# AUDIT — AI-slop elimination & consistency audit

Date: 2026-08-04T04:06:21Z
Branch: `claude/ai-slop-consistency-audit-lc2552` (off `origin/develop` @ `a4dbf2c`)
Scope: whole repository, read-first. Fixes applied this session are marked **FIXED**;
everything else is reported with evidence and left for a decision.

> Method note. Every finding below was verified against the tree at `a4dbf2c` — by
> running the gate, reading the code path end-to-end, or reproducing the failure.
> Nothing here is inferred from naming or assumed from a doc. Where I could not
> verify something in this environment, it says so.

---

## Executive summary

The repository is in **materially better shape than its current CI state suggests**.
The canonical application (`src/` + `web/`) is disciplined work: 53 backend modules
with no table collisions, no orphaned module registrations, 473 backend routes with
no unexplained frontend gaps, a single consistent error envelope, a single API client,
tenant-scoping previously swept clean, and 96 backend + 26 frontend test files.

The damage is concentrated in one place, and it is not the application code: **a
foreign workspace has been merged into this repository five times**, and one
occurrence is live on `develop` right now. It has broken CI, deleted the environment
templates, and left a **second, diverging copy of the entire application** in
`artifacts/` — 1,004 files, 46% of the tree.

That is the finding. Most of the rest is small.

### Scores (0–100)

| Dimension | Score | Basis |
|---|---:|---|
| **AI slop** | **34** | 1,004-file duplicate app tree; 48 copies of one test helper in 8 variants; a dead root dependency; 4 dead allowlist entries |
| **Architecture** | **72** | Canonical tree is clean and consistent (no module orphans, no table collisions); the score is held down entirely by the duplicate tree, not by `src/` itself |
| **Security** | ~~80~~ **68** | Prior sweeps verified authz + tenant-scoping; CI guards unguarded mutations and SQL interpolation. **Revised down 2026-08-04T15:00Z**: the original 80 was assigned without ever running a dependency audit — a gap in this audit, not a clean result. Running one (F-16) found **14 advisories in `web`: 1 critical, 9 high, 4 moderate**, plus 2 low at the root, with nothing watching for them. **F-26 has since cleared 6** (root 2→0, web 14→10); the remaining 10 need the framework majors in F-24/F-25 |
| **Performance** | — | **Not assessed.** No profiling or query-plan evidence was gathered; a score here would be invented |
| **Maintainability** | **62** | Strong conventions and unusually good comments, undermined by the duplicate tree and the copy-pasted test harness |
| **Testing** | **78** | 96 backend + 26 frontend test files, real-DB smoke, e2e. Gaps: 3 web tests need Node 24; `StoreAuthContext` had zero coverage and carried a real bug |
| **Documentation** | **70** | Genuinely excellent (AGENTS.md, ADRs, audit trail). Penalised because the documented gates (`npm test`, `npm run verify`) did not exist at HEAD |
| **Production readiness** | **45** | CI cannot pass on `develop` as of `a4dbf2c`. Everything else is secondary to that |
| **Overall** | ~~58~~ **56** | A good codebase with a broken front door (revised for the dependency finding above) |

Overall is deliberately below the component average: a repository whose CI cannot run
is not 70% healthy regardless of what the code looks like underneath.

---

## Findings

### CRITICAL

#### C-1 — CI is red on `develop`: the npm root was replaced by a foreign workspace stub — **FIXED (superseded on merge)**

> **Correction, 2026-08-04T14:30Z.** This section originally called it the *third*
> occurrence. It was the **fifth**. That count was everything the tree at `a4dbf2c`
> could support — `AUDIT_2026-08-03T190400Z` and `…T190734Z`, which document
> occurrences four and five, were **not committed at that commit** (verified:
> `git cat-file -e a4dbf2c:WORK/audits/…` fails for both). They arrived with PR #182.
> Worth recording rather than quietly editing, because the mechanism is itself a
> finding: *the audit trail was incomplete because parallel sessions' work had not
> landed yet*, so an audit taken at a point-in-time commit under-counted a recurring
> incident. Any future count should be taken against `origin/develop`, not the
> working tree.
>
> **This fix was also superseded.** PR #182 (`2db1ee7`, "restore Ascend npm root
> (5th workspace re-merge)") landed the same restore on `develop` independently
> while this branch was open. On merge, `develop`'s root won and my restore
> collapsed to nothing — the root manifests here are now byte-identical to
> `develop`'s. **C-2's guard is not superseded**: #182 explicitly states its own
> durable fix is "enforce_admins on develop protection — Sri-only", i.e. it shipped
> no structural prevention. That remains this branch's contribution.

**Description.** At `a4dbf2c` the repository root was not Ascend's. `package.json` was
`{"name":"workspace"}` carrying one dependency (`@replit/connectors-sdk`) and a single
`preinstall` script whose body is `rm -f package-lock.json … case "$npm_config_user_agent" in pnpm/*) ;; *) exit 1`.
`package-lock.json` was deleted (`a4dbf2c`, "Remove package-lock.json file").
`tsconfig.json` was a project-references stub — `"files": []`, no `compilerOptions`.
`.env.example`, `.env.staging.example`, `web/.env.example`, `web/.env.local.example`
were all deleted.

**Root cause.** A separately-scaffolded pnpm workspace shares this `origin` and merges
into it. `WORK/audits/AUDIT_2026-08-03T110000Z-replit-pnpm-root-hijack-incident.md`
documents occurrences one and two and states plainly that the *cause* was not fixed.
It was not. The hotfix branch that audit describes (`hotfix/restore-npm-root-after-replit-merge`)
**never merged** — `git log -- package.json` on HEAD ends at `186de92`, the commit that
re-asserted the stub.

**Business impact.** No code can ship. `develop` → `staging` → `master` is blocked.
**Technical impact.** `.github/workflows/ci.yml` runs `npm ci` at lines 160, 183, 263,
301, 404, 444, 482 — all seven fail, and the `preinstall` hook deletes the lockfile as
its first act. The documented gates (`npm run typecheck`, `npm test`, `npm run smoke`,
`npm run verify`) did not exist. The Dockerfile and `api/index.js` both depend on
`tsc -p tsconfig.json` emitting `dist/src/server.js`; against a `files: []` stub that
build emits nothing and "succeeds".

**This is confirmed from CI's own logs, not predicted.** `develop` has failed **five
consecutive runs**, every run since the hijack merged at `186de92` (2026-08-03T10:37Z):

| Run | Commit | Result |
|---:|---|---|
| 695 | `a4dbf2c` | failure |
| 692 | `7b61407` | failure |
| 691 | `dcdf04b` | failure |
| 690 | `2ad1724` | failure |
| 687 | `8e0b3fa` | failure |

Run 695 (the current `develop` HEAD), 3 of 9 jobs failed, with exactly the causes above:

- **Production guard** — `npm error Missing script: "prevent:drift"`
- **Docker build** — `RUN npm ci --omit=dev` → `did not complete successfully: exit code: 1`
- **Backend — typecheck + test** — failed

The first of those is word-for-word the condition C-2's guard now asserts.

**Fix applied.** Restored `package.json`, `package-lock.json`, `tsconfig.json` and the
four env templates from `ca7ec4b` (last known good, an ancestor of HEAD).
**Verified:** `npm ci` → 154 packages, clean; `npm run typecheck` → exit 0;
`npm run hygiene` / `gap:scan` / `table:scan` → pass.

**Deliberately preserved:** `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.npmrc` and the
whole `artifacts/` tree. Once the root manifests are Ascend's again these are inert to
npm, and destroying another environment's setup is not this session's call to make.
`@replit/connectors-sdk` was dropped with the stub — it is imported nowhere in the
repository (verified by grep across all `.ts`/`.tsx`/`.js`).

**Effort:** done. **Risk:** low — restores a known-good state, proven by `npm ci` + typecheck.

---

#### C-2 — Nothing prevented C-1, five times running — **FIXED**

**Description.** Occurrences one and two were each hand-diagnosed after the fact. The
second audit recommended exactly this guard and explicitly did not build it: *"a
root-manifest guardrail in CI … Not built here."*

**Root cause.** The failure is invisible until after checkout **and** install, where it
reads as an infrastructure flake rather than a swapped manifest.

**Fix applied.** Added check 8 to `tools/hygiene-check.mjs`, asserting the behaviour CI
actually depends on:

- root `package.json` `name === "ascend"`;
- every root script CI or the Dockerfile invokes by name is present;
- no `preinstall` hook that rejects npm;
- `package-lock.json` and `web/package-lock.json` both exist;
- root `tsconfig.json` has `compilerOptions`, an `outDir`, and includes `src/`.

Asserting *behaviour* rather than the absence of specific foreign files is deliberate:
it catches the whole class without forbidding a pnpm workspace that coexists honestly.

Wired into `.github/workflows/ci.yml` as the **first step of the first job**, invoked as
a bare `node tools/hygiene-check.mjs` — never `npm run hygiene`, because the whole point
is to survive a root that has no scripts. It fails in seconds instead of minutes.

**Verified both directions:** passes on the restored tree; against the actual broken
commit (`git show a4dbf2c:package.json`, lockfile removed) it emits all six violations
and exits 1.

**Also fixed:** the `guard` job invoked `node tools/hygiene-check.mjs` twice — the new
first step supersedes the later "Repo hygiene" step, which was removed. One invocation.

**Effort:** done. **Risk:** low — additive check, verified negative and positive.

---

### HIGH

#### H-1 — `artifacts/` is a second, bidirectionally-diverged copy of the whole application (1,004 files) — **REPORTED, NOT TOUCHED (NEEDS-SRI)**

**Description.** 46% of tracked files are a parallel app:

| Canonical (deployed) | Duplicate | Files |
|---|---|---|
| `src/` (Express backend) | `artifacts/api-server/` | 411 vs 405 |
| `web/` (Next.js frontend) | `artifacts/ascend/` (Vite/React) | 445 vs 452 |
| — | `artifacts/ascend-mobile`, `ascend-pitch`, `mockup-sandbox` | 147 |

`src/` is unambiguously the deployed one: the `Dockerfile` copies `src`, `api/index.js`
imports `../dist/src/app.js`, and every CI guard greps `src/`. Nothing builds or deploys
`artifacts/`.

**This is not a stale copy — the two trees have diverged in both directions:**

- `src/` has `ai_assistant` and `demand_planning`; `artifacts/api-server/` has neither.
- `artifacts/api-server/` has a complete `push_tokens` module — `service.ts`, `routes.ts`,
  `batcher.ts` plus `batcher.test.ts` and `quiet_hours.test.ts` — that exists **nowhere**
  in `src/` or `web/` (verified by grep for `push_tokens`/`push-tokens`). Commit `5554592`
  describes it as "per-tenant quiet hours for order push notifications … owner-only
  GET/PUT /api/v1/push-tokens/quiet-hours".
- Shared files have drifted: `app.ts` is 545 lines in `src/` vs 659 in `artifacts/`;
  `orders/index.ts` 191 vs 172. Some files (`shared/db.ts`) are still byte-identical.

**Business impact.** Feature work is being written into a tree that is never deployed.
`push_tokens` is finished, tested, and unreachable by any customer. Every future change
lands in one tree and silently misses the other.
**Technical impact.** It is the single largest violation of "never keep two
implementations of the same business rule" in the repository, and it defeats every
guard the repo owns — the CI greps, `gap:scan`, and `table:scan` all scope to `src/`.

**Recommended fix — needs a human decision, which is why nothing was changed:**

1. **Decide the canonical tree.** Evidence overwhelmingly favours `src/` + `web/`
   (it is what deploys). This should be recorded as an ADR, not left implicit.
2. **Harvest before removing.** `push_tokens` is real, tested work — port it into
   `src/modules/` on its own branch with its tests, and check the two `app.ts` files for
   any other backend change that only exists on the `artifacts/` side.
3. **Then remove `artifacts/api-server` and `artifacts/ascend`** in one reviewed commit
   with the harvest PR already merged. *Rollback: they are in git history; `git revert`
   restores them wholesale.*
4. **Stop the recurrence at the source** — this is the same root cause as C-1. The
   controls that actually work are branch protection on `develop` requiring green CI,
   and/or pointing the other workspace's `origin` at a fork. C-2 makes the breakage
   loud and immediate, but a guard cannot substitute for the merges not happening.

**Effort:** 1–2 days (mostly the harvest). **Risk:** medium — deleting 857 files is
irreversible-feeling even though it is not; do the harvest first, and never both in one PR.

**Explicitly out of scope for this session.** AGENTS.md says do not delete user work,
and this is another environment's work. It is documented, not touched.

---

#### H-2 — `StoreAuthContext` carried a private `apiFetch` fork; users saw `[object Object]` on failed sign-in — **FIXED**

**Description.** `web/contexts/StoreAuthContext.tsx` defined its own 8-line `apiFetch`
alongside the canonical one in `web/api-client/client.ts`. The fork diverged in four ways:

| Behaviour | `api-client/client.ts` | the fork |
|---|---|---|
| Error envelope | parses `{error:{code,message,requestId}}` → `ApiResponseError` | read `error` as a **string** |
| API base env var | `NEXT_PUBLIC_API_BASE_URL` | `NEXT_PUBLIC_API_BASE` — **defined nowhere in the repo** |
| 429 `Retry-After`, network-error wrapping, 204 | all handled | none |
| 401 | silent refresh + retry | none |

**The envelope bug is real and user-visible.** `src/gateway/errorEnvelope.ts` sends
`error` as an *object*, so `(data as {error?: string}).error ?? "Request failed"` never
reached its fallback and `new Error(<object>)` stringified to the literal
`"[object Object]"` — which is what a customer saw instead of "Invalid email or password."

**The env var is wrong too.** Everything else in the repo — `web/.env.example`,
`next.config.mjs`'s `env` allowlist, `middleware.ts`'s CSP `connect-src`,
`playwright.config.ts`, `README.md`, `docs/getting-started/local-development.md` — uses
`NEXT_PUBLIC_API_BASE_URL`. Because Next only inlines variables it knows about,
`NEXT_PUBLIC_API_BASE` compiled to `undefined`, so storefront auth always went
same-origin regardless of configuration — and the CSP would have blocked it anyway.

**Root cause.** A helper written locally instead of importing the one that already
existed; classic duplicated-utility drift.

**Fix applied.** Routed all four call sites through the shared client via a small
`storeFetch` wrapper. `anonymous: true` is deliberate and load-bearing: the customer
token is a *different* credential from the staff session token, so the client must not
attach `getAccessToken()` or run the staff 401-refresh/redirect-to-`/login` path.

**Verified.** New `web/tests/storeAuthErrorEnvelope.test.tsx` (3 tests) passes, and
**fails against the old code with exactly the predicted symptom**:
`expected '[object Object]' to be 'Invalid email or password.'`. Web typecheck exit 0;
`next lint` 0 errors.

**Effort:** done. **Risk:** low — behaviour-preserving for the success path, test-covered,
and the surface is Preview-gated today (`storeAuthPreview()`), so blast radius is small.

---

#### H-3 — `test-request.ts` is copy-pasted into 48 modules in 8 divergent variants — **REPORTED, NOT FIXED**

**Description.** 48 copies of the same ~83-line test HTTP client. By content hash:
34 byte-identical, plus 7 forks. The forks are supersets that each added one thing:

| Variant | Copies | What it added |
|---|---:|---|
| majority | 34 | — (owner role, fixed) |
| `catalog`, `ai_assistant` | 5 | optional `role` param, default `owner` |
| `workflows` | 5 | optional `role` param, default **`manager`** |
| `custom_roles` | 1 | `role` + `customRoleId`/`permissions` claims |
| `business` | 1 | full `TestClaims` object (cross-tenant tests) |
| `identity` | 1 | custom request headers, returns response headers |
| `progress` | 1 | different **argument order** (`role` before `body`) |

**Impact.** ~4,000 duplicated lines. A fix to the harness (say, the `/api/` → `/api/v1/`
path upgrade) has to be made 48 times or it silently applies to some modules only. The
differing default role (`manager` vs `owner`) is exactly the kind of drift that makes an
authz test assert something other than what its author believed.

**Recommended fix.** One `src/shared/test-request.ts` factory
(`makeRequest({ defaultRole })`) whose signature is a superset; each module's file
becomes a one-line re-export that pins its own default, so behaviour is preserved
*exactly* rather than approximately. 46 of 48 collapse cleanly; `identity` (different
return type) and `progress` (different argument order) need their call sites touched and
should be a separate commit.

**Why not done here:** it edits ~48 helper files and touches the call sites of 96 test
files. That is a mechanical change whose only real proof is a full green backend suite,
and it should land as its own reviewed PR rather than riding along with a CI hotfix.
Bundling it here would have made the C-1 fix hard to review — which is the change that
actually unblocks the pipeline.

**Effort:** ~half a day. **Risk:** low-medium (test-only; no production code path).

---

### MEDIUM

#### M-1 — `.gitignore`'s bare `.env*` made deleting the env templates irreversible — **FIXED**

`.gitignore:50` and `web/.gitignore:24` both matched `.env*` with no negation. The
templates predated the rule, so git kept tracking them and the rule looked harmless —
until the C-1 merge deleted them, at which point `git add .env.example` silently did
nothing and the deletion became permanent. This is why the C-1 restore of those four
files initially appeared to no-op. Added `!.env*.example` to both files, with a comment
explaining why the negation must stay next to the rule.

**Impact:** `.env.example` is 99 lines and is the reference the security audit's
`JWT_SECRET` finding depends on. **Risk:** low.

#### M-2 — Four dead entries in `tools/api-gap-allowlist.json` — **FIXED**

The allowlist's own header says every entry must map to a board item. Four did not:

- `/api/v1/inventory/pipeline/receiving`, `…/receiving/:p/update`, `…/pipeline/summary` —
  the backend caught up. Verified against `src/modules/inventory/pipeline-routes.ts`
  lines 41, 45, 50 before removing. (`/pipeline/issues` has no route and stays.)
- `/api/v1/things` — never a real call at all; see M-3.

An allowlist that accumulates entries nobody rechecks stops meaning "deliberate preview
surface" and starts meaning "nobody has looked at this", at which point a genuine gap can
hide behind a stale line. 21 entries → 17.

#### M-3 — `gap:scan` counted paths inside doc comments as live API calls — **FIXED**

`/api/v1/things` is a placeholder in `web/api-client/client.ts`'s `safeLoad` docstring.
The scanner regexes raw source, so it saw a real frontend call and the only way to
silence it was a permanent allowlist entry — a false positive laundered into config.
Now strips `/* … */` block comments before matching. Deliberately block comments only:
`//` also appears inside `https://` string literals, and stripping those would corrupt
real call sites — the exact failure this scanner exists to catch. Frontend paths 382 → 380,
backend unchanged at 473.

#### M-4 — `gap:scan` had no way to notice an allowlist entry going dead — **FIXED**

It warned when the backend caught up (`stale`) but not when the *frontend* call
disappeared. Added an `orphaned` warning for entries matched by neither side. On its
first run it flagged exactly `/api/v1/things` and nothing else — which is how M-2's
fourth entry was found rather than guessed. Reported, not fatal: an entry may
legitimately land a step ahead of the UI that needs it.

---

### LOW

#### L-1 — `scripts/` has two owners

`scripts/` holds Ascend's operational scripts (`test.ts`, `smoke.ts`, `seed-e2e.ts`,
invoked from the root `package.json`) *and* a `package.json` declaring it the pnpm package
`@workspace/scripts`, whose only source file is `src/hello.ts`. Harmless today — the root
scripts call `tsx scripts/test.ts` directly, not through any workspace resolution — but it
is a directory with two conflicting definitions of what it is. Resolve with H-1.

#### L-2 — Three web tests require Node 24; the dev default here is Node 22

`tests/api-client.test.ts` has 3 jsdom `Blob`/`FileReader` tests that fail on Node 22 and
pass on Node 24, exactly as AGENTS.md documents. Confirmed pre-existing and unrelated to
this session's changes by stashing them and re-running: still 3 failed / 16 passed. CI
uses `.nvmrc` (24) so CI is unaffected. Worth a `engines`/`.nvmrc` assertion in the web
test setup so the failure names its own cause.

---

## What was checked and found clean

Reporting only problems would misrepresent the repository. Verified healthy:

- **Module registration** — every directory in `src/modules/` is imported by
  `src/modules/index.ts` and vice versa. No orphans, no dead registrations.
- **Table collisions** — 166 table names across all modules, zero collisions
  (`table:scan`). This matters: three separate production-breaking collisions were found
  and fixed in July, and the guard is holding.
- **Frontend→backend route alignment** — 473 backend paths, 380 frontend paths, no
  unexplained gaps.
- **`console.*` discipline** — one deliberate `console.warn` in `src/shared/db.ts`; the
  CI guard covers `modules/` and `gateway/`, and the rest of `src/` is clean anyway.
- **Raw `fetch` in the frontend** — only 4 files outside the API client, each with a
  specific reason (error reporter, offline outbox, two streaming/polling views).
- **Error envelope** — one shape, one middleware, mounted last, no stack leakage on 5xx.
- **Secrets** — hygiene scan clean across 2,194 files.

---

## Refactoring plan

Phases 1–2 are done. The rest is ordered by dependency, not by appetite.

| Phase | Work | State |
|---|---|---|
| **1 — Critical blockers** | C-1 root restore; C-2 structural guard | **DONE** |
| **2 — AI-slop quick wins** | H-2 duplicate `apiFetch` + regression test; M-1 gitignore door; M-2/3/4 allowlist + scanner | **DONE** |
| **3 — Architecture cleanup** | H-1: ADR naming the canonical tree → harvest `push_tokens` and any other `artifacts`-only backend work → remove the duplicate trees | **NEEDS-SRI** (decision, then ~1–2 days) |
| **4 — Duplication** | H-3: consolidate 48 `test-request.ts` copies behind one factory | Ready; own PR |
| **5 — Prevention** | Branch protection on `develop` requiring green CI; decide the other workspace's remote | **Sri-only** |
| **6 — Testing** | L-2 Node-version assertion; extend coverage to the storefront surfaces H-2 exposed as untested | Backlog |
| **7 — Documentation** | Fold this audit's conclusions into `GAPS.md`; ADR for phase 3 | With phase 3 |

**Performance** is deliberately absent: no evidence was gathered, so there is nothing
honest to schedule. A real pass needs query plans against a seeded database and a bundle
analysis — worth doing, not worth guessing at.

---

## Verification performed this session

| Gate | Result |
|---|---|
| `npm ci` (root) | **PASS** — 154 packages. Direct proof C-1's blocker is cleared |
| `npm run typecheck` (backend) | **PASS** — exit 0 |
| `npm run hygiene` | **PASS** — 2,194 files |
| `npm run hygiene` vs. broken `a4dbf2c` root | **FAILS with 6 violations, exit 1** — proves C-2's guard works |
| `npm run gap:scan` | **PASS** — 473 backend / 380 frontend / 17 allowlisted, no gaps |
| `npm run table:scan` | **PASS** — 166 tables, no collisions |
| `web` `tsc --noEmit` | **PASS** — exit 0 |
| `web` `next lint` | **PASS** — 0 errors (pre-existing warnings only) |
| `web` vitest | 174 passed / 3 failed — the 3 are L-2, **proven pre-existing** by re-running on a stashed tree |
| New `storeAuthErrorEnvelope.test.tsx` | **3/3 pass**; **1 fails against the old code** with the predicted `[object Object]` |
| `npm test` (backend, 96 files) | **PASS — 851/851, 0 failures** (`# pass 851 / # fail 0`), 19m implementation time against a local Postgres 16 |
| `npm run smoke` | **NOT RUN locally** — running in CI on PR #185 |

### CI evidence on PR #185 (run 700, `7ffadac`)

The jobs that are red on `develop` pass here, which is the point of the change:

| Job | on `develop` (run 695) | on this branch (run 700) |
|---|---|---|
| Production guard | **FAIL** — `Missing script: "prevent:drift"` | **PASS** — incl. the new *Root manifest integrity* step, green in 1s as CI's first step |
| Docker build | **FAIL** — `npm ci --omit=dev` exit 1 | **PASS** |
| Backend `npm ci` → `typecheck` | **FAIL** | **PASS** (suite still running at time of writing) |
| Frontend `npm ci` → `typecheck` → `lint` | **FAIL** | **PASS** |

### Honest gaps in this verification

- ~~The backend suite did not finish in this environment.~~ **Resolved — it did finish:
  851 tests, 851 pass, 0 fail.** It takes ~19 minutes wall-clock (`duration_ms 1138014`),
  which is why two earlier attempts hit a timeout and looked like a hard limit rather than
  a slow run. Worth recording for the next session here: `scripts/test.ts` runs all 96 test
  files in a single `node --test` process, so budget 20 minutes and run it detached.
  *(Embedded Postgres cannot `initdb` as root in this environment — a system Postgres 16
  was used via `DATABASE_URL` instead.)*
- **`npm run smoke` was still not run locally** — CI runs it immediately after `npm test`
  in the same job, so it is covered there rather than here.
- **No Docker build** was attempted; the `docker-build` CI job covers it.
- **Nothing in `artifacts/` was executed or verified.** H-1 is a structural finding from
  file comparison, not a claim about whether that tree runs.

---

## NEEDS-SRI

1. **H-1 — which tree is canonical, and may the duplicate be removed after harvesting
   `push_tokens`?** This is the largest single cleanup available and it is blocked on a
   decision only you can make.
2. **Branch protection on `develop` requiring green CI.** Every occurrence of C-1
   would have been blocked automatically; it was red on arrival. The prior audit
   recommended this after occurrence two.
3. **The other workspace's `origin`.** A guard makes the breakage loud. It does not stop
   the merges. Pointing that workspace at a fork does.
