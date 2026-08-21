# AUDIT 2026-08-05T054800Z — post-merge staging hardening

**Verdict: NO-GO for `staging → master`.** Not because the code is bad — the
code evidence is the strongest part of this report — but because the release
would be unrecoverable and unobservable if it went wrong: no production backup
has ever been taken, and the production heartbeat has been red for days against
a hostname that no longer exists.

Scope: the merged `staging` tree `f0c1845` (PR #187, `develop → staging`,
103 non-merge commits). Session: Claude Code (web), branch
`claude/git-notebook-explanation-hmieyb`.

---

## 0 — Premise correction

The task this audit answers was written on the premise that "a merge into
`master` has just landed". **It had not.** `origin/master` is `e55e743`, dated
**2026-07-23**, and did not move at any point during this session. What landed
was PR #187 into **`staging`** (`f0c1845`, 2026-08-05T05:16Z).

Consequently the requested back-merge (`master → staging → develop`) is a
**no-op**: nothing exists on `master` that the lower tiers lack. The requested
success criterion — `master..staging` and `master..develop` both `0` — is
reachable *only* by merging `staging` into `master`, i.e. shipping to
production, which is Sri-only. It was not done.

---

## 1 — Tier sync

Measured after PR #187 merged (`git fetch origin master staging develop`):

| Range | Count | Reading |
|---|---|---|
| `origin/staging..origin/develop` | **0** | develop fully absorbed into staging |
| `origin/develop..origin/staging` | 4 | promotion merge commits (#147/#151/#155/#187) only |
| `origin/staging..origin/master` | **0** | master holds nothing staging lacks ✅ |
| `origin/develop..origin/master` | **0** | master holds nothing develop lacks ✅ |
| `origin/master..origin/staging` | 186 | unreleased work queued for production |
| `origin/master..origin/develop` | 186 | same |

`git cherry origin/develop origin/staging` → **0** unique content commits. The
4-commit asymmetry is merge bookkeeping, not drift: a `develop → staging` PR
merge writes a merge commit that by construction cannot exist on `develop`.

**The `develop ≥ staging ≥ master` invariant holds.** No tier has drifted
sideways; no hotfix is stranded above the lower tiers.

Note on the invariant as documented in `AGENTS.md`: the check it specifies
(`origin/master..origin/staging` == 0) only reads zero in the moments right
after a release. The always-true drift alarm is the **reversed** range
(`origin/staging..origin/master`), which is 0 now and should never be anything
else.

---

## 2 — Verification on the merged tree

All gates run against `f0c1845` in a dedicated worktree.

### Environment note (affects how to read these results)

This sandbox has **Node 22.22.2**; `.nvmrc` pins **24**. Egress is restricted —
`example.com` and `vercel.com` fail identically to any project URL, so **no
liveness claim in this document comes from a local probe**; every one is sourced
from a GitHub Actions run or a committed repo document.

`npm test` initially died with `EACCES` spawning `initdb`. Root cause:
`embedded-postgres` drops privileges, and the resulting user cannot traverse the
sandbox scratchpad path. Worked around by standing up PostgreSQL 18.4 under a
non-root user and pointing `DATABASE_URL` at it (`ensurePg` honours a preset
`DATABASE_URL`). **The results below are real runs against real Postgres, not
skips.**

### `npm run verify` — stage by stage

| Stage | Result | Evidence |
|---|---|---|
| `hygiene` | **PASS** | 2176 files scanned; no junk, tracked env, conflict markers, secrets, broken doc links |
| `gap:scan` | **PASS** | 473 backend paths, 378 frontend, 17 allowlisted; no unexplained gaps |
| `table:scan` | **PASS** | 166 table names, no collisions |
| `typecheck` (backend) | **PASS** | `tsc --noEmit` clean |
| `test` | **PASS** | **852 tests, 852 pass, 0 fail, 0 skipped** |
| `smoke` | **PASS** | exit 0 — full POS lifecycle on real Postgres |
| web `typecheck` | **PASS** | exit 0 |
| web `lint` | **PASS** | exit 0 |
| web `build` | **PASS** | exit 0 — full route manifest emitted |

CI independently confirms the same tree: run **30977630220** on the `staging`
push — Production guard ✅, Backend typecheck+test ✅, Frontend ✅, Docker ✅,
**E2E (Playwright golden paths) ✅ success**.

### `npm run ops:check`

First run **FAILED** (2 failures) — but under `NODE_ENV=development` with no
allowlist configured. Re-run against a **production-mode** backend
(`NODE_ENV=production`, `ALLOWED_ORIGINS` set, `METRICS_TOKEN` set):

```
[PASS] liveness + version      - version=dev, builtAt=
[PASS] readiness + database    - 54 modules, pool waiting=0
[PASS] service module info     - 53 modules mounted
[PASS] CORS allowlist          - allowed=https://ascendhq-app.vercel.app, blocked=https://blocked.finder.invalid
[PASS] auth boundary           - /api/v1/flags rejects unauthenticated requests
[WARN] metrics authorized scrape - /metrics is not public, but authorized scrape
                                   was not verified because METRICS_TOKEN/OPS_METRICS_TOKEN is unset in the checker's env
Operational readiness passed: 5 check(s), 1 warning(s).
```

**Result: PASS.** The two initial failures were proven to be dev-mode artifacts,
not defects — `src/app.ts:169` reads `const allowed = isDev || allowedOrigins.has(origin)`,
so the allowlist is bypassed only when `NODE_ENV=development`; and `/metrics` is
gated on `METRICS_TOKEN`, which was unset.

Two production-mode behaviours worth recording as working-as-designed:

- Production **fails closed without DB TLS** (`Error: The server does not
  support SSL connections`) — the C-3 hardening is live.
- Production **neutralises seeded demo accounts** carrying the published
  password on boot (`owner@ascend.dev`, `cashier@ascend.dev`).

### CI `guard` anti-pattern checks, run locally

| Check | Result |
|---|---|
| console.* in `src/modules`/`src/gateway` | **PASS** — count 0 |
| duplicate / copy-junk files tracked | **PASS** — none |
| one canonical `AGENTS.md` | **PASS** — exactly 1 |
| `prevent:drift` | **PASS** — 2176 tracked files, no drift |
| raw SQL string interpolation | **see finding F-1 — the check is inert** |
| unguarded mutation routes | **see finding F-2 — the check is inert** |

---

## 3 — Findings

### F-1 (NEW, high) — the raw-SQL-injection guard has never run

`ci.yml:59-64`. Reproduced verbatim:

```
########## No raw SQL string interpolation (SQL injection risk) ##########
grep: Unmatched ( or \(
No raw SQL interpolation found ✓
>>> STEP EXIT CODE = 0
```

The pattern `"\.query\(\`.*\${"` is a POSIX BRE, in which `\(` opens a capture
group that is never closed. `grep` aborts with exit 2; `!` inverts that to
success; the `|| (echo ❌ && exit 1)` branch never fires; the step prints its ✓
and exits 0. **It has never once evaluated the codebase.**

Six interpolation sites exist that it would have had to classify. All six were
checked by hand and are **safe** — the interpolated fragment is always a literal
column name from a ternary (`catalog/service.ts:1288,1290,1299`), a hard-coded
key map (`customers/service.ts:471`), or one of two literal WHERE clauses
(`healthcare/index.ts:85`, `automotive/index.ts:97`); every user value is bound
via `@param`. **No injectable SQL exists today.** The defect is that the control
preventing tomorrow's is dead.

Identical in the staging tree and on `develop` — verified against
`f0c1845`'s own `ci.yml`, not master's.

### F-2 (NEW, medium) — the unguarded-mutation-route guard cannot fail

`ci.yml:41-48`. Its pipeline *does* match lines; `!` turns that into a failure;
`|| echo …` swallows it and `echo` returns 0. Step exit code is **0
unconditionally**. It also cannot recognise the `mgr` alias used by most guarded
routes, so it would emit false positives even if it could fail.

### F-3 (NEW, high) — `scripts/deploy.sh` reports a successful deploy when the deploy failed — **FIXED**

From CI run 30977630220, job "Deploy → Testing":

```
→ Frontend: deploying…
Error: Project not found ({"VERCEL_PROJECT_ID":"prj_TiPX9UYctGKJbQr4Lb1WFwSsKiN1", …})
→ Frontend deployed:
→ Frontend: aliasing  → ascend-frontend-staging.vercel.app
Error: The provided argument "" is not a valid ID or URL
✓ frontend deployed (testing)
✗ backend exit=1 frontend exit=0
```

Two bash behaviours combine: `set -e` is suspended inside
`deploy_frontend || frontend_status=$?`, and the function's last command was an
unconditional `echo "✓ frontend deployed"` — so it always returned 0. The job
only went red because the *backend* half failed independently.

**This path is shared with `DEPLOY_ENV=prod`.** A production deploy could fail
outright and be reported green; if the previous deployment were still serving,
the post-deploy smoke would pass against the stale build and the release would
look successful while shipping nothing.

**Fixed** in this change: both `deploy_backend` and `deploy_frontend` now
`return 1` with an explicit message when `vercel` produces no deployment URL.
Regression test `src/shared/deploy-guard.test.ts` — **verified to fail without
the fix** (1 fail) and pass with it (3/3).

### F-4 (confirmed, not new) — no production backup has ever been taken

Already recorded in `WORK/FORWARD_PLAN.md:581`. Confirmed live this session:
`backup.yml` has run daily on schedule and reported **success 16 times**, most
recently 2026-08-04, while skipping every meaningful step —
`Install postgresql-client` / `Run backup` / `Verify backup integrity` /
`Upload backup artifact` all `skipped`, job duration **5 seconds**, because
`PROD_DATABASE_URL` is unset and the workflow is written to skip cleanly rather
than fail.

**Honest RPO is not ≤24h. There is no recovery point at all.**

### F-5 (confirmed, not new) — production heartbeat red, probing a dead host

Already tracked as P0 in `docs/architecture/DEPLOYMENTS.md`. Confirmed live:
`uptime.yml` has **30 consecutive failures**, red since at least 2026-08-02,
failing in **~1 second** at `Backend liveness (/healthz)` — a DNS failure, not a
timeout — against `ascendhq-api.vercel.app`. The repo's own docs record the
post-migration backend as `ascend-prod.onrender.com`.

**Deliberately not "fixed".** Repointing the probe at the Render host would
merely move the redness: `DEPLOYMENTS.md` records that host as unreachable from
three independent networks and gates the question on Sri's dashboard
confirmation. Repointing a monitor at a second unverified host is not a fix.

---

## 4 — Load / stress testing: **NOT DONE**

Section 3 of the mandate (API surface walk, rate-limit burst/sustained,
cache invalidation, pooler exhaustion, idempotency races, SSE reconnect churn,
and the endpoint/concurrency/p50/p95/p99/error-rate table) was **not performed.**

Reason: there is no reachable TESTING tier to exercise. `deploy-staging` **ran
and failed** (it did not skip — so `vars.STAGING_BACKEND_URL` *is* set), because
the Vercel projects it targets no longer exist. This session also has no Vercel
or Supabase credentials and restricted egress.

No numbers are reported because none were measured. **An unverified PASS is a
FAIL** — this is a FAIL, and it blocks any claim that staging survives traffic.

---

## 5 — Backup restore drill: **DONE — C-1 drilled for the first time**

Standing critical C-1 ("restore drill never run") has never been executable
because no dump ever existed. It is now drilled — against the **real
`db/backup/backup.sh` and `db/backup/restore.sh`**, on a version-matched
PostgreSQL 16 pair, with the **real Ascend schema** (193 tables created by the
app's own migrations) and seeded data.

| Phase | Measured |
|---|---|
| `backup.sh --full` | **0.168 s** → 501 KB custom-format dump |
| `restore.sh --latest` into scratch DB | **~1 s** (script reported `0m 1s`; wall 0.985 s) |
| Script's own RTO gate (≤ 30 min) | **PASSED** |

Verification of the restored database:

| Object | Original | Restored | Match |
|---|---|---|---|
| tables (public) | 193 | 193 | ok |
| products | 16 | 16 | ok |
| customers | 8 | 8 | ok |
| orders | 25 | 25 | ok |
| order_lines | 49 | 49 | ok |
| payments | 23 | 23 | ok |
| users | 2 | 2 | ok |

Strongest check: the application was booted against the **restored** database
and `/readyz` returned `{"status":"ok","db":"connected", …}` with all modules
mounted. The restore is application-usable, not merely row-identical.

Safety guards observed working: `restore.sh` demands the target database name be
typed before proceeding; `seed-demo.ts` refuses without `ALLOW_DEMO_SEED=1`.

**Scope limit, stated plainly:** this drilled the *scripts and mechanism*, not
production data. No `PROD_DATABASE_URL`, no production access. It proves the
tooling works; it does **not** prove production is recoverable — production has
nothing to recover from (F-4).

**Measured RPO/RTO, honestly:**

- **RTO: ~1 s** for a 501 KB database; well inside the 30-min target, but this
  scales with data volume and says little about a production-sized dump.
- **RPO: undefined / total loss.** Not 24h. `backup.sh`'s docstring claims ≤5 min
  via WAL archiving, but `run_wal_archive` is still a stub, and the daily
  `pg_dump` that would give ≤24h has never executed against production.

---

## 6 — Rollback procedure for this release

Applies to promoting `f0c1845` (staging) → `master`.

**Last known good per tier**

| Tier | Last known good | Note |
|---|---|---|
| `master` / production | `e55e743` (2026-07-23) | current tip; unchanged since |
| `staging` | `b05b5ce` (2026-08-02) | tip before PR #187 |
| `develop` | `7791700` (2026-08-04) | current tip |

**Git rollback (forward-only — never force-push a tier)**

```bash
# Revert the release merge on master via a PR, not a push:
git fetch origin master
git switch -c revert/release-<utc> origin/master
git revert -m 1 <merge-sha-of-staging-into-master>
git push -u origin revert/release-<utc>
# open PR → master; merging it redeploys the previous tree
```

**Deploy rollback** — fastest path is Vercel's own "Promote to Production" on
the last known good deployment (dashboard → project → Deployments), because it
does not depend on CI being healthy. The CI path is a revert PR as above.

**Migration safety — the part that has no rollback**

Schema changes in this release are applied by `buildApp` on boot (every module
runs its own migration); there is **no down-migration mechanism in this repo.**
A `git revert` restores *code*, not *schema*. Reverting to `e55e743` leaves any
new columns/tables in place — usually harmless (additive), but **destructive or
type-narrowing changes cannot be rolled back without a restore**, and per F-4
there is nothing to restore from.

**This is the single loudest caveat in this document:** until `PROD_DATABASE_URL`
is set and one backup has actually run, the production rollback story covers
code only. Any data-affecting mistake in these 186 commits is permanent.

---

## 7 — What was changed on this branch

- `scripts/deploy.sh` — empty-URL guards in `deploy_backend`/`deploy_frontend` (F-3).
- `src/shared/deploy-guard.test.ts` — new regression test, proven to fail without the fix.
- `WORK/LOOP_STATE.md` — status, backlog, NEEDS-SRI updated in place.
- `WORK/LOCK.md` — session claim.
- This audit.

Not changed, deliberately: `ci.yml` (F-1/F-2 are real but touching CI mid-release
would restart the pipeline and they are not regressions from this merge — filed
as backlog); `uptime.yml` (F-5, gated on the `DEPLOYMENTS.md` P0).
