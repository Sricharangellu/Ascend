# AUDIT 2026-08-15T174500Z — Replit worktree import (`ascend-wt-v3`)

Session: Claude Code web — `claude/replit-import-ascend-sv4ykb`, cut from `origin/develop` at `04eea87`.
Directive (Sri, 2026-08-15): audit the Replit worktree at `Desktop/Prj/ascend-wt-v3`, identify what is
valuable and missing from ASCEND, and integrate it safely.

---

## 0. The named source was never reachable — read this before trusting anything below

`Desktop/Prj/ascend-wt-v3` is a path on Sri's local machine. This session runs in an isolated remote
container whose only content is a fresh clone of `Sricharangellu/Ascend`. There is no shared
filesystem, so the directory could not be read. This was verified, not assumed:

| Check | Result |
|---|---|
| Full-filesystem scan for `*ascend*` / `*wt-v3*` / `Desktop` / `Prj` | only `/home/user/Ascend` and Claude's own caches |
| `/mnt/attach`, `/mnt/user-data/working`, `/media`, `/workspace`, `/data` | all empty |
| `git worktree list` | one worktree, no `wt-v3` |
| `git stash list` | empty |
| All 91 remote branches | no `ascend-wt-v3`; nothing matching `wt-v3`/`wtv3` |

**Consequence:** everything below audits the Replit worktree content that *is* in this repo — the
`@workspace/*` tree merged by `64758a5` and parked under `artifacts/`. If the Desktop worktree has
diverged from what that merge captured, **this import does not cover the difference.** The honest
scope line: this is an audit of in-repo Replit content, not of `Desktop/Prj/ascend-wt-v3`.

To close the gap, push the Desktop worktree as a branch and re-run:

```bash
cd ~/Desktop/Prj/ascend-wt-v3
git checkout -b import/replit-wt-v3 && git add -A
git commit -m "snapshot: replit wt-v3 worktree for audit"
git push -u origin import/replit-wt-v3
```

---

## 1. What the Replit work in this repo actually is

Commit `64758a5` "Merge local workspace work into develop" brought **2,121 files**. Its shape matters
more than its size:

| Bucket | Files | What it was |
|---|---|---|
| `.migration-backup/` | 1,082 | the **real ASCEND repo**, moved aside wholesale (`R100` renames of `AGENTS.md`, `README.md`, `WORK/**`, `.github/**`) |
| `artifacts/` | 997 | five complete Replit projects on a Vite/Radix/Drizzle/pnpm stack |
| `lib/` | 20 | an orval/drizzle starter scaffold (`@workspace/api-{spec,zod,client-react}`, `@workspace/db`) |
| root config | ~12 | `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.npmrc`, `.replit`, `replit.md`, `tsconfig.base.json` |
| `web/` | (deleted) | the entire Next.js frontend, removed by the merge |
| `scripts/` | (deleted) | `db-setup.sh`, `seed-demo.ts`, `seed-e2e.ts`, `smoke.ts`, `test.ts`, `ops-check.ts`, `pg-harness.ts`, `products-import.json` — replaced by `scripts/src/hello.ts` |

That is a *scaffold-a-fresh-monorepo* operation that clobbered the real project. The damage was
already repaired on `develop` by the hotfix branches (`hotfix/restore-npm-root-after-replit-merge`,
`hotfix/restore-npm-root-v2`, `cursor/hotfix-develop-replit-merge-ci-604f`): `.migration-backup/` is
gone, `web/` and the real `scripts/` are back, and the pnpm root manifests are gone with
`package-lock.json` restored. `hygiene-check.mjs` check 8 now guards the recurrence.

**The `lib/` scaffold has no production value.** Measured against the real surface:

| | Replit `lib/` | Live ASCEND |
|---|---|---|
| OpenAPI | `lib/api-spec/openapi.yaml`, 36 lines, **1 endpoint** (`/healthz`) | `contracts/openapi.yaml`, 3,194 lines |
| Backend routes | — | 631 (per `contract:scan`) |
| DB schema | `lib/db/src/schema/index.ts` — commented template, `export {}`, **zero tables** | `db/migrations` (8 SQL) + `db/rls` + `db/seeds`; 168 table names |
| `@workspace/scripts` | `scripts/src/hello.ts` — one `console.log` | the real `scripts/` |

These packages are also **orphaned**: `pnpm-workspace.yaml` was removed in the npm-root restore, but
the `@workspace/*` names and `tsconfig.base.json`'s `"customConditions": ["workspace"]` remain, so
nothing resolves or builds them. Left in place (deleting user work needs Sri), recorded here.

## 2. The real find: `artifacts/api-server/`

`artifacts/api-server/` (405 files, `@workspace/api-server`) is not a scaffold — it is a
bidirectionally-diverged copy of the whole backend. Against live `src/`:

- **103 files differ**, 30 exist only in `src/`, 13 only in the Replit copy.
- Live `src/` is **ahead** on: `ai_assistant`, `demand_planning`, `payments/gateway.ts`,
  `purchasing/receiving-*`, `gateway/accessLog.ts`, `shared/{circuit-breaker,demand-rate,sales-velocity,connection-info,uom}.ts`,
  the F-5 `shared/test-request.ts` factory, and three `app.*.test.ts` suites.
- The Replit copy is ahead on exactly one shippable feature: **`push_tokens`**.

This reproduces, independently, what `WORK/LOOP_STATE.md` already records twice as **NEEDS-SRI**:

> *"`artifacts/` is a 1,004-file bidirectionally-diverged copy of the whole app — a finished, tested
> `push_tokens` module lives only there and ships to nobody."*

with the recommendation **"harvest-then-extract (own repo or orphan branch), never delete."**
This session does the harvest half. Nothing under `artifacts/` was deleted or moved.

---

## 3. Imported

### `src/modules/push_tokens/` — 6 files, 720 lines

Expo push-notification registration, tenant quiet hours, and order-alert batching.

| File | Lines | Role |
|---|---|---|
| `index.ts` | 83 | `PosModule`: 3 idempotent migrations, `order.created` subscription, route wiring |
| `service.ts` | 200 | token CRUD, Expo delivery, quiet-window evaluation |
| `routes.ts` | 81 | `POST /` · `DELETE /` · `GET /quiet-hours` · `PUT /quiet-hours` |
| `batcher.ts` | 158 | collapses an order burst into one "N New Orders · $X total" alert |
| `batcher.test.ts` | 112 | batching-window behaviour |
| `quiet_hours.test.ts` | 86 | overnight windows, timezone evaluation, fail-open |

Registered in `src/modules/index.ts` (import + registry entry, placed next to `notificationsModule`),
mounted at `/api/v1/push-tokens`.

**Why it was safe to import — each checked against live code, not assumed:**

- **Conventions.** Uses `PosModule`, `handler`/`parseBody`/`badRequest` from `shared/http.js`,
  `requireRole` from `gateway/auth.js`, `res.locals.auth` — all present and unchanged in live `src/`.
- **Event contract.** `src/modules/orders/service.ts:282` publishes `order.created` with
  `{id, tenantId, orderNumber, stateCode, totalCents, lines}`. The module reads `tenantId`, `id`,
  `orderNumber`, `totalCents` — an exact subset. No producer change needed.
- **Multi-instance dedup.** The module skips events carrying `_origin`. `src/shared/events.ts:113`
  stamps `_origin` on Redis fan-out, so exactly one instance sends per order under horizontal deploy.
- **Tenant isolation.** Every query is `tenant_id`-scoped; `push_tokens` is `UNIQUE (tenant_id, token)`,
  `push_quiet_hours` is keyed by `tenant_id`.
- **RBAC.** Token register/unregister is any authenticated user (own device). Quiet hours is
  tenant-wide config, so both read and write are `requireRole("owner")`.
- **Failure containment.** Delivery errors are swallowed inside the batcher callback — a push failure
  can never surface on the order-creation path.
- **No collision.** Live `notifications` is in-app notification records and settings; it stores no
  device tokens and sends no push. `table:scan` confirms `push_tokens`/`push_quiet_hours` collide
  with none of the 168 existing table names.

### Database changes

Three idempotent `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` statements in the
module's `migrations` array — applied at startup by the existing module-migration runner, the same
mechanism every other module uses. **No new files under `db/migrations/`, no seed or reference data,
and no production data touched.** Both tables are new and empty; there is nothing to backfill and
no existing row is read or rewritten.

### Dependencies

**None added.** The module uses `uuid`, `zod`, `express`, `pg` — all already in `package.json`.
`package-lock.json` is unchanged.

---

## 4. Excluded — and why

| Excluded | Reason |
|---|---|
| `shared/restore-verify.ts`, `src/scripts/verify-restore.ts` | **Superseded.** Live has `scripts/verify-restored-db.ts`, newer and purpose-written against ASCEND's own `db/backup/restore.sh` DR checklist. Importing the Replit version would overwrite newer work with older. |
| `shared/backup-storage.ts`, `orchestration/jobs/db-backup.job.ts`, `orchestration/tests/db-backup-alert.test.ts`, `src/scripts/remote-backups.ts` | **Real gap, deliberately not taken in this pass.** Offsite S3 backup + a self-re-enqueuing 24 h job. It adds an `@aws-sdk/client-s3` production dependency, writes `pg_dump` output to disk, sends alert email, and needs bucket/credential/retention decisions. Live already has `db/backup/{backup,restore,drill}.sh`. That is a production ops change, not an import — **recommended as a follow-up for Sri**, not slipped into this PR. |
| 41 per-module `test-request.ts` copies (incl. `notifications/`, `team/`) | **Superseded** by the F-5 single factory `src/shared/test-request.ts` (`3ed07f8`). |
| `gateway/errorEnvelope.ts` | **Superseded.** Live delivers the requestId envelope via `gateway/index.ts` + `requestId.ts` with its own `errorEnvelope.test.ts` (`342d475`). |
| `src/lib/logger.ts`, `src/middlewares/.gitkeep` | Live has `src/shared/logger.ts`; the rest is an empty placeholder dir. |
| `lib/api-spec`, `lib/api-zod`, `lib/api-client-react`, `lib/db`, `scripts/src/hello.ts` | Starter scaffold — 1 endpoint vs 3,194 lines of real contract; empty drizzle schema. Nothing to harvest. Left in place (not deleted). |
| `artifacts/ascend`, `ascend-mobile`, `ascend-pitch`, `mockup-sandbox` (600 files) | Separate apps on an incompatible stack. Already tracked as their own NEEDS-SRI extract decision in `LOOP_STATE.md`; out of scope here. |
| `.migration-backup/` | Already gone from `develop`; it was the real repo moved aside, and the repo is back. |
| `.replit`, `.replitignore`, `pnpm-*`, `.npmrc` | Replit sandbox config. `REPLIT.md` is explicit that Replit is sandbox-only and never a deploy target. |

**Secrets:** none. Every Replit-added file was scanned for password/secret/api-key/token/`postgres://`
patterns — zero hits. No Replit credential or dev-only config was promoted.

---

## 5. Conflicts resolved

| Conflict | Resolution |
|---|---|
| Replit `notifications/test-request.ts` and `team/test-request.ts` vs live `shared/test-request.ts` | Kept live (F-5 factory). Not imported. |
| Replit `errorEnvelope.ts` vs live envelope in `gateway/index.ts` | Kept live (newer, tested). |
| Replit restore-verify vs live `scripts/verify-restored-db.ts` | Kept live (newer, ASCEND-specific). |
| Replit `modules/index.ts` drops `aiAssistantModule` + `demandPlanningModule` | Not copied. Only the two `pushTokensModule` lines were added to the live registry, by hand. |
| Module placement | Registered next to `notificationsModule` rather than at the Replit copy's line offsets, so the registry stays grouped by concern. |

---

## 6. Validation

Run in this container. `embedded-postgres` cannot `initdb` as root here (the same limitation the
catalog and F-18 sessions recorded), so the suite ran against a **real PostgreSQL 16** cluster
initialised under the `postgres` user, with `DATABASE_URL` set — the harness short-circuits to it.

| Gate | Result |
|---|---|
| `npm run typecheck` | **PASS** |
| `npm test` (full suite, real PG 16) | see LOOP_STATE row — run to completion, not a stale number |
| `push_tokens` unit tests in isolation | **PASS — 15/15** (`batcher.test.ts`, `quiet_hours.test.ts`) |
| `npm run hygiene` | **PASS** — 2,230 files, no junk/tracked-env/conflict-markers/secrets/broken-doc-links |
| `npm run table:scan` | **PASS** — 168 table names, no collisions (includes the two new tables) |
| `npm run authz:scan` | **PASS** — 50 route files; every mutating route carries an authorization guard |
| `npm run contract:scan` | **PASS** — 147 documented ops vs 631 backend routes, 6 mismatches all allowlisted |

**Not run, and why — stated rather than softened:**

- **Web gates** (`web` typecheck/lint/vitest/build). Zero files under `web/` were touched and the
  change is backend-only; `web/node_modules` is not installed in this container. Not run.
- **`npm run smoke`.** The POS lifecycle smoke does not exercise push notifications; the module's own
  15 tests cover the batching and quiet-hours logic.
- **End-to-end push delivery.** No Expo device or push credential exists here, and no frontend in
  `web/` calls these routes — the only client is `artifacts/ascend-mobile`, which ships to nobody.
  **The routes are live and tested; an actual notification arriving on a real device is unproven.**
  This is the honest ceiling of the harvest: it stops the module being dead code, it does not
  demonstrate a delivered push.

---

## 7. Remaining issues

1. **`Desktop/Prj/ascend-wt-v3` was never audited.** The directive's actual source is unread. Push it
   as a branch (§0) to close this.
2. **Offsite S3 backup + daily backup job** — a real gap, deliberately excluded. Needs Sri's call on
   bucket, credentials, retention, and alert routing.
3. **`artifacts/` extraction still NEEDS-SRI.** The harvest removes the "a finished module ships to
   nobody" argument for `push_tokens`; the other four projects and the 405-file backend copy remain.
4. **Orphaned `@workspace/*` scaffold** (`lib/**`, `scripts/{package.json,tsconfig.json,src/hello.ts}`,
   `tsconfig.base.json`'s `customConditions`) resolves to nothing now that `pnpm-workspace.yaml` is
   gone. Harmless but dead; removal is part of the same extract decision.
5. **`push_tokens` routes are not in `contracts/openapi.yaml`.** `contract:scan` passes (it gates
   contract→code, and 484 backend routes are already undocumented), so this is consistent with the
   repo's current state rather than a new regression — but it is a gap. Fold into F-19/F-28.
6. **No frontend consumer in `web/`.** The module is reachable API surface with no shipping caller
   until the mobile app is extracted and deployed.
