# Ascend CI/CD Pipeline — 3-Tier Promotion

A single, forward-only promotion pipeline across three environments. Code is built on **develop**,
QA'd on **staging**, and released on **master**. Each tier is wired to its own full stack (Vercel +
Supabase) and gated by CI. The Vercel projects are **not** git-connected — GitHub Actions
(`.github/workflows/ci.yml`) drives deploys via `scripts/deploy.sh` (the Vercel CLI).

## Environments

| Tier | Git branch | Vercel env | Database | Frontend URL |
|---|---|---|---|---|
| **PROD** | `master` (default) | Production (`vercel --prod`) | Supabase **A** (prod) | finder-pos-frontend.vercel.app |
| **TESTING** | `staging` | Preview (stable alias) | Supabase **B** (testing) | `STAGING_FRONTEND_ALIAS` |
| **DEV** | `develop` | Preview (unique per deploy) | Supabase **B** (shared) | per-deploy preview URL |
| feature work | `feature/*` | — (CI tests only) | ephemeral CI Postgres | — |

`develop` and `staging` both deploy as Vercel **Preview** builds, so they share the Preview
environment variables → the same **testing** database (Supabase B). Production is fully isolated on
Supabase A. This gives real isolation with **two** databases, not three.

## Promotion flow (forward-only)

```
feature/*  ──PR──▶  develop   → CI + deploy DEV     (preview, testing DB)
develop    ──PR──▶  staging   → CI + deploy TESTING (preview alias, testing DB) + smoke
staging    ──PR──▶  master    → CI + deploy PROD    (--prod, prod DB) + smoke
```

- **Start work:** branch `feature/<name>` off `develop`. Open a PR into `develop`.
- **Promote to QA:** open a PR `develop → staging`. On merge, TESTING redeploys.
- **Release:** open a PR `staging → master`. On merge, PROD redeploys.
- **Hotfix:** branch off `master`, PR into `master`. After release, back-merge
  `master → staging → develop` so the lower tiers stay ahead.

Every branch requires the CI status checks (`Production guard`, `Backend — typecheck + test`,
`Frontend — typecheck + lint + build`) to pass before merge. Force-push is blocked.

> **⚠ BROKEN SINCE 2026-08-05 — `master` cannot accept any merge. Read before attempting a release.**
>
> The third name above is what `master`'s branch protection actually requires, and **nothing produces
> it any more.** Commit `1a4b989` ("test(web): add route-integrity guard and run web tests in CI",
> 2026-08-05) renamed that job to **`Frontend — typecheck + lint + test + build`** without updating
> branch protection or this line. A required check that no job emits is never satisfied and never
> fails — it sits permanently "expected", so the merge button is dead for every PR into `master`.
>
> Verified 2026-08-08 by attempting the release merge of PR #200. GitHub's answer, verbatim:
>
> ```
> 405 Required status check "Frontend — typecheck + lint + build" is expected.
> ```
>
> This is why `master` has not moved since 2026-07-23. It also means the release PR's other red
> checks are **red herrings** for the merge block: `CodeQL` (17 pre-existing alerts, all against a
> `master` baseline CodeQL has never analysed — it passes on every `develop`-based PR with identical
> code) and `Deploy → Testing` (fails only on its backend half, which uploads to Vercel while the
> backend runs on Render). Neither is what GitHub names when the merge is refused.
>
> **Two remedies, either one sufficient — pick one, do not do both:**
> 1. *Preferred.* Settings → Branches → `master` → required status checks: replace
>    `Frontend — typecheck + lint + build` with `Frontend — typecheck + lint + test + build`, then
>    correct the list above. Keeps the accurate job name. **Sri-only** — protection is
>    admin-enforced and the API returns `403 Resource not accessible by integration` to agents.
> 2. Rename the job back to `Frontend — typecheck + lint + build`, restoring the contract both this
>    document and branch protection already record. Agent-doable, but the name then understates the
>    job, which does run the web tests.
>
> **Whichever is chosen, keep this line and the protection setting in sync.** The failure mode is
> silent by construction: renaming a required job produces no error anywhere until someone tries to
> merge, which on a release branch may be weeks later.

## Release policy (standing rule, confirmed 2026-07-19)

**Nothing reaches `master`/production without Sri's explicit command.** This isn't a convention —
it's structurally enforced, not just followed:

- `master` branch protection requires all 4 CI checks green **and** is admin-enforced (no bypass,
  including for repo admins).
- No workflow anywhere auto-merges a PR — confirmed no `gh pr merge`, `--auto`, or equivalent exists
  in any `.github/workflows/*.yml`. A human (or an agent acting on Sri's explicit instruction) must
  click merge every time.
- `deploy-production` triggers **only** on a `push` event to `master` — which only happens as the
  direct result of that merge. There is no scheduled, automatic, or conditional path to production
  that bypasses a human decision.

Practical shape from Vercel's side: there are really only **two** live deploy destinations —
**Production** (`master` only) and **Preview** (`develop` and `staging` both land here, distinguished
by alias). Git's 3-tier branch model exists to gate what reaches Production, not to create a third
Vercel environment. The moment a PR is merged into `master`, the pipeline runs end-to-end
automatically and production reflects the change — that merge is the one and only trigger.

Any agent/session working on this repo: treat a merge into `master` as requiring the same standing
explicit authorization as any other hard-to-reverse, production-affecting action — ask first, every
time, even if CI is green.

## What CI does per branch (`.github/workflows/ci.yml`)

- **Every push & PR** on `develop`/`staging`/`master`: `guard`, `backend` (typecheck + test + smoke
  on ephemeral Postgres), `frontend` (typecheck + lint + build), `e2e` (Playwright on ephemeral PG).
- **push `develop`** → `deploy-dev` → `DEPLOY_ENV=dev scripts/deploy.sh both` (preview, testing DB).
- **push `staging`** → `deploy-staging` → `DEPLOY_ENV=testing scripts/deploy.sh both` (preview aliased
  to stable staging domains) → smoke `/healthz` + `/readyz` on the testing backend.
- **push `master`** → `deploy-production` → `DEPLOY_ENV=prod scripts/deploy.sh both` (`--prod`) →
  `smoke-test` (`/healthz`, `/readyz`, `/api/v1/flags`→401, frontend 200).

## Configuration (GitHub + Vercel + Supabase + Render)

**Status (2026-07-20): PROD reconfigured onto Render, non-prod tiers currently DOWN, not
aspirational-but-live.** The section below is the target state. What actually changed this pass:

- **Production backend moved off Vercel serverless onto Render** (persistent process, no cold
  starts — see `ARCHITECTURE.md`). `deploy-production`/`smoke-test` in `ci.yml` still deploy/probe a
  Vercel backend — that path is now redundant for the backend half and needs reconciling; Render's own
  git-integration auto-deploy on push to `master` is what actually ships prod today. Frontend still
  deploys via Vercel (project `ascend_hq_web`, git-connected to `master`).
- **`develop`/`staging` backend hosting is currently DOWN**, not merely unconfigured: the Vercel
  projects `ci.yml`/`scripts/deploy.sh` target (formerly `finder-pos-backend`/`ascend-backend`) were
  deleted this session. `https://ascend-backend-staging.vercel.app` returns `DEPLOYMENT_NOT_FOUND`
  (verified 2026-07-20) — confirm this before assuming the smoke-test rows below still apply.
- **Database topology is fixed at exactly 2 projects** (Sri directive, 2026-07-20, reconfirmed): one
  Supabase project shared by `develop` **and** `staging`, one fully isolated for `master`/production.
  `ci.yml`'s `deploy-dev` job previously carried a `DEV_DATABASE_URL` override that would have given
  `develop` its **own third database**, contradicting this — removed; `develop` now falls back to the
  same Preview-environment `DATABASE_URL` that `staging` uses, same as the design below always said.

## Configuration registry (authoritative — refreshed 2026-07-30)

Every credential/config item this repo knows about, verified against the actual GitHub
secrets/variables API and `.env.example` this session (not assumed). **Never lists values** —
placeholders only. An item marked UNVERIFIED means: the name/purpose is known, but its actual
current value/live status was not independently confirmed this pass (usually because it lives
in a dashboard — Render/Vercel/Supabase/Replit — this investigation hasn't had access to).

### GitHub repo **secrets** (Settings → Secrets and variables → Actions → Secrets)

| Name | Purpose | Environment(s) | Used by | Owner | Rotation guidance | Verification status |
|---|---|---|---|---|---|---|
| `VERCEL_TOKEN` | Vercel API token, team-scope | Dev, Testing | `ci.yml`'s dev/testing deploy jobs, `scripts/deploy.sh` | Platform (Sri) | Generate a new token in the Vercel dashboard (Account Settings → Tokens), then `printf '%s' '<token>' \| gh secret set VERCEL_TOKEN --repo Sricharangellu/Ascend` (pipe via stdin, never as a `--body` CLI argument). Was dead for 10 days (found 2026-07-20, commit `c8185d9`, never actioned) until rotated 2026-07-30. | VERIFIED — rotated and confirmed set 2026-07-30 |
| `VERCEL_TOKEN_PROD` | Vercel API token, prod-scope | Production | `ci.yml`'s prod backend deploy job (Legacy — see `DEPLOYMENTS.md`; this job is redundant if Render is the real prod backend, not yet reconciled) | Platform (Sri) | Same mechanism as `VERCEL_TOKEN`, separate token. Rotated 2026-07-30. | VERIFIED — rotated and confirmed set 2026-07-30; **whether this secret is even needed depends on the unresolved Render-vs-Vercel question in `DEPLOYMENTS.md`** |
| `DEV_DATABASE_URL` | Dev tier's own isolated database connection override | Dev | `ci.yml`'s `deploy-dev` job (`scripts/deploy.sh`'s `DATABASE_URL` override mechanism) | Platform (Sri) | Rotate via Supabase dashboard (regenerate connection string), then `gh secret set` | UNVERIFIED — exists, live value/currently-working status not re-checked this session |
| `DEV_PG_CA_CERT_B64` | Base64 CA cert for the dev-tier DB's TLS verification | Dev | Same as above | Platform (Sri) | Regenerate alongside `DEV_DATABASE_URL` if the underlying Supabase project's cert chain changes | UNVERIFIED — exists, not re-checked this session |

### GitHub repo **variables** (non-secret — Settings → Secrets and variables → Actions → Variables)

| Name | Purpose | Environment(s) | Used by | Owner | Verification status |
|---|---|---|---|---|---|
| `STAGING_BACKEND_URL` | Testing-tier backend origin the frontend proxies to | Testing | dev + testing frontend build target; testing smoke | Platform (Sri) | **DEAD** — `x-vercel-error: DEPLOYMENT_NOT_FOUND`, confirmed 2026-07-20 and re-confirmed this session; project was deleted |
| `STAGING_BACKEND_ALIAS` | Stable alias the testing-tier backend deploy pins to | Testing | testing backend alias step in `scripts/deploy.sh` | Platform (Sri) | **DEAD** — same project as above |
| `STAGING_FRONTEND_ALIAS` | Stable alias the testing-tier frontend deploy pins to | Testing | testing frontend alias + environment URL | Platform (Sri) | **DEAD** — confirmed via the PR #116 staging-deploy failure log this session (aliasing an empty/failed deploy URL) |

Non-prod backend hosting needs to be rebuilt from scratch (NEEDS-SRI: Render, like prod, or a fresh
Vercel project — pick one before re-activating `deploy-dev`/`deploy-staging`). See `DEPLOYMENTS.md`
for the full investigation this depends on.

### Application environment variables (`.env.example` — 27 vars, pulled directly, not guessed)

| Name | Purpose | Used by | Storage location | Rotation guidance | Verification status |
|---|---|---|---|---|---|
| `DATABASE_URL` | Postgres connection string | `src/shared/db.ts`, every module | Render/Vercel env (backend host — see `DEPLOYMENTS.md` for which), or `DEV_DATABASE_URL` GH secret override for dev tier | Regenerate via Supabase dashboard; update wherever the real backend host stores env vars | VERIFIED present + actively used; **which host actually holds the live value is UNVERIFIED — see `DEPLOYMENTS.md`** |
| `PG_POOL_MAX` | Postgres connection pool size cap | `src/shared/db.ts` | Same as `DATABASE_URL`'s host | No rotation — a tuning value, not a credential | VERIFIED (code reference) |
| `PG_TX_TIMEOUT_MS` | Per-transaction statement timeout | `src/shared/db.ts` | Same | No rotation — tuning value | VERIFIED — actively tuned per-environment (CI got its own headroom, PR #118) |
| `PG_SSL` | Enable/disable TLS to Postgres | `src/shared/db.ts` | Same | No rotation — config flag | VERIFIED (code reference) |
| `PG_CA_CERT` / `PG_CA_CERT_B64` | Custom CA certificate for DB TLS verification (raw PEM / base64) — **two distinct formats, not a duplicate** | `src/shared/db.ts` (C-3 hardening) | Same | Regenerate alongside the Supabase project's cert chain if it rotates | VERIFIED — real fix, `WORK/LOCK.md` "session D — C-3: verified DB TLS" |
| `PG_SSL_NO_VERIFY` | Explicit escape hatch to skip cert verification (logs a loud warning) | `src/shared/db.ts` | Same | Should not be set in production outside a documented exception | VERIFIED (C-3 fix) |
| `JWT_SECRET` | Signs/verifies auth tokens (identity, SSO, webhooks all reference it) | `src/identity/*`, `src/modules/sso/*`, `src/modules/webhooks/*` | Wherever the backend host stores env vars | Rotating invalidates every live session — coordinate a maintenance window; generate via `crypto.randomBytes(64).toString('hex')` | VERIFIED (code reference, multiple modules) |
| `APP_URL` | This app's own public URL (used for self-referencing links, e.g. in emails) | Inferred from name, not traced to a specific call site this pass | Same | No rotation — a URL, not a credential | UNVERIFIED (present in `.env.example`, purpose inferred) |
| `BACKEND_URL` | Backend origin the frontend proxies to, non-prod tiers | `scripts/deploy.sh` (explicit header comment confirms this exact meaning) | CI-provided at deploy time | N/A — must match whatever the real non-prod backend host is (currently unresolved, see `DEPLOYMENTS.md`) | VERIFIED (deploy.sh's own documented purpose) |
| `TRUST_PROXY_DEPTH` | Express `trust proxy` depth, for correct client-IP detection behind a reverse proxy | Gateway/rate-limiting middleware, inferred from name | Backend host env | No rotation — config value | UNVERIFIED (present, purpose inferred, not traced to a specific call site) |
| `WEBHOOK_SECRET_KEY` | Encrypts stored webhook secrets; fails closed in production if unset | `src/modules/webhooks/service.ts` | Backend host env | Rotating re-encrypts stored webhook secrets — needs a migration, not just a value swap | VERIFIED — real fail-closed behavior, `WORK/audits/AUDIT_2026-07-12T013607Z-webhook-secret-fail-closed.md` |
| `CRON_SECRET` | Authenticates scheduled/cron-triggered endpoints | Scheduled job routes | Backend host env (Vercel Cron or equivalent) | Rotate + update wherever the scheduler is configured to send it | VERIFIED as a real concept (`WORK/LOOP_STATE.md`'s "C-2 completion" item); live value not re-checked |
| `JOBS_TICK_SECRET` | Authenticates the `/jobs/tick` endpoint (ACPA M1.2 job-runtime) | `src/orchestration/*` | Backend host env | Rotate + update wherever `/jobs/tick` is triggered from | VERIFIED (referenced in `ARCHITECTURE.md`'s ACPA M1.2 note) |
| `REDIS_URL` | Optional Redis connection — **falls back to in-memory if unset**, per this repo's own architecture doctrine | Queue/cache layer | Backend host env | Rotate via Redis provider dashboard | VERIFIED (code reference + explicit doctrine: Redis is optional, not required) |
| `STRIPE_SECRET_KEY` | Stripe API authentication for payments | `payments` module | Backend host env | Rotate via Stripe dashboard; update immediately, no grace period on live-mode keys | VERIFIED (`stripe` is a real `package.json` dependency) |
| `STRIPE_TERMINAL_READER_ID` | Stripe Terminal (physical card reader) device identifier for POS hardware | POS/payments, inferred from name | Backend host env | Reissue via Stripe Terminal dashboard if the physical reader is replaced | UNVERIFIED (present, purpose inferred, not traced to a specific call site) |
| `STRIPE_WEBHOOK_SECRET` | Verifies Stripe webhook payload signatures | `payments` module webhook handler | Backend host env | Rotate via Stripe dashboard's webhook endpoint settings | VERIFIED (real Stripe dependency + standard webhook-secret pattern) |
| `SENDGRID_API_KEY` | Email delivery provider authentication | Email/notifications | Backend host env | Rotate via SendGrid dashboard | UNVERIFIED (present in `.env.example`; not traced to a specific call site this pass) |
| `EMAIL_FROM` | Sender address for outgoing email | Email/notifications | Backend host env | No rotation — a config value, not a credential | UNVERIFIED (present, purpose inferred) |
| `EMAIL_WEBHOOK_URL` | Inbound email webhook endpoint (e.g. SendGrid inbound parse) | Email/notifications | Backend host env | N/A unless the provider's inbound-parse config changes | UNVERIFIED (present, purpose inferred) |
| `METRICS_TOKEN` | Authenticates the `/metrics` endpoint | Observability | Backend host env | Rotate + update whatever scrapes `/metrics` | VERIFIED (`ORCHESTRATION.md`'s Observability agent role references `/metrics`); C-2 completion item references confirming this is set |
| `SENTRY_DSN` | Error-tracking ingestion endpoint | App-wide error handling | Backend host env | Regenerate via Sentry project settings if the DSN is compromised (low sensitivity — DSNs are meant to be client-visible) | VERIFIED (direct code reference found) |
| `STORE_NAME` | Display name for the tenant/store — app config, not a credential | Various display surfaces | Backend host env | No rotation | VERIFIED (present) |
| `PORT` | Server listen port — Render/hosting platforms inject this | `src/server.ts` (`app.listen(PORT, ...)`, defaults to 3000) | Backend host env (usually platform-injected, not manually set) | No rotation | VERIFIED (direct code reference) |
| `NODE_ENV` | Standard Node environment flag; gates production-only behavior (e.g. `PG_SSL_NO_VERIFY` warnings) | Widespread | Backend host env | No rotation | VERIFIED (direct code reference) |
| `ALLOWED_ORIGINS` | CORS allowlist | Gateway/CORS middleware | Backend host env | Update when a new frontend origin needs access | UNVERIFIED (present, purpose inferred) |

**Not included above** (found during discovery, explicitly out of scope): `scripts/import-products.mjs`
reads `BASE`/`BATCH`/`EMAIL`/`PASSWORD` as CLI-convenience env overrides for a one-off dev utility
script (with hardcoded demo defaults, e.g. `PASSWORD` defaults to a demo credential) — not
application runtime config, not a rotation concern. Worth noting: its hardcoded default `BASE` URL
is `https://ascendhq-api.vercel.app` — the same dead URL found everywhere else in this investigation,
one more independent confirmation that URL is obsolete repo-wide, not just in the heartbeat workflow.

### Configuration Ownership Matrix

| Component | Configuration source | Secrets location | Deployment target | Environment | Owner | Verification status |
|---|---|---|---|---|---|---|
| Frontend | `scripts/deploy.sh` (Vercel CLI, manual — **not** git-connected per this script's own header comment, contradicting `ARCHITECTURE.md`'s 2026-07-20 "git-connected to master" claim — see Gap Analysis below) | Vercel dashboard env vars | Vercel (project `ascend_hq_web` / formerly `finder-pos-frontend`) | Prod/Testing/Dev | Platform (Sri) | CONTRADICTED — two of this repo's own docs disagree on the deploy mechanism |
| Backend (claimed) | Unknown — no Render deploy path exists in `scripts/deploy.sh`/`ci.yml`; if real, configured entirely outside this repo | Render dashboard env vars (claimed) | Render (`ascend-prod.onrender.com`, supplied 2026-07-30) | Production | Platform (Sri) | UNVERIFIED — unreachable from 3 independent networks; full investigation in `DEPLOYMENTS.md` |
| Backend (CI-driven path) | `scripts/deploy.sh` (Vercel CLI, hardcoded `BACKEND_PID`) | GitHub secrets (`VERCEL_TOKEN`/`VERCEL_TOKEN_PROD`) | Vercel (project id `prj_krZ34CIFjzQrMvZ08PWqqbxzBf7d`) | Prod/Testing/Dev | Platform (Sri) | CONFIRMED BROKEN — this Vercel project serves a bare, unrelated Express app, not this repo's backend |
| Database (Production, claimed) | Supabase dashboard | Render env (claimed) | Supabase project `kplruangtivthgqudjwt` (`ca-central-1`) | Production | Platform (Sri) | UNVERIFIED — never confirmed to have received a live connection |
| Database (Testing/Dev) | Supabase dashboard | GitHub secrets (`DEV_DATABASE_URL` override) / backend host env | Supabase project `lqaicxibgrlxwkvxsaji` (`us-west-2`) | Testing, Dev | Platform (Sri) | VERIFIED in active use — ~172 tables, demo login self-provisioned; this is the database this session's own work actually ran against |
| CI/CD | `.github/workflows/ci.yml` | GitHub Actions secrets/variables | GitHub Actions runners | All tiers | Platform (Sri) | VERIFIED — the one component whose configuration source is unambiguous |
| Production monitoring | `.github/workflows/uptime.yml` | None (public endpoint probes only) | GitHub Actions (scheduled) | Production | Platform (Sri) | CONFIRMED BROKEN — probes a dead pre-migration URL; fix held on branch `fix/uptime-heartbeat-stale-endpoints` pending the Backend row above being resolved |
| Replit sandbox | Replit's own workspace config (`replit.md`, restructured `artifacts/` layout) | Replit Secrets manager (fully separate from GitHub) | Replit (self-contained: own Postgres, MSW mocks) | Sandbox only | Platform (Sri) | VERIFIED disconnected from this repo's git history — see `REPLIT.md` |

### Gap Analysis (config/secrets — refreshed 2026-07-30)

- **Missing documentation, now closed by this section**: prior to this pass, no single place listed
  every GitHub secret/variable alongside application-level env vars — `PIPELINE.md` only had the
  GitHub-side tables.
- **Unverified configuration** (the real, open list — not resolved by writing this document, only by
  Render/Vercel/Supabase dashboard access): the entire "Backend (claimed)" row above, `DEV_DATABASE_URL`/
  `DEV_PG_CA_CERT_B64`'s current live values, and roughly a third of the application env vars (marked
  UNVERIFIED above) whose purpose is inferred from their name but not traced to a specific call site.
- **Dead/legacy variables, already confirmed**: `STAGING_BACKEND_URL`, `STAGING_BACKEND_ALIAS`,
  `STAGING_FRONTEND_ALIAS` (all `DEPLOYMENT_NOT_FOUND`), and `VERCEL_TOKEN_PROD`'s entire job may be
  moot depending on the Render-vs-Vercel resolution.
- **Dashboard-only configuration** (nothing in this repo represents it): whatever Render is actually
  configured with (if it's real at all), Supabase's dashboard-side project settings, Replit's Secrets
  manager. This is a structural gap, not an oversight — some of this genuinely can't live in a repo
  (real secret values), but the *names and purposes* of anything dashboard-only should still end up
  in this registry once confirmed, which several rows above do not yet.
- **Configuration not represented in the repository at all**: no `render.yaml`; no record anywhere of
  what Render env vars would need to be set even if the platform were confirmed real. If Render is
  confirmed as the real backend (`DEPLOYMENTS.md` P1), its required env vars should be added to this
  table by name, same as every other row.
- **Two direct contradictions this document doesn't resolve** (already flagged in `DEPLOYMENTS.md`,
  repeated here because they're configuration-ownership questions specifically): frontend
  git-connected vs. manual-CLI deploy (two of this repo's own docs disagree), and the non-prod backend
  Vercel project "deleted" (2026-07-20 claim) vs. "still resolving, serving a bare unrelated app"
  (2026-07-23 finding).
- **Recommended cleanup**: once the Render-vs-Vercel decision is made (`DEPLOYMENTS.md`'s P1), remove
  whichever path is not chosen entirely — the dead GitHub variables, the redundant `VERCEL_TOKEN_PROD`
  job if Render wins, or the incompatible Render references in `ARCHITECTURE.md`/`ORCHESTRATION.md` if
  Vercel wins. Don't leave the losing path's config lying around as a future source of the same
  confusion this investigation just spent itself resolving.
- **Security note, not a new finding**: no secret value is exposed anywhere in this document or its
  construction — every entry above was verified by name/existence only (`gh secret list`, `.env.example`
  var names, code references to `process.env.X`), never by reading a value.

### Re-verification (2026-07-23) — the Render claim above is not confirmed from this repo

Direct evidence gathered this pass, without Vercel/Render dashboard access:

- **`scripts/deploy.sh` — the one mechanism `ci.yml` actually invokes to deploy — has zero Render
  logic anywhere in it.** Every tier (`prod`/`testing`/`dev`) still deploys via the Vercel CLI to the
  two hardcoded project IDs (`BACKEND_PID`/`FRONTEND_PID`). If production really is served from
  Render today, that cutover happened entirely outside this repo (dashboard-only) and was never
  reconciled into the code that's supposed to drive it — which matches this section's own
  "needs reconciling" note, but means the claim can't be verified by reading the repo.
- **All three backend URLs this doc has referenced for troubleshooting are dead, re-checked today:**
  `ascendhq-api.vercel.app` (prod default) → `x-vercel-error: DEPLOYMENT_NOT_FOUND`.
  `ascend-backend-staging.vercel.app` → same, `DEPLOYMENT_NOT_FOUND` (unchanged since 2026-07-20).
  `ascend-backend.vercel.app` (the backend project's own auto-domain) → resolves, but to a bare
  Express instance answering `Cannot GET /` / `Cannot GET /api/v1/flags` — i.e. a deployment with
  none of this app's actual routes wired up, not our running backend.
- **The production heartbeat (`.github/workflows/uptime.yml`) still probes `ascendhq-api.vercel.app`**
  and has been failing on a ~15-minute schedule since at least 2026-07-22 as a result. Whether or not
  Render is genuinely serving real traffic, this specific check has been alerting on a dead Vercel
  target — treat every heartbeat failure since then as uninformative, not as evidence prod is down.
- **The real Render URL, if one exists, is not recorded anywhere in this repository** — not in
  `scripts/deploy.sh`, not in any workflow, not in any secret/variable name we could find. Whoever
  did the cutover needs to supply it before any of the following can be reconciled:
  1. Point `uptime.yml`'s backend probes at the real prod origin.
  2. Either give `deploy.sh`/`ci.yml`'s `deploy-production` job a real Render deploy path, or remove
     it if Render's own git integration is genuinely the sole deploy mechanism now (it isn't currently
     a required branch-protection check, so it isn't blocking merges — but it is a guaranteed-red,
     misleading status on every `master` push until this is resolved one way or the other).
  3. Confirm whether the "new isolated Supabase project" (`kplruangtivthgqudjwt`, `ca-central-1`)
     below is actually the one in use — the backend's known-working connection on file elsewhere is
     the `us-west-2` project, which this doc calls out as the **testing** tier's database, not prod's.

### Supabase
- **Production** = new isolated project created 2026-07-20 (ref `kplruangtivthgqudjwt`, region
  `ca-central-1`), connected only from Render via the Session pooler with verified TLS
  (`PG_CA_CERT_B64`). Never shared with any other tier.
- **Testing** (shared by `develop` + `staging`) = the pre-existing project (ref `lqaicxibgrlxwkvxsaji`,
  region us-west-2) already used for local/dev work — already has all ~172 tables and the standard
  demo login self-provisioned; reuse it rather than paying for a third project.
- Schema self-provisions on first backend boot (`buildApp` runs every module's migration) — no manual
  seed step needed for either project.

## Rollback

Every change here is a branch/CI/protection edit — no data migrations, and the prod DB (Supabase A)
is never touched by pipeline work.

- **Bad release:** re-run the last known-good `master` deploy, or `git revert` the release merge and
  push `master` (redeploys prod). Vercel also keeps prior deployments — promote a previous one in the
  dashboard for an instant rollback.
- **Bad pipeline change:** revert the CI commit on `master`.

## Known issue — E2E login flake: ROOT CAUSE CONFIRMED (2026-07-18)

**Confirmed via direct evidence** (a Playwright trace DOM snapshot at the moment of failure — not
inference): `/api/identity` (login, refresh, register, me) is rate-limited per-IP at
`capacity: 10, refillRate: 0.33` (src/app.ts) — a correct brute-force guard for production. The
entire E2E suite runs from **one CI runner IP** and needs dozens of `/api/identity` requests (global
setup's login, every worker-restart self-heal probe login, `login.spec.ts`'s 3 dedicated login tests,
every retry of every test). That exhausts the 10-token bucket quickly; refill is slow (1 token per
3s), so once tripped, **every spec that needs auth fails at once** — exactly matching the observed
cross-spec cascade (checkout, delivery, invoice-pay, inventory-receive, verticals all failing
together) and the run-to-run variance (5.9–11.1 min, 2–22 failures — depends on how many login
attempts pile up before the window resets). It is pre-existing on `master`, unrelated to the pipeline.

**The proof:** the trace for `login.spec.ts`'s "valid credentials redirect to the app" test — a
*completely fresh, unauthenticated context*, no shared session, first login attempt — timed out with
this literal alert visible on the page: `Too many requests — slow down.` (the exact message
`rateLimitMiddleware` returns on a 429). This ruled out every session/cookie/rotation theory below in
one shot: a brand-new login with zero prior state was rejected by the rate limiter, not by auth logic.

**Fix:** made the limiter's thresholds env-overridable in `src/app.ts`
(`IDENTITY_RATE_LIMIT_CAPACITY` / `_REFILL`, `IDENTITY_REGISTER_RATE_CAPACITY` / `_REFILL`) — defaults
unchanged (10/0.33 and 5/0.05), so **production behavior is byte-identical** unless explicitly
overridden. Set to generous values (`1000` / `100`) in the `e2e` CI job env only. No prod security
posture change; local dev and unit tests keep the strict defaults too.

**Verified fixed:** a `develop` run with the fix landed **27 passed / 0 failed / 0 flaky in 32.1 s**
— down from 5.9–11.1 minutes with 2–22 failures per run beforehand. `e2e` is back in the deploy
`needs` for all three tiers and added to the branch-protection required checks on `master`/`staging`/
`develop` — it is a hard gate again.

<details>
<summary>Investigation history (superseded by the confirmed root cause above — kept for the record)</summary>

The suite was originally suspected to have a session-rotation timing flake: the backend rotates
refresh tokens strict single-use, and Playwright starts a fresh worker after any test failure, so a
shared authenticated `storageState` cookie could already be revoked → affected tests redirect to
`/login` and the inline re-login's `waitForURL` occasionally exceeds 15 s. This looked plausible from
the failure location (all failures at the same helper line) but turned out to be the wrong layer
entirely — see below.

**Attempted fix (reverted):** tried setting `REFRESH_REUSE_GRACE_MS=900000` in the `e2e` job env
(widening the backend's existing reuse-grace window so a replayed cookie from a restarted worker
would stay valid). Verified against a live `develop` run — the result contradicted the hypothesis
rather than confirming it:

| | baseline (`master`, no change) | with `REFRESH_REUSE_GRACE_MS=900000` |
|---|---|---|
| failed | 5–7 | **22** |
| flaky (recovered on retry) | 10–11 | **1** |
| passed | 10–11 | 5 |
| runtime | 5.9–6.8 min | **11.1 min** |
| failure spread | one helper line, one spec file | many unrelated spec files, two distinct error signatures |

The low flaky count is the key signal: baseline retries mostly self-heal (a fresh Playwright worker
gets a clean login); with the widened grace, retries stopped recovering — consistent with the grace
window interfering with the worker-scoped session self-heal in `web/e2e/fixtures.ts`, though the
exact mechanism isn't confirmed (no backend log capture in CI to inspect the `/login` calls during
the run). **Reverted** — a fix that isn't proven to help and correlates with a 3–4× worse outcome
isn't a fix. Root cause of the *original* flake (documented above) is still open.

**Diagnostics added and run (2026-07-18):** the backend was backgrounded with no log redirect, so its
stdout/stderr were discarded — no past run ever had backend evidence. Added `LOG_LEVEL=debug` +
redirect to a file, a 2s `/healthz` poll timeline, and always-on artifact upload. Result from a real
failing run (16 failed / 3 flaky / 9 passed, 7.9 min):

- **Backend health: zero gaps.** `/healthz` returned `200` at every 2s sample for the full ~10 min
  run — rules out backend crash/stall/restart as the cause.
- **`backend.log` is nearly empty** — 3 boot lines, then nothing until two `res.clearCookie`
  deprecation warnings at the very end. The app has **no per-request or login-attempt logging** (no
  `pino-http`/morgan middleware, no logger calls in `identity/service.ts`'s login/refresh paths), so
  even debug level shows nothing about individual `/login` calls.
- **Separately found and fixed:** the E2E job runs `playwright test --reporter=github`, which only
  emits GH Actions annotations — it does **not** write an HTML report, so `web/playwright-report/`
  (the artifact this workflow uploaded on failure) has been **empty on every past run**; that upload
  step has never actually captured anything. Screenshots/video/trace are written to
  `web/test-results/` regardless of reporter — the upload path was corrected to point there instead.

Net effect of the backend-log + health-poll diagnostics: the backend process itself was cleared
(zero `/healthz` gaps across two full runs) before the trace evidence above pinned the actual cause —
the rate limiter, not a crash/stall/restart. The `playwright-report` upload fix (empty on every past
run — `--reporter=github` never wrote an HTML report) was what made pulling the trace above possible
at all.

</details>

## Local development

Point a local clone at whichever tier's DB you're working against (see `.env.staging.example` for the
testing tier). Backend on `:3001`, frontend on `:3000` with `NEXT_PUBLIC_MOCK=false`. Never point
local at Supabase A (prod) for development.
