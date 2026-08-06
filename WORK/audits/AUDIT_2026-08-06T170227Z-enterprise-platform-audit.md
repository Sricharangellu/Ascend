# Ascend — Enterprise Infrastructure, Platform, DevOps & Technology Modernization Audit

**Date:** 2026-08-06T17:02:27Z · **Branch:** `claude/ascend-erp-platform-audit-a80478` (off `develop`)
**Method:** every claim below is either (a) cited to a command run in this session against
this checkout, or (b) explicitly marked UNVERIFIED. Nothing is asserted from a prior
document without re-checking it — `DEPLOYMENTS.md` exists precisely because this repo has
already been burned twice by docs that outlived their facts.

**Baseline measured this session (commit `14736ff`, before this audit's changes):**

| Gate | Result |
|---|---|
| `tsc -p tsconfig.json --noEmit` (backend) | **PASS** |
| `tools/hygiene-check.mjs` | **PASS** — 2,181 files |
| `tools/api-gap-scan.mjs` | **PASS** — 473 backend / 378 frontend paths, 17 allowlisted |
| `tools/table-collision-scan.mjs` | **PASS** — 166 table names, no collisions |
| `npm test` (backend, real Postgres 16) | **PASS** — see §6.1 for the count |
| `web`: typecheck / lint / vitest | **PASS** — 0 errors, 0 warnings, **188/188** in 28 files |
| `web`: `NEXT_PUBLIC_MOCK=false npm run build` | **PASS** — 124 routes, 87.4 kB shared JS |
| `npm audit` root | **0 advisories** |
| `npm audit` web | **10** — 1 critical, 6 high, 3 moderate |

The engineering substance here is real and the gates are honest. **Every serious finding in
this audit is operational, not architectural.** That is the single most important sentence
in this document, and §11 quantifies it.

---

# Executive summary

Ascend is a 49k-line TypeScript modular monolith (53 domain modules, 619 route
registrations, 202 tables) behind a 90k-line Next.js 14 frontend (124 routes). It is
further along than its own documentation claims in places, and further behind in exactly
one place that matters more than all the others.

**The system is architecturally sound and operationally unowned.**

- The code passes every gate it has. Tenant isolation, money-as-integer-cents, append-only
  ledgers, race-free document numbering, an outbox with durable redelivery, RLS as a
  backstop, per-tenant rate limiting, circuit breakers on both external providers — these
  are not aspirational, they are in the tree and tested.
- **Nobody can currently prove where production runs, or that it runs at all.** Three of
  this repo's own documents assert the backend is on Render; zero lines of deploy
  automation support it; the claimed URL answered from none of three independent networks.
  That has been open since 2026-07-30.
- **No production backup has ever been taken.** The `backup.yml` workflow has reported
  green 16 consecutive times while skipping every step, because `PROD_DATABASE_URL` is
  unset. The real recovery point objective is not 24 hours. It is total loss.
- **The heartbeat has been red for ~30 consecutive runs against a hostname that no longer
  resolves**, which means a genuine outage and the current state are indistinguishable.

Everything in the first bullet is worth very little while the other three hold. A retail
customer does not experience your outbox; they experience whether their tills work on
Saturday and whether last week's sales still exist on Monday.

**The recommendation is therefore not to modernize the stack.** The stack is fine, and
this audit explicitly rejects most of the technology swaps it was asked to consider (§2).
The recommendation is to **close the operational floor before adding one more feature**,
and the first four items take days, not quarters.

## What this audit changed in code

Seven changes, all backward-compatible, all verified (§12.15):

| # | Change | Why it is not cosmetic |
|---|---|---|
| 1 | Replaced CI's inert authorization guard with `tools/route-authz-scan.mjs` | The old step could **never fail** (`\|\| echo` swallowed the exit status) and, if repaired as written, would have gone red with 39 findings of which ~35 were false. The new scanner resolves middleware aliases and found **4 genuine unguarded mutations**. |
| 2 | Manager-gated `DELETE /api/v1/quotes/:id` + regression test | A cashier could hard-delete a customer quotation. No soft-delete column, no audit-log entry — unrecoverable and untraceable. |
| 3 | `/metrics` now exposes DB-pool, job-queue, outbox and runtime gauges | A stalled job drain or a growing undispatched outbox — money-adjacent side effects silently not happening — was observable only by hand-querying the database. |
| 4 | New `security.yml`: CodeQL + dependency review | There was **no SAST of any kind**. The existing guards catch mistakes this repo has already made; nothing looked for the ones it hasn't. |
| 5 | Root `npm audit` promoted from report-only to a `high` gate | Root is at 0 advisories, so the gate costs nothing today and catches the next one. `web` stays report-only, for a stated reason. |
| 6 | `backup.yml` now annotates and summarises when it takes no backup | Converts a silent green into a loud green. A monitoring job that lies by omission is worse than an absent one. |
| 7 | `Dockerfile` `HEALTHCHECK` on `/readyz` | The image declared no health probe, so any orchestrator would route traffic to a container whose database was down. |

**Deliberately not changed**, and why, in §12.14 — including the one thing this audit was
asked for and refused to add.

---

# Phase 1 — Technology inventory

Complete list of what is actually wired in, from `package.json`, `web/package.json`,
`.env.example`, `.github/workflows/`, and code references. Categories in the brief with no
entry here have **no implementation in this repo** and are called out in §1.4.

## 1.1 Runtime and application stack

| Technology | Version | Role | Verdict |
|---|---|---|---|
| **Node.js** | 24 (`.nvmrc`, CI, Dockerfile) | Backend + build runtime | **Keep.** Version is consistent across `.nvmrc`, CI, and the Dockerfile — a drift (20 vs 24) existed and was fixed. |
| **TypeScript** | 5.7.3 both halves | Language | **Keep.** Strict; backend typechecks clean. |
| **Express** | 4.21.2 | HTTP server | **Keep, plan the 5.x bump.** Express 4 is in maintenance. Not urgent — no advisory, and the gateway seam means the migration is contained. |
| **Next.js** | **14.2.29** | Frontend, SSR, API proxy | **UPGRADE — this is the single highest-severity technical item in the inventory.** See §5.3. |
| **React** | 18.3.1 | UI | **Keep**; moves with the Next upgrade. |
| **PostgreSQL** | 16 (CI, local); Supabase-managed in cloud | Sole datastore | **Keep.** The right choice and used well. |
| **`pg` (node-postgres)** | 8.21.0 | Driver, pooling | **Keep.** Pool bounded by `PG_POOL_MAX`, 30s statement timeout, TLS verified by default. |
| **Raw SQL** (no ORM) | — | Data access (ADR-001) | **Keep.** 248 indexes, 230 of which lead with `tenant_id`. The 18 that don't are correct exceptions (trigram search, token-hash lookups, global tables). |
| **Zod** | 3.24.1 | Request validation | **Keep.** Applied at route boundaries via `parseBody`. |
| **`jsonwebtoken`** | 9.0.2 | JWT sessions (HS256) | **Keep**; see §5.1 on HS256 vs RS256. |
| **`bcryptjs`** | 2.4.3, cost 10 | Password hashing | **Keep the library, raise the cost.** Cost 10 is below the 2026 norm (12+). Login already burns a constant-time dummy compare to prevent user enumeration — good. |
| **`otpauth`** | 9.5.1 | TOTP MFA | **Keep.** |
| **`helmet`** | 8.2.0 | HTTP security headers | **Keep.** CSP disabled here on purpose (API-only origin); the frontend sets its own. |
| **`pino`** | 10.3.1 | Structured logging | **Keep.** Redacts `authorization`/`cookie`/`password`/`token`/`secret`/`apiKey` at every nesting level. |
| **`ioredis`** | 5.11.1 | **Optional** cache / rate-limit / event fan-out | **Keep as optional.** See §1.3 — the in-memory fallback is a real correctness cliff, not just a performance one. |
| **`uuid`** | 11.0.5 | Identifiers | **Keep.** |
| **Tailwind CSS** | 3.4.14 | Styling + design tokens | **Keep.** One token system, enforced by `AGENTS.md` design rules. |
| **Recharts** | 3.8.1 | Charts | **Keep.** |
| **`clsx` + `tailwind-merge`** | 2.x | Class composition | **Keep.** |
| **`next-mdx-remote` + `gray-matter`** | 6.x / 4.x | MDX content pages | **Keep.** |

## 1.2 External services (real integrations, verified by code reference)

| Service | Purpose | Auth | Coupling | Verdict |
|---|---|---|---|---|
| **Supabase (Postgres)** | Primary database, 2 projects (prod `ca-central-1` claimed-isolated; testing/dev `us-west-2` confirmed in use) | `DATABASE_URL` + `PG_CA_CERT_B64` | **Low.** Plain Postgres over a connection string. No Supabase SDK, no Supabase Auth, no Supabase Storage, no RPC. | **Keep.** Migrating to Neon/RDS/AlloyDB is a connection-string change. That is an unusually good position to be in. |
| **Stripe** | Card payments + Terminal (physical readers) | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_TERMINAL_READER_ID` | **Medium, correctly isolated.** Behind `payments/gateway.ts` + a circuit breaker; webhook verified against raw bytes before `express.json()`. | **Keep.** The gateway seam already exists if a second processor is ever needed. |
| **Anthropic** | AI assistant, explain-only (ADR-005) | `ANTHROPIC_API_KEY` | **Low.** One file (`shared/ai/anthropic-client.ts`), circuit-broken, degrades to 503 with a useful message. | **Keep.** Model pinned to `claude-sonnet-5`; prompts forbid inventing business facts and resist embedded instruction injection. Architecturally exemplary. |
| **SendGrid** | Transactional email | `SENDGRID_API_KEY`, `EMAIL_FROM` | **Low.** Behind `shared/email.ts`; logs to console when unset. | **Keep.** |
| **Sentry** | Error tracking | `SENTRY_DSN` | **Very low.** Hand-rolled HTTP envelope, **no SDK dependency**. | **Keep the seam; see §4.2** — the hand-rolled envelope is missing breadcrumbs, release tagging and source maps. |
| **Vercel** | Frontend hosting (all tiers) | `VERCEL_TOKEN`, `VERCEL_TOKEN_PROD` | **Medium.** `next.config.mjs` `output: "standalone"` means the app can run in any container. | **Keep for frontend.** |
| **Render** | **Claimed** production backend host | — | **UNKNOWN.** No `render.yaml`, no deploy step, no env-var record anywhere in this repo. | **BLOCKED on §3.1.** |
| **GitHub + Actions** | SCM, CI/CD, scheduled backup + heartbeat | `GITHUB_TOKEN` (least-privilege in all 4 workflows) | **Medium** — reasonable. | **Keep.** |

## 1.3 Redis: an optional dependency with a non-optional consequence

`REDIS_URL` unset falls back to in-memory. `ARCHITECTURE.md` frames this as deliberate
doctrine ("don't add required infra without a measured need"), and for **caching** that is
right. But Redis is load-bearing for three things, and the fallback is not equivalent:

1. **Rate limiting** becomes per-instance. Two replicas = double the effective limit. The
   `/api/identity` brute-force guard (10 burst, 0.33/s) is a **security control**, and it
   silently weakens in proportion to replica count.
2. **EventBus fan-out** stops crossing instances. In-process subscribers on instance A
   never see an event published on instance B.
3. **SSE** (`/api/v1/stream`) only reaches clients connected to the publishing instance.

`buildApp` already logs a production warning for an unset `REDIS_URL`. That is the right
mechanism and it names the rate-limit consequence. **This is safe at one instance and
becomes a correctness bug at two** — so it is not "optional", it is "optional until you
scale horizontally", which is a different and much more dangerous property. Recorded in
the risk register as **R-7**.

## 1.4 Categories in the brief with no implementation

Verified absent by search, so a future pass does not go looking:

| Category | Status | Assessment |
|---|---|---|
| **Object storage** (S3/R2/Blob) | **Absent.** No credential, no SDK. Files referenced by URL only. | Correct for today. Becomes required for receipt/invoice PDFs and product images at scale. |
| **OCR** | **Absent.** No library, no service. | Phase 10 aspiration only. |
| **Barcode** | **Present but server-side only** — `product_barcodes` + POS scan resolution + metrics. No image-decoding library; scanners are HID keyboard-wedge devices. | Correct and cheaper than a decode library. |
| **Search engine** | **Absent by design.** `pg_trgm` GIN indexes on product/customer/supplier names. | Correct. Defer a dedicated engine to a measured bottleneck. |
| **Message queue** (Kafka/SQS/Rabbit) | **Absent by design.** Postgres `job_queue` + `event_outbox` with `FOR UPDATE SKIP LOCKED`. | **Correct, and explicitly re-affirmed.** Kafka is a standing rejection in `ARCHITECTURE.md`. Do not re-litigate. |
| **Infrastructure as Code** | **Absent — total.** No Terraform, Pulumi, `render.yaml`, `fly.toml`, Helm, CloudFormation. | **A real gap** (§3.5). Every environment is dashboard-configured and unreproducible. |
| **Secrets manager** | **Absent.** GitHub Actions secrets + platform env vars. | Acceptable at this size; no rotation automation, no audit trail on secret access. |
| **Feature flag service** | **Absent by design.** `feature_flags` table, tenant-overridable, served at `/api/v1/flags`. | **Correct.** Do not buy LaunchDarkly for this. |
| **CDN** | Vercel's edge, implicitly. Not configured or reasoned about. | Fine for now. |
| **APM / distributed tracing** | **Absent.** `requestLogger()` emits W3C `trace_id`/`span_id` fields, but nothing propagates context across process boundaries and no collector exists. | Honest scaffolding, not tracing (§4.3). |
| **Analytics** | **Absent.** No product analytics of any kind. | Deliberate for a B2B ERP. |
| **Maps / geolocation** | **Absent.** | Not needed. |

## 1.5 Code and repository inventory

| Metric | Value | Note |
|---|---|---|
| Backend source | 49,033 LOC | Excluding tests |
| Backend tests | 19,495 LOC across 98 files | **40% test-to-source ratio** — strong |
| Frontend | 89,746 LOC, 122 pages, 33 shared components | |
| Domain modules | 53 | Each with own migrations + routes |
| Route registrations | 619 | |
| Tables | 202 `CREATE TABLE` | 166 distinct names, no collisions |
| Indexes | 248 | 230 lead with `tenant_id` |
| ADRs | 7 + template | ADR-008 and ADR-009 added by this audit |
| MSW mock handlers | ~10,300 LOC | See §1.6 |
| **`artifacts/`** | **1,005 tracked files, 5 separate projects** | See §1.6 |

## 1.6 Two significant pieces of dead weight

**`artifacts/` — 1,005 tracked files.** Five complete, independent projects (`ascend` 453
files, `api-server` 405, `mockup-sandbox` 69, `ascend-mobile` 39, `ascend-pitch` 39) on a
totally different stack — Vite, Radix UI, Drizzle, pnpm workspace — with their own
`package.json` files. **Nothing builds them, nothing tests them, nothing deploys them, and
no CI gate touches them.** They are 55% of the repo's tracked files.

This is not merely clutter. It is the direct cause of a recurring, expensive incident
class: **five separate "foreign workspace root hijack" events in two days** (2026-08-03 to
2026-08-04) where the root `package.json` was replaced by a pnpm workspace stub, breaking
every `npm ci` in CI. `tools/hygiene-check.mjs` check 8 now guards the symptom. The cause
is that two incompatible project layouts live in one tree. `LOOP_STATE.md` also records
that a finished, tested `push_tokens` module exists *only* in `artifacts/` and ships to
nobody.

**Recommendation (NEEDS-SRI, R-8):** extract `artifacts/` to its own repository or an
orphan branch, harvesting anything of value first. This is not a drive-by deletion — it is
user work, and `AGENTS.md` forbids deleting user work. But it should not stay in the tree
that CI, CodeQL, and every agent session has to reason about. `security.yml` already
excludes it from analysis for exactly this reason.

**`lib/` — 20 files.** A parallel Drizzle + orval + OpenAPI client stack. Also unbuilt,
unreferenced by `src/` or `web/`. Same recommendation, much smaller.

---

# Phase 2 — Technology evaluation and alternatives

Every category the brief asked about. **The default answer is "keep what you have"**, and
that is a finding, not a dodge: this stack was chosen well, the vendor lock-in is genuinely
low, and technology churn is a bigger risk to this project right now than technology debt.
Only three rows recommend a change.

| Category | Current | Alternatives evaluated | **Recommendation** |
|---|---|---|---|
| **Database** | Supabase Postgres | Neon, PlanetScale, CockroachDB, AlloyDB, Aurora | **KEEP.** Coupling is a connection string — no SDK, no Supabase Auth/Storage/RPC. Migration cost is near-zero *and stays that way*, which is the point. PlanetScale (MySQL/Vitess) would break the raw-SQL/`pg_trgm`/RLS foundations. CockroachDB adds distributed-transaction latency this workload does not need. Aurora/AlloyDB are the right *scale-up* answers when the bill or the size justifies them; neither does today. |
| **Backend hosting** | **Unconfirmed** (Render claimed) | Render, Railway, Fly.io, DigitalOcean, Cloud Run, ECS, App Service, K8s | **PICK ONE AND WIRE IT INTO CI** (§3.1). Any of Render / Fly / Cloud Run works. The app is `output: standalone`, containerised, binds `process.env.PORT`, and has no host-specific code — the choice is genuinely low-stakes. **Not** Kubernetes: a standing rejection in `ARCHITECTURE.md`, and correct for a team of this size. |
| **Frontend hosting** | Vercel | Netlify, Cloudflare Pages | **KEEP.** Next.js on Vercel is the reference path. The Dockerfile means you are not trapped. |
| **Object storage** | None | S3, R2, Backblaze, Supabase Storage | **DEFER**, then **Cloudflare R2** when needed — S3-compatible API (no lock-in) with zero egress fees, which matters for a POS serving receipt/invoice PDFs. |
| **Auth** | Custom (JWT + bcrypt + TOTP + OIDC SSO + API keys) | Clerk, Better Auth, Auth0, Keycloak, Firebase, Supabase Auth | **KEEP.** This is the highest-conviction "keep" in the table. The implementation is complete and correct: constant-time login, lockout, refresh rotation with reuse-grace, hashed API keys with scopes, per-tenant OIDC config, MFA. Migrating to Clerk/Auth0 would mean re-implementing tenant/role/permission/capability mapping in a vendor's model, paying per-MAU forever, and adding a hard external dependency to the login path of a **POS system that must work when the internet is flaky**. The cost/benefit is strongly negative. |
| **Authorization** | RBAC + custom roles + scopes + capability/module gates | OPA, Cedar, Casbin | **KEEP.** A policy engine is justified when policy changes faster than code. Here it does not. Revisit if ABAC (per-location, per-time-window) becomes a real requirement. |
| **Cache / rate-limit backing** | Optional Redis, in-memory fallback | Valkey, Dragonfly, Upstash, Momento | **KEEP ioredis; MAKE REDIS REQUIRED BEFORE THE SECOND INSTANCE** (§1.3). If/when hosted, **Upstash** (per-request pricing, no idle cost) or **Valkey** (drop-in, BSD-licensed, avoids the Redis licence question entirely). |
| **Queue / jobs** | Postgres `job_queue` + outbox | BullMQ, SQS, Temporal, Inngest | **KEEP.** `FOR UPDATE SKIP LOCKED` is the correct pattern below ~1k jobs/sec, and it gives you transactional enqueue for free — the property SQS cannot offer and the one that makes the outbox correct. **The gap is not the technology, it is that nothing observes it** — fixed in this audit (§4.1). |
| **Search** | `pg_trgm` GIN | Elasticsearch, OpenSearch, Meilisearch, Typesense | **KEEP.** Revisit at a measured p95, not a hunch. |
| **Monitoring / metrics** | In-process `/metrics`, Prometheus format | Grafana Cloud, Prometheus, Datadog, New Relic, Better Stack | **KEEP THE ENDPOINT, ADD A SCRAPER.** The exposition format is already correct, which means this is a configuration task, not an engineering one. **Grafana Cloud free tier** — generous limits, hosted Prometheus + Loki + alerting in one, no agent to run. Datadog is excellent and roughly 10× the price for this workload. |
| **Logging** | pino JSON to stdout | Loki, ELK, OpenSearch, Seq, Better Stack | **KEEP THE FORMAT, ADD A SINK.** Logs currently go to stdout and, wherever the backend actually runs, are retained by the platform's default and searchable only there. Grafana Loki pairs with the metrics recommendation. |
| **Tracing** | W3C fields in logs, no propagation | OpenTelemetry, Datadog APM, Jaeger | **ADOPT OTEL WHEN THE SECOND SERVICE APPEARS** (§4.3). In a single-process monolith, request-scoped structured logs plus RED metrics answer nearly every question a trace would. The 90th-percentile value of tracing arrives with the second network hop, not before. |
| **Error tracking** | Hand-rolled Sentry envelope | Sentry SDK, GlitchTip, Rollbar | **ADOPT THE OFFICIAL SDK** (§4.2). The one place where "no dependency" costs more than it saves. |
| **Feature flags** | `feature_flags` table | LaunchDarkly, Unleash, Flagsmith, PostHog | **KEEP.** Tenant-scoped overrides already work. |
| **Secrets** | GitHub + platform env | Vault, Doppler, Infisical, AWS/GCP Secret Manager | **KEEP for now; revisit at SOC 2.** Missing rotation automation and access audit trails, both of which SOC 2 will ask for. |
| **Email** | SendGrid | Resend, Postmark, SES | **KEEP.** If deliverability disappoints, **Postmark** for transactional. |
| **Payments** | Stripe (+ Terminal) | Adyen, Square, Checkout.com | **KEEP.** Terminal is a genuine differentiator for physical POS, and the gateway seam means adding a regional processor later is contained. |
| **AI** | Anthropic, explain-only | OpenAI, Gemini, Bedrock, self-hosted | **KEEP.** ADR-005's explain-only posture is the correct architecture for ERP AI and matters far more than the provider. |
| **Testing** | node:test + Vitest + Playwright | Jest, Cypress, k6, Artillery | **KEEP; ADD LOAD TESTING** (§6.3). `k6` — scriptable, CI-friendly, no account. |
| **Monorepo tooling** | npm workspaces (implicit), two lockfiles | Nx, Turborepo | **KEEP.** Two packages do not justify a build orchestrator. Turborepo becomes interesting at four or five. |
| **Linting / formatting** | ESLint 8 + `eslint-config-next` | Biome, oxlint, ESLint 9 flat config | **CONSIDER BIOME for the backend only.** ESLint 8 is EOL, and `eslint-config-next` is one of the packages carrying advisories. Biome is ~20× faster, formats and lints in one tool, and has no plugin-resolution fragility. **But do it after the Next 16 migration**, not before — that migration brings `eslint-config-next@16` anyway and doing both at once conflates two failure modes. |
| **Dependency updates** | Dependabot, grouped, majors ignored | Renovate | **KEEP.** The conservative config is correct for a repo whose dominant failure mode is merge chaos. |
| **Code review** | CODEOWNERS + PR template | CodeRabbit, SonarQube | **ADD CODEQL** — done in this audit. SonarQube's value overlaps heavily with what CodeQL + the existing custom scanners already cover. |
| **Commits / releases** | Conventional commits, no automation | changesets, semantic-release, release-please | **ADD release-please LATER.** No version tags, no changelog, no release notes exist today. Low urgency for a continuously-deployed app; real value once customers ask "what changed?". |

**Net: 3 changes recommended out of 26 categories.** Next.js (security-forced), Sentry SDK
(observability), and a metrics/log sink (observability). Everything else stays.

---

# Phase 3 — Infrastructure and cloud architecture

## 3.1 The central finding: deployment ownership is unresolved

This is not new — `docs/architecture/DEPLOYMENTS.md` opened it on 2026-07-30 and it
remains open. Re-confirmed from the repo this session:

| Fact | Evidence |
|---|---|
| `scripts/deploy.sh` contains **zero** Render logic | Read in full. Every tier (`prod`/`testing`/`dev`) shells out to `npx vercel deploy` against hardcoded project IDs. |
| No `render.yaml`, no Render deploy step, no Render env-var record | Filesystem search, all workflows read. |
| `uptime.yml` falls back to `ascendhq-api.vercel.app` | Read. The comment states this hostname no longer resolves. |
| `next.config.mjs` falls back to the same dead hostname when `BACKEND_URL` is unset on Vercel | `next.config.mjs:34`. |
| `scripts/import-products.mjs` hardcodes the same dead hostname | Per `PIPELINE.md`'s own registry. |
| Two of this repo's docs disagree on whether Vercel is git-connected | `PIPELINE.md` says git-connected; `scripts/deploy.sh`'s own header says manual CLI. |

**Three mutually exclusive pictures of "where production is" exist simultaneously, and no
confirmed responding endpoint sits behind any of them.**

This is the P0. Nothing else in this audit is worth doing first. **It is also not
code-addressable** — it needs Render/Vercel/Supabase dashboard access, which is Sri's.
`DEPLOYMENTS.md`'s Option A / Option B decision is still the right framing; this audit adds
no new opinion, because a fourth opinion is precisely what would make it worse.

## 3.2 Environments

| Tier | Branch | Frontend | Backend | Database |
|---|---|---|---|---|
| Production | `master` | Vercel `--prod` | **UNCONFIRMED** | Supabase A (`ca-central-1`) — never confirmed to have received a connection |
| Testing | `staging` | Vercel Preview alias | **DEAD** (`DEPLOYMENT_NOT_FOUND`) | Supabase B (`us-west-2`) — **confirmed in active use** |
| Dev | `develop` | Vercel Preview | **DEAD** | Supabase B (shared with staging, by directive) |
| Feature | `feature/*` | — | — | Ephemeral CI Postgres |

Two databases for three tiers is a deliberate, sensible cost decision. **But the database
that has actually carried real schema and data is the one labelled *testing*.** If the
Render cutover never came up, it is possible no traffic has ever reached the "production"
database — which would mean the isolation boundary everyone believes exists has never been
exercised.

## 3.3 What is genuinely good here

Not everything is broken, and the parts that work were built deliberately:

- **Forward-only 3-tier promotion** (`feature → develop → staging → master`) with
  Sri-only `master` merges, structurally enforced: admin-enforced branch protection, no
  auto-merge anywhere in any workflow, and `deploy-production` triggered only by a `push`
  to `master`. That is a real release gate, not a convention.
- **Migrations are correct.** Content-hashed, idempotent, run under
  `pg_advisory_xact_lock(7381920)` in a single transaction at boot. Concurrent instances
  block, then skip. This is genuinely hard to get right and it is right.
- **Least-privilege `GITHUB_TOKEN`** in all four workflows.
- **`actionlint` + `shellcheck`** on the workflows and ops scripts — rare, and it catches
  the silent-skip class of CI bug.
- **`actionlint` pinned to an immutable release tag** rather than piping from `main`, with
  the supply-chain reasoning written down.
- **Rollback exists**: Vercel keeps prior deployments and `git revert` on `master`
  redeploys. **But see R-3** — there are no down-migrations, so a schema change is not
  covered by either mechanism.

## 3.4 Backup, DR and data protection

| Control | Status | Assessment |
|---|---|---|
| Backup mechanism | **Built and drilled** | `backup.sh` → `restore.sh` proven end-to-end 2026-08-05: 193 tables, 501 KB, restore ~1s, app booted against the restored DB. The scripts work. |
| **Production backups** | **NEVER RUN** | `PROD_DATABASE_URL` unset → 16 consecutive green runs that did nothing. **Real RPO: total loss.** Partially addressed in this audit (§12.6) — the run is now loud. Only Sri can set the secret. |
| Restore drill against production | **Never** | Cannot be done until a production backup exists. |
| PITR / WAL archiving | **Stub** | `run_wal_archive` is unintegrated. Supabase's own PITR (paid tiers) is the pragmatic answer — do not build WAL-G. |
| Down-migrations | **Absent** for module migrations | `db/migrations/` has three `.down.sql` files; the 53 module migration sets that actually run have none. **R-3.** |
| Multi-region | **None** | Correct for this stage. |
| Database replication / failover | **Supabase-managed only** | Not configured or tested by this repo. |
| Data retention / GDPR erasure | **Partial** | Outbox retention sweep exists. No tenant-level export or right-to-erasure implementation. **R-9.** |

## 3.5 Infrastructure as Code — total absence

Zero IaC files. Every environment — Vercel project settings, Render service config,
Supabase projects, all env vars — exists only as dashboard state. Consequences, in order
of how much they will hurt:

1. **A deleted project is unrecoverable from this repo.** This already happened: the
   staging Vercel projects were deleted and `scripts/deploy.sh` still points at their IDs.
2. **No review trail** on infrastructure changes, which SOC 2 will ask for directly.
3. **No reproducibility.** A new environment is a manual checklist nobody has written.

**Recommendation and an explicit non-action:** this audit did **not** add a `render.yaml`,
even though "no IaC" is a real finding and the brief asks for implementation.
`DEPLOYMENTS.md` states plainly that the failure mode here is *half-configured paths* —
"do not leave both paths half-configured, which is the current state" — and adding a
speculative blueprint for a host nobody has confirmed would create a **fourth** picture of
production alongside the three that already conflict. The correct sequence is: resolve
§3.1, **then** codify the winner. Doing it in the other order is how this situation was
created. See §12.14.

## 3.6 Zero-downtime, canary, blue/green

| Capability | Status |
|---|---|
| Zero-downtime deploys | **Frontend yes** (Vercel atomic swap). **Backend unknown** — depends on §3.1. |
| Rollback | Vercel dashboard promote, or `git revert` + push. Not covering schema. |
| Blue/green | Not configured. Vercel's model approximates it for the frontend. |
| Canary | **None.** |
| Feature flags | **Yes** — tenant-scoped, DB-backed. This is the *right* progressive-delivery primitive for this product and it already exists. |

**Do not build canary infrastructure.** Feature flags plus a 3-tier pipeline give you most
of the risk reduction at a fraction of the operational cost. Revisit at multi-region.

---

# Phase 4 — Monitoring and observability

## 4.1 Coverage assessment

| Capability | Before this audit | After | Notes |
|---|---|---|---|
| HTTP RED metrics | ✅ | ✅ | Prometheus format, path-normalised to bound cardinality. Well done. |
| Domain metrics (UOM, POS scans) | ✅ | ✅ | Genuinely thoughtful — a config error surfaces as a metric, not a support ticket. |
| **DB pool metrics** | ❌ | **✅ added** | `db_pool_connections{state}`, `db_pool_max`. |
| **Job-queue depth** | ❌ | **✅ added** | `job_queue_depth{status}`, `job_queue_oldest_due_age_ms`. |
| **Outbox backlog** | ❌ | **✅ added** | `outbox_pending_events`, `outbox_oldest_pending_age_ms`. |
| **Runtime saturation** | ❌ | **✅ added** | RSS, heap, uptime, **event-loop delay** p50/p99/max. |
| **Build correlation** | ❌ | **✅ added** | `ascend_build_info{sha}`. |
| Health checks | ✅ | ✅ | `/healthz` liveness, `/readyz` proves DB + 503s on pool exhaustion. Genuinely good. |
| **Container health probe** | ❌ | **✅ added** | `HEALTHCHECK` on `/readyz`. |
| Structured logging | ✅ | ✅ | pino JSON, redacted. |
| Error tracking | 🔶 | 🔶 | Hand-rolled Sentry envelope — see §4.2. |
| Heartbeat | 🔶 broken | 🔶 broken | Repointable via repo variable; the variable is unset. **Sri.** |
| **Metrics scraper** | ❌ | ❌ | **The endpoint exists and nothing reads it.** This is now the top observability gap. |
| **Alerting** | ❌ | ❌ | Only "a GitHub Actions run went red". No paging, no routing, no on-call. **C-4.** |
| Distributed tracing | ❌ | ❌ | See §4.3. |
| Slow-query detection | 🔶 | 🔶 | `app.request_id` is set on every transaction so Postgres logs *can* correlate — but nothing reads `pg_stat_statements`. |
| Synthetic monitoring | 🔶 | 🔶 | Heartbeat is a 4-endpoint probe. No user-journey synthetic. |
| Status page | ❌ | ❌ | Needed before the first paying customer. |
| Business KPI metrics | ❌ | ❌ | See §4.4. |
| Incident response | ❌ | ❌ | No runbook, no severity definitions, no postmortem template. |

**The single highest-leverage next action in this entire phase is not building anything —
it is pointing a scraper at `/metrics`.** The exposition format is already correct.
Grafana Cloud's free tier plus `METRICS_TOKEN` closes metrics, dashboards, and alerting in
roughly an afternoon, and the gauges added by this audit make that afternoon worth far
more than it would have been yesterday.

### Alerts worth defining on day one

```
outbox_oldest_pending_age_ms > 300000        # 5 min — money-adjacent side effects stalled
job_queue_oldest_due_age_ms  > 900000        # 15 min — the job drain has stopped
db_pool_connections{state="waiting"} > 0     # sustained 1 min — pool exhaustion
nodejs_eventloop_delay_ms{quantile="0.99"} > 200
rate(http_requests_total{status=~"5.."}[5m]) > 0.01
up{job="ascend-backend"} == 0                # replaces the dead-hostname heartbeat
```

The first two were **not expressible before this audit** — the data did not exist.

## 4.2 Error tracking: adopt the official SDK

`shared/monitoring.ts` hand-rolls a Sentry envelope over `fetch` to avoid a dependency.
Elegant, and the wrong trade here. What it cannot do:

- **No source maps** → every frontend stack trace is minified and effectively unreadable.
- **No breadcrumbs** → you get the throw, never the sequence that led to it.
- **No release tagging** → cannot answer "did this start with the last deploy?", which is
  the first question in every incident.
- **Frames are `filename: <raw stack line>, function: "<unknown>"`** → Sentry's grouping
  degrades, so the same bug fragments into many issues.
- **No sampling, no rate limit** → an error storm sends unbounded traffic to Sentry.
- Fire-and-forget with a 3s timeout: a slow Sentry silently drops errors.

`@sentry/node` + `@sentry/nextjs` costs two dependencies and delivers all of the above.
For a system where an unhandled exception can mean a sale that did not record, that is
worth it. **Recommended, not implemented here** — it touches both halves of the app and
belongs in its own reviewable PR.

## 4.3 Tracing: correctly deferred, honestly labelled

`requestLogger()` emits `trace_id`/`span_id`, and the code comment says exactly what it is:
"a lightweight OTEL-compatible foundation ... deferred to when a specific APM vendor is
chosen." That is honest. **Do not adopt OpenTelemetry yet.** In a single-process monolith,
RED metrics plus request-scoped structured logs answer nearly every question a trace would,
and OTEL's collector, sampling and instrumentation overhead buy little until there is a
second network hop. **Trigger to revisit:** the first extracted service, or the first
incident where "which of these 9 queries was slow?" cannot be answered from logs.

## 4.4 Business KPI observability

The brief asks for inventory, purchasing, receiving, warehouse, POS, supplier and executive
metrics. **The right architecture is the one already in place, and it should not change.**
Business KPIs belong in the `reports` module reading OLTP — tenant-scoped, permission-gated,
point-in-time-accurate — not in a global Prometheus counter that would be cross-tenant, need
per-tenant labels (cardinality explosion), reset on restart, and leak one customer's volumes
into an operator dashboard.

`/metrics` is for **operators**. `reports` is for **businesses**. The existing split is
correct. The genuine gap is an *executive/operator* view of platform health across tenants
(active tenants, orders/hour, GMV) — which is a `reports` feature with a platform-admin
permission, not a metrics one. **Recommended, not built** — it needs a product decision on
who may see cross-tenant aggregates.

---

# Phase 5 — Security assessment

## 5.1 What is genuinely strong

Verified by reading the implementation, not the docs:

| Control | Assessment |
|---|---|
| **Authentication** | HS256 JWT with `algorithms: ["HS256"]` explicitly pinned — the `alg: none` / algorithm-confusion class is closed. Tokens missing `tenantId`/`sub` rejected. API keys SHA-256 hashed, prefix-indexed, expiry + revocation honoured. |
| **Login hardening** | Constant-time: a missing email burns an equivalent bcrypt compare, so user enumeration by timing fails. Lockout implemented and tested. Per-IP rate limits: 10 burst/0.33 s⁻¹ login, 5/0.05 registration. |
| **Refresh tokens** | Stored hashed, rotated on use, single-use outside a tunable reuse-grace window. httpOnly + `secure` in prod + `sameSite=lax`. |
| **XFF spoofing** | `extractClientIp` takes the IP `TRUST_PROXY_DEPTH` from the **right**, not the leftmost — the bypass most rate limiters ship with. |
| **Rate-limit fail-safe** | `safeNumber()` guards against a malformed env override producing `NaN`, which would silently fail **open**. Fixing that at the single funnel point rather than per-call-site is exactly right. |
| **SQL injection** | All caller values `@param`-bound. CI gate active since 2026-08-05; the 6 interpolation sites are identifier-only and allowlisted by expression. |
| **Tenant isolation** | Application-layer filtering + `AsyncLocalStorage` tenant context + `SET LOCAL app.tenant_id` per transaction + RLS backstop. A 2026-07-16 sweep verified verify-then-mutate on every literal `WHERE id = @id`. Dedicated `tenant-isolation.test.ts`. |
| **Capability isolation** | `requireCapability`/`requireModule` fail **closed** and the 403 message never names the capability — a retail tenant cannot enumerate other packages. The asymmetry with `requirePlan` (fail-open entitlement) is deliberate and documented. |
| **Webhook security** | Stripe signature verified against raw bytes before `express.json()`. Stored webhook secrets encrypted; fails **closed** with 503 when `WEBHOOK_SECRET_KEY` is unset in production. |
| **Secrets hygiene** | pino redaction at every nesting level; `hygiene-check.mjs` fails the build on a tracked `.env` or embedded credential; `PIPELINE.md`'s registry documents ~30 config items **by name only**, never by value. |
| **Container** | Non-root `node` user (uid 1000), multi-stage, dev deps stripped from runtime. |
| **DB TLS** | Verified by default; `PG_SSL_NO_VERIFY` is an explicit escape hatch that logs a loud warning every boot. |
| **Prompt injection** | Both AI system prompts explicitly instruct the model to ignore embedded instructions in user input and in the data payload. Rare and correct. |

**This is a well-secured application.** The findings below are real but they sit on top of
a solid foundation, not in place of one.

## 5.2 Findings

### S-1 — RLS is permissive when the tenant context is unset (HIGH, accepted-by-design)

`src/modules/rls/index.ts` applies to every table carrying `tenant_id`:

```sql
USING (
  tenant_id IS NULL
  OR tenant_id::text = 'system'
  OR COALESCE(current_setting('app.tenant_id', true), '') IN ('', tenant_id::text)
)
```

An unset `app.tenant_id` yields `''`, which matches, so **all rows are visible**. This is
deliberate (the doc comment says so — backwards compatibility with code predating
`withTenant`), and it is also **directly contrary to this repo's own design document**:
`db/rls/policies.sql` states "Never use the two-argument form `current_setting('app.tenant_id', true)`
here ... the error form is better because it surfaces the bug."

The practical position: RLS is a backstop against a forgotten `WHERE` clause *inside an
authenticated request* (where the context IS set by `tenantResolver`), and provides **no
protection at all** for any code path that runs without it — background jobs, the outbox
reconciler, migrations, scripts, and `/metrics`'s own new gauges.

Two further wrinkles: `tenant_id = 'system'` rows are visible to **every** tenant, and
`db/rls/policies.sql` (24 `CREATE POLICY`, **0** `ENABLE ROW LEVEL SECURITY`) is a design
document that has never run — two RLS stories in one repo, only one of them real.

**Recommendation:** do **not** flip this in a drive-by. `db/rls/policies.sql` already
documents the correct migration path (a `BYPASSRLS` auth role for the pre-auth
tenant/user lookup, then a strict policy for everything else). That is a project. What
should happen now, in order: (1) record the accepted risk — done, in `SECURITY.md`;
(2) write ADR-009 so the next reader does not rediscover it — done; (3) schedule the
strict-RLS migration behind a flag with the tenancy test suite as its gate.

### S-2 — Frontend CSP allows `'unsafe-inline'` for scripts (MEDIUM)

`web/middleware.ts` sets `script-src 'self' 'unsafe-inline'` in production, which defeats
much of CSP's XSS value. Required by Next.js App Router's inline bootstrap without nonces.
**Fix:** nonce-based CSP, which is materially easier on Next 15+ — so fold it into the
Next 16 migration (§5.3) rather than doing it twice. Everything else in that header set is
correct: HSTS 1y + subdomains, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, nosniff,
strict-origin referrer, and a Permissions-Policy that disables camera/mic/geolocation.

### S-3 — Dependency advisories, all in `web` (1 CRITICAL, 6 HIGH)

Measured this session:

| Package | Sev | The one that matters here |
|---|---|---|
| `vitest` ≤3.2.5 | **CRITICAL** | Vitest UI server allows arbitrary file read + execution. Dev-only — **but `web/package.json` ships a `test:ui` script**, so this is reachable on any developer machine that runs it. |
| `next` 14.2.29 | **HIGH ×10+** | **`Server-Side Request Forgery in rewrites via attacker-controlled destination hostname`** and **`HTTP request smuggling in rewrites`** — and this app proxies its **entire** backend through `rewrites()`. Also `Middleware / Proxy bypass` and `Middleware / Proxy redirects can be cache-poisoned`, and this app's **auth gate is `middleware.ts`**. The advisory surface aligns precisely with the two Next features this app depends on most. |
| `postcss` ≤8.5.22 | HIGH | Path traversal / arbitrary `.map` read via `sourceMappingURL`. Build-time. |
| `vite`, `glob`, `eslint-config-next`, `@next/eslint-plugin-next` | HIGH | Transitive, dev/build-time. |

Root is at **0 advisories** — now a CI gate at `high` (§12.5).

**The `next` 14 → 16 migration is the highest-priority engineering task in this audit.**
It is not a version-hygiene chore; it is remediation for SSRF and request-smuggling
advisories against the exact code paths this application is built on.

### S-4 — Audit-log coverage is thin (MEDIUM)

Only **14 of 53** modules write audit entries. `AGENTS.md` requires "orders, payments,
refunds, voids, register sessions, permission changes, and business profile changes must be
auditable" — the money paths are covered. But SOC 2 and most enterprise buyers expect
**every** privileged mutation to be attributable. The quotes hard-delete fixed in this
audit (§12.2) is a concrete example: it was both unguarded *and* unlogged, so a deleted
quotation left no trace of who removed it or what it contained.

**Recommendation:** an audit-write helper applied at the `requireRole`-guarded route layer,
so coverage follows authorization rather than being remembered per-module.

### S-5 — bcrypt cost 10 (LOW)

Below the 2026 norm of 12+. Raising it is a one-line change plus a rehash-on-login path.
Genuinely low risk given the lockout and rate limiting in front of it.

### S-6 — No SAST, secret scanning, container scanning or license policy (MEDIUM → partly closed)

Closed by this audit: **CodeQL** (`security-and-quality`, weekly + per-PR) and
**dependency review** (§12.4). Still open: container image scanning (needs a third-party
action — a supply-chain decision that is Sri's, not an audit's), GitHub secret scanning +
push protection (a repo *setting*, not a workflow), and a license policy (needs the policy
before a tool can enforce it).

### S-7 — JWT signed with a symmetric secret (INFORMATIONAL)

HS256 means every verifier needs the signing key. Fine for a monolith; becomes a real
constraint the first time a second service must verify tokens without being able to mint
them. **Trigger to revisit:** the first service extraction — then move to RS256/EdDSA with
a JWKS endpoint. Not before.

## 5.3 Compliance readiness

| Framework | Status | The gating items |
|---|---|---|
| **OWASP Top 10** | **Strong.** A01 broken access control, A03 injection, A07 auth failures all well covered. A05 misconfiguration is the weak column — S-1, S-2. |
| **GDPR** | **Partial.** Tenant isolation, encryption in transit, audit logging exist. **Missing: right-to-erasure, data-portability export, retention policy, DPA/sub-processor register.** |
| **SOC 2** | **Not ready**, and not for code reasons. Blockers are all operational: no verified backups (§3.4), no alerting or incident response (§4.1), no IaC change-management trail (§3.5), no access reviews, no secret-rotation evidence. |
| **PCI DSS** | **Well positioned.** Stripe + Terminal means card data never touches this system; SAQ-A / SAQ-A-EP territory. Confirm no PAN ever lands in logs or the database — the pino redaction list should gain explicit card-field paths as a belt-and-braces measure. |
| **HIPAA** | **Not ready** and should not be pursued yet. There is a `healthcare` vertical module. Needs BAAs (Supabase, Vercel, the backend host, Anthropic), encryption at rest attestation, and far stronger audit logging than S-4 describes. **Do not market the healthcare pack as HIPAA-capable until this is done.** |

---

# Phase 6 — Testing and quality engineering

## 6.1 Current coverage

| Layer | Tool | Volume | Assessment |
|---|---|---|---|
| Backend unit + integration | `node:test` via `scripts/test.ts` | **98 files, 19,495 LOC** | **Strong.** Real Postgres, per-test schema isolation. 40% test-to-source ratio. |
| Frontend unit/component | Vitest + Testing Library + MSW | **28 files, 188 tests** | **Good**, all passing. |
| E2E | Playwright | 9 specs, **20 tests** | **Thin but well-chosen** golden paths: login, checkout, delivery, inventory receive, invoice pay, verticals. |
| Smoke | `scripts/smoke.ts` | 20 steps | Boots the real app on real Postgres, drives the full POS lifecycle over HTTP. **This is the strongest single gate in the repo.** |
| Contract | `contracts/openapi.yaml` (3,060 lines, 109 paths) + `openapi-typescript` | Types generated | **Generated, not enforced** — nothing fails when the implementation drifts from the spec. |
| Drift guards | 5 custom `tools/*.mjs` scanners | — | **Unusually good.** `gap:scan` catches a frontend call with no backend route — a bug class most teams never automate. |

The backend suite is the quality backbone of this project and it has repeatedly earned its
keep: `LOOP_STATE.md` records **8 real production bugs found purely by writing tests** for
modules that were marked "built" — including a table-name collision that made an entire
module 100% non-functional in a way no other gate could see.

## 6.2 Gaps, ranked by what they would actually catch

| Missing | Priority | What it would catch that nothing does today |
|---|---|---|
| **Load / stress testing** | **P1** | Nothing anywhere establishes throughput, p95 latency, or the concurrency at which the pool exhausts. For a **POS**, "how many tills can check out simultaneously on Black Friday" is a product requirement, not a nice-to-have — and it is currently unanswerable. `k6`, scriptable, CI-friendly, no account. |
| **Backup restore validation in CI** | **P1** | The mechanism was drilled by hand once. Nothing re-proves it. A restore path that silently rots is the worst kind of backup. |
| **Contract testing** | P2 | OpenAPI drift. The spec generates types but never fails a build. `openapi-backend` or a schema-response assertion in the smoke test. |
| **Migration testing** | P2 | Migrations only ever run forward on an empty schema in CI. Nothing tests applying them to a populated database, which is what production actually does. |
| **Accessibility testing** | P2 | `AGENTS.md` mandates WCAG 2.1 AA as a hard gate; **nothing automated verifies it.** `@axe-core/playwright` in the existing E2E suite is roughly a day's work. |
| **Visual regression** | P3 | Design-system drift across 122 pages. Playwright screenshots. |
| **Chaos / fault injection** | P3 | Circuit breakers exist for Stripe and Anthropic; nothing verifies behaviour when Postgres or Redis actually disappears. |
| **Penetration testing** | P2 (external) | No substitute for the real thing before enterprise customers. |

## 6.3 Test-infrastructure observations

- **`PG_POOL_MAX=1`** in `scripts/test.ts` due to known parallel flakiness. Single-file runs
  are treated as authoritative. This works but caps suite speed and hides concurrency bugs
  that only appear with a real pool — the very class the inventory `FOR UPDATE` fixes were
  about.
- **48 copies of `test-request.ts`** across modules, flagged by the repo's own
  duplicate-code scan (F-15, report-only). Divergence between copies is a live risk; the
  shared `src/shared/test-request.ts` already exists to consolidate onto.
- **E2E is a hard gate** on all three tiers after the rate-limit root-cause fix took it from
  5.9–11.1 min / 2–22 failures to **27 passed / 0 failed / 32.1 s**. That investigation —
  driven to a confirmed root cause via a Playwright trace DOM snapshot rather than guessed —
  is a model of how to handle a flake.

---

# Phase 7 — Performance engineering

## 7.1 Frontend — measured this session

`NEXT_PUBLIC_MOCK=false npm run build`:

| Metric | Value | Assessment |
|---|---|---|
| Routes | 124 | |
| **Shared first-load JS** | **87.4 kB** | **Excellent** for a 122-page ERP. Comfortably inside Next's own budget guidance. |
| Largest first-load | 247 kB | Acceptable; likely a Recharts-heavy dashboard. |
| POS terminal | 28.1 kB route / 143 kB first load | **The number that matters most**, and it is good — this is the screen a cashier waits on. |
| Middleware | 26.9 kB | Runs on every request; worth watching. |
| `.next/standalone` | 38 MB | Reasonable container payload. |

**No frontend performance work is warranted.** The bundle is lean, `output: standalone`
enables container/CDN deployment, and there is no evidence of a problem. Optimising this
would be effort spent where there is no measured pain.

## 7.2 Backend

| Area | Assessment |
|---|---|
| **Index coverage** | **Strong.** 248 indexes; 230 lead with `tenant_id`, matching the query shape. The 18 exceptions are correct by design. |
| **Pagination** | Keyset primitive (`shared/pagination.ts`) exists and unbounded lists were swept in 2026-07-16 (movements, audit log, journal). **But `catalog`/`inventory` list pages have no pagination UI despite backend support** (per `GAPS.md`) — the backend can page, the frontend does not ask. |
| **N+1 queries** | **Examined; no list-endpoint N+1 found.** The 9 files with a query-inside-loop shape all loop over an order's own **line items inside a single transaction** — bounded by cart size, inherent to the operation, and correct. This is the good kind. |
| **Connection pooling** | Bounded, 5s connect timeout, 30s statement timeout, `allowExitOnIdle`. `/readyz` 503s on `waiting > 0` so a load balancer sheds. Well done. |
| **Reporting** | Queries OLTP directly. `ARCHITECTURE.md` marks read models as ⬜ with "trigger = first slow dashboard". **Correct call** — do not build CQRS before a measured problem. |
| **Cold starts** | Was the reason for the serverless→persistent-process move. Unverifiable pending §3.1. |
| **Compression** | **No `compression` middleware.** JSON list responses go over the wire uncompressed unless the platform adds gzip/brotli at its edge. Worth confirming; a one-line addition if not. |
| **Background jobs** | Bounded per tick (20 iterations / 10s deadline), `FOR UPDATE SKIP LOCKED`, idempotent consumers. Sound. |

## 7.3 The actual performance finding

**There is no performance data.** No load test, no p95 tracking, no slow-query log review,
no capacity model. Everything in §7.2 is a code-reading assessment of *whether the shapes
are right* — and they are. But nobody knows what this system does at 50 concurrent tills,
or where it breaks first.

For a POS that will be pitched on "high-volume POS environments", that is the gap.
Recommendation: `k6` against a staging tier that actually works (§3.1), targeting the POS
lifecycle the smoke test already scripts. **The smoke test is 90% of a load test already** —
it drives the full lifecycle over HTTP; it just runs each step once.

---

# Phase 8 — DevOps and developer experience

## 8.1 Strong

- **Conventional commits**, enforced culturally and visible in history.
- **Forward-only 3-tier promotion**, structurally enforced (§3.3).
- **A genuinely unusual guard suite**: hygiene, API-gap, table-collision, duplicate-code,
  dead-code, prevention-agent, plus actionlint and shellcheck. Several catch bug classes
  most teams never automate.
- **ADRs with a template** and real, non-ceremonial content.
- **`AGENTS.md` as a single agent-instruction file**, CI-enforced to exactly one copy.
- **A multi-session coordination lock** (`WORK/LOCK.md`) — a real answer to a real problem
  (four AI environments on one repo).
- **Honest status vocabulary** (`built_verified` / `built_unverified` / `partial` /
  `mocked` / `planned` / `missing`) and audits that record what failed, not just what
  passed. The `DEPLOYMENTS.md` incident document is a model of separating confirmed fact
  from claim.

## 8.2 Weak

| Gap | Impact |
|---|---|
| **Documentation contradicts itself about production** | The most expensive gap in the repo. Three docs vs. zero automation (§3.1). |
| **`artifacts/` — 1,005 files of parallel codebase** | Directly caused 5 CI-breaking incidents in 2 days (§1.6). |
| **Default branch is still `master`** | `AGENTS.md` mandates branching from `develop`; tooling bootstraps off GitHub's default and has already opened a PR against the wrong base. One-line repo setting. **Sri.** |
| **No release versioning** | `package.json` says `2.0.0`; no tags, no changelog, no release notes. "What shipped?" is answered by reading git log. |
| **Report-only checks that may never gate** | duplicate-code (F-15), dead-code (F-17, 371 hits), `web` audit (F-16). Each has a stated reason. The risk is that "report-only" becomes permanent and the signal is tuned out. Each needs a target and a date. |
| **Two inert CI guards** | Both now fixed — SQL injection in `c00a485`, authorization in this audit (§12.1). Worth noting as a *class*: a check that cannot fail is worse than no check, because it is counted as coverage. **Every new guard should ship with a proof that it fails against a known-bad input.** `tools/route-authz-scan.mjs` was validated exactly this way — it found 4 real issues before its allowlist was written. |
| **Docker not the deploy path** | `docker-build` is a non-blocking sanity check. The image is the most portable asset here and it is exercised least. |

## 8.3 Developer experience

Strong: `npm run smoke` gives a full-lifecycle proof with zero setup; `npm run verify`
aggregates every gate; a local runbook covering the real-stack e2e recipe; environment
caveats (Cursor Cloud `/dev/shm`, Node 24 vs 22) documented where they bite; and the web
test harness **prints a warning explaining which 3 tests will fail on Node 22 and why** —
observed live this session. That is unusually considerate tooling.

---

# Phase 9 — Enterprise integrations

Current state: webhooks (encrypted secrets, fail-closed), API keys with scopes, OIDC SSO
(per-tenant config in `settings_kv`), Stripe, SendGrid. `ARCHITECTURE.md` marks the
integration platform 🔶 with a connector registry queued as E5.

**Sequencing recommendation — build the platform once, not eight adapters.** E5's connector
registry (credential storage, retry/backoff, per-connector rate limiting, sync-state
tracking, error surfacing) is the reusable part. Every integration below then becomes an
adapter, not a project.

| Tier | Integrations | Rationale |
|---|---|---|
| **1 — highest ROI** | **QuickBooks / Xero**, **Shopify**, **shipping (EasyPost/Shippo)** | Accounting sync is the #1 SMB/mid-market ERP ask and `accounting` already has a COA and append-only ledger to sync *from*. Shopify unifies the online/in-store inventory story the `ecommerce` module gestures at. One shipping aggregator covers UPS/FedEx/USPS/DHL at once. |
| **2** | **Avalara/TaxJar**, WooCommerce, Amazon, label printers (ZPL) | A tax engine **also resolves the three-way tax-authority conflict** documented in `ARCHITECTURE.md` (F-11) — an external engine becomes the single source of truth, turning a correctness defect into an integration. That is the highest-value item on this entire list. |
| **3** | Slack/Teams alerts, Microsoft 365 / Google Workspace SSO, Power BI/Tableau via a read replica | Slack is nearly free given the existing notifications module and closes part of C-4. |
| **4 — do not build speculatively** | SAP, Oracle, NetSuite, EDI, RFID, fiscal devices | Each is months of work and only justified by a named customer contract. Note EDI is already half-built and blocked on a product decision (`GAPS.md`). |

---

# Phase 10 — AI and intelligent automation

**ADR-005's explain-only posture is the correct architecture and must not be relaxed.** In
an ERP, an AI that invents a quantity, price or supplier is worse than no AI at all —
it corrupts the book of record. The existing implementation gets this right: rule-based
signals are computed deterministically from real tenant data, the model narrates them, the
system prompt forbids inventing facts, every write requires human approval, and a circuit
breaker degrades to a message that points the user at the underlying data.

Recommended capabilities, ordered by value-to-risk with that constraint held:

| Priority | Capability | Why it fits |
|---|---|---|
| **1** | **Demand forecasting** | `shared/sales-velocity.ts` + `demand-rate.ts` + `demand_planning` + `inventory_movements` already contain everything needed. This is **statistics, not an LLM** — seasonality and trend on existing data. Deterministic, testable, explainable. Highest value, lowest risk. |
| **2** | **Reorder optimisation** | `reorderAlerts()` already computes velocity → days-to-stockout → suggested qty, with MOQ/pack-size rounding and safety stock shipped. Adding supplier lead-time variance and holding cost is an incremental, deterministic improvement. |
| **3** | **Natural-language reporting** | Highest user-visible value. Do it as **NL → a whitelisted, parameterised report query**, never NL → arbitrary SQL. The model picks from known reports and fills parameters; the report computes the number. |
| **4** | **Semantic search / knowledge base** | `pgvector` on the existing Postgres. No new infrastructure. |
| **5** | **Invoice / receipt OCR** | Genuine manual-labour elimination and the natural completion of the stalled EDI work. Needs an OCR provider decision and, critically, a **human-confirmation step before anything posts**. |
| **6** | **Anomaly detection** (fraud, shrinkage) | Statistical, on `inventory_movements` + `audit_log`. Flag for review — never auto-act. |
| **Not yet** | Dynamic pricing, autonomous agents | Dynamic pricing changes what customers are charged; there is no single pricing owner in the codebase today (`ARCHITECTURE.md`: "NO OWNER — does not exist"), so this is blocked on that architecture. Autonomous agents contradict ADR-005 and E6's own sequencing (after E1/E4). |

---

# Phase 11 — Production readiness scores

Scored on evidence gathered this session. **These are pre-existing scores measured against
the baseline commit** — §12.15 records what this audit's changes move.

| Dimension | Score | Evidence |
|---|---|---|
| **Architecture** | **88** | Modular monolith with genuine module boundaries, event bus + outbox, clean gateway seam, 6 ADRs, documented standing rejections. −: tax has three independent authorities (a live correctness defect); pricing has no owner at all. |
| **Scalability** | **62** | Right primitives (keyset pagination, tenant-leading indexes, `SKIP LOCKED`, bounded pool, stateless app). −: **no load test has ever run**, so every scalability claim is theoretical; Redis-optional breaks rate limiting and event fan-out at instance #2; reporting on OLTP. |
| **Reliability** | **45** | Outbox with durable redelivery, circuit breakers, advisory-locked migrations, `/readyz` sheds load. −−: **production location unconfirmed**; **no backup has ever run**; no down-migrations; heartbeat probes a dead hostname. |
| **Security** | **82** | Strong across auth, authorization, injection, tenancy, secrets, transport, container. −: RLS fail-open (S-1); `web` carries 1 critical + 6 high advisories (S-3); CSP `unsafe-inline` (S-2); audit logging in 14/53 modules (S-4). |
| **Performance** | **70** | 87.4 kB shared bundle, good index coverage, no list-endpoint N+1, sane pool config. −: no measurements of any kind; no compression middleware; list pages lack pagination UI. |
| **Observability** | **48** | Prometheus-format metrics (now with pool/queue/outbox/runtime gauges), redacting structured logs, good health probes. −−: **nothing scrapes the endpoint**; **no alerting** (C-4); no tracing; hand-rolled error tracking. |
| **Testing** | **78** | 98 backend files at 40% test-to-source on real Postgres, 188 frontend tests, 20 E2E, a 20-step full-lifecycle smoke, 5 custom drift scanners. −: no load/contract/a11y/migration/restore testing; `PG_POOL_MAX=1` hides concurrency bugs. |
| **Deployment** | **35** | Real 3-tier forward-only pipeline, structurally-enforced release gate, comprehensive CI. −−: **production deploy target unconfirmed and unautomated**; dev+staging backends dead; **zero IaC**; two Vercel projects referenced by ID that no longer exist. |
| **Maintainability** | **72** | Single-owner-per-entity discipline, honest status labels, drift scanners, coordination lock. −: `artifacts/` is 55% of tracked files and has broken CI five times; 48 duplicated test helpers; 371 dead-code hits. |
| **Developer experience** | **85** | `npm run smoke` / `verify`, documented runbooks and environment caveats, a test harness that explains its own expected failures, ADR + PR templates. −: default branch mismatch; two-lockfile setup. |
| **Compliance** | **40** | PCI well-positioned (Stripe/Terminal), audit-log infrastructure exists, secrets never committed, `SECURITY.md` now present. −−: no verified backups, no alerting, no access reviews, no GDPR erasure/export, no IaC change trail. |
| **ERP readiness** | **80** | Genuinely broad and deep: catalog, inventory with immutable movements, purchasing with 3-way match and requisitions, accounting with append-only ledger, POS, AR/AP, workforce, 12 vertical packs. −: tax conflict; no pricing owner; receiving sessions, EDI parsing and issue detection are decision-blocked. |
| **Enterprise readiness** | **52** | Multi-tenancy, RBAC + custom roles, OIDC SSO, MFA, API keys with scopes, webhooks, audit log, capability-based package isolation. −: no SLA (nothing measures uptime), no status page, no DR proof, no incident process, no SOC 2 path. |
| **AI readiness** | **65** | Correct architecture (ADR-005), circuit-broken, prompt-injection-aware, ADR-007's extension pattern. −: one narrow use case; forecasting/OCR/NL-reporting all unbuilt; no eval harness for AI output quality. |

### **Overall: 64 / 100**

The distribution is the whole story. **Architecture 88, Security 82, Testing 78, DX 85 —
against Deployment 35, Compliance 40, Reliability 45, Observability 48.**

That is not a system that was built badly. It is a **well-built system that nobody has
finished putting into production.** The four low scores share one root cause and largely
one owner: §3.1. Resolving deployment ownership, setting one secret, and pointing a
scraper at an endpoint that already exists would move Deployment, Reliability and
Observability by roughly 25–30 points each — without writing meaningful new application code.

---

# Phase 12 — Deliverables

## 12.1 Technology inventory
§1. 43 technologies catalogued; 11 categories confirmed absent.

## 12.2 Architecture diagram

```
                            ┌──────────────────────────────────────────┐
                            │  Browser / POS terminal / HID scanner    │
                            └────────────────────┬─────────────────────┘
                                                 │ HTTPS
                            ┌────────────────────▼─────────────────────┐
                            │  Next.js 14 (Vercel) — output:standalone │
                            │  middleware.ts: session gate + CSP/HSTS  │
                            │  rewrites(): /api/* → BACKEND_URL        │◀── same-origin,
                            │  122 pages · 87.4 kB shared JS           │    so no browser CORS
                            └────────────────────┬─────────────────────┘
                                                 │ server-side proxy
    ┌────────────────────────────────────────────▼─────────────────────────────────────────┐
    │                     Express 4 modular monolith  (src/app.ts)                          │
    │                                                                                        │
    │  GATEWAY   requestId → metrics → rateLimit(IP) → auth(JWT|API key) → tenantResolver    │
    │            → tenantRateLimit(tier)   ·   errorEnvelope (last)                          │
    │                                                                                        │
    │  PUBLIC    /healthz  /readyz  /metrics(token)  /jobs/tick(secret)                      │
    │            /api/identity/{login,refresh,register,...}   /api/v1/sso/*  (pre-token)     │
    │            /api/stripe/webhook  (raw body, signature-verified before express.json)     │
    │                                                                                        │
    │  AUTHED    /api/v1/*  →  53 domain modules                                             │
    │            Commerce · Supply Chain · Finance · Platform · Verticals(gated)             │
    │                                                                                        │
    │  SHARED    money(cents) · docnumber · pagination · uom · sales-velocity                │
    │            EventBus ──(financial types)──▶ Outbox ──▶ durable idempotent consumers     │
    │            SSE broker  ·  circuit breakers (Stripe, Anthropic)                          │
    └───────┬──────────────────────┬──────────────────────┬──────────────────┬──────────────┘
            │                      │                      │                  │
   ┌────────▼────────┐   ┌─────────▼────────┐   ┌─────────▼──────┐  ┌────────▼────────┐
   │ PostgreSQL 16   │   │ Redis (OPTIONAL) │   │ Stripe         │  │ Anthropic       │
   │ Supabase        │   │ rate limit ·     │   │ payments +     │  │ explain-only    │
   │ 202 tables      │   │ event fan-out    │   │ Terminal       │  │ (ADR-005)       │
   │ tenant_id + RLS │   │ ⚠ in-memory      │   └────────────────┘  └─────────────────┘
   │ 248 indexes     │   │   fallback ⇒     │   ┌────────────────┐  ┌─────────────────┐
   │ advisory-locked │   │   per-instance   │   │ SendGrid       │  │ Sentry          │
   │ migrations      │   │   limits (R-7)   │   │ email          │  │ (hand-rolled)   │
   └─────────────────┘   └──────────────────┘   └────────────────┘  └─────────────────┘
```

## 12.3 Infrastructure diagram (as actually wired)

```
  Developer ──git push──▶ GitHub (Sricharangellu/Ascend)
                                │
        ┌───────────────────────┼────────────────────────┬─────────────────────┐
        │                       │                        │                     │
   ci.yml                 security.yml [NEW]        uptime.yml            backup.yml
   guard·backend·frontend  CodeQL + dep-review      */15 min probe        daily 09:00
   docker-build·e2e        weekly + per-PR                │                     │
        │                                                 │                     │
        ▼ per branch                                      ▼                     ▼
  develop ─▶ deploy-dev ──┐                    ⚠ PROD_BACKEND_URL   ⚠ PROD_DATABASE_URL
  staging ─▶ deploy-stg ──┼─▶ scripts/deploy.sh   unset ⇒ falls back    unset ⇒ 16 green
  master  ─▶ deploy-prod ─┘   (Vercel CLI only)   to a hostname that     runs, ZERO backups
                                    │              no longer resolves     (now annotated —
                                    │                                      §12.6)
              ┌─────────────────────┼─────────────────────┐
              ▼                     ▼                     ▼
      Vercel FRONTEND       Vercel BACKEND          Render BACKEND
      (all tiers)           ⚠ dead / wrong app      ⚠ CLAIMED, no automation,
      ✅ working            ⚠ project IDs stale        no render.yaml, unreachable
              │                     │                     │
              └─────────────────────┴──────────┬──────────┘
                                               ▼
                        ┌──────────────────────────────────────────┐
                        │ Supabase A "prod"  ca-central-1          │
                        │   ⚠ no connection ever confirmed         │
                        │ Supabase B "testing"  us-west-2          │
                        │   ✅ 172 tables, actually in use          │
                        │   (shared by develop + staging)          │
                        └──────────────────────────────────────────┘

  ⚠ = the three unresolved facts that make this diagram a question, not a record.
```

## 12.4 Integration map
§1.2 (live) and §9 (recommended, tiered).

## 12.5 Service dependency graph

```
Ascend backend
├── HARD (service will not start / core function fails)
│   └── PostgreSQL ....... fail-fast at boot; every request depends on it
├── SOFT — degrade gracefully, verified in code
│   ├── Redis .......... falls back in-memory ⚠ silently weakens rate limiting at N>1 (R-7)
│   ├── Stripe ......... circuit breaker → 503; cash/other tenders unaffected
│   ├── Anthropic ...... circuit breaker → 503 + a message pointing at the real data
│   ├── SendGrid ....... logs to console when unset
│   └── Sentry ......... fire-and-forget, 3s timeout, never throws
└── BUILD/DEPLOY-TIME
    ├── GitHub Actions · Vercel · npm registry
    └── ⚠ Render — claimed runtime dependency, unrepresented in this repo

Frontend
├── HARD: backend origin via BACKEND_URL (baked at build time into rewrites)
└── SOFT: MSW (dev/test only; NEXT_PUBLIC_MOCK=false in every real deployment)
```

Sound blast-radius design: **exactly one hard runtime dependency**, and every soft one has
a verified degradation path.

## 12.6 Security assessment
§5. 7 findings (0 critical-in-prod, 1 high accepted-by-design, 4 medium, 2 low/info) plus
1 critical + 6 high dependency advisories.

## 12.7 Monitoring gap analysis
§4. Five gauge families added; scraper and alerting remain the top open items.

## 12.8 Testing gap analysis
§6. Load testing and restore validation are P1.

## 12.9 Performance optimisation report
§7. **No optimisation recommended — measurement recommended instead.** No shape in the code
justifies work; no data exists to justify it either.

## 12.10 Cost optimisation report

Estimated current monthly spend (all tiers plausibly on free/hobby):

| Item | Est. | Note |
|---|---|---|
| Vercel | $0–20 | Hobby → Pro at commercial use |
| Supabase ×2 | $0–50 | Free → $25/project at Pro |
| GitHub Actions | $0 | Public/free tier |
| Stripe | Per-transaction | Revenue-linked, not fixed |
| Anthropic | <$10 | Explain-only, 400 max tokens |
| **Total** | **≈$0–80/mo** | |

**Cost is not a problem today; under-provisioning is.** The optimisations that matter:

1. **Two Supabase projects instead of three** — already done by directive. Correct.
2. **Redis: use a serverless tier when it becomes required** (Upstash per-request) rather
   than a $15+/mo always-on instance for a workload that idles.
3. **Grafana Cloud free tier** rather than Datadog — closes metrics + logs + alerting for
   $0 at this volume. Datadog would be ~$200+/mo for the same coverage.
4. **The real cost risk is Supabase egress + connection limits.** `PG_POOL_MAX` formula is
   documented in `.env.example`; it must be recalculated the moment instance count changes,
   or the pooler's per-project client limit becomes the outage.
5. **`artifacts/` costs CI minutes and, five times, whole days of engineering.** Extracting
   it is a cost optimisation, not just hygiene.

## 12.11 Infrastructure modernization roadmap
§12.13.

## 12.12 Migration strategy

| Migration | Approach | Risk | Rollback |
|---|---|---|---|
| **Next 14 → 16** | Branch, run codemods, fix breaking changes, full E2E on staging, adopt nonce-CSP in the same PR (fixes S-2 for free) | **Medium.** App Router APIs shifted across two majors. | Revert the PR; frontend deploys are atomic on Vercel |
| **Vitest 2 → 4** | Independent of the above; config + API changes only | Low | Revert |
| **Deploy-target resolution** | §3.1 Option A or B, then IaC the winner, then repoint `uptime.yml` + `deploy.sh` + `next.config.mjs` fallbacks | **Low technically, blocking organisationally** | N/A — this is a decision, not a change |
| **Strict RLS** | Add `BYPASSRLS` auth role for pre-auth lookups → strict policy behind a flag → run the tenancy suite → enable per environment | **High.** A wrong move here breaks login for everyone. | Feature-flagged; revert the policy migration |
| **Redis required** | Provision → set `REDIS_URL` → verify limits are shared → **then** scale past one instance | Low | Unset the variable |
| **`artifacts/` extraction** | Harvest `push_tokens` and anything else of value → push to its own repo → remove from this tree | Low technically; **needs Sri's sign-off** — it is user work | The history remains in git |

## 12.13 Implementation priorities

### IMMEDIATE — this week (blocking; nothing else matters until these land)

| # | Action | Owner |
|---|---|---|
| 1 | **Resolve deployment ownership** (`DEPLOYMENTS.md` Option A or B). Confirm from dashboards where the backend runs, which Supabase it connects to, and whether it is up. | **Sri** |
| 2 | **Set `PROD_DATABASE_URL`**, run `backup.yml`, confirm a `db-backup-*` artifact attaches. **Until this is done, any data-affecting mistake is permanent.** | **Sri** |
| 3 | **Set `PROD_BACKEND_URL` / `PROD_FRONTEND_URL`** repo variables so the heartbeat probes something real. | **Sri** |
| 4 | **Change the GitHub default branch to `develop`** — one setting, prevents a recurring process violation. | **Sri** |
| 5 | Merge this audit's PR: working authz guard, quotes fix, metrics gauges, CodeQL, audit gate, honest backup, HEALTHCHECK. | Eng |

### 30 DAYS

| # | Action |
|---|---|
| 6 | **Next 14 → 16 + Vitest 2 → 4.** Remediates 1 critical + 6 high, including SSRF/smuggling in `rewrites()` — the code path this entire app proxies through. Adopt nonce-CSP in the same PR (closes S-2). |
| 7 | **Point a scraper at `/metrics`** (Grafana Cloud free) and define the six alerts in §4.1. Closes C-4. |
| 8 | **Adopt the official Sentry SDK** in both halves — source maps, breadcrumbs, release tagging, sampling. |
| 9 | **First load test** (`k6`) against a working staging tier, using the smoke test's lifecycle as the script. Establishes the first real capacity number this project has ever had. |
| 10 | **Restore drill against a real production backup**, and add a restore-validation job to CI so it cannot rot. Closes C-1 properly. |
| 11 | **Incident runbook + status page.** Severity levels, on-call, comms. |

### 90 DAYS

| # | Action |
|---|---|
| 12 | **IaC the confirmed deploy target** (now that #1 is settled). Every env var by name, in the repo, reviewable. |
| 13 | **Resolve the tax three-authority conflict** (F-11) — or adopt Avalara/TaxJar, which resolves it as a side effect. |
| 14 | **Strict RLS migration** behind a flag (ADR-009). |
| 15 | **Extend audit logging** to every `requireRole`-guarded mutation (S-4) via a route-layer helper. |
| 16 | **Extract `artifacts/`** to its own repository. |
| 17 | **Accessibility testing** (`@axe-core/playwright`) — `AGENTS.md` mandates AA; nothing verifies it. |
| 18 | **Contract testing** — make OpenAPI drift fail a build. |
| 19 | **Down-migrations** for module migrations, or an explicit documented forward-only policy with expand/contract discipline. |

### 6 MONTHS

| # | Action |
|---|---|
| 20 | **Connector registry (E5)** — then QuickBooks/Xero, Shopify, shipping as adapters. |
| 21 | **Demand forecasting** on the existing velocity foundation (statistics, not LLM). |
| 22 | **Redis required + second instance**; verify shared rate limits before scaling. |
| 23 | **GDPR export + right-to-erasure.** |
| 24 | **SOC 2 readiness assessment** — access reviews, secret rotation, change management. |
| 25 | **Read models for reporting** — only if a dashboard has actually gone slow. |

### 12 MONTHS

| # | Action |
|---|---|
| 26 | Multi-region read replicas / PITR, driven by a real availability requirement. |
| 27 | Natural-language reporting over whitelisted parameterised queries. |
| 28 | OCR/invoice automation with mandatory human confirmation. |
| 29 | External penetration test + SOC 2 Type I. |
| 30 | Revisit OTEL, RS256/JWKS, and a dedicated search engine — **each gated on the specific trigger named in §2**, not on the calendar. |

## 12.14 Deliberately NOT done, and why

Honesty about scope matters more than a longer changelog:

| Not done | Why |
|---|---|
| **`render.yaml` / any IaC** | Would create a **fourth** conflicting picture of production while three already disagree. `DEPLOYMENTS.md` explicitly warns against half-configured paths. Codify the winner *after* §3.1, not before. |
| **Flipping RLS to fail-closed** | Would break the pre-auth tenant/user lookup and lock everyone out. Needs the `BYPASSRLS` auth role first — a project, documented in ADR-009. |
| **Next 16 migration** | A two-major migration is not an audit-PR change. It needs its own branch, full E2E, and a staging tier that works. |
| **Sentry SDK adoption** | Touches both halves and adds runtime dependencies — deserves its own reviewable PR. |
| **Container scanning (Trivy)** | Requires a third-party GitHub Action. This repo pins even actionlint to an immutable tag for supply-chain reasons; widening that surface is Sri's call. |
| **Deleting `artifacts/`** | `AGENTS.md`: do not delete user work. Recommended for extraction with sign-off. |
| **Business KPI metrics in `/metrics`** | Architecturally wrong (cross-tenant, cardinality explosion, resets on restart). Belongs in `reports` with a platform-admin permission — a product decision. |
| **Raising bcrypt cost** | Needs a rehash-on-login path; low risk given lockout + rate limiting. Queued, not rushed. |

## 12.15 Verification of this audit's changes

| Gate | Result |
|---|---|
| `npm run typecheck` (backend) | **PASS** |
| `npm run hygiene` | **PASS** — 2,184 files |
| `npm run authz:scan` (new) | **PASS** — 49 route files, 6 allowlisted, 0 unguarded |
| `npm run gap:scan` | **PASS** |
| `npm run table:scan` | **PASS** |
| `npm test` (backend, real Postgres 16) | see §12.16 |
| `web` typecheck / lint / test | **PASS** — 188/188 |
| `web build` (`NEXT_PUBLIC_MOCK=false`) | **PASS** |
| `actionlint` on the new + modified workflows | see §12.16 |

**Proof the new guard actually works** — the standard this audit argues every guard should
meet (§8.2). Run against the tree *before* the allowlist was written, `route-authz-scan.mjs`
exited 1 and named 4 unguarded mutations. One (`quotes DELETE /:id`) was fixed in code;
three were reviewed and allowlisted with written reasons. The old CI step, by contrast,
exited 0 on every run it ever made.

## 12.16 Risk register

| ID | Risk | Likelihood | Impact | Status | Owner |
|---|---|---|---|---|---|
| **R-1** | **Production location unconfirmed; deploy automation targets dead projects.** A release may not reach production, or may reach the wrong one. | High | **Critical** | Open since 2026-07-30 (`DEPLOYMENTS.md`) | **Sri** |
| **R-2** | **No production backup has ever run.** RPO is total loss, not 24h. Any data-affecting error is permanent. | Certain (already true) | **Critical** | Partially mitigated — the run is now loud (§12.6). Secret still unset. | **Sri** |
| **R-3** | **No down-migrations for module migrations.** A bad schema change cannot be rolled back by either rollback mechanism. | Medium | High | Open | Eng |
| **R-4** | **Next.js 14 carries SSRF + request-smuggling advisories against `rewrites()`** — the mechanism this app proxies all backend traffic through — and middleware-bypass advisories against `middleware.ts`, its auth gate. | Medium | **High** | Open — 30-day item #6 | Eng |
| **R-5** | **No alerting.** An outage is discovered by a customer. Heartbeat has been red ~30 runs against a dead hostname, so a real outage looks identical to today. | High | High | Open — C-4 | Sri + Eng |
| **R-6** | **RLS fail-open when tenant context is unset.** Any code path outside an authenticated request has no DB-level tenant protection. | Low (app layer filters) | **Critical if it fires** | Accepted, documented (ADR-009, `SECURITY.md`) | Eng |
| **R-7** | **Redis-optional silently weakens rate limiting and breaks event fan-out at instance #2.** A security control degrades in proportion to replica count. | Medium (on scaling) | High | Documented; boot warning exists | Eng |
| **R-8** | **`artifacts/` (1,005 files) has broken CI five times in two days** via root-manifest hijack, and hides shipped work that reaches nobody. | Medium (recurring) | Medium | `hygiene-check.mjs` check 8 guards the symptom | Sri (sign-off) |
| **R-9** | **No GDPR erasure or export.** Blocks EU enterprise sales; a subject request cannot currently be honoured. | Low now, High on first EU customer | High | Open | Product |
| **R-10** | **No capacity data.** "High-volume POS" is unproven; the first real load event is also the first load test. | Medium | High | Open — 30-day item #9 | Eng |
| **R-11** | **Tax has three independent authorities.** An invoice POSTed without `tax_rate_pct` charges **zero tax** while the same goods through POS are taxed at the state rate. | **Already true** | **High** (financial/legal) | Open — F-11 | Eng + Sri |
| **R-12** | **Audit logging in 14 of 53 modules.** Privileged mutations outside those 14 are unattributable. | Medium | Medium | Open — S-4 | Eng |
| **R-13** | **Report-only checks may never gate.** duplicate-code, dead-code (371 hits) and `web` audit each have a reason; without a target date, "report-only" becomes permanent and the signal is tuned out. | Medium | Low | Open | Eng |

## 12.17 ADRs

Added by this audit, in `docs/architecture/ADR/`:

- **ADR-008 — Authorization guards on mutating routes are enforced by a scanner, not a grep.**
  Records why the CI step was replaced, the PUT/PATCH/DELETE-only scope and why POST is
  excluded, and the shrink-only allowlist rule.
- **ADR-009 — RLS is a backstop, not the tenant boundary (until the auth-role split lands).**
  Makes the accepted risk explicit, states the invariant callers may rely on, and defines
  the migration path and the evidence bar for revisiting it.

## 12.18 Documentation updates

- `SECURITY.md` — **new.** Disclosure process, scope, security invariants, accepted risks.
- `docs/architecture/GAPS.md` — new verified gaps from this pass.
- `WORK/LOOP_STATE.md` — backlog + NEEDS-SRI updated; F-2 closed with evidence.
- This audit — the point-in-time record, per `AGENTS.md`'s handoff protocol.

---

# Closing assessment

**Is Ascend going in the right direction? Yes — more clearly than the project's own
documentation suggests.**

The architectural decisions are consistently good, and the *rejections* are as impressive as
the adoptions: no microservices, no Kafka, no Kubernetes, no ORM, no auth vendor, no search
cluster, no feature-flag SaaS. Each was considered and declined with a written reason and a
named trigger for revisiting. That is unusual discipline, and it is why this audit
recommends changing three technologies out of twenty-six.

The gap is not technical judgement. It is that **an excellent application has been built
faster than the operational capability to run it**. Deployment ownership is unresolved,
backups have never run, nothing scrapes the metrics endpoint that already emits the right
format, and no one has ever measured what the system does under load.

None of those are hard problems. Three of the four are configuration, not engineering — a
secret, two repo variables, and a decision. That is what makes the current state
frustrating rather than worrying: **the distance between 64/100 and something close to 85
is measured in days of operational work, not quarters of engineering.**

The correct next move is not another module. It is to stop, resolve where production lives,
prove a backup can be restored, and point something at the metrics. Then resume building —
on a foundation someone can actually operate.
