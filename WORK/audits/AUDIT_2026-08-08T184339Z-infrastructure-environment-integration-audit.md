# Ascend — Infrastructure & Environment Integration Audit

**Prepared:** 2026-08-08T18:43:39Z · **Branch:** `claude/ascend-infrastructure-audit-mehnrd` (cut from `origin/develop` @ `0919f37`)
**Method:** every claim below is either (a) reproduced by command in this checkout, (b) read from a
live GitHub Actions run whose ID is cited, or (c) explicitly marked as an unverified carry-forward
from an existing document. Nothing is asserted from documentation alone — several of this repo's own
documents are stale, and this audit contradicts three of them with evidence.

**Status label for this document:** `Built and verified` for the findings; `Partial` for the fixes
(two verified defects fixed and tested here; the four P0s are dashboard-side and Sri-only).

---

## 0. Executive summary — the five things that matter

1. **Production has no backups.** The daily `backup.yml` run has reported *success* every day while
   producing **zero artifacts** — run `31250642991` (2026-08-08 09:28, conclusion `success`) has
   `total_count: 0` artifacts. `PROD_DATABASE_URL` is unset, so every step after the config check is
   skipped. Real RPO is **total loss**, not the ≤24h the workflow's docstring claims. This is
   standing critical **C-1** and it is the single highest-severity item in this audit.

2. **Where production runs was answered mid-audit — and the answer is a free-tier instance.**
   When this audit began, `PROD_BACKEND_URL` was **unset** and the fallback was
   `https://ascendhq-api.vercel.app`, which returned **HTTP 404** in 90 ms (run `31272326653`,
   dispatched from `develop` during this audit). **PR #206 then landed on `develop`** with Sri's
   reconfirmation: production is Render service **"Ascend Prod" (`srv-d9lo8jm7bikc739dnsn0`), Docker
   runtime, public web service, deploying from `master` via Render's own git integration, on the
   FREE plan** at `https://ascend-prod.onrender.com`. That is now the inline fallback in
   `deploy.sh`, `ci.yml`'s `smoke-test` and `uptime.yml`.

   Two consequences that are **new findings, not resolutions**:
   - **Free-plan Render spins down after ~15 min idle and cold-starts in ~50 s.** For a POS/ERP the
     first request after any quiet period takes ~50 s — a cashier opening a till, a webhook from
     Stripe, a scheduled job tick. It also means the "unreachable from three independent networks"
     evidence in `DEPLOYMENTS.md` may always have been a 15-second timeout measuring itself rather
     than an outage. Upgrading off the free plan is now a **P0 product-behaviour item**, not a cost
     optimisation.
   - **Render deploys from `master`**, which is 245 commits behind `staging` — so the production
     *backend code* is stale by the same margin as the workflows in finding 4. `PROD_BACKEND_URL`
     the repo variable is still unset; only the in-repo fallback changed.

3. **The production monitor has never once checked the one production surface that is alive.** Every
   scheduled heartbeat since ~2026-07-22 dies at step 1 — first against a dead hostname, and now
   plausibly against a free-tier cold start outlasting a 15-second timeout — so steps 2–4, including
   the frontend probe, never execute. `ascendhqweb.vercel.app` is confirmed live and is monitored by
   **nothing**. A real frontend outage today would be indistinguishable, in the Actions list, from
   the existing noise. **Fixed in this change**, and the fix is independent of both causes: it is the
   sequencing that was wrong, not the target.

4. **Scheduled workflows run the default branch's copy, and the default branch is 245 commits
   stale.** GitHub executes `schedule:` workflows from `master` only. `master` is **245 commits
   behind `staging`** and **237 behind `develop`**. So every ops hardening landed on `develop` since
   2026-07-20 is **inert in production**: the repo-variable indirection of ADR-011 (PRs #191/#197/
   #201), the backup job's "green lie" fix, and `security.yml` entirely — which does not exist on
   `master`, so its weekly CodeQL/gitleaks/SBOM re-scan **has never run and cannot run**. Proof: the
   18:03 scheduled run (`31270958830`) executed the hardcoded `curl … ascendhq-api.vercel.app/healthz`
   form that exists only on `master`, while the `develop` dispatch executed the `"$BACKEND/healthz"`
   form. This finding appears in no existing document and it changes the fix order: **setting
   `PROD_BACKEND_URL` alone will not turn the heartbeat green.**

   **And `master` cannot currently be released to — PR #209 found the mechanism while this audit was
   open.** `master`'s branch protection requires a status check named
   `Frontend — typecheck + lint + build`; commit `1a4b989` (2026-08-05) renamed that job to
   `Frontend — typecheck + lint + test + build` without updating protection. A required check that
   no job emits is never satisfied *and never fails* — it sits permanently "expected", so the merge
   button is dead for every PR into `master`. GitHub's own words on the attempted release of PR #200:
   `405 Required status check "Frontend — typecheck + lint + build" is expected.` Independently
   confirmed here by reading both job names (`master`'s `ci.yml:171` vs `develop`'s `ci.yml:330`).

   This turns finding 4 from "nobody has released" into **"nobody can release"**, and it is why
   findings 1–3 have stayed open: the fix for each of them has to travel through a merge that has
   been structurally impossible for three days. Repairing the required-check name is now the single
   highest-leverage action in this audit — it is a prerequisite for almost everything else.

5. **Two of the three tiers deploy nothing, and the third half-deploys.** `develop`'s `Deploy → Dev`
   job is **skipped** on every push (`DEV_BACKEND_URL` unset — job `93137531666`, conclusion
   `skipped`), so a green `develop` CI means "tests passed", not "dev is updated". `staging`'s
   deploy **fails on the backend half** every push: `Error: Project not found
   ({"VERCEL_PROJECT_ID":"prj_krZ34CIFjzQrMvZ08PWqqbxzBf7d"})` (run `31271109836`). The frontend half
   succeeds and is aliased to `ascend-frontend-staging.vercel.app` — pointed at
   `ascend-backend-staging.vercel.app`, which does not exist. **Staging is a live frontend with no
   backend: QA against it cannot test anything real.**

The through-line: **the engineering is well ahead of the operations.** The application layer has a
transactional outbox, a `SKIP LOCKED` job queue, distributed locks, idempotency, circuit breakers,
RLS, and 98 backend test files. None of that is reachable in production, because the deployment,
monitoring and backup layer beneath it is disconnected.

---

## 1. Current Infrastructure Inventory

Legend: **V** verified by command/run this session · **CNV** configured but not verified ·
**P** partial · **M** missing · **B** broken · **R** recommended.

### 1.1 Platform & runtime

| Component | State | Evidence |
|---|---|---|
| Backend | Node 24 (`.nvmrc`), Express 4, TypeScript strict, modular monolith — 53 domain modules under `src/modules`, 412 `.ts` files | **V** `ls src/modules`, `tsconfig.json` |
| Frontend | Next.js 14.2.29 App Router, React 18, Tailwind, `output: standalone` | **V** `web/package.json`, `web/next.config.mjs` |
| Database | PostgreSQL (Supabase managed), raw SQL via `pg` (ADR-001, no ORM) | **V** `src/shared/db.ts` |
| Serverless entry | `api/index.js` caches a `buildApp()` promise per warm instance; clears it on rejection | **V** read |
| Long-lived entry | `src/server.ts` with SIGTERM/SIGINT drain (10s), pool + Redis cleanup | **V** read |
| Container | Multi-stage `Dockerfile`, non-root `node` user, `--target runtime` built in CI (non-blocking) | **V** job `93135397324` success |
| Local dev | `docker-compose.yml` (Postgres 16 + backend + frontend), or `npm run dev` + embedded-postgres harness | **V** read |
| Desktop shell | Electron wrapper in `desktop/` | **CNV** — not built or deployed by any pipeline |

### 1.2 Environments as actually wired

| Tier | Branch | Deploy job | **Actual outcome today** |
|---|---|---|---|
| Local | — | — | **V** works: `scripts/pg-harness.ts` + `docker-compose` |
| Feature `*` | `feature/*`, `fix/*`, `claude/*`, `cursor/*` | none | **V** no CI on push; CI runs on the PR into `develop` |
| CI (ephemeral) | any PR/push to the 3 tiers | `guard`/`backend`/`frontend`/`e2e`/`docker-build` | **V** all green on `develop` run `31270468757` |
| **DEV** | `develop` | `Deploy → Dev` | **B / M** — **skipped every push** (`DEV_BACKEND_URL` unset). Nothing is deployed anywhere. |
| **TESTING** | `staging` | `Deploy → Testing` | **B** — frontend deploys + aliases OK; backend fails `Project not found`; frontend built against a dead backend origin |
| **STAGING (separate)** | — | — | **M** — does not exist. "staging" the branch maps to the "testing" tier; there is no production-like pre-prod. |
| Preview (per-PR) | any PR | Vercel GitHub App on `ascend_hq_web` | **CNV** — git-connected previews confirmed on PR #201; not isolated (shares Preview env → testing DB) |
| **PROD** | `master` | `Deploy → Production` + `smoke-test` (Vercel frontend) · **Render git integration (backend)** | **P** — last release `e55e743`, 245 commits behind `staging`. Backend = Render "Ascend Prod" (`srv-d9lo8jm7bikc739dnsn0`, Docker, **FREE plan**), deployed by Render's own git integration on `master` — **no automation in this repo deploys it**. |

### 1.3 CI/CD

| Item | State | Evidence |
|---|---|---|
| `ci.yml` — `guard` (16 steps) | **V** green | root-manifest integrity, route-authz scan (ADR-008), SQL-injection guard, hygiene, prevention agent, API gap scan, dup/dead-code scan, `npm audit` gate at `high`, actionlint, shellcheck |
| `ci.yml` — `backend` | **V** green | typecheck + `npm test` (real PG 16 service, `--shm-size=1g`) + `npm run smoke` (full POS lifecycle over HTTP) |
| `ci.yml` — `frontend` | **V** green | typecheck + lint + vitest + `next build` |
| `ci.yml` — `e2e` | **V** green, 7 Playwright specs, hard deploy gate | push-only; rate-limit flake root-caused and fixed (PIPELINE.md) |
| `ci.yml` — `docker-build` | **V** green, non-blocking | not in any `needs:` |
| `security.yml` — CodeQL, dependency-review, gitleaks, npm audit, SBOM | **P** | runs on push/PR to the 3 tiers (**V** green on `develop`); **weekly `schedule:` arm never runs** — file absent from `master` |
| `dependabot.yml` | **CNV** | grouped weekly npm (root + web) + monthly actions; majors ignored |
| `uptime.yml` | **B** | see §0.3/§0.4 |
| `backup.yml` | **B** | see §0.1 |
| Deploy mechanism | **P** | `scripts/deploy.sh` via Vercel CLI **and** a git-connected Vercel project — both fire on a `master` push (double-deploy, flagged in DEPLOYMENTS.md, still open) |
| Rollback | **P** | Vercel "promote previous deployment" + `git revert`; **no down-migrations** for the 53 module migration sets |
| IaC | **M** | zero. No Terraform/Pulumi/`render.yaml`/`fly.toml`. All infra is dashboard state. |

### 1.4 Data layer

| Item | State | Evidence |
|---|---|---|
| Connection pooling | **V** | `pg.Pool`, `PG_POOL_MAX` (default 10), 5s connect timeout, 30s idle, `allowExitOnIdle` |
| Statement timeout | **V** | `SET LOCAL statement_timeout` per tx, `PG_TX_TIMEOUT_MS` (default 30s) |
| Pool-exhaustion signal | **V** | `/readyz` returns 503 when `pool.waiting > 0` |
| TLS to Postgres | **V code / CNV prod** | `sslConfig()` verifies by default; `PG_SSL_NO_VERIFY` logs a loud warning. C-3's "universally enforced" half is unverified. |
| Migrations (runtime) | **V** | `buildApp()` runs every module's migrations under `pg_advisory_xact_lock(7381920)`, hash-tracked in `schema_migrations` |
| Migrations (SQL files) | **P — duplicated** | `db/migrations/*.sql` + `run.sh` is a **second, parallel** migration system covering only 3 foundation files. Two mechanisms, one schema. |
| Down-migrations | **M** | 3 `.down.sql` for the foundation files; **none** for the 53 module sets / ~186 tables |
| RLS | **P** | `db/rls/policies.sql` + `set_config('app.tenant_id', …, true)` per transaction. ADR-009 is explicit: **RLS is a backstop, not the boundary** |
| Backups | **B** | §0.1 — zero production backups ever taken |
| PITR / WAL archiving | **M** | `run_wal_archive` in `backup.sh` is a stub |
| Read replicas | **M** | none |
| PgBouncer | **M** | `db/README.md` documents a `db/pool/` directory that does not exist |

### 1.5 Runtime services

| Item | State | Evidence |
|---|---|---|
| Redis | **P — optional everywhere** | `openRedis()` returns `null` when `REDIS_URL` is unset; rate limiting silently degrades to per-instance, EventBus to in-process. `REDIS_URL` is a warn-only var in production. |
| Job queue | **V** | Postgres `job_queue`, `FOR UPDATE SKIP LOCKED`, exponential backoff capped at 60s, `max_attempts` |
| Dead-letter queue | **M** | exhausted jobs land in `status='failed'` and are never retried, surfaced or alerted. `/api/v1/jobs` (owner-only) is the only view. |
| Job scheduler | **P — daily** | `vercel.json` crons `/jobs/tick` at `0 6 * * *`. Worst-case latency for outbox redelivery and every scheduled job is **~24h**. |
| Transactional outbox | **V** | `event_outbox`, dual dispatch, boot reconcile + 60s in-process sweep, `MAX_ATTEMPTS=10`, durable consumers must be idempotent (ADR-003) |
| Distributed locks | **V** | `workflow_locks` table, TTL 30s, `INSERT … ON CONFLICT`, spin-acquire with timeout |
| Idempotency | **V** | `idempotency_keys` + middleware + expiry job |
| Circuit breaker | **V** | `src/shared/circuit-breaker.ts` — in-process by design, tested |
| Retry policy | **V** | `orchestration/policies/retry.policy.ts` |
| Sagas / compensations | **V** | 5 sagas, 3 compensations, workflow-state store |
| SSE | **V** | `/api/v1/stream`, tenant-scoped broker |
| Rate limiting | **V** | token bucket, Redis-backed when available; tiered per-tenant on `/api/v1`; strict per-IP on `/api/identity` |

### 1.6 Integrations

| Category | Provider | State |
|---|---|---|
| Payments | Stripe (`stripe@22.2.2`), Terminal reader, signed webhook at `/api/stripe/webhook` (raw body, `constructEvent`) | **V code / CNV live** — 503s without `STRIPE_SECRET_KEY` |
| Email | SendGrid (`src/shared/email.ts`) | **V code / CNV live** — logs to console when unset |
| SMS | — | **M** |
| Object storage | — | **M** — blocks EDI file parsing, invoice/receipt OCR, product images, document search |
| Auth / identity | in-house JWT + refresh rotation, MFA (`otpauth`), API keys (`fpk_`), SSO/OIDC | **V** |
| SSO secret storage | per-tenant OIDC client secrets in `settings_kv` | **V — accepted risk**, documented in ARCHITECTURE.md |
| Webhooks (outbound) | own subscription model, secrets encrypted with `WEBHOOK_SECRET_KEY`, fails closed | **V** |
| Analytics | — | **M** (in-app `insights` module ≠ product analytics) |
| Error tracking | hand-rolled Sentry envelope over `fetch` | **P** — no SDK, no releases, no source maps, no breadcrumbs, no frontend coverage |
| Metrics | `/metrics` Prometheus exposition (RED + pool/queue/outbox/event-loop gauges), bearer-token gated | **V produced / M consumed** — nothing scrapes it |
| Logging | `pino` JSON to stdout with credential redaction | **V produced / M aggregated** — no aggregator; **no per-request access log** |
| Tracing | W3C `traceparent` generated, `requestLogger(traceId, spanId)` | **P** — exported nowhere |
| Uptime monitoring | `uptime.yml` | **B** |
| Alerting | GitHub's "workflow went red" email only | **P** — C-4 open; no paging, routing, on-call or status page |

---

## 2. Environment / Branch Integration Map

```
Developer
   │  local: docker-compose (PG16) or embedded-postgres harness; web :3000, api :3001
   │  gates: npm run verify  (hygiene, gap:scan, table:scan, typecheck, test, smoke, web build)
   ▼
feature/* ── no CI on push ──▶ PR into develop
   │                              │
   │                              ├── CI: guard · backend(+smoke) · frontend · e2e · docker-build   ✅ verified green
   │                              └── Security: CodeQL · gitleaks · npm audit · SBOM                 ✅ verified green
   ▼ merge
develop ─── CI + Security ─┬─▶ Deploy → Dev ......... ⛔ SKIPPED (DEV_BACKEND_URL unset) → nothing deployed
   │                       └─▶ (no artifact, no environment, no URL)
   ▼ PR
staging ─── CI + Security ─┬─▶ Deploy → Testing
   │                       │      ├─ frontend → Vercel preview → alias ascend-frontend-staging.vercel.app   ✅ deploys
   │                       │      └─ backend  → ❌ Project not found (prj_krZ34CI…)                          ⛔ FAILS
   │                       └─▶ Testing smoke ......... never reached (job already failed)
   │                       Net: live staging frontend proxying /api/* at a host that does not exist
   ▼ PR (Sri-only)
master ──── CI + Security ─┬─▶ Deploy → Production (Vercel --prod, VERCEL_TOKEN_PROD)
(default)                  │      └─ + git-connected Vercel build fires in parallel → DOUBLE DEPLOY
                           └─▶ smoke-test → probes vars.PROD_BACKEND_URL || dead fallback → would fail
                           ⚠ 245 commits behind staging — last release e55e743
                           ⚠ schedule: workflows (uptime, backup, security-weekly) run THIS branch's copies
```

### Per-environment detail

| Field | Local | CI | DEV (`develop`) | TESTING (`staging`) | PROD (`master`) |
|---|---|---|---|---|---|
| Source branch | any | any of 3 | `develop` | `staging` | `master` |
| Platform | Docker / host | GH runners | **none (skipped)** | Vercel Preview | Vercel (fe) + **unknown** (be) |
| App URL | `localhost:3000` | — | none | `ascend-frontend-staging.vercel.app` **V** | `ascendhqweb.vercel.app` **V** |
| API URL | `localhost:3001` | `localhost:3001` | none | `ascend-backend-staging.vercel.app` **B dead** | `ascend-prod.onrender.com` **CNV** (Sri-confirmed 2026-08-08, PR #206; repo variable still unset, and unprobeable from here — the agent network policy 403s `CONNECT` to `*.onrender.com`) |
| Database | local PG / embedded | ephemeral PG16 service | *(would be)* Supabase `lqaicxibgrlxwkvxsaji` | Supabase `lqaicxibgrlxwkvxsaji` (us-west-2) **CNV** | Supabase `kplruangtivthgqudjwt` (ca-central-1) **CNV — never confirmed to have received a connection** |
| Redis | none | none | none | none | none |
| Storage | none | none | none | none | none |
| Env vars | `.env` | job `env:` blocks | Vercel Preview store | Vercel Preview store (**shared with dev**) | Vercel Production store + backend host |
| Env isolation | n/a | n/a | **⚠ shares Preview vars with staging** | **⚠ shares Preview vars with dev** | isolated **CNV** |
| CI workflow | `npm run verify` | `ci.yml` + `security.yml` | same | same | same |
| Deploy trigger | manual | — | push (**skipped**) | push (**fails**) | push (Sri-only merge) |
| Approvals | — | — | none | GH environment `staging` | GH environment `Production` |
| Automated tests | full suite | full suite | pre-deploy only | pre-deploy only | pre-deploy only |
| Post-deploy verify | — | — | `/healthz`+`/readyz` (never runs) | `/healthz`+`/readyz` (never runs) | 4-probe smoke (would fail) |
| Monitoring | — | — | **none** | **none** | `uptime.yml` **B** |
| Logging | stdout | job log | — | Vercel logs | Vercel logs + backend host logs |
| Error tracking | — | — | — | — | `SENTRY_DSN` **CNV** |
| Rollback | — | — | — | redeploy alias | Vercel promote / `git revert`; **no schema rollback** |
| Backup | — | — | **none** | **none** | **none taken** **B** |

### Missing / duplicated / stale / disconnected

- **Missing:** a real staging tier (production-like, own DB); object storage; a metrics collector; a
  log aggregator; alert fan-out; DLQ; down-migrations; IaC; load-test capability; a documented,
  reachable production backend origin.
- **Duplicated:** two migration systems (`db/migrations/run.sh` vs runtime `buildApp`); two prod
  deploy triggers (CLI + git-connected); `artifacts/` — **1,005 of 2,202 tracked files (46%)** are a
  parallel codebase on an incompatible stack, built and deployed by nothing.
- **Stale:** `PIPELINE.md`'s environment table still names `finder-pos-frontend.vercel.app` as the
  prod frontend; `scripts/import-products.mjs` defaults to the dead `ascendhq-api.vercel.app`;
  `db/README.md` documents a `db/pool/` PgBouncer directory that does not exist; `deploy.sh`'s header
  says "NOT git-connected", contradicted by PR #201's evidence.
- **Disconnected:** `/metrics` (nothing scrapes), traceparent (nothing collects), Sentry envelope
  (no frontend), `errorEnvelopeMiddleware` (dead code — `errorMiddleware` always responds first, so
  **no error response ever carries a `requestId`**).
- **Undocumented until now:** the default-branch rule for scheduled workflows (§0.4).

---

## 3. Branch → Environment Integration: direct answers

| Question | Answer (evidence) |
|---|---|
| What deploys from each branch? | `develop`: nothing (job skipped). `staging`: frontend only (backend job fails). `master`: frontend twice (CLI + git-connected); backend deploy targets a deleted Vercel project. |
| Where does it deploy? | Vercel team `team_WNp8vBq1RmWTEH8WSnenP7jM`, project `ascend_hq_web` (`prj_Mvvm…`) for all frontends. Backend project `prj_krZ34CI…` **does not exist**. |
| Automatic or manual? | Automatic on push to the 3 tiers; the *merge* into `master` is the human gate. |
| Which CI checks must pass? | Deploy jobs `needs: [guard, backend, frontend, e2e]`. Branch-protection required checks report `protected: true` on all three; the rule detail is not readable with the tooling available to this session. |
| Are migrations automatically applied? | **Yes — on every cold start**, inside `buildApp()`, advisory-locked and hash-tracked. There is no separate migrate step and no gate: a bad migration ships with the code. |
| Are environment variables isolated? | **Prod: yes. Dev and testing: no** — both are Vercel *Preview* builds and share the Preview variable store, therefore the same database, by explicit design (2 DBs, not 3). |
| Can testing accidentally affect production? | **Not via the pipeline.** `deploy.sh` fails closed if a non-prod tier has no `BACKEND_URL`, so a non-prod frontend cannot silently fall back to the prod backend. Two residual paths: a human pasting the prod connection string into a local `.env`, and the shared Preview store meaning a dev change alters staging's data. |
| Can production data be accessed from non-production? | Only by holding the prod credentials. No automation grants it. `.env.staging.example` warns against it explicitly. **Unenforceable** — there is no secrets manager and no access audit. |
| Are preview deployments isolated? | **No.** Per-PR Vercel previews use the shared Preview env → the shared testing database. |
| Is there a clear promotion path? | **Yes on paper, broken in practice.** `feature/* → develop → staging → master` is forward-only and enforced; but the middle two tiers deploy nothing usable, so "promotion" currently validates code, not a running system. And `master` is 245 commits behind — the path exists and is not being walked. |
| Can a bad merge break production? | **Yes.** No canary, no progressive rollout, no automatic rollback. `smoke-test` runs *after* the deploy and would fail against the dead default; nothing reverts on failure. |
| Can deployments be rolled back safely? | **Code: yes** (Vercel promote / `git revert`). **Schema: no** — no down-migrations for 53 module sets, and no restorable production backup. A data-affecting mistake is currently permanent. |
| Is there branch protection? | `master`, `develop`, `staging` all report `protected: true`. PIPELINE.md claims admin-enforced with 4 required checks; not independently re-verified this session. |
| Are required reviews/environments enforced? | GH environments `Preview`, `staging`, `Production` are declared in `ci.yml`. `CODEOWNERS` routes every path to `@Sricharangellu`. Whether the environments carry approval gates is dashboard state — **CNV**. |

---

## 4. Infrastructure Gap Analysis & Failure/Risk Matrix

| # | Failure mode | Severity | Verified? | Root cause | First breaking point |
|---|---|---|---|---|---|
| 1 | **Total data loss on a DB incident** | **Critical** | **V** — run `31250642991`, 0 artifacts | `PROD_DATABASE_URL` unset; master's `backup.yml` exits 0 silently | Any Supabase incident, bad migration, or errant `DELETE` |
| 2 | **Production backend runs on a FREE Render instance: ~15 min idle → spin-down, ~50 s cold start** | **Critical** | **V** — Sri-confirmed service identity, PR #206 | Free plan chosen at cutover; never revisited | Every first request after a quiet period — a cashier's first sale, a Stripe webhook, a job tick. Also makes availability data ambiguous |
| 2b | **No automation in this repo deploys the production backend** | **High** | **V** — `deploy_backend` targets Vercel | Render cutover was dashboard-only; no `render.yaml`, no deploy hook | A rollback or redeploy has to be done by hand in a dashboard |
| 3 | **Ops hardening inert in prod (default-branch rule)** | **Critical** | **V** — runs `31270958830` vs `31272326653` | `master` 245 commits behind; `schedule:` runs default branch | Already broken; will silently absorb future "fixes" too |
| 3b | **`master` cannot accept any merge — the release path is structurally dead** | **Critical** | **V** — PR #209's `405` + both job names read here | A required status check was renamed (`1a4b989`, 2026-08-05) without updating branch protection; the check sits permanently "expected" | Already broken since 2026-08-05. Blocks the fix for rows 1, 3 and 7, since each has to reach `master` |
| 4 | **A bad release ships a frontend that cannot reach any API** | **Critical** | **V** — ci.yml's own comment + `deploy.sh` default | `BACKEND_URL` baked at build time by `next.config.mjs` `rewrites()`; prod defaulted to a dead host | Next `master` release — **fixed here** |
| 5 | **Staging cannot validate anything** | **High** | **V** — run `31271109836` | Vercel backend project deleted; `STAGING_DEPLOY_TARGET` unset → `both` | Already broken; every QA sign-off on staging is meaningless |
| 6 | **Schema change is irreversible** | **High** | **V** — 3 `.down.sql` vs 53 module sets | Runtime migrations have no down path; no restorable backup | First bad `ALTER TABLE` in production |
| 7 | **Background jobs lag up to 24h** | **High** | **V** — `vercel.json` `0 6 * * *` | Vercel Hobby permits only daily crons | Outbox redelivery, AR dunning, reservation expiry, payment reconciliation |
| 8 | **Silent job loss** | **High** | **V** — `queue-consumer.ts` | Exhausted jobs terminate in `status='failed'`; no DLQ, no alert | A handler bug drops every job of that type, invisibly |
| 9 | **Debugging a production incident is near-impossible** | **High** | **V** — PIPELINE.md's own diagnostic run; `errorEnvelopeMiddleware` dead | No access log, no aggregator, no `requestId` in error responses | Any customer-reported error |
| 10 | **Rate limits and events don't cross instances** | **High** | **V** — `openRedis()` returns null | `REDIS_URL` unset (warn-only) | The moment prod runs >1 instance |
| 11 | **Pool exhaustion under concurrency** | **High** | **P** — mechanism verified, capacity unknown | `PG_POOL_MAX` default 10 × instances vs Supabase pooler limit; **no load test has ever run** | Unknown — that is the finding |
| 12 | **Every `/api/*` call is one proxy hop through Next** | **Medium** | **V** — `next.config.mjs` `rewrites()` | Architecture choice | Adds latency + a documented SSRF/smuggling advisory surface (`next` 14) |
| 13 | **`web` dependency advisories: 1 critical, 6 high** | **Medium** | carried from GAPS.md | Resolve only via `next` 14→16 and `vitest` 2→4 | Includes SSRF + request smuggling in `rewrites()` — the proxy path above |
| 14 | **No object storage** | **Medium** | **V** — no SDK/credential anywhere | Never provisioned | Blocks EDI parsing, OCR, product images, document search |
| 15 | **Duplicate prod deploy (CLI + git-connected)** | **Medium** | carried from DEPLOYMENTS.md | Both triggers live on the same project | Two builds of one commit race; last-writer-wins |
| 16 | **`artifacts/` — 46% of tracked files, built by nothing** | **Medium** | **V** — 1,005 / 2,202 | Foreign workspace merged in | Direct cause of 5 root-manifest CI incidents in 2 days |
| 17 | **No secrets manager / rotation / access audit** | **Medium** | **V** | GH secrets + host env only | Per-tenant OIDC client secrets sit in `settings_kv` |
| 18 | **Audit-log coverage 14 of 53 modules** | **Medium** | carried from GAPS.md | Per-module opt-in | Privileged mutations outside money paths are unattributable |
| 19 | **Two migration systems** | **Low** | **V** | Historical | Drift between `db/migrations/*.sql` and runtime migrations |
| 20 | **No GDPR erasure/export, no retention policy** | **Low (blocking for EU sales)** | carried from GAPS.md | Not built | Enterprise/EU procurement |

---

## 5. Recommended Integrations

Only items that solve a **verified** problem above. "Use what exists" was applied first: the job
queue, outbox, locks, idempotency, circuit breaker, rate limiter and `/metrics` endpoint already
exist and are **not** re-proposed — several recommendations are "connect a consumer to a signal this
platform already produces", which is cheaper and lower-risk than adding a service.

| Integration | Current state | Problem solved (row #) | Benefit | Complexity | Cost | Priority |
|---|---|---|---|---|---|---|
| **Set `PROD_DATABASE_URL` + `BACKUP_REQUIRED=true`** | job exists, unconfigured | #1 | RPO total-loss → ≤24h; the job stops lying | Trivial (1 secret, 1 var) | $0 | **P0** |
| **Upgrade Render "Ascend Prod" off the FREE plan** | free instance, spins down at ~15 min idle | #2 | Removes a ~50 s cold start from the first request after any quiet period, and makes availability data mean something | Trivial (dashboard) | ~$7/mo | **P0** |
| **Supabase PITR** (paid tier) | not enabled | #1, #6 | RPO ≤24h → minutes; makes a bad migration survivable | Low (dashboard) | ~$25/mo | **P0** |
| **Set `PROD_BACKEND_URL`** | host confirmed by Sri and wired as the inline fallback (PR #206); the repo variable itself is still unset | #2, #4 | Makes the target explicit rather than a best-known default; one edit covers monitor, release gate and prod build (ADR-011) | Trivial | $0 | **P1** (downgraded from P0 — the fallback is live now) |
| **A deploy path for the Render backend** (`render.yaml` or a deploy hook in `ci.yml`) | none — `deploy_backend` targets Vercel | #2b | The backend's deploy stops being invisible to this repo; rollback stops being a dashboard-only action | Medium | $0 | **P1** |
| **Promote `develop` → `staging` → `master`** | 245 commits behind | #3 | Makes every ops fix since 2026-07-20 actually run | Low (a release, Sri-only) | $0 | **P0** |
| **Set `STAGING_DEPLOY_TARGET=frontend` or recreate the backend project** | unset → `both` → fails | #5 | Staging becomes usable for QA | Trivial or Low | $0–$7/mo | **P0** |
| Restore drill in CI (monthly, restore the artifact into a throwaway PG + boot the app) | drilled by hand once | #1, #6 | Proves the backup is restorable; stops silent rot | Low — `smoke.ts` already boots the app | $0 (runner min) | **P1** |
| Grafana Cloud free tier scraping `/metrics` | endpoint exists, unscraped | #9, #11 | Retention + alerting on pool, queue depth, outbox backlog, event loop, RED | Low — `METRICS_TOKEN` + agent | $0 free tier | **P1** |
| Log aggregator (Better Stack / Grafana Loki free) | JSON to stdout | #9 | Searchable logs; correlate by `requestId` | Low | $0–$10/mo | **P1** |
| `pino-http` access log + repair `errorEnvelopeMiddleware` | absent / dead code | #9 | Every request logged; every error carries a `requestId` a customer can quote | Low — in-repo | $0 | **P1** |
| Alert fan-out (GH Action → Slack/PagerDuty on heartbeat + backup + job-failure) | red run only | #1, #2, #8 | C-4 closed; failures reach a human | Low | $0–$21/mo | **P1** |
| DLQ view + alert on `job_queue.status='failed'` | terminal state, no surface | #8 | Lost jobs become visible; `/api/v1/jobs` already computes the counts | Low — one metric + one alert | $0 | **P1** |
| Managed Redis (Upstash free → paid) | code-ready, unset | #10 | Cross-instance rate limits + event fan-out; unblocks horizontal scaling | Low — just set `REDIS_URL` | $0–$10/mo | **P1** |
| Move `/jobs/tick` off the daily Vercel cron (Render cron / GH Actions every 5 min) | daily | #7 | Job latency 24h → 5 min | Low — endpoint already scheduler-agnostic (ADR-012) | $0 | **P1** |
| Sentry SDK (backend + frontend) replacing the hand-rolled envelope | partial | #9 | Releases, source maps, breadcrumbs, user context, frontend errors | Medium | $0–$26/mo | **P2** |
| Down-migrations, or a written forward-only + restore policy | neither | #6 | A schema mistake stops being permanent | Medium (policy) → High (53 sets) | $0 | **P2** |
| `render.yaml` / Terraform for the winning topology | none | #2, #15 | Infra stops being unrecorded dashboard state | Medium — **blocked on P0 #2** | $0 | **P2** |
| k6 load test built from `scripts/smoke.ts` | none | #11 | Answers "how many tills concurrently?" — currently unanswerable | Medium (~90% written already) | $0 self-hosted | **P2** |
| Object storage (Cloudflare R2 / S3) | none | #14 | Unblocks EDI, OCR, images, docs — highest-leverage single prerequisite | Medium | ~$5/mo | **P2** |
| Trivy image scan on the existing `docker-build` job | image built, never scanned | #13 | CVE gate on what would ship | Low | $0 | **P2** |
| Extract `artifacts/` to its own repo | 1,005 files | #16 | Halves the tree; removes the root-hijack class | Low mechanically, **needs Sri sign-off** | $0 | **P2** |
| Secrets manager (Doppler / Infisical / Vault) | GH + host env | #17 | Central rotation, expiry, access audit | Medium | $0–$18/mo | **P3** |
| Read replica for reports | none | scale | Removes analytical load from the OLTP path | Medium | ~$25/mo | **P3** |
| CDN for product images | none | scale | Only meaningful after object storage | Low | ~$0 | **P3** |
| WAF / bot protection (Cloudflare) | app-layer rate limiting only | security | L7 protection in front of the origin | Medium | $0–$20/mo | **P3** |

**Deliberately not recommended:** BullMQ/pg-boss (the Postgres queue with `SKIP LOCKED` is adequate
and Redis is not yet even provisioned); Kubernetes (a modular monolith on a managed platform is the
right shape at this size); a service mesh; OpenTelemetry Collector before anything scrapes the
metrics that already exist; a third Supabase project (explicitly counter to Sri's 2-database
directive); an ORM (ADR-001).

---

## 6. Target Architecture

```
DEVELOPMENT
  feature/* ─▶ PR ─▶ CI: guard · backend+smoke · frontend · e2e · docker-build+Trivy · CodeQL · gitleaks · SBOM
                      └─▶ isolated preview (own ephemeral schema, NOT the shared testing DB)

TESTING (develop)                        STAGING (staging)                    PRODUCTION (master)
  Vercel Preview                           production-like                      Vercel (fe) + persistent
  Supabase TESTING ◀── shared ──┐          Supabase TESTING                     backend host (single,
  seeded demo data              │          + migration dry-run                  documented, in IaC)
  smoke on deploy               │          + smoke + k6 load                    Supabase PROD (isolated,
                                │          + approval gate ──────────────────▶  PITR on)
                                └── (today's 2-DB directive; a 3rd DB only if staging must be prod-like)

  ACROSS ALL TIERS
    Redis (Upstash)        rate limits + EventBus fan-out across instances
    Job runtime            /jobs/tick every 5 min (scheduler-agnostic, ADR-012) + DLQ surface
    Object storage (R2)    EDI uploads, OCR sources, product images
    Observability          /metrics ─▶ Grafana Cloud ─▶ dashboards + alerts
                           pino JSON ─▶ log aggregator (searchable by requestId)
                           Sentry SDK (backend + frontend, releases + source maps)
                           traceparent ─▶ (later) OTLP
    Alerting               heartbeat · backup-missing · job-failed · error-rate · pool-waiting
                             ─▶ Slack (all) ─▶ PagerDuty (prod-down only)
    Security               CodeQL · gitleaks · dependency-review · SBOM · Trivy · secrets manager
    Backup/DR              nightly pg_dump artifact + PITR + MONTHLY AUTOMATED RESTORE DRILL
    Rollback               Vercel promote (code) + PITR (data) + documented forward-only migration policy
```

The single structural change relative to today: **`master` stops being a slow-moving snapshot.** As
long as scheduled workflows execute the default branch, `master` is not just "production's code" —
it is *the operations runtime*, and letting it drift 245 commits disables monitoring and backups as a
side effect.

---

## 7–13. Strategies

**Promotion.** Keep forward-only `feature/* → develop → staging → master`. Add: (a) a maximum drift
budget for `master` — a release at least weekly, because scheduled ops workflows live there;
(b) staging as a genuine gate (migration dry-run + smoke + load) rather than a branch that deploys a
frontend with no backend; (c) an approval gate on the `Production` GH environment.

**CI/CD.** The test pipeline is genuinely strong and needs no redesign. What it lacks is *deployment
verification*: add Trivy to the existing `docker-build` job; make `docker-build` blocking once green
for a fortnight; add a post-deploy smoke that fails the run *and* triggers a rollback rather than
just reporting; add the monthly restore drill. Keep ADR-011's variable indirection — and extend the
ADR with the default-branch caveat this audit found.

**Monitoring & observability.** Everything needed is already emitted; nothing consumes it. Order:
scrape `/metrics` → alert on `pool.waiting`, `job_queue` depth, outbox backlog, event-loop delay,
5xx rate → add `pino-http` and ship logs → repair `errorEnvelopeMiddleware` so errors carry a
`requestId` → replace the hand-rolled Sentry envelope with the SDK. Fix the heartbeat so it reports
which surface is down (done here) and route it to Slack.

**Security.** Strong foundation: CodeQL, gitleaks (tree gating, history report-only), dependency
review, SBOM, `npm audit` at `high`, route-authz scanner, helmet, CORS allowlist, tenant RLS backstop,
webhook secret encryption, credential redaction in logs, non-root container. Gaps in priority order:
the weekly scan arm never runs (§0.4); no image scanning; no secrets manager; POST-side authz gaps
(GAPS.md); `web`'s critical/high advisories gated behind the `next` 14→16 migration; no WAF.

**Backup & DR.** Today: **none**. Target: nightly `pg_dump` artifact (mechanism exists, needs the
secret) + Supabase PITR + a monthly automated restore drill that boots the app against the restored
database — `scripts/smoke.ts` already does the boot-and-exercise half. Publish an RTO/RPO the team
can actually defend; the current honest numbers are RPO ∞ / RTO unknown.

**Scalability.** First breaking point is almost certainly **Postgres connections**: `PG_POOL_MAX`
default 10 per instance against a shared Supabase pooler, with `/readyz` already 503-ing on
`waiting > 0`. Second is **rate limiting and EventBus without Redis** — both silently become
per-instance the moment there is more than one instance. Third is **reports on the OLTP database**.
Order: Redis → measure with k6 → tune `PG_POOL_MAX`/pooler mode → read replica → CDN/object storage.
None of this is worth doing before #11's measurement exists.

**Enterprise readiness.** Multi-tenant: **yes** (tenant-scoped queries + RLS backstop + per-tenant
rate tiers). Multi-store: **yes** (`outlets`, `store_locations`). 20,000 concurrent users: **unknown
and currently unlikely** — single instance, no Redis, pool of 10, no load data. High-volume POS:
the offline-first sync queue and idempotency are the right primitives; the 24h job tick is not.
Disaster recovery: **absent**. Regional outage: no multi-region, no failover. Security incident: no
central audit of access, no secrets rotation. Third-party failure: circuit breaker + retry exist and
are the strongest part of this list.

---

## 14. Prioritized Roadmap

**Phase 1 — Critical (this week; all but one are Sri-only dashboard/variable actions)**
0. **Unblock `master` first — everything else queues behind it.** Settings → Branches → `master` →
   required status checks: replace `Frontend — typecheck + lint + build` with
   `Frontend — typecheck + lint + test + build`. Sri-only: protection is admin-enforced and the API
   returns `403` to agents. (The alternative — renaming the job back — is agent-doable but makes the
   name understate what the job runs. Do one, not both, and keep `PIPELINE.md`'s list in sync.)
1. Set `PROD_DATABASE_URL`; set `BACKUP_REQUIRED=true`; confirm an artifact appears.
2. **Upgrade "Ascend Prod" off Render's free plan.** ~50 s cold starts after 15 min idle are not
   viable for a POS, and they make every availability measurement ambiguous.
3. Release `staging → master` — this is what makes the ops workflows real (§0.4), and it is also
   how 245 commits of backend work reach the Render service, which deploys from `master`.
4. Set `STAGING_DEPLOY_TARGET=frontend` (or recreate the Vercel backend project).
5. Set `DEV_BACKEND_URL` or accept and document that `develop` is CI-only.
6. Enable Supabase PITR on the production project.
7. Set `PROD_BACKEND_URL` so the target is explicit rather than a fallback.

**Phase 2 — Reliability (2–4 weeks)**
Restore drill in CI · Grafana Cloud scraping `/metrics` + first five alerts · log aggregator ·
`pino-http` + `errorEnvelopeMiddleware` repair · alert fan-out to Slack · DLQ surface + alert ·
Redis · `/jobs/tick` every 5 min.

**Phase 3 — Scalability (1–2 months)**
k6 from `scripts/smoke.ts` · tune pool/pooler from the measurement · object storage · Sentry SDK ·
Trivy · read replica if reports prove to be the load · `next` 14→16 (closes the critical/high
advisories and enables nonce-based CSP).

**Phase 4 — Enterprise (quarter)**
IaC for the confirmed topology · secrets manager · down-migration or forward-only policy ·
audit-log coverage to all privileged mutations · GDPR erasure/export · WAF · multi-region DR plan ·
`artifacts/` extraction.

---

## 15. Changes Implemented in This Change

Three verified defects fixed, plus an ADR and a documentation reconciliation. All are in-repo, need
no dashboard access, and change no working path. A fourth fix (the error envelope) was landed
independently on `develop` by PR #211 while this branch was open and **theirs was taken** — see §17
row 8, which records the collision rather than quietly absorbing it.

**A. `.github/workflows/uptime.yml` — the heartbeat now actually monitors production.**
*Problem (verified):* steps run sequentially, so the first backend failure aborted the job. Run
`31272326653` died at step 1 in 90 ms; the frontend probe never executed. Every red run since
~2026-07-22 has the same shape, so `ascendhqweb.vercel.app` — the one confirmed-live production
surface — has never been checked.
*Fix:* the three backend probes carry `continue-on-error: true` (the job still fails, via a new
`Verdict` step) so the frontend probe always runs. `Verdict` writes a job summary naming which
surface is down, and distinguishes **"`PROD_BACKEND_URL` not configured — not an outage signal"**
from **"backend configured and down"**, which the run status alone cannot express. The dead fallback
hostname is deliberately **not** changed — ADR-011's evidence bar forbids merging an unverified URL.
A header comment records the default-branch rule so the next editor knows the file is inert until it
reaches `master`.
*Verified:* `actionlint` 1.7.12 clean on all workflows; the `Verdict` script extracted and
`shellcheck`-clean; exercised under `bash -e` across all 8 permutations of
(configured × backend × frontend) — exit 0 only when both surfaces pass; job-summary output rendered
and inspected.

**B. `scripts/deploy.sh` — SUPERSEDED mid-audit by PR #206; replaced with a regression guard.**
*What I originally did:* prod was the only tier whose `BACKEND_URL` fell back to a literal, and that
literal was `https://ascendhq-api.vercel.app` — dead since 2026-07-23. Since `web/next.config.mjs`
reads `BACKEND_URL` inside `rewrites()`, which Next evaluates at **build time** and freezes into
`routes-manifest.json`, a release taking that default shipped a frontend nobody could log in to and
reported success. I made all three tiers fail closed.

*What happened:* PR #206 landed on `develop` while this audit was in progress, with Sri's
reconfirmation of the real host, and repointed the fallback at `https://ascend-prod.onrender.com`
instead. **I dropped my change and took `develop`'s.** My justification for deviating from ADR-011
("a fallback confirmed dead is not a default, it is a defect") was conditional on the fallback being
dead. It no longer is, so the deviation is no longer warranted, and ADR-011's considered decision —
made with Sri's direct input — stands.

*What I kept, because it guards the failure ADR-011 cannot catch by itself:* two tests in
`src/shared/deploy-guard.test.ts` asserting that no deploy or probe fallback — in `deploy.sh`,
`ci.yml` or `uptime.yml` — resolves to a hostname `DEPLOYMENTS.md` records as dead. ADR-011 keeps
fallbacks deliberately; the gap is that nothing noticed when one silently rotted, which is how a dead
host sat in the production build path for two weeks. The workflow test is not vacuous: it currently
inspects five real fallbacks across the two files.

*One defect this merge created, found and fixed here:* with `continue-on-error`, all four probes now
run instead of aborting at the first — and PR #206 had widened each to a ~10-minute retry budget for
the cold start. Against `timeout-minutes: 5` the job would be killed mid-probe and the `if: always()`
Verdict step would never run, reporting neither result nor summary. Fixed by giving only `/healthz`
(the request that actually pays the wake-up) the full cold-start budget, leaving the other three at
~100 s, and raising the job timeout to 20 minutes. Without that split, a fully-down production would
take ~40 minutes to report — longer than the 15-minute interval, so every run would be cancelled by
the next before saying anything.

**C. `src/gateway/accessLog.ts` — one structured log line per completed request.**
*Problem (verified):* §4's risk #9. `pino` was configured and redacting correctly, but nothing logged
requests, so a ten-minute production run emitted **three lines, all from boot**. PIPELINE.md's own
diagnostic walkthrough ends at "check the logs"; there was nothing in them to check. A customer
reporting "it failed around 3pm" left an operator with no record that the request had ever arrived.
*Fix:* a `res.on("finish")` hook mirroring the idiom `metricsMiddleware` already establishes —
mounted as layer 2b, after metrics and before rate limiting, so a rate-limited request is still
logged. Severity is derived, not fixed: probe paths (`/healthz`, `/readyz`, `/health`, `/metrics`)
log at `debug` so a 15-minute heartbeat cannot bury real traffic, 5xx at `error`, 4xx at `warn`,
everything else at `info`. The line carries method, normalised path, status, duration, `requestId`,
`traceId` and auth/tenant context — and **never** a body, header or query string, so it cannot become
a new way to leak a credential past `pino`'s redaction.
*Design note:* the decision is a pure function, `buildAccessLogLine(req, res, durationMs)`, with the
middleware a four-line wrapper. That was not a stylistic preference — the first version tested the
middleware by capturing `process.stdout.write`, and captured **zero lines**, because in development
`pino` writes through a worker-thread transport straight to fd 1 and never touches the patched
function. Extracting the decision made it testable against no sink at all.
*Verified:* 5 tests in `src/gateway/accessLog.test.ts`, all passing — severity mapping including
`429 → warn` and probes → `debug`; correlation ids and auth context present; no credential-carrying
field emitted; and end-to-end through a real server that the logged `requestId` equals the
`x-request-id` response header, which is the property that makes the log joinable to a customer
report. `pino-http` was deliberately not added (see §17 row 8).

**D. `ADR-014-master-is-the-operations-runtime.md`** — writes down §0's central finding as a standing
rule, since it is the one thing in this audit that no existing document stated and that silently
invalidates ops work: a scheduled-workflow change is not done when it merges, it is done when it
reaches the default branch and a scheduled run from there demonstrates it.

**E. Documentation reconciled with today's evidence** — `docs/architecture/DEPLOYMENTS.md` and
`docs/architecture/PIPELINE.md`. Most consequentially, DEPLOYMENTS.md's **open contradiction is now
closed**: the 2026-07-20 claim ("the non-prod backend Vercel project was deleted") is correct and the
2026-07-23 finding ("it still resolves") is superseded — run `31271109836` proves the project ID is
gone (`Error: Project not found`).

**Not changed, deliberately:** the dead fallback hostnames in the probes (ADR-011); `master`'s copies
of anything (release is Sri's call); `BACKUP_REQUIRED`'s default; `artifacts/`; anything requiring a
Vercel/Render/Supabase/GitHub-settings credential.

---

## 16. Remaining Risks

- **Production availability is still unmeasured.** The origin is now known, but nothing in this
  session could probe it: the agent network policy answers `403` to `CONNECT` for `*.onrender.com`.
  Fix A makes the monitor capable of telling the truth; the first scheduled run from `master` after a
  release is what will actually establish whether production answers.
- **A free-tier cold start and a real outage look the same to a probe.** PR #206's widened timeouts
  mitigate this; upgrading the plan removes it. Until then, treat a single red heartbeat as
  "investigate", not "production is down".
- **Zero restorable backups.** Unchanged by this PR — it needs a secret only Sri holds.
- **Fixes A and B do not take effect for the scheduled heartbeat until `master` is released.**
  Fix A's own header says so; that is the point of §0.4.
- **`master` is 245 commits behind and cannot currently be merged into**, so production is running
  ~3 weeks of superseded code including the pre-audit security posture — and will keep doing so until
  the required-check name is repaired. That repair is Sri-only.
- **The same failure mode can recur silently.** Renaming a required CI job raises no error anywhere
  until someone attempts a merge, which on a release branch may be weeks later. Nothing in the repo
  cross-checks job names against branch protection, and nothing can — the protection API is not
  readable by agents.
- **Load behaviour is unknown.** No capacity claim in this document is measured; #11 is a finding,
  not an estimate.
- **`STAGING_BACKEND_URL` still points at a dead host**, so even after the backend deploy is
  repaired, the staging frontend's baked origin needs the variable updated in the same edit.
- **`web/next.config.mjs` can still ship the dead origin.** It holds a third copy of the fallback
  that neither PR #206 nor this change touched, and the git-connected Vercel build bypasses
  `deploy.sh` entirely (§15.B, task 13).
- **No automation in this repo deploys the production backend.** Render's git integration on `master`
  does it, invisibly to CI. A rollback of the backend is a dashboard action nobody has drilled.
- **This audit could not read GitHub repo variables, secrets, branch-protection rules, or the
  Vercel/Render/Supabase dashboards.** Everything about them here is inferred from workflow behaviour
  (which is strong evidence for *unset*, weaker for *set-and-correct*) and is labelled accordingly.

---

## 17. Exact next tasks for the next agent

**Sri-only (blocking, in this order — 0 gates the rest):**
0. **Repair `master`'s required-check name** (see Phase 1 item 0 and `PIPELINE.md`'s warning box).
   Until this is done, task 3 below is impossible and every ops fix on `develop` stays inert.
1. Answer DEPLOYMENTS.md's P0: open the Render (or whichever) dashboard and record the production
   backend's service name, URL, branch, build/start command, public-vs-private, and running state.
   Then set repo variable `PROD_BACKEND_URL`.
2. Set repo secret `PROD_DATABASE_URL`, run `backup.yml` via `workflow_dispatch`, and confirm a
   `db-backup-*` artifact is attached. Then set `BACKUP_REQUIRED=true`.
3. Release `staging → master`. Until this happens the scheduled heartbeat, the backup job's honesty
   fix, and the weekly security scan remain inert (§0.4).
4. Set `STAGING_DEPLOY_TARGET=frontend` (if the backend is not on Vercel) **and** update
   `STAGING_BACKEND_URL` to wherever the staging backend actually is; or recreate the Vercel backend
   project and set `VERCEL_BACKEND_PROJECT_ID`.
5. Decide `develop`: set `DEV_BACKEND_URL` to give it a deploy target, or accept CI-only and remove
   the `deploy-dev` job so a green run stops implying a deployment.
6. Enable Supabase PITR on the production project.

**Progress on the agent-actionable list (updated 2026-08-11, PR #208 — reconciled against `develop`):**

Three of these rows changed meaning after they were first written, because concurrent sessions landed
overlapping work on `develop` while this branch was in flight. The rows are corrected in place rather
than left as they were filed; where another PR's version won, that is stated and the reason given.

| # | Item | State |
|---|---|---|
| 8 | `pino-http` request logging + repair `errorEnvelopeMiddleware` | **DONE — one half here, one half by PR #211.** *Request logging* is this PR's: `gateway/accessLog.ts` emits one structured line per completed request, `develop` had none. It was implemented **without** `pino-http` — `metricsMiddleware` already establishes the `res.on("finish")` idiom, so matching it cost ~40 lines and no new dependency, which also avoids a supply-chain decision in a repo that pins even actionlint by release tag. *The envelope repair* was landed independently by **PR #211** while this branch was open, consolidating in the opposite direction: it folded the envelope into `errorMiddleware` and deleted `src/gateway/errorEnvelope.ts`, where this branch had deleted `errorMiddleware` and kept the gateway file. **Theirs was taken wholesale on merge** — it is the merged incumbent, and it found a defect this branch missed: `contextFromRequest` reads `req.id` and the `x-trace-id`/`x-span-id` *request* headers, none of which this app sets, so **every 500 ever logged also carried `requestId: undefined`**. Both sides of the correlation were broken, not just the response side. This branch's envelope change, its `CONTRACTS.md` edit and its `errorEnvelope.test.ts` are dropped. |
| 9 | DLQ surface (`/metrics` gauge for `job_queue` failures) | **ALREADY DONE on `develop` — this audit was wrong to list it.** `collectRuntimeGauges` emits `job_queue_depth{status="failed"}` plus `job_queue_oldest_due_age_ms` and the outbox backlog. The error was mine: §1.5's "no DLQ surface" came from reading `master`'s `app.ts`/`metrics.ts` before this branch was rebased onto `develop`, and I did not re-check it after. The genuinely open half is the *alert*, which needs a collector (task in Phase 2). |
| 12 | ADR for the default-branch rule | **DONE.** `ADR-014-master-is-the-operations-runtime.md` — states the invariant (a scheduled-workflow change is not done until it reaches `master`), a drift budget, and the rule that a monitoring "fix" is pending until a scheduled run from `master` demonstrates it. Records why making `develop` the default branch — the tempting fix — is worse: the heartbeat exists to test production, and running it from `develop` would monitor production with unreleased configuration, and would point `backup.yml` at the production database from unreviewed code. **Renumbered 013 → 014 on merge:** `develop` took ADR-013 for a different subject (schema is forward-only, recovery is by restore) while this branch was open. Two ADRs numbered 013 is exactly the ambiguity the numbering exists to prevent, so this one moved; the incumbent on `develop` kept its number. |
| 7 | Restore drill in CI | **CLOSED on `develop` by PR #212 — this PR's draft was withheld and is now obsolete.** This session wrote a `scripts/restore-drill.sh` and **deliberately did not ship it**: the sandbox Postgres was killed three times mid-run and ended in a slow crash-recovery loop, so the drill never once completed. Shipping an ops check that has never executed is the exact failure this audit spends its length arguing against — `backup.yml` reported success 18 times while backing up nothing. That judgement stands, and it turned out to cost nothing: `develop` now carries `db/backup/drill.sh` + `.github/workflows/restore-drill.yml`, which run on a real `postgres:16` service container, and they are **stronger than the withheld draft** on three counts — a per-table *content checksum* rather than a row count (so `users.password_hash` is provably intact byte for byte), an enforced RTO budget, and a refusal to run against an empty source (which would otherwise pass trivially). Their scope note is also the correct one and matches this audit's C-1: a green run proves the *mechanism*, not that production is recoverable, because `PROD_DATABASE_URL` is still unset. **C-1's production half remains OPEN** — a drill proves the path, it cannot conjure a backup nobody took. |
| 10 | Trivy image scan | **DEFERRED — blocked, with a reason.** Not for the reason `security.yml` records ("needs a third-party action, which is Sri's call"): that objection is answerable, since a pinned release binary is the same trust model this repo already accepted for `gitleaks` and `actionlint`. The actual blocker is narrower — this session's GitHub access is scoped to `Sricharangellu/Ascend`, so `api.github.com/repos/aquasecurity/trivy/releases` returns "access to this repository is not enabled". I cannot resolve a real version to pin, and pinning a guessed tag ships a step that 404s at runtime — an unverified value that *looks* fixed, which ADR-011's evidence bar exists to prevent. Any session with wider network access can finish this in one step. |

**Agent-actionable now (no credentials needed, in dependency order):**
7. Add the monthly restore-drill job: download the latest `db-backup-*` artifact, `pg_restore` into a
   throwaway Postgres service, boot the app against it, run `scripts/smoke.ts`. Closes C-1's
   never-re-proven half. *(Depends on task 2 for a real artifact; can be written and dry-run against
   a seeded DB first.)*
8. Add `pino-http` request logging and repair `errorEnvelopeMiddleware` — mount it so `{error:{code,
   message,requestId}}` is actually delivered, and add the test that would have caught it being dead.
9. Add a DLQ surface: a `/metrics` gauge for `job_queue` rows in `status='failed'`, plus the
   `/api/v1/jobs` summary already computed — then an alert once a collector exists.
10. Add Trivy to the existing `docker-build` job (report-only first, per ADR-008/010).
11. Write the k6 script from `scripts/smoke.ts` and run it against a tier that exists (blocked on
    task 4 — there is currently nowhere to point it).
12. Extend ADR-011 with the default-branch caveat, or open a new ADR: "scheduled workflows execute the
    default branch; `master` is the operations runtime, not just production's code." *(Shipped as
    ADR-014 — 013 was taken by `develop` in the meantime.)*
13. Close the second half of Fix B: `web/next.config.mjs`'s `rewrites()` has its own
    `VERCEL_ENV ? "https://ascendhq-api.vercel.app" : …` fallback, and the git-connected Vercel build
    never runs `deploy.sh`. Either set `BACKEND_URL` in the `ascend_hq_web` Vercel project
    environment (Sri, dashboard — the low-risk option), or make that branch throw at build time.
    Blocked here by two ACTIVE `web/**` locks and by the inability to validate a preview build from
    this container.

**Do not:** merge a "fixed" production URL that has not answered a request (ADR-011); add IaC before
task 1 is answered (it would create a fourth conflicting picture of production); add a third Supabase
project; re-propose the queue/outbox/lock/idempotency/breaker primitives — they exist and work.
