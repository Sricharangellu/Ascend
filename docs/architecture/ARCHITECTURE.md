# Ascend — Architecture (as-built, single source of truth)

One file, kept truthful. Update when reality changes. Consolidates the
former `ARCHITECTURE.md` + `ACPA_ROADMAP.md` + `DOMAIN_MODEL.md` +
`PLATFORM_ROADMAP.md` + `orchestration/SYSTEM_DESIGN.md` into one place —
those are archived under `_archive/`.

## Shape

Domain-driven **modular monolith**: Node/TypeScript/Express backend
(`src/modules/*`, 52 modules), Next.js 14 frontend (`web/`), one PostgreSQL
(Supabase-hosted).

```
Next.js web (Vercel) ── proxies /api/* ──▶ Express backend (Render — long-lived process)
  EnterpriseShell nav, package gating         gateway: JWT/API-key auth, tenant
  /store public storefront                    resolver, role/plan/rate limits
                                              modules: { migrations, register }
                                              EventBus (+outbox, ADR-003)
                                                    │
                                              PostgreSQL (tenant_id + RLS)
```

Production backend moved from Vercel serverless to Render (a persistent
process) in this session — the old "runtime move off serverless" roadmap
item (Level 5/E3 step 6, below) is **done for production**; `develop`/
`staging` tiers still need their own real backend host to match (tracked as
a live gap, not yet actioned).

**Unconfirmed as of 2026-07-23** — see `PIPELINE.md`'s "Re-verification" note. `scripts/deploy.sh`
has no Render deploy path, and none of the backend URLs this repo knows about serve a working
instance of this app. Treat "prod is on Render" as an open claim to confirm, not a settled fact,
until someone with dashboard access verifies the real origin and it gets wired into `deploy.sh`/
`ci.yml`/`uptime.yml`.

## External services & connections (added 2026-07-30 — real services only, verified this pass)

End-to-end flow, as actually built (not aspirational — compare against the contradictions in
`PIPELINE.md`'s Configuration registry and `DEPLOYMENTS.md` for where the "actually" breaks down):

```
Developer
  ↓ (git push)
GitHub (Sricharangellu/Ascend)
  ↓ (on push/PR to develop|staging|master)
GitHub Actions (ci.yml)
  ↓ (deploy step, per tier)
Vercel (frontend, all tiers) ── Render (prod backend, claimed — UNVERIFIED) ── Vercel (backend, CI-driven path, CONFIRMED BROKEN)
  ↓                                    ↓
Express backend (src/app.ts)  ◀────────┘
  ↓
PostgreSQL — Supabase (2 projects: prod ca-central-1, testing/dev us-west-2)
  ↓ (optional)
Redis (ioredis — falls back to in-memory if REDIS_URL unset)
  ↓
Stripe (payments) · SendGrid (email) · Sentry (error tracking)
  ↓
uptime.yml (scheduled probe — CONFIRMED BROKEN, probes a dead pre-migration URL)
```

Per-service detail — for the full secrets/config each depends on, see `PIPELINE.md`'s
Configuration registry rather than duplicating it here:

- **GitHub** — source of truth for code + this documentation. Auth: SSH/HTTPS + PAT for `gh` CLI
  operations. Connected to: GitHub Actions (native), Vercel (frontend deploy trigger, per
  `scripts/deploy.sh`), Render (claimed git-integration, unverified).
- **GitHub Actions** (`ci.yml`, `uptime.yml`, `backup.yml`) — CI/deploy/monitoring runner. Auth:
  repo-scoped `GITHUB_TOKEN` (automatic) + the secrets/variables in `PIPELINE.md`'s registry.
- **Vercel** — frontend hosting (all tiers) via `scripts/deploy.sh`'s manual CLI deploy (see the
  git-connected-vs-manual-CLI contradiction flagged in `PIPELINE.md`). Also the backend's CI-driven
  deploy path, confirmed broken (targets a dead/wrong project). Auth: `VERCEL_TOKEN`/`VERCEL_TOKEN_PROD`.
- **Render** — claimed production backend host (persistent process, no cold starts). **Not verified
  this pass** — no deploy automation in this repo supports the claim, and the claimed URL is
  unreachable from 3 independent networks. Full investigation: `DEPLOYMENTS.md`.
- **Supabase (PostgreSQL)** — 2 projects: one claimed-isolated for production (`ca-central-1`, never
  confirmed to have received a live connection), one shared by testing/dev (`us-west-2`, confirmed in
  active real use — ~172 tables, demo login). Auth: `DATABASE_URL` + `PG_CA_CERT_B64`/`PG_SSL` for
  TLS. Connected to: the Express backend only (never the frontend directly).
- **Redis** — optional. `REDIS_URL` unset falls back to an in-memory implementation — this is a
  documented architectural choice (see this repo's own CTO doctrine: don't add required infra
  without a measured need), not a gap.
- **Stripe** — real payment processing dependency (`stripe` package). Auth: `STRIPE_SECRET_KEY`
  (API calls), `STRIPE_WEBHOOK_SECRET` (inbound webhook verification), `STRIPE_TERMINAL_READER_ID`
  (physical POS card-reader hardware).
- **SendGrid** — email delivery. Auth: `SENDGRID_API_KEY`. Purpose of `EMAIL_FROM`/`EMAIL_WEBHOOK_URL`
  inferred from name, not independently traced to a call site this pass (see `PIPELINE.md`'s registry).
- **Sentry** — error tracking. Auth: `SENTRY_DSN` (low-sensitivity by design — DSNs are meant to be
  client-visible, unlike the other secrets here).
- **OAuth/SSO** — real OIDC support exists (`src/modules/sso`), but **provider credentials
  (client ID/secret, discovery URL) are stored per-tenant in the `settings_kv` table, not as global
  environment variables** — confirmed via code search (only `JWT_SECRET`/`NODE_ENV` are read from
  `process.env` inside the sso module). This is a real, deliberate architectural difference from
  every other integration in this list, worth knowing before assuming "OAuth secret" means "env var."
- **Object/file storage** — no dedicated storage-provider credential (S3, Vercel Blob, etc.) found in
  this codebase. Matches this repo's own architecture doctrine ("object storage, never bytea in
  Postgres — repo already stores URLs") — files are referenced by URL, storage itself is external and
  not directly integrated/credentialed in this repo as of this pass.
- **Replit** — fully separate migrated workspace, not part of this connection chain at all (own
  Postgres, own MSW mocks, own Secrets manager). See `REPLIT.md`.

## Load-bearing invariants

- Money is integer cents everywhere (`src/shared/money.ts`).
- Every table is tenant-scoped; indexes lead with `tenant_id`; RLS backstop.
- Migrations: per-module idempotent SQL, hash-tracked, advisory-locked at boot.
- Events: in-process bus, sequential dispatch; financially-critical types are
  outbox-persisted with idempotent durable redelivery (ADR-003).
- Append-only records: `journal_entries`, `po_approvals`,
  `product_price_history`, audit logs — corrections are new rows, never edits.
- Race-free numbering: `document_counters` (`src/shared/docnumber.ts`).
- Keyset pagination primitive: `src/shared/pagination.ts`.
- Package isolation: vertical modules and wholesale features are gated by
  module/feature flags (`accountMode`); retail UI must never render
  wholesale-only fields (verified — see `GAPS.md`'s note on the retail
  isolation fix landed this session).

## Team → module ownership

Shared entities (Product, Customer, Supplier, Order, Invoice, Payment,
Ledger Entry, Tenant, Location) each have exactly ONE owning module —
creating a duplicate concept is a constitution violation (see
`DESIGN_PRINCIPLES.md`).

| Team | Modules |
|---|---|
| **Commerce** | orders (POS), sales (quotes/SOs), returns, discounts, promotions (in catalog), customers, loyalty, giftcards, quotes, service_orders |
| **Supply Chain** | inventory, purchasing (POs/suppliers/receiving/bills/3-way match; case/box purchasing units via `product_barcodes`, converted to base-unit `stock_qty` at the API edge — ADR-006), product_batches, serial_numbers, store_locations, outlets, fulfillment, shipping, warehouse pages, ai_assistant (explain-only, reads inventory/orders, delegates writes — ADR-005) |
| **Finance** | accounting (COA/ledger/deposits), billing (AP bills/AR invoices), payments, expenses, customer_invoices, tax (settings tax rates) |
| **Platform** | identity (src/identity), gateway (src/gateway), custom_roles, permission_requests, sso, sync, webhooks, sequences (+outbox infra), monitoring, notifications, audit_log, rls, workflows, search, settings |
| **Experience** | web/ (EnterpriseShell, components, pages), reports UI, storefront (/store) |
| **Verticals** (gated) | restaurant, healthcare, automotive, hospitality, manufacturing, rental, entertainment, education, golf pages |

Cross-team seams are event contracts (bus) and documented read-joins
(ADR-002) — never imports of another module's service.

### Domain → owning implementation (added 2026-08-04)

The table above assigns modules to *teams*. This one assigns each business
rule to the *one file that decides it*, which is what a duplicate has to be
migrated toward. Verified against the code, not aspirational — a domain with
no single owner says so rather than being assigned a plausible one.

| Domain | Canonical owner | Notes |
|---|---|---|
| Inventory levels & movements | `src/modules/inventory/service.ts` — `InventoryService` | Movements immutable; `adjustStockTx` is the only writer, `FOR UPDATE` guarded |
| Purchasing (POs, suppliers, bills) | `src/modules/purchasing/service.ts` — `PurchasingService` | |
| Receiving | `src/modules/purchasing/receiving-sessions.ts` — `ReceivingSessionService` | Inside purchasing by design; not a separate module |
| Catalog & price history | `src/modules/catalog/service.ts` — `CatalogService` | Owns `product_price_history` (append-only) |
| Orders / POS | `src/modules/orders/service.ts` — `OrdersService` | |
| Accounting (COA, ledger) | `src/modules/accounting/service.ts` — `AccountingService` | `journal_entries` append-only |
| Identity & authentication | `src/identity/service.ts` — `IdentityService`, with `src/gateway/auth.ts` | |
| Money arithmetic | `src/shared/money.ts` | Integer cents everywhere |
| Document numbering | `src/shared/docnumber.ts` | Race-free `document_counters` |
| Keyset pagination | `src/shared/pagination.ts` | |
| Sales velocity / demand rate | `src/shared/sales-velocity.ts`, `src/shared/demand-rate.ts` | Consolidated 2026-07-28 from 5 divergent call sites — the precedent this table exists to prevent repeating |
| Progress intelligence (hypothesis → evidence → decision) | `src/modules/progress/service.ts` — `ProgressService` | Owns all four `progress_*` tables. `EVIDENCE_FOR_HYPOTHESIS` is the single predicate for "what counts as evidence" — the decision gate and every evidence read share it, so they cannot disagree. Statuses `evidence_attached` / `system_verified` / `validated` / `invalidated` are earned through their own endpoints, never settable via `PATCH /tasks/:id/status`. Frontend display vocabulary: `web/lib/progress.ts` |
| **Tax** | **CONTESTED — no single owner** | See below. |
| **Pricing (price selection)** | **NO OWNER — does not exist** | There is no `src/modules/pricing`. `/api/v1/pricing` is an allowlisted UI-only Preview prefix. Catalog owns price *storage*; nothing owns price *derivation* (rules, tiers, promos). Do not cite a "PricingEngine" — it is not there. |

**Tax has three independent authorities today.** This is a live correctness
defect, not a naming quibble, and it is the worked example of why this table
exists:

1. `src/modules/orders/tax.ts` — declares itself "Tax Engine (orders module
   owns it)"; hard-codes four state rates (CA 8.25 / NY 8.875 / TX 6.25 /
   FL 6.00) per `CONTRACTS.md`. **Imported only within `orders/`.**
2. `src/modules/customer_invoices/service.ts` — computes tax inline from a
   caller-supplied `tax_rate_pct`, which `routes.ts`'s zod schema marks
   `.optional()` and the service defaults to `0`. An invoice POSTed without a
   rate charges **zero tax**, silently, while the same goods through POS are
   taxed at the state rate.
3. `src/modules/settings/service.ts` — a tenant-configurable `tax_rates`
   table (`listTaxRates`), a third source of truth that neither of the other
   two reads.

`reports` only sums stored `tax_cents`, so it is a consumer, not a fourth
authority. Resolution is tracked as **F-11** in `WORK/FORWARD_PLAN.md`
Phase 9 — it is deliberately not a drive-by fix, because picking the winner
changes what customers are charged.

## Platform roadmap (Levels 1–10, real status)

Status is code-verified, not aspirational.

| Level | Platform | Status |
|---|---|---|
| 1 | Foundation: identity, tenant, permissions, audit | ✅ Built (JWT/API keys, roles+custom roles, RLS, audit_log, MFA) |
| 2 | Enterprise data model | ✅ Built; guarded by "one owner per entity" reviews |
| 3 | Workflow engine | 🌱 Seeds (workflows module, PO approvals ✅, SO transitions ✅, requisitions ✅). Generalize (E4) after a second approval domain exists to generalize from. |
| 4 | Rules engine | 🌱 Proto-rules (approval tiers, margin rules, promotions, tax). Extract shared evaluator at the 3rd family. |
| 5 | Event platform: outbox + workers | ✅ Outbox v1–v1.4 shipped (ADR-003, dual dispatch + durable redelivery + stable event identity + staged publish). Job-tick runtime (`/jobs/tick`, ACPA M1.2) replaces the old relay. Long-lived process now true for production (Render); `develop`/`staging` still pending. |
| 6 | Reporting platform: read models | ⬜ Reports still query OLTP (acceptable at current volume; trigger = first slow dashboard). |
| 7 | Search platform | 🔶 pg_trgm indexes shipped; dedicated engine only on measured bottleneck. |
| 8 | Integration platform | 🔶 Webhooks + API keys + scopes exist; connector registry queued (E5). |
| 9 | Extension platform | ⬜ After 8. |
| 10 | AI platform | ⬜ Permissioned action layer; after 3/5. |

### Operational floor (parallel track, not a level)

Verified backups + restore drill · staging environment · CI gate · secrets
manager · runtime move off serverless + pooled connections (✅ prod, ⬜ dev/staging)
· alerting. These outrank feature levels for enterprise trust. See
`GAPS.md`'s "known open criticals" (C-1..C-4) for current status.

## Transformation epics (E1–E6, in order)

1. **E1 Durable events** — M1 ✅ → M1.2 ✅ (tick runtime + relay removal) →
   M1.3 ✅ (stable event identity + all-financial-consumer migration) →
   M1.4 ✅ (staged publish: payments; retention sweep) → M1.5 purchasing.receive
   staging + claim-inside-consumer-tx (true exactly-once) + operational
   stock-flow events — not yet started.
2. **E2 Procurement completion** — requisitions ✅, 3-way match ✅ (both
   shipped this session). GRN/GRNI status needs a specific check (see
   `GAPS.md`).
3. **E3 Scale mechanics** — batch bulk ops, pooling + runtime (✅ prod via
   Render, ⬜ dev/staging), reporting read models.
4. **E4 Workflow/rules generalization** — unify PO+requisition approvals;
   extract rule evaluation. Not started.
5. **E5 Extension platform** — connector registry over webhooks. Not started.
6. **E6 AI foundation** — permissioned action layer over modules; only after
   E1/E4. Not started. A scoped precursor shipped 2026-07-25: `ai_assistant`
   module narrates existing rule-based signals (reorder/low-stock/expiry/
   best-sellers/slow-movers) via Anthropic, gated behind human approval for
   any write — see ADR-005. This is not E6 itself; proactive/broader-domain
   AI still waits on E4.

**Standing rejections (re-affirmed, do not re-litigate):** microservices,
Kafka, K8s, multi-DB, schema-per-domain rename, low-code engine v1.

## Verification harness

`scripts/test.ts` boots embedded Postgres, per-test schemas, `PG_POOL_MAX=1`
(known parallel flakiness — single-file runs are authoritative; confirmed
repeatedly this session via isolated re-runs). `npm run verify` aggregates
all gates.

Structural guards (each a dependency-free `tools/*.mjs`, run in CI's `guard`
job and in `npm run verify`) — every one exists because the failure it catches
already happened at least once here:

| Guard | Catches |
|---|---|
| `hygiene-check.mjs` | Copy-junk, collision backups, merge leftovers, duplicate `AGENTS.md`, **root-manifest hijack** (check 8 — the pnpm/workspace incident, 5 occurrences) |
| `api-gap-scan.mjs` | Frontend calling a route that has no backend (pages shipping on MSW mocks while prod 404s) |
| `table-collision-scan.mjs` | Two modules declaring the same table — silently makes the losing module 100% non-functional (3 real occurrences) |
| `route-guard-scan.mjs` | Mutating routes registered with no authorization middleware. Added 2026-08-06, replacing a CI grep step that could not fail and had never evaluated the codebase (ADR-008) |
| `duplicate-code-scan.mjs` / `dead-code-scan.mjs` | Report-only |

Security scanning lives in `.github/workflows/security.yml` (secret scan —
gating; dependency advisories, licence inventory — report-only; CycloneDX SBOM —
artifact). The gating policy is ADR-008: **a check either fails on a real
violation or is explicitly labelled report-only at the step where it runs.**
There is no third state, and a check that cannot fail is a defect regardless of
what it prints.
