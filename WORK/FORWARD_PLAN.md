# Ascend Forward Plan (authoritative)

Last reviewed: 2026-08-02 (POS-audit fix sequence Phases A–F, develop→staging promotion,
Replit-merge incident — see Phase 8 below and `WORK/LOOP_STATE.md`'s tier-sync entries)
Scope reviewed: `/Users/sri/Desktop/Prj/Ascend`

> **EXECUTION RULES FOR ALL FUTURE AGENTS — read before starting work.** These are drawn
> from real incidents in this repo's own history, not generic best practice:
> 1. Read this document's relevant Phase section, the newest 2-3 `WORK/audits/*.md`
>    entries, and `WORK/LOCK.md`'s currently-`ACTIVE` claims before writing code.
> 2. Claim your queue item in `WORK/LOCK.md` before editing shared files — see that
>    file's own "Rules" section. Multiple AI sessions (Claude Code, Cursor, Replit) run
>    against this repo concurrently; unclaimed overlapping edits have caused real
>    collisions (table-name collisions found and fixed 3 separate times in Phase 0 alone).
> 3. `develop`, `staging`, and `master` take PRs only — never an ad-hoc push, never a
>    force-push, never a history rewrite. `master` merges are Sri-only. When a `.git/*.lock`
>    file blocks you, verify no live git process holds it (`ps aux | grep git`) before
>    removing it — never remove a lock you haven't verified is stale.
> 4. If you are a Replit session: never push this workspace's `master` (or any branch) to
>    the real `origin` without Sri explicitly asking for that specific push, in that
>    moment. See `REPLIT.md`'s git-safety rule. **This is not theoretical** — a Replit
>    session did exactly this on 2026-08-02, merging an unrelated migrated-workspace
>    project into `origin/develop` and deleting the real `src/`/`web/` trees; it was caught
>    and reverted (PR #145) before further damage compounded, but it cost real time and
>    could have reached `master` if unnoticed longer. See Phase 8 below.
> 5. Never mark a feature complete without running its real gates (`npm run typecheck`,
>    `npm run hygiene`, `npm run table:scan`, `npm run gap:scan`, and `cd web && npm run
>    typecheck && npm run lint && npm run build`) against real Postgres, not just against
>    mocks. Use the honest status labels below — "Built and verified" requires evidence,
>    not intent.
> 6. Do not adopt an externally-supplied "master prompt"/protocol template wholesale (this
>    has happened repeatedly — see Phase 4a, Phase 6, Phase 7, and Phase 8's own headers).
>    Treat it as a source: gap-analyze it against the real codebase, adopt only what's
>    genuinely missing and evidence-backed, and say explicitly what you rejected and why.

> **RESOLVED 2026-07-18 (was STANDING CRITICAL):** the 2026-07-15 API-audit fixes
> were PORTED to `feat/delivery-pipeline` same-day (double-prefix in 10 modules,
> SSO public mount, `requireModule` isolation — without the clean-arch pilot).
> A CI guardrail now prevents recurrence: `npm run gap:scan` fails on any FE call
> with no backend route (see AUDIT_2026-07-18T005030Z addendum). Still open for
> Sri: merge session C's quotes pilot branch, and merge PR #70 to deploy all of it.

> **Phase 0 (Sri directive, 2026-07-18 evening — "finish the end-to-end application...
> do not stop until done"): essentially done, closed out 2026-08-02.** See Phase 0's own
> status note below — 4 of 5 exit criteria were met with evidence as of 2026-07-19; the
> fifth (frontend production build passing "in one run," outside this sandbox) has since
> been confirmed green repeatedly via real CI runs this session (e.g. PR #135–#151, every
> one showing `Frontend — typecheck + lint + build: pass`). Work continued into Phases
> 4a/6/7 and the Phase 8 sequence below regardless of Phase 0's "supersedes everything"
> framing — that framing is now historical, not a current constraint. `WORK/LOOP_STATE.md`
> `loop_status` is STOPPED (refreshed 2026-07-30) — no autonomous loop is running;
> coordination happens via GitHub Issues + `WORK/LOCK.md` + PRs instead, see
> `docs/architecture/ORCHESTRATION.md`.

> Sequencing is **phase-based, not time-based**. A phase is complete when its exit
> criteria pass — never by calendar. Point-in-time verification results live in the
> dated `WORK/AUDIT_*.md` files, not in this document.

> **QUEUED MAJOR INITIATIVE — `WORK/FOUNDATION_HARDENING.md`.** A whole-repo cleanup /
> governance-consolidation / end-to-end-wiring pass authored by Sri (2026-07-05). Run it
> as a **single exclusive lock claim when no other session is active** — it touches the
> whole tree and will collide otherwise. See that file for the full spec and how to run.

## Executive summary

Ascend is moving in a reasonable technical direction, but it is not deployment-ready as a serious production SaaS product yet.

The project has a strong amount of work completed: a real TypeScript/Express backend, PostgreSQL schema/migrations, modular business domains, a large Next.js frontend, API contracts, documentation, Docker setup, CI definitions, e2e test files, and many enterprise workflows. This is not an empty prototype.

The brutal truth is that the project currently looks overbuilt on the surface and under-proven in production quality. Many screens and modules exist, but several areas appear to depend on mocks, demo flows, optimistic documentation, or basic implementations. The codebase has breadth before depth. That is risky for POS, inventory, accounting, payments, and compliance software because correctness matters more than having every module name in the sidebar.

The right move is not to keep adding more pages. The right move is to harden the shared operating engine end-to-end: login, tenant setup, catalog, inventory receive, POS/order/invoice sales, payment, order lifecycle, return/refund, reporting, audit log, and deployment operations.

## Product scope correction

Ascend is **not only a retail POS**. Ascend is a modular business operating platform
for product-based businesses. Retail POS is one business pack, not the whole product.

The shared operating model is:

```text
Buy / produce / receive goods
-> manage inventory
-> price products
-> sell through POS, invoice, ecommerce, service order, table ticket, or sales order
-> collect payment
-> fulfill / deliver / close
-> report, audit, and reconcile
```

Supported business types should be treated as **business packs on one platform**, not
separate applications:

- Retail and convenience.
- Wholesale / B2B / distribution.
- Restaurants, cafes, bars, and food service.
- Mobile, electronics, serial/IMEI-heavy stores.
- Grocery, food inventory, batch/lot/expiry businesses.
- Ecommerce and omnichannel sellers.
- Service and repair businesses.
- Hospitality, golf, rental, education, entertainment, healthcare, manufacturing, and enterprise operations.

The non-negotiable product rule:

```text
One backend truth. One shared data model. Many configured business experiences.
```

Do not duplicate product, inventory, order, payment, customer, or reporting systems per
vertical. Business packs may add fields, workflows, constraints, navigation, and UI, but
they must reuse the core entities.

## Business pack architecture

Business type selection should create a tenant configuration. It should not fork the app.

Keep these four concepts separate:

| Layer | Meaning | Example |
|---|---|---|
| Plan | What the tenant pays for | Starter, Growth, Enterprise |
| Business type | The operating model selected during onboarding | retail, wholesale, restaurant, mobile_store |
| Entitlements | Which modules/features the tenant can use | invoices, loyalty, price tiers, kitchen display |
| Permissions | What a specific user can do | create quote, approve credit, edit price list |

The app should check all four layers:

```text
Is this module enabled for the tenant?
Is this feature included in the tenant plan?
Does this business type allow this workflow?
Does this user have permission?
```

Business type selection should install defaults:

- Enabled module bundle.
- Default navigation.
- Required fields.
- Default workflows.
- Default role templates.
- Default permissions.
- Default reports.
- Default product/customer/order form sections.
- Default pricing and tax behavior.

Example:

```json
{
  "businessType": "wholesale",
  "enabledModules": ["catalog", "inventory", "customers", "purchasing", "quotes", "invoicing", "payments"],
  "features": {
    "pos": false,
    "quotes": true,
    "invoices": true,
    "loyalty": false,
    "priceTiers": true,
    "creditTerms": true
  },
  "requiredFields": {
    "account": ["legalName", "billingAddress", "primaryContact"],
    "product": ["sku", "name", "price", "cost"]
  },
  "workflows": ["quote_to_sales_order", "sales_order_to_invoice", "purchase_receive_to_inventory"]
}
```

### Current implementation status

The codebase already has a **Partial** first version:

- `src/shared/moduleRegistry.ts` defines core modules, optional modules, and business bundles.
- `GET/POST /api/v1/settings/business-profile` reads/writes business type and module flags.
- `GET /api/v1/capabilities` and `GET /api/v1/settings/capabilities` now expose the
  read-only tenant/user capabilities contract that setup, settings, shell navigation,
  and demo switchers should consume before claiming a business pack is active.
- `GET /api/v1/capabilities/impact` and `GET /api/v1/settings/capabilities/impact`
  now expose the read-only preview contract for business-type or module changes before
  applying them to tenant settings.
- `GET/PUT /api/v1/settings/feature-flags` stores tenant feature flags.
- `POST /api/v1/settings/edition` supports simple retail/wholesale/enterprise presets.
- `web/app/(protected)/setup/business-profile/page.tsx` lets the tenant choose a business type and module bundle.
- `web/app/(protected)/settings/modes/page.tsx` toggles business modes.
- `web/components/EnterpriseShell.tsx` hides navigation by feature flags.
- `web/app/(protected)/settings/permissions/page.tsx` manages role feature access.

This is not the finished architecture yet. Today it mostly controls and reports module
visibility. It now has backend capability and impact contracts, but it does not fully
enforce required fields, workflow constraints, pricing rules, plan entitlements, or
business-pack permissions.

### Target data model

Add or formalize these backend concepts before serious vertical expansion:

```text
tenant_business_profile
tenant_enabled_modules
tenant_feature_entitlements
tenant_business_settings
tenant_required_fields
tenant_pack_versions
business_pack_registry
business_pack_module_changes
role_templates
tenant_roles
tenant_permissions
workflow_templates
tenant_workflows
```

For customers, move toward an account model:

```text
accounts
contacts
addresses
tax_profiles
price_lists
credit_terms
```

Retail can use a simple person account: name, phone, email. Wholesale can unlock the
full business account: legal name, contacts, licenses, tax profile, multiple addresses,
customer-specific pricing, payment terms, and credit limits.

## How developers and companies should see business-type changes

Developers need a source-of-truth matrix. Companies need an in-app impact view.

### Developer view

Create a generated or maintained matrix from the business-pack registry:

| Business type | Module | Status | Enabled by default | Required fields | Workflows | Permissions | Backend proof | UI proof |
|---|---|---|---|---|---|---|---|---|
| retail | loyalty | Partial | yes | customer phone/email optional | sale -> points | loyalty.manage | test name/link | page route |
| wholesale | price_book | Partial | yes | account + price list | quote -> invoice | price_list.edit | test name/link | page route |
| restaurant | kitchen | UI-only/Partial | yes | menu item/modifier | ticket -> KDS | kitchen.view | missing | page route |

Every module change should answer:

- Which core entity does it extend?
- Which business pack enables it?
- Which plan includes it?
- Which permission controls it?
- Which backend validation enforces it?
- Which UI changes when enabled or disabled?
- Which real-backend test proves it?
- Which migration changed the schema?

### Company/admin view

The app should provide a `Business Profile` or `Plan & Modules` screen that shows:

- Current business type.
- Enabled packs.
- Enabled modules.
- Disabled modules and why: not in plan, not in business type, or manually disabled.
- Required fields added by the selected business type.
- Workflows activated by the selected business type.
- Reports activated by the selected business type.
- Role/permission changes created by the selected business type.
- Last module configuration change: actor, time, before/after.

The company should also be able to preview a switch before applying it:

```text
Switch Retail -> Wholesale
Adds: Quotes, Invoices, Price Lists, Credit Terms, Business Accounts
Removes by default: Loyalty Rewards
Changes customer form: Person -> Account + Contacts + Addresses
Changes sale flow: POS sale remains optional; Invoice flow becomes primary
Requires setup: payment terms, tax profile defaults, price tiers
```

This is now implemented at the backend API level through the capabilities and impact
endpoints. The UI still must consume the same contracts before it claims to support
business-mode switching.

## Retail-first execution rule

The business-pack architecture must be built one complete pack at a time.

Current priority:

```text
1. Finish Retail end-to-end.
2. Build the business-pack/capabilities control plane needed to support switching.
3. Only then deepen Wholesale, Restaurant, Mobile/Electronics, Grocery, Ecommerce, and other packs.
```

Retail is the first complete proof because it exercises the shared engine without the
extra complexity of B2B credit, restaurant table state, serial/IMEI lifecycle, or
lot/expiry traceability.

Retail must include:

- Signup, login, logout, session recovery.
- Setup/onboarding for retail business type.
- Business profile and module settings showing retail as active.
- Demo account support that can preview other business types without calling them done.
- Outlet, register, tax, payment mode, receipt settings.
- Product create/edit/list/detail.
- Inventory receive and adjustment through immutable movements.
- POS checkout with tax, discount, loyalty where enabled, payment, receipt.
- Register close and end-of-day reporting.
- Refund/return.
- Audit log coverage.
- Permission-gated owner/manager/cashier paths.

Non-retail business types can remain in the registry and demo preview, but they are
**Planned** or **Partial** until their own end-to-end gates pass after retail.

## Required setup, auth, settings, and demo UX

The product must teach users that Ascend is one platform with configurable business
packs. This should be visible in the first-run and admin flows.

### Signup and setup

- Signup creates the tenant and owner user.
- Setup asks for business type and starts from a curated pack.
- Retail is the default first completed pack.
- Setup must show required next tasks for retail: outlet, register, tax, payment modes,
  receipt, first product, first receiving.
- Setup must not present every vertical as equally complete.

### Login and session

- Login should load effective tenant/user capabilities after authentication.
- The shell/nav should render from capabilities, not from hardcoded assumptions.
- Demo mode must be explicit and visually distinguishable from production mode.

### Settings

Settings must expose a `Business Profile` / `Plan & Modules` view with:

- current business type
- active pack
- enabled modules
- disabled modules and reason
- role templates and active permissions
- required fields by entity
- active workflows
- last business-type/module changes with actor and timestamp

### Demo account switcher

A demo account may switch between business types to show how UI/UX changes, but the
switcher must be based on the same capabilities/pack registry that production will use.

Required demo switcher behavior:

```text
Retail demo -> shows POS, loyalty, simple customer fields, retail reports
Wholesale demo -> previews accounts, contacts, quotes, invoices, price tiers
Restaurant demo -> previews tables, tickets, kitchen display, menu modifiers
Mobile demo -> previews serial/IMEI, repairs, warranties, trade-ins
Grocery demo -> previews lot/batch/expiry, scale labels, traceability
```

Only retail may be marked **Built and verified** until its real-backend gates pass.
Other demo modes must be labeled **Preview**, **Partial**, or **Mocked** depending on
their actual implementation.

## Current state in plain language

Ascend is a modular business operating platform for product-based businesses. It has:

- A backend API that stores and processes business data.
- A frontend web app for owners, managers, cashiers, and staff.
- A PostgreSQL database model.
- A modular structure for catalog, inventory, orders, payments, customers, purchasing, reports, accounting, shipping, settings, team, webhooks, workflows, and vertical modules.
- A documented enterprise architecture and roadmap.
- Local Docker setup and GitHub Actions CI configuration.
- Playwright e2e tests and frontend mock data.

The application is in an advanced prototype / internal alpha state. It is beyond a toy demo, but below production launch quality.

## What is done so far

### Backend

The backend is implemented as a Node.js, TypeScript, Express modular monolith.

Important completed areas:

- Express app assembly in `src/app.ts`.
- PostgreSQL access layer in `src/shared/db.ts`.
- Gateway middleware for auth, request IDs, rate limiting, metrics, error envelopes, and CORS.
- Identity module with users, JWT auth, refresh-related flows, MFA-related types/routes, and tests.
- Domain modules under `src/modules`.
- Orchestration layer under `src/orchestration` with commands, events, sagas, workflows, locks, compensations, retry state, and jobs.
- Stripe payment integration surface and webhook signature verification.
- Health/readiness endpoints.
- Migration hashing and advisory lock around schema migrations.
- Test files across many modules.

Backend typecheck passed locally with:

```bash
npm run typecheck
```

That is a good sign.

### Frontend

The frontend is a Next.js 14 app under `web/`.

Important completed areas:

- Login/signup flows and protected layouts.
- Large protected app area with many pages.
- POS terminal UI components.
- Catalog/product pages.
- Customer pages.
- Inventory pages.
- Purchasing pages.
- Reporting pages.
- Settings, team, workflow, ecommerce, finance, shipping, vertical module pages, and more.
- Reusable components such as Button, Card, Table, Modal, Toast, Input, Select, KPI cards, shell, notification bell, offline banner, receipt, and charts.
- Frontend API client and generated type structure.
- MSW mock handlers for development/demo mode.
- Playwright e2e specs.

Frontend typecheck passed locally with:

```bash
cd web
npm run typecheck
```

Frontend lint was initially blocked by a corrupted `es-abstract` install in
`web/node_modules`; this was repaired on 2026-07-03 (targeted package reinstall).
Current lint/test/build results are recorded in `WORK/AUDIT_2026-07-03.md`.

### Documentation

The project has substantial documentation:

- `README.md`
- `WORK_STATE.md`
- `docs/ENTERPRISE_ARCHITECTURE.md`
- `docs/ENTERPRISE_PRODUCT_SPEC.md`
- `docs/ENTERPRISE_UX_SPEC.md`
- `docs/ENTERPRISE_INVENTORY_PIPELINE.md`
- `docs/ENTERPRISE_DOMAIN_ROADMAP.md`
- API docs under `docs/api`
- contracts under `contracts`
- orchestration docs and gap analyses under `orchestration`

The documentation is useful, but it is too optimistic in places. Some docs describe the desired product as if it is already production-complete. That makes planning harder because it hides the difference between built, mocked, partially wired, and verified.

## Architecture summary

### Current architecture

Ascend is currently a modular monolith:

- Frontend: Next.js 14, React, TypeScript, Tailwind.
- Backend: Express, TypeScript, PostgreSQL.
- Database: raw SQL migrations and raw SQL query helper.
- Auth: JWT-based auth with role/permission direction.
- Business logic: grouped by domain modules.
- Orchestration: commands, events, workflows, sagas, locks, compensation logic.
- Realtime: SSE and Redis/event bus direction.
- Deployment target: Vercel for frontend/backend plus managed Postgres.

This architecture is acceptable for the current stage. A modular monolith is the correct choice. Do not split this into microservices yet.

### What is good

- The codebase has clear domain boundaries.
- TypeScript is used across backend and frontend.
- The backend has a real database and migrations.
- Money is treated as integer cents in the architecture.
- There is a serious attempt at multi-tenant design.
- There is an orchestration layer for complex business workflows.
- The app has CI and e2e direction.
- The frontend has many operational screens, not just a landing page.

### What is risky

- Too many modules exist before the core path is fully proven.
- Frontend mocks are extensive, which can make screens look complete before backend behavior is truly integrated.
- Documentation overstates completion.
- Production security posture is not fully proven.
- POS/payment/accounting flows require stronger invariants, reconciliation, and audit proof than ordinary CRUD apps.
- Deployment readiness depends on CI, secrets, database migrations, e2e tests, and operational monitoring, not just successful typecheck.
- There are generated/build/dependency artifacts in the repo tree, including `.next`, `dist`, `node_modules`, and multiple duplicate-looking `.git` files. This should be cleaned carefully if those are tracked or polluting the working tree.

## Security review

**Refreshed 2026-08-02 — this section was last substantively true 2026-07-18; Phase
4/4a (2026-07-22) verified significantly more of it than shown below at the time.
Read this version, not an older cached one.**

Good signs, verified with evidence (not just present in code — see Phase 4/4a for
citations):

- Production startup fails if `JWT_SECRET` or `DATABASE_URL` is missing.
- Helmet is enabled; CORS is restricted in production by allowlist.
- Stripe webhook uses raw body + signature verification, fails closed (503) if
  `STRIPE_WEBHOOK_SECRET` is unset — dedicated test coverage (`payments/webhook.test.ts`).
- Redis-backed sliding-window rate limiting (`src/gateway/rateLimit.ts`, SEC-9) — degrades
  to in-process (not off) when `REDIS_URL` is unset.
- Webhook secrets are AES-256-GCM encrypted (`src/modules/webhooks/service.ts`, DB-16) —
  fails closed (503) in production if `WEBHOOK_SECRET_KEY` is unset, does not silently
  store plaintext.
- Metrics endpoint closes with `503 metrics_unconfigured` in production with no
  `METRICS_TOKEN` set — not silently unauthenticated.
- Circuit breaker around all Stripe calls (`src/shared/circuit-breaker.ts`) — fails fast
  (503) after N consecutive gateway failures instead of paying full retry cost.
- **Tenant isolation VERIFIED CLEAN** (Phase 0 iter 9, re-confirmed no regression since):
  every literal `WHERE id=@id` mutation is gated by a prior tenant-scoped verify or
  re-reads a just-created row; dynamic `${where}` builders include `tenant_id`; RLS
  backstop underneath (`db/rls/policies.sql`, applied automatically to every table with a
  `tenant_id` column, registered last in `src/modules/index.ts` specifically so it covers
  every other module's tables including ones added later).
- CI includes checks for unguarded mutation routes and raw SQL interpolation
  (`Production guard — lint anti-patterns`), plus `gap:scan` (FE↔BE contract drift) and
  `table:scan` (cross-module table-name collisions — a bug class that hit this repo 3
  separate times before the check existed).

Concerns, still real:

- Some production security settings are warnings, not hard failures (documented,
  deliberate — see Phase 4's `app.ts` startup-check list). NEEDS-SRI: confirm which
  *warned* (not required) vars are actually set in the live Vercel/Render env — no code
  can see platform secrets from a sandbox.
- MFA/device verification pages and frontend auth refresh-token behavior still contain
  mock/demo flows — not re-verified this pass.
- RLS policy *presence* is proven; production *enforcement* (that RLS is actually
  switched on against the live database, not just defined in a SQL file) still needs a
  direct Sri-side confirmation against whichever database production actually uses — see
  the open production-infrastructure question below.
- Secrets/env rotation checklist: `docs/architecture/PIPELINE.md`'s configuration
  registry now exists (added 2026-07-30) with Purpose/Environment/Used-by/Owner/Rotation/
  Verification columns per secret — the checklist itself is now built; what's still open
  is Sri actually working through it against the real platform dashboards.

Security conclusion: materially stronger than the 2026-07-18 assessment on RBAC/tenant
isolation/secret handling/rate limiting/audit logging (all now verified with tests, not
just present in code) — but still gated on the same handful of Sri-only items every
prior pass has named: confirm production infra + secrets, run one real restore drill.

## Deployment readiness

**Refreshed 2026-08-02.** The code-quality gates that blocked this answer on 2026-07-18
are now closed. The blocker that remains is infrastructure, not code:

- Backend typecheck, backend tests (real Postgres), frontend typecheck, frontend lint,
  frontend build, and Playwright E2E all pass — confirmed repeatedly via real CI this
  session (not local-only claims): every PR in the #135–#151 range shows all four
  required checks green.
- `npm run hygiene` / `table:scan` / `gap:scan` all clean on the current `develop`/
  `staging` tip (1095 files, 161 table names zero collisions, 456/381 API paths 21
  allowlisted).
- `develop` and `staging` are in sync as of PR #147/#151 (2026-08-02) — the promotion
  path itself works end-to-end for code.

**What's actually blocking real production deployment — `docs/architecture/DEPLOYMENTS.md`
(open incident, not resolved as of this writing):**

- Where production actually runs is **unconfirmed**. Docs claim Render; the claimed URL
  (`ascend-prod.onrender.com`) times out completely from three independent networks; zero
  Render deploy logic exists anywhere in this repo's CI/CD (`ci.yml`/`scripts/deploy.sh`
  only ever target Vercel project IDs).
- Confirmed live and reproduced this session: the `deploy-staging` CI job fails with
  `Error: Project not found (VERCEL_PROJECT_ID: prj_TiPX9UYctGKJbQr4Lb1WFwSsKiN1)` — that
  Vercel project is dead. A `master` merge today would very likely hit the identical
  class of failure on `Deploy → Production (Vercel --prod)`, or worse, silently target
  infrastructure nobody has confirmed is real.
- What database production uses is **unconfirmed** — the database actually populated and
  in active use (`us-west-2`, ~172 tables, demo login) is documented as *testing*'s, not
  *production*'s isolated `ca-central-1` project, which has never been confirmed to
  receive a live connection.
- No production backup has ever actually run (`PROD_DATABASE_URL` secret unset) — the
  backup cron's own clean-skip path has been firing since it was set up, per Phase 4a #3.
  Restore-from-backup cannot be tested until this is fixed, and until it's tested, treat
  disaster recovery as unproven regardless of how good the *code* around it is.

None of the above is code-addressable. It's four Sri-only actions, all named in
`DEPLOYMENTS.md`'s P0-P3 plan: (P0) confirm via browser whether the Render URL responds
at all; (P1) get Render-dashboard-confirmed answers on what's actually running there;
(P2) reconcile the contradicting docs once P1 answers exist; (P3) fix the monitoring
probe once the real URL is known. Do not treat a red `deploy-staging`/`deploy-production`
CI job as a code regression until these are resolved — it is very likely infra, not code,
exactly as reproduced this session.

Deployment recommendation (unchanged in spirit from 2026-07-18, updated for what's now
proven vs. still open):

- Demo deployment: acceptable — code gates are clean.
- Internal alpha with fake payments and demo data: acceptable.
- Pilot with one friendly store and limited scope: code is ready; **infra is not** — do
  not attempt this until DEPLOYMENTS.md's P0/P1 are closed.
- General production launch: not ready — blocked on infra confirmation + one real
  restore drill, not on further feature work.

## Is the app going in the right direction?

Yes, directionally, but it needs discipline.

The good direction:

- Modular monolith.
- TypeScript.
- Postgres.
- Domain-driven modules.
- Offline-first thinking.
- Event/workflow architecture.
- Rich operational UI.
- Serious docs and contracts.

The bad direction:

- Too much feature breadth too early.
- Too many pages before end-to-end proof.
- Mock-heavy frontend can create false confidence.
- Documentation sometimes sounds like a sales brochure instead of an engineering status report.
- Enterprise scope is too large for the current maturity level.

The product should narrow temporarily. Build one excellent POS/inventory/accounting spine before expanding vertical modules like healthcare, hospitality, golf, automotive, etc.

## Development areas that need attention

### 1. Core POS flow

Must be proven end-to-end:

1. Login.
2. Open register.
3. Scan/search product.
4. Add to cart.
5. Apply tax and discount.
6. Take payment.
7. Create order.
8. Reduce inventory through immutable movement.
9. Print/email receipt.
10. Close register.
11. Report sales and cash/card totals.
12. Refund or return.
13. Reconcile payment and accounting entries.

This should be the main release gate.

### 2. Inventory correctness

Needed:

- Strict inventory ledger.
- No silent stock updates.
- Oversell prevention.
- Reservations.
- Batch/lot/expiry correctness.
- Receiving flow tied to vendor cost.
- Cycle count adjustments with audit trail.
- Transfer workflow with source/destination movement records.

### 3. Accounting and reporting

Needed:

- Clear chart of accounts behavior.
- Journal entry generation from payments, refunds, deposits, purchase receiving, and adjustments.
- Reconciliation reports.
- End-of-day reports.
- Register close reports.
- AR/AP aging only if the data model is truly wired.

### 4. Frontend integration

**Gap scan done 2026-07-18** (`AUDIT_2026-07-18T005030Z-fe-be-gap-audit.md`), and
two remediation waves shipped same-day (see the audit's addendum): wave 1 —
the double-prefix/SSO/requireModule fixes ported, team time-tracking + customers
search/merge + orders timeline built, storefront auth gated Preview, and
`npm run gap:scan` enforcing parity in CI from here on. Wave 2 — the catalog
product-detail page (17 of 18 mock-only paths: stock/sales/purchases/invoices/
returns/duplicate as real joins, reorder-suggestions/analytics/supplier-price-
comparison as documented-approximation derived metrics, new CRUD for suppliers/
pricing+tiers/expiry/images, and a real audit trail via GET /:id/audit-log —
CatalogService didn't write to audit_log at all before this). In the process,
also fixed a genuine table-name collision from wave 1 (team's time_entries vs
workforce's pre-existing time_entries) and a pre-existing FE/BE field-name bug
in the images tab that the gap-scanner can't catch (contract drift, not a
missing path) — both caught by finally getting `npm test` running in the
Cowork sandbox (see LOOP_STATE's NEEDS-SRI note on the esbuild fix).

**Wave 3 (2026-07-18, 3rd follow-up):** inventory pipeline pending/history/
reorder-alerts built as real joins (purchase_orders/lines/suppliers/products),
reorder-alerts extending the tenant-wide reorder-suggestions signal with
velocity/stockout/cost fields plus a working create-po action. Receiving,
Issues, Errors, and the pipeline Overview funnel reclassified NEEDS-SRI —
each implies an unbuilt subsystem (receiving sessions, an issue/error
detection engine, a stage funnel that doesn't map onto the real POStatus
enum), same call as catalog credits. Also found and fixed three unrelated
live bugs while surveying this surface: (1) inventory's reorder-suggestions
and serial_numbers both queried a nonexistent `catalog_products` table with
nonexistent columns — 500'd on every call against real Postgres despite
being wired to shipped pages; (2) a route-shadowing bug where GET
/:productId (registered early in inventory/routes.ts) silently swallowed
GET /counts, /locations, and /reorder-suggestions registered after it; (3)
the inventory/serials page called the API with no /api/v1 prefix at all,
and serial_numbers' module mount collided with inventory's own catch-all
even after adding a mountPath — fixed by module registration order. The
gap-scanner itself was hardened to catch bug class (3) going forward (it
previously couldn't see a missing-prefix call at all). Full detail in the
audit's addendum #3.

Remaining mock-only surfaces (all allowlisted + tracked): catalog credits (1
path — no backing concept anywhere in the schema, a design decision not
plumbing), inventory pipeline receiving/issues/errors/summary (9 — needs a
design decision, see above), notifications prefs/rules (4), purchasing EDI
(6), workflows approval-chains (3), settings b2b/permissions/custom-roles
(contract decision — NEEDS-SRI), plus the by-design Preview verticals
(golf/pricing/warehouse/documents/promotions).
174 backend paths remain unsurfaced by any page (map for future UI work).

Needed:

- Audit every page and classify it as live, mocked, partial, or static.
- Remove or clearly label demo-only behavior.
- Replace MSW routes with real API calls module-by-module.
- Keep mocks only for local development and tests.
- Add visible error/loading/empty states consistently.

### 5. Security

Needed:

- Permission matrix.
- Endpoint-level RBAC audit.
- Component-level permission gates.
- Tenant isolation tests.
- RLS enforcement.
- Secret encryption.
- Auth/session hardening.
- MFA completion or removal from production UI until complete.
- Rate limiting backed by Redis in production.

### 6. Testing

Needed:

- Backend integration tests for every money/inventory/order mutation.
- Frontend component tests for critical forms and terminal flows.
- Playwright e2e tests for golden paths.
- Security regression tests for tenant isolation and RBAC.
- Migration tests.
- Smoke tests against deployed preview.

### 7. Deployment and operations

Needed:

- Clean CI from fresh install.
- Staging environment with isolated database.
- Production environment checklist.
- Database backup and restore test.
- Migration rollback runbook.
- Observability: logs, metrics, tracing, alerts.
- Error reporting.
- Uptime checks.
- Payment/webhook replay procedure.

## Recommended forward plan

### Phase 0: Finish end-to-end, close the gap to deployment-ready — TOP PRIORITY (Sri directive 2026-07-18)

**This phase supersedes every other initiative in this document until its exit
criteria pass.** `WORK/LOOP_STATE.md` loop_status is ACTIVE against this phase;
`FOUNDATION_HARDENING.md` stays queued/paused (FUNCTIONAL_REBRAND_PLAN executed and removed 2026-07-19)
unless a session explicitly claims them instead.

Direct answer this phase exists to make true: as of 2026-07-18 the app is
**not** working end-to-end for a real customer and is **not** deployment-ready
(see the assessment folded into this section). The retail core (catalog,
inventory, POS checkout, payments, orders, customers) is the most solid part
and has real database-backed logic with test coverage, but three things stand
between here and "customers can actually use this in production":

1. **Remaining mock-only FE↔BE gaps.** Not yet built, tracked in
   `tools/api-gap-allowlist.json`: notifications digest/preferences/rules (4
   paths), purchasing EDI-imports + vendor-history (6 paths), workflows
   approval-chains + run-history (3 paths). Catalog credits, inventory
   pipeline receiving/issues/errors/summary (9 paths), and settings
   custom-roles are correctly deferred to NEEDS-SRI (each needs a product
   decision, not plumbing — do not build these without Sri's call). Ecommerce
   storefront auth is correctly gated Preview until a real backend is built.
2. **Security hardening that's code-addressable from this environment.**
   **CORRECTED 2026-07-19**: the earlier blanket claim "MFA/device
   verification pages are mocked" was overbroad. MFA itself
   (`src/identity/service.ts`) is a real implementation — genuine TOTP via
   `OTPAuth`, a real `user_mfa` table, real backup codes, and the login flow
   genuinely requires the challenge when enabled; not a mock. The actual gap
   is narrower and smaller: `/login/device-verification` and
   `/login/security-alert` are self-documented mocks (their own code
   comments already said so) showing hardcoded fake device data, and neither
   is reachable from the real login flow today (nothing navigates to them) —
   so they weren't silently masquerading as real to any actual user, but
   they had no visible in-UI signal either. Fixed by adding a visible
   "Preview" banner to both, matching the ecommerce-storefront treatment,
   so they can't start masquerading if ever wired in later. Building a real
   new-device-detection/security-event pipeline is a genuine new feature
   (needs decisions on what triggers it, whether it blocks login, and what
   notification/session-revocation behavior it should have) — NEEDS-SRI,
   not built here, same class of decision as catalog's `/credits` gap.
   Frontend auth otherwise has some demo/mock refresh-token
   behavior that needs auditing against the real identity module.
   **RLS SWEEP DONE 2026-07-19**: verified the design is generic and
   self-covering, not something each new module has to wire up — src/
   modules/rls/index.ts's migration dynamically scans
   `information_schema.columns` for ANY table with a `tenant_id` column and
   applies `ENABLE`/`FORCE ROW LEVEL SECURITY` + a tenant_isolation policy to
   it, and that module is registered LAST in src/modules/index.ts
   specifically so it runs after every other module's tables exist. The
   backstop itself (shared/db.ts's `db.query()` auto-wrapping in a
   transaction that sets `app.tenant_id` whenever an AsyncLocalStorage tenant
   context is present, set globally by `tenantResolver` on every `/api/v1`
   request) is also request-scoped, not per-module — no new module has to
   opt in. Confirmed every table added this session (notification_
   preferences/alert_rules/digest_config, edi_imports, approval_chains/
   approval_chain_runs, workflow_run_history, product_suppliers/
   price_tiers, and the rest from the catalog/inventory waves) has a
   tenant_id column, and extended src/gateway/tenant-isolation.test.ts with
   a live leaky-query proof against `notification_alert_rules` (a table that
   didn't exist when that test was first written) — RLS still blocks a
   cross-tenant read with no WHERE tenant_id clause. No fix was needed; this
   confirms the defense-in-depth design holds without per-feature RLS work.
3. **A fresh, honest audit before calling this phase done.** Every module
   gets one of the required status labels (`Built and verified` /
   `Built but not verified` / `UI-only` / `Mocked` / `Partial` / `Planned` /
   `Not production-ready`) — no module may be called "done" without one.

**Explicitly out of scope for this phase** (real infrastructure, not code —
stays on the NEEDS-SRI list in LOOP_STATE.md): Redis provisioning for
shared-instance rate limiting, a real backup/restore drill against production
infra, Vercel environment variable configuration, production DB certificate
chain verification, secret rotation. These require Sri's access to real
infra/accounts and cannot be completed from a sandboxed coding session —
flagging them honestly is the job here, not pretending to close them.

Working method for this phase: one queue item per `WORK/LOCK.md` claim
(never two sessions/agents on overlapping files); independent, non-
overlapping items (e.g. notifications vs. purchasing EDI vs. workflows) may
run as separate worktree-isolated agents in parallel and get merged back
sequentially with full gates (`typecheck`, real-Postgres tests, `gap:scan`)
run after each merge — never merged unverified, never merged concurrently.

Exit criteria for Phase 0:

- Every path in `tools/api-gap-allowlist.json` is either implemented and
  removed from the allowlist, or has an explicit NEEDS-SRI entry in
  `WORK/LOOP_STATE.md` explaining the product decision blocking it.
  **MET** — `gap:scan` is clean (444 backend paths, 373 frontend paths, 21
  allowlisted); every one of those 21 has an explicit NEEDS-SRI entry in
  `WORK/LOOP_STATE.md` (see the current NEEDS-SRI table), not a silent
  allowlist add.
- MFA/device-verification UI either works against a real backend or is
  removed/clearly labeled non-functional — no silent mock masquerading as a
  security control.
  **MET** — MFA (`src/identity/service.ts`) was confirmed a real
  implementation (TOTP, backup codes, enforced in login) this session's
  test run (`identity.test.ts`, 21/21 passing, incl. 3 MFA-specific tests).
  `/login/device-verification` and `/login/security-alert` are labeled
  Preview (fixed 2026-07-19, commit `b859ec6`) and unreachable from the real
  login flow.
- A fresh cross-tenant RLS regression test passes against every module
  registered in `src/modules/index.ts` as of the audit date.
  **MET** — `gateway/tenant-isolation.test.ts` passed (part of a 19/19
  gateway-suite pass this session) and was extended 2026-07-19 (commit
  `5b20519`) with a live leaky-query proof against a table created this
  Phase-0 effort (`notification_alert_rules`); the RLS module's design
  (dynamic `information_schema` scan + registered last in `modules/index.ts`)
  is generic and self-covering, confirmed by inspection, not per-module opt-in.
- `npm run verify` (hygiene + gap:scan + typecheck + test + smoke + frontend
  typecheck/lint/build) passes clean in one run.
  **PARTIALLY MET** — hygiene, gap:scan, backend typecheck, all 601 backend
  tests (78/78 files), the 20-step Postgres smoke test, frontend typecheck,
  and frontend lint all passed clean, run across many batched tool calls (not
  literally one `npm run verify` invocation — this sandbox cannot sustain a
  single call long enough for that). **`cd web && npm run build` could not be
  completed in this sandbox** — a confirmed architectural limit (background
  processes do not persist across tool calls; a plain `sleep` proved this
  independently of the build itself), not a code or config problem. See
  `AUDIT_2026-07-19T062148Z-phase0-verification.md` §2a for the full
  investigation. This one item needs to be run once in CI or on a real
  machine to close out fully.
- A new dated audit in `WORK/audits/` states, module by module, which of the
  seven honest status labels applies — replacing optimism with evidence.
  **MET** — `WORK/audits/AUDIT_2026-07-19T062148Z-phase0-verification.md`,
  covering all 51 modules registered in `src/modules/index.ts`.

**Overall Phase 0 status: essentially done, one item open.** Four of five
exit criteria are fully met with evidence above. The fifth (`npm run verify`
passing "in one run") is met in substance — every stage that can run in this
sandbox passed clean — except the frontend production build, which needs a
CI or real-machine run to get the final confirmation; nothing found this
session gives reason to expect it would fail there (typecheck and lint, the
two parts of that pipeline that don't need one long-lived process, both
passed clean). The retail core is real, tested, and proven end-to-end by the
smoke test against real Postgres — this is not a demo. What remains before
calling the whole platform (not just Phase 0) deployment-ready is the
NEEDS-SRI list in the new audit's §5: a handful of product decisions (catalog
credits, inventory pipeline receiving/issues/errors, custom-roles contract,
real EDI parsing, approval-chain triggering) and a handful of real-infra
items (Redis, backup drill, Vercel env, cert chain, PR merges) that no
sandboxed session can close.

#### Phase 0 continuation (2026-07-19, Sri: "continue on the phase0-verification audit")

The verification audit's §3/§4 named seven real, mounted, gap-scan-clean
modules as "Built but not verified" — thin-to-zero dedicated test coverage
(quotes, loyalty, store_locations, product_batches, service_orders,
customer_invoices, workforce). All seven now have real integration test
coverage against embedded Postgres, each written by a dispatched subagent and
independently re-verified by the coordinator (re-ran typecheck, gap:scan, and
the actual test files myself — not just trusting agent self-reports).

**This wave surfaced 4 more real production bugs**, all found purely by
writing tests for code that had none — bringing the total for the whole
Phase 0 effort to 8:

- `quotes`' `quotations` table collided with `sales`' pre-existing,
  incompatible `quotations` table (sales registers first in
  `modules/index.ts`, so its schema always won) — **the quotes module was
  100% non-functional**, every insert 500'd. Renamed to
  `customer_quotations`/`customer_quotation_lines`. Also fixed a dead
  `already_converted` guard reading a column nothing populates.
- `store_locations`' `product_locations` table collided with `fulfillment`'s
  pre-existing, incompatible table of the same name — same bug class, 3rd
  occurrence this effort (1st: `team`/`workforce` on `time_entries`, fixed
  2026-07-18). Renamed to `store_location_products`.
- `customer_invoices`' `create()` used SQL placeholders that didn't match its
  own params object's actual keys — `shared/db.ts` silently binds NULL for an
  unmatched `@name` placeholder, so **every invoice creation with any lines
  500'd** on a NOT NULL violation. Also fixed a status-update route bypassing
  `parseBody()` and leaking raw 500s instead of 400s.
- `workforce`'s `clockIn()` never validated `employeeId` against the
  employees table (its sibling creators do) — a bogus id returned 201 and
  created a permanently-invisible orphaned `time_entries` row while
  permanently occupying that id's "already clocked in" slot, an unrecoverable
  stuck state.

`product_batches` and `service_orders` had no bugs — genuinely working as
built, confirmed by 11 and 12 new tests respectively.

Net: 113 new tests written across the 7 modules (26 + 61 + 27, per the
iteration log in `WORK/LOOP_STATE.md` iterations 18-20), typecheck and
gap:scan clean throughout, no regressions in any sibling module touched by
the table renames. The recurring table-collision bug class (now found 3
times) confirms module registration order in `src/modules/index.ts` remains
a live footgun for any *new* module — worth a lint/CI check (grep every
module's `CREATE TABLE IF NOT EXISTS` name for uniqueness across the whole
`src/modules/` tree) rather than relying on manual test-writing to keep
catching it after the fact. Not built this wave (would need its own
scoping); flagged here as a candidate for the backlog.

### Phase 1: Truth and cleanup

Goal: know exactly what is live, mocked, partial, and broken.

Tasks:

- Create a page/module status matrix.
- Mark each backend endpoint as tested or untested.
- Mark each frontend page as live API, mock, static, or partial.
- Refresh frontend dependencies and make lint pass from a clean install.
- Run backend tests, frontend build, and Playwright e2e.
- Remove misleading deployment-ready language from docs.

Exit criteria:

- `npm run typecheck` passes.
- `npm test` passes.
- `cd web && npm run typecheck && npm run lint && npm run build` passes.
- E2E golden path passes locally or in CI.
- Status docs use honest labels.

### Phase 2: Retail release pack

Goal: make one complete business type reliable end-to-end. The first complete business
type is retail.

Build and verify:

- Signup, login, logout, and session recovery.
- Retail tenant setup/onboarding.
- Business profile and module settings showing retail as active.
- Role/permission basics.
- Catalog products.
- Inventory receive.
- Register open/close.
- POS checkout.
- Payment capture or simulated payment in non-production.
- Order creation.
- Inventory decrement.
- Receipt.
- Return/refund.
- End-of-day report.
- Audit log.
- Retail demo account path.

Exit criteria:

- One complete retail POS workflow works without mocks.
- Retail setup/settings/auth flows work against the real backend.
- Retail owner/manager/cashier permission paths are proven.
- Retail demo mode is clearly separated from production mode.
- Every mutation has a test.
- Every mutation is tenant-scoped and permission-checked.

### Phase 3: Business-pack control plane

Goal: turn current module flags into a reliable capabilities and business-mode system
without deepening other verticals yet.

**Status update 2026-07-22**: three of the five tasks below were already built
(just not reflected here — real gap in documentation honesty, not in code).
One real gap remains open. See detail per task.

Tasks:

- DONE: Build `GET /api/v1/capabilities` for the current tenant/user.
- DONE: Build a read-only business-type/module impact preview endpoint.
- DONE, VERIFIED 2026-07-22 (already built, previously undocumented): **Record
  business-type/module changes with audit history.**
  `SettingsService.auditBusinessProfileChange` (`src/modules/settings/service.ts`)
  writes `business_profile.type_changed` / `business_profile.modules_changed`
  entries (actor, before/after, timestamp) via the shared `writeAudit` helper,
  called from `POST /settings/business-profile`
  (`src/modules/settings/routes.ts`). Covered by a real test:
  `settings.test.ts` — "business-profile changes are audit-logged with actor
  and timestamp" — asserts both action types appear in
  `GET /audit-log?resource_type=business_profile`. Nothing to build here.
- DONE, VERIFIED 2026-07-22 (already built, previously undocumented): **Make
  setup, settings, shell navigation, and demo mode read from capabilities.**
  `web/contexts/CapabilitiesContext.tsx` is consumed by
  `web/components/EnterpriseShell.tsx` (nav gating),
  `web/app/(protected)/setup/business-profile/page.tsx`,
  `web/app/(protected)/setup/modules/page.tsx`, and
  `web/components/setup/RetailSetupChecklist.tsx` — confirmed by direct
  inspection, not assumption. `useAccountMode` (session E, 2026-07-06) already
  derives from `useCapabilities()` rather than a separate fetch. Not
  re-verifying every page exhaustively in this pass; flagging as a candidate
  for a dedicated audit if Sri wants full page-by-page proof.
- OPEN, real gap: **formalize plan → entitlements → module enforcement.**
  `buildCapabilitiesResponse` (`src/modules/settings/service.ts`) computes
  `entitlements: { source: "placeholder", enforced: false, ... }` verbatim —
  the code itself says plan-to-module enforcement doesn't exist yet. Today
  `modules[].enabled` comes only from business-pack defaults + manual feature
  flags; a tenant on a "starter" plan and a tenant on "enterprise" see
  identically enforceable module access. **NEEDS-SRI before building**: which
  modules/features actually gate on which plan tier is a product/pricing
  decision, not a plumbing gap — same class of decision as catalog credits
  (Phase 0's precedent for not guessing at NEEDS-SRI items).
- DONE 2026-07-22: **Developer-facing business-pack matrix.** Built
  `scripts/generate-business-pack-matrix.ts` (`npm run business:matrix`),
  reading the same registry objects the backend serves at runtime
  (`MODULE_REGISTRY`/`BUSINESS_BUNDLES`/`GROUP_LABELS`/`CORE_MODULES` from
  `src/shared/moduleRegistry.ts`, plus `BUSINESS_CAPABILITY_PROFILES`/
  `BUSINESS_SETUP_TASKS`/`MODULE_PERMISSIONS`/`MODULE_REPORTS` — now exported
  from `src/modules/settings/service.ts` for this purpose) — no hand-maintained
  data. Generates `docs/architecture/BUSINESS_PACK_MATRIX.md`: one section per
  business type, listing every module with group/status/default-enabled/route/
  permissions/reports, plus required fields, workflows, and setup tasks. The
  "status" column is intentionally conservative (only core modules are marked
  "Built and verified"; everything else is "Built but not verified" or
  "Partial" — the script cannot see real test coverage, only route existence).
  Not wired into CI to auto-detect staleness yet — a natural follow-up if this
  drifts from the registry (same idea as `gap:scan`'s FE/BE enforcement).

Exit criteria:

- A developer can see what each business type changes by reading one matrix/source of truth.
  **MET** — `docs/architecture/BUSINESS_PACK_MATRIX.md`, regenerable via `npm run business:matrix`.
- A company admin can preview what will change before switching business type.
  **MET** — `GET /api/v1/settings/capabilities/impact` (pre-existing).
- The backend enforces disabled modules/features; frontend hiding is not the only guard.
  **PARTIAL** — disabled modules are enforced (feature flags gate backend behavior
  where checked), but plan-tier entitlement enforcement is the open NEEDS-SRI
  item above; frontend hiding is not the *only* guard for module visibility, but
  plan enforcement specifically has no guard yet.
- Demo account switching uses the same registry/capabilities model as production.
  **MET** — confirmed by inspection (no separate demo-only registry found).

### Phase 4: Production hardening

Goal: make deployment safe.

Tasks:

- DONE, VERIFIED 2026-07-22: **Configure production env vars.** `src/app.ts`
  fails fast in production if `JWT_SECRET`/`DATABASE_URL` are missing, and
  logs an explicit warning (with the concrete consequence) for every other
  important-but-optional var: `APP_URL`, `SENDGRID_API_KEY`,
  `STRIPE_SECRET_KEY`, `REDIS_URL`, `METRICS_TOKEN`, `CRON_SECRET`,
  `WEBHOOK_SECRET_KEY`. This is a mature, honest pattern already — nothing
  to build. NEEDS-SRI: confirm which of the *warned* (not required) vars are
  actually set in the live Vercel env — code can't see repo/platform secrets
  from here (same class of blind spot as the backup-cron finding below).
- DONE, VERIFIED 2026-07-22: **Redis for rate limiting/event propagation.**
  `src/gateway/rateLimit.ts` (Redis-backed sliding-window, SEC-9) and
  `EventBus.useRedis()` (`src/shared/events.ts`, Pub/Sub fan-out across
  instances) are both implemented and wired in `app.ts`. Deliberately
  degrades to in-process/in-memory when `REDIS_URL` is unset rather than
  refusing to boot — reasonable for a single-instance deploy, but on
  Vercel's multi-invocation model this means unset `REDIS_URL` silently
  gives every invocation its own rate-limit counters and event bus (no
  crash, just quietly wrong at scale). NEEDS-SRI: confirm `REDIS_URL` is
  actually set in production.
- PARTIAL (unchanged): enable secure metrics token. Production no-token `/metrics` now closes with
  `503 metrics_unconfigured`; set `METRICS_TOKEN` to allow authorized scraping.
- DONE, VERIFIED 2026-07-22: **Encrypt webhook secrets.** DB-16 —
  AES-256-GCM in `src/modules/webhooks/service.ts`, fails closed (503) in
  production if `WEBHOOK_SECRET_KEY` is unset rather than silently storing
  plaintext.
- DONE, VERIFIED 2026-07-22: **Stripe webhook and payment flows.** The
  inbound webhook route (`src/app.ts`, `POST /api/stripe/webhook`) is
  textbook-correct: raw-body parser mounted before `express.json()` (required
  for signature verification), real `stripe.webhooks.constructEvent`
  signature check, 503 if `STRIPE_WEBHOOK_SECRET` unset, 400 on bad
  signature, fast 200 + fire-and-forget internal event dispatch. Dedicated
  `src/modules/payments/webhook.test.ts` covers the fail-closed path. Outbound
  side (checkout charges) now also has the Phase 4a circuit breaker +
  gateway seam (see above).
- DONE, VERIFIED 2026-07-22 (real gap found — see Phase 4a #3 above): backup
  cron exists and is scheduled but has never actually run against
  production (`PROD_DATABASE_URL` secret unset). NEEDS-SRI.
- DONE, VERIFIED 2026-07-22: **Migration lock and rollback plan.**
  `pg_advisory_xact_lock(7381920)` in `app.ts` — this is the "migration lock
  acquired" line visible in every single test run in this repo, i.e. it's
  not just present in code, it demonstrably fires on every app boot.
  Rollback: Vercel-dashboard instant rollback, documented in
  `docs/architecture/PIPELINE.md`.
- DONE: add backend operational readiness checks to deployment via `npm run ops:check`.
- DONE: add `PG_SSL` override so production-mode checks can run against local/CI
  Postgres while production still defaults to SSL.
- PARTIAL, VERIFIED 2026-07-22: **Monitoring and alerting.** Real, working
  parts: structured JSON logging (`shared/monitoring.ts`, aggregator-ready +
  optional Sentry envelope), `gateway/metrics.ts` (token-gated Prometheus
  endpoint), and `.github/workflows/uptime.yml` — a 15-minute production
  heartbeat hitting `/healthz`, `/readyz`, the auth boundary, and the
  frontend, confirmed via GitHub's public Actions page to have **85
  consecutive scheduled runs**, all completing in 5-12s (i.e. this is a real,
  live signal, not dead CI config). The gap: alerting on heartbeat failure is
  GitHub's default "notify repo watchers on red run" only — the workflow's
  own header already admits this is "the floor, not the ceiling" and names
  the follow-up (Slack webhook / PagerDuty / Sentry cron monitor) as a
  deliberate deferral, not an oversight. Not building one of those
  speculatively without Sri picking a channel.

Exit criteria (checked 2026-07-22 against GitHub's public Actions/PR pages —
no auth needed, no assumptions):

- DONE, VERIFIED: **Fresh CI passes.** Latest run (#508, `develop`, merge of
  PR #110, 2026-07-22) is green end to end: backend typecheck+test (13m29s),
  frontend typecheck+lint+build, production-guard lint-anti-patterns, Docker
  build sanity check, and E2E Playwright (27 passed, 1 skipped) all passed;
  post-run deploy steps to Production/Dev/Testing environments and a
  post-deploy production smoke test also ran clean.
- PARTIAL/UNCLEAR: **Staging deploy passes smoke/e2e.** The same CI run
  deploys to environments labeled Production/Dev/Testing, not one explicitly
  labeled "Staging" — worth Sri confirming that mapping matches the
  `feature → develop → staging → master` branch flow this repo otherwise
  documents (i.e. that a real staging deploy+smoke gate exists distinct from
  these, not just assuming the label overlap is fine).
- CONTEXT, NOT A GATE: **Security checklist passes.** No single active
  "security checklist" file exists to run against — the closest artifact is
  `orchestration/_archive/SECURITY_AUDIT.md` (2026-06-13, archived, i.e.
  superseded), which found 3 issues and fixed them, reviewed auth/tenant-
  isolation/validation/SQL-injection/secrets as passing. Real security work
  has continued well past that date (RLS backstop, SEC-7 cookie hardening,
  SEC-9 Redis rate limiting, webhook secret encryption — see Phase 4 items
  above), just not against one static checklist doc. Not treating "no
  checklist file" as a red flag on its own — the ad hoc `security-checker`/
  `security-review` skills exist for point-in-time review instead.
- BLOCKED (known, see Phase 4a #3 above): **Restore from backup is tested.**
  Can't be tested — no production backup has actually run yet
  (`PROD_DATABASE_URL` unset). This is the same NEEDS-SRI item, not new work.

### Phase 4a: Reliability / failure-resilience hardening (added 2026-07-22)

Source: Sri supplied a general enterprise failure-architecture checklist
(infra outage, network/API failure, DB/data corruption, integration failure,
hardware failure, backup/DR, monitoring, offline-first) and asked for it to
become part of the plan. Full gap scan against the actual codebase:
`WORK/audits/AUDIT_2026-07-22T013025Z-reliability-gap-scan.md`.

Ascend already covers a meaningful share of this checklist in code, not just
docs — see that audit's §0 for what's verified built (offline-first
transactional outbox, immutable inventory ledger, retry-with-backoff +
idempotency, saga/compensation workflow runner, immutable audit log,
Redis rolling-window rate limiting, verified tenant isolation, RPO/RTO-targeted
backups with a documented DR drill, structured monitoring, rollback-on-deploy).
Do not re-build any of that.

Real, code-addressable gaps found, in priority order:

1. DONE, committed `4e68d95`: **Circuit breaker
   around external calls** — retry-with-backoff exists
   (`src/orchestration/policies/retry.policy.ts`) but nothing trips open after
   N consecutive failures to fail fast instead of paying full retry/timeout
   cost on every request during a sustained outage. Built `src/shared/circuit-breaker.ts`
   (closed/open/half-open, named registry) and wired it around every Stripe
   call site in `src/modules/payments/service.ts` / `stripe.ts`. Only
   StripeAPIError/StripeConnectionError/StripeRateLimitError count as breaker
   failures — declines/bad requests don't trip it. Open circuit surfaces as a
   clean 503 `payment_gateway_unavailable`. The second-gateway seam (item 4
   below) is still open — this only covers Stripe.
2. DONE, committed `2b2a5be`: **Inventory
   reconciliation detector** — `inventory.stock_qty` is a maintained cache
   next to the immutable `inventory_movements` ledger, not purely derived.
   Prior real bugs in this exact area
   (`AUDIT_2026-07-16T063000Z-inventory-oversell-race.md`,
   `..._134500Z-transfer-number-race.md`) argued for a scheduled job that
   diffs `stock_qty` against `SUM(inventory_movements.delta)` per
   tenant/product and alerts on mismatch. Built as
   `src/orchestration/jobs/inventory-reconciliation.job.ts` — daily,
   self-re-enqueuing (same pattern as `outbox-retention`/`idempotency-expiry`),
   read-only (reports drift via structured logs, does not auto-correct — see
   the file's header comment for why auto-correcting would be the wrong
   move). Known false-positive case documented in the same comment
   (products that had movement history while untracked, before their
   `inventory` row existed).
3. VERIFIED 2026-07-22 (NEEDS-SRI — real gap found): **backup cron is
   scheduled but not actually backing up prod.** `.github/workflows/backup.yml`
   exists, is scheduled (daily 09:00 UTC), and both its runs so far succeeded
   — but each took only 4-8s and produced zero artifacts
   (https://github.com/Sricharangellu/Ascend/actions/workflows/backup.yml,
   run #1 and #2). That's the workflow's own documented clean-skip path when
   the `PROD_DATABASE_URL` repo secret isn't set (see the workflow's header
   comment) — meaning **no production backup has actually run since this was
   set up.** Also worth knowing: the workflow's own header is honest that
   even once configured, this delivers RPO ≤24h via daily `pg_dump`, not the
   ≤5min in `backup.sh`'s docstring (that number assumes WAL archiving, which
   is a stub — `run_wal_archive` isn't wired to WAL-G/pgBackRest yet). Not
   code-addressable — needs Sri to set the `PROD_DATABASE_URL` (and
   optionally `BACKUP_S3_BUCKET` / AWS creds) repo secrets, then re-check the
   next scheduled run actually uploads a `.pgdump` artifact.
4. DONE, committed `73f9530`: **Document the
   second-payment-gateway seam** — no second live gateway (not recommending
   building one speculatively), but the Stripe adapter boundary needed to be
   explicit so adding Adyen/Authorize.net later is contained, not a rewrite.
   Added `src/modules/payments/gateway.ts` (`PaymentGatewayAdapter` interface:
   `isConfigured`/`createTerminalIntent`/`retrieveIntent`/`cancelIntent`) and
   `stripeGatewayAdapter` in `stripe.ts` implementing it; `service.ts` now
   calls through a single `gateway` binding instead of the Stripe SDK
   directly, so a second gateway is one new file + one line changed, not a
   rewrite of checkout logic. All 17 `payments.test.ts` tests still pass
   (verified against real Postgres) — this was a pure seam extraction, no
   behavior change.

Named for completeness but not queued (see audit for reasoning): tax-rate
caching (no dedicated tax module found — may be a non-issue), object storage
for receipts/images (no evidence anything is blocked on it),
printer/scanner/cash-drawer hardware retry queues (Ascend's terminal is
browser `window.print()`, not real thermal-printer hardware, today), DB
read-replica failover (likely covered at the managed-Postgres-provider level
already), staged/canary deploys beyond rollback (feature flags already give
staged *feature* rollout even without staged *deployment* rollout).

Infra sections of the source checklist that assume self-managed
infrastructure Ascend doesn't run (multi-region active-active, Kubernetes,
dedicated DNS/CDN failover, PagerDuty) are kept as DR notes in the audit
appendix only — not backlog items — since Vercel + managed Postgres already
provides the platform-level equivalent for the current deployment model.

### Phase 5: Business expansion

Goal: expand business packs without duplicating the core.

Priority order:

1. Wholesale pack: accounts, price tiers, quotes, invoices, terms, credit limits.
2. Ecommerce pack: online catalog, order sync, fulfillment, customer portal.
3. Restaurant/food pack: tables, kitchen display, modifiers, tips, split checks.
4. Mobile/electronics pack: serial/IMEI, trade-ins, warranties, repairs.
5. Grocery/food inventory pack: lot/batch/expiry, scale labels, traceability.
6. Enterprise pack: approvals, SSO, audit depth, workflow automation, advanced analytics.

### Phase 6: Procurement intelligence (approved scope, 2026-07-28)

Source: Sri supplied a generic "ASSCEND Enterprise Demand Planning &
Procurement Engine" master prompt (SAP/Oracle/Dynamics/NetSuite-scale spec).
Full gap analysis against the actual codebase:
`WORK/audits/AUDIT_2026-07-28T184729Z-erp-procurement-demand-planning-gap.md`.
Verdict, confirmed by Sri: **treat the master prompt as target architecture,
not this iteration's scope.** The repo's phased, verification-first discipline
takes precedence over the prompt's "don't simplify, build the whole thing"
framing. This phase is intentionally narrow.

**Explicitly out of scope for this phase** (do not build without a separate,
explicit Sri decision — these are standing NEEDS-SRI items in
`WORK/LOOP_STATE.md`, not newly discovered here): real EDI parsing, a
stateful receiving session, approval-chain triggering, any redesign of the
existing purchasing/receiving/approval/accounting/inventory-ledger
functionality. This phase only adds to what exists.

Approved items, in strict order — each complete, tested, and regression-clean
before the next starts:

1. **Supplier MOQ and pack-size aware reorder calculations.** Round
   `suggested_qty` in the existing reorder-suggestion surfaces up to the
   supplier's MOQ and the product's pack size, using data that already exists
   (`product_suppliers.moq`, `product_barcodes.pack_size`) but is currently
   unread by that logic. No new tables. Preserves existing purchasing APIs.
2. **Explicit safety stock.** A dedicated safety-stock concept, separate
   from `reorder_point` (today `reorderAlerts()` literally sets
   `safety_stock = reorder_pt` — not a real distinct value anywhere).
   Migration + validation + regression coverage; reorder-quantity formula
   updated without changing existing response shapes for callers that don't
   opt in.
3. **Promised delivery date.** Compute an expected arrival date from
   supplier `lead_time_days` and surface it on purchase recommendations/
   planning views. No PO workflow/state-machine changes.

Deferred to future phases, in order, only after all three items above are
complete and merged: projected inventory by date; demand coverage / days of
supply; a real demand-forecasting engine (replacing the trailing-30-day
velocity proxy used in `catalog/detail-views.ts`, `inventory/pipeline-
views.ts`, and `ai_assistant`); buyer workspace; forecast analytics/reports.

Exit criteria for Phase 6 (this slice):

- Items 1–3 shipped as separate, independently gated changes (typecheck,
  `gap:scan`, `table:scan`, real-Postgres tests) — no big-bang commit.
- No regression in `purchasing`, `inventory`, `catalog`, `accounting` test
  suites.
- No change to existing API response shapes beyond additive fields.
- A dated completion audit in `WORK/audits/` records what shipped, matching
  this repo's evidence-over-optimism convention.

### Phase 7: Demand planning foundation (approved scope, 2026-07-28)

Source: after Phase 6 shipped, Sri asked for a Phase 7 gap analysis mirroring
how Phase 6 started. Full gap analysis:
`WORK/audits/AUDIT_2026-07-28T203748Z-phase7-demand-planning-foundation-gap.md`.
That audit found the same "reorder suggestion" signal computed independently
in five places (three unified by Phase 6, two not:
`insights/service.ts`'s `reorderRecommendations()` and `purchasing/
service.ts`'s `priceHistory()` suggested-qty calc — both on a 90-day window
vs. the other three's 30-day), and, separately, a live bug: the Insights →
Forecasting tab's "Create Draft POs" button calls `insights.
createReorderPOs()`, which inserts into a table that does not exist
(`po_lines` — the real table is `purchase_order_lines`) and bypasses
`purchasing.createOrder()` entirely (own PO numbering, hardcoded
`unit_cost_cents = 0`, no approval gating). Sri's explicit framing: **do not
start Phase 7 by adding forecasting — first remove the duplicated demand
logic and build a trustworthy foundation.** No ML, no forecasting models in
this phase.

**The `insights.createReorderPOs()` bug fix is a separate, standalone task —
explicitly NOT part of Phase 7.** It is a production-correctness fix (route
through `purchasing.createOrder()`, reuse the existing PO-numbering
primitive/approval workflow/audit trail, remove the hardcoded
`unit_cost_cents = 0`), tracked and gated on its own, not bundled with any
Phase 7 item below.

Approved items, in strict order — each complete, tested, and regression-clean
before the next starts:

1. **Consolidate sales-velocity logic into one shared service.** Single
   source of truth for reorder suggestions, purchasing recommendations,
   inventory insights, and future forecasting inputs. Supports daily/weekly/
   monthly buckets, configurable lookback windows, location-level filtering,
   product-level filtering, and category-level aggregation where the schema
   supports it. Migrate every existing consumer onto it — the three surfaces
   Phase 6 already touched (`catalog/detail-views.ts`'s
   `reorderSuggestions()`, `inventory/pipeline-views.ts`'s
   `reorderAlerts()`, `inventory/service.ts`'s `getReorderSuggestions()`)
   plus the two Phase 6 left alone (`insights/service.ts`'s
   `reorderRecommendations()`, `purchasing/service.ts`'s `priceHistory()`
   suggested-qty calc). No formula is left running in parallel once this
   item is done.
2. **Demand snapshot foundation.** Minimum schema for historical demand
   snapshots, forecast periods, actual-sales comparison, and location/
   product demand history — built to support future moving-average/
   weighted-average/seasonal/AI models, but no model is built in this item.
3. **Forecast accuracy framework.** The measurement layer, built before any
   prediction logic: forecast quantity, actual quantity sold, variance,
   accuracy %, forecast period, product, location. The system must be able
   to answer "was our forecast correct" before it can answer "what should we
   forecast."
4. **Replace the reorder placeholder** (deferred until 1–3 are complete).
   Only after velocity consolidation, snapshots, and the accuracy framework
   all exist does replacing the trailing-window velocity proxy with a real
   forecast engine get evaluated.
   **2026-08-03 — evaluated + first surface cutover:** no new forecast *model*
   (ML/seasonal/weighted still out of scope). Shared `resolveDemandRates()`
   (`src/shared/demand-rate.ts`) prefers a covering `demand_forecasts` row,
   else Phase 7 item 1 velocity. First migrated surface: inventory pipeline
   `reorderAlerts()`. Remaining reorder/insights/purchasing surfaces still on
   velocity until migrated the same way. Audit:
   `WORK/audits/AUDIT_2026-08-03T042109Z-phase7-item4-reorder-forecast-demand.md`.

Explicitly out of scope for this phase: AI/ML forecasting models, EDI, new
receiving workflows, buyer workspace, supplier-scoring redesign, procurement
optimization algorithms. Those remain future phases, same as Phase 6's
NEEDS-SRI exclusions.

Exit criteria for Phase 7 (this slice):

- One sales-velocity implementation exists; every reorder/purchasing/
  insights calculation uses it (no parallel formulas).
- Demand snapshots exist; forecast accuracy can be measured.
- Existing purchasing flows remain unchanged (no regression in
  `purchasing`, `inventory`, `catalog`, `insights` test suites).
- The broken draft-PO-creation bug is fixed separately (own commit/claim) or
  explicitly still tracked if not yet done.
- A dated completion audit in `WORK/audits/` records what shipped.

### Phase 8: Execution-grade guardrails, failure prevention, multi-agent safety (approved scope, 2026-08-02)

Source: Sri supplied a generic "MASTER PROMPT — update the forward plan into an
execution-ready roadmap" template (audit-first, per-phase Business Objective/Failure
Scenarios/Guardrails/Security/Deployment Checklist sections, enterprise-scale
considerations, a 10-point future-agent rulebook). Same verdict as Phase 4a/6/7's own
handling of similar templates: **treat it as a source, not a literal spec.** Rewriting
this whole 1400-line document into that generic structure would delete a large amount of
specific, evidence-cited content (Phase 0's 8 real bugs found by writing tests, the
table-collision bug class found 3 times, DEPLOYMENTS.md's P0-P3 plan, today's Replit
incident) in favor of generic boilerplate this document's own "Avoid" list already warns
against ("treating docs as proof of implementation"). What follows is what's genuinely
missing, grounded in this session's real findings — not a restructure.

**What already exists and should not be re-built** (the master prompt's own request to
audit before writing applies to itself first):

- Failure-scenario thinking: Phase 4a's reliability audit already covers retry/backoff
  (`src/orchestration/policies/retry.policy.ts`), circuit breaking
  (`src/shared/circuit-breaker.ts`), transactional outbox, saga/compensation workflows,
  and inventory reconciliation — see that Phase for the full "what's verified built" list.
- Data-integrity guardrails: negative-inventory prevention, atomic transfer legs,
  cycle-count double-close prevention, and the immutable `inventory_movements` ledger are
  all shipped — see Phase 0 iterations 10-13's bug-fix trail.
- Audit compliance (who/what/when/before/after): the audit-log module already covers
  this; RLS + tenant-scoped verify-then-mutate covers cross-tenant isolation (verified
  clean, see Security review above).
- A release gate checklist already exists below (`## Release gate checklist`) — extend
  it, don't duplicate it.
- Honest status labels already exist below (`## Human-language status labels`) — use
  them, don't invent new ones.

**Real gaps found this session, in priority order — each is a standalone, independently
gated item, not a big-bang rewrite:**

1. **DONE, 2026-08-02: AI-agent / multi-session git-safety rules.** Added as the
   "EXECUTION RULES FOR ALL FUTURE AGENTS" blockquote at the top of this document. Not
   theoretical — grounded in a real incident the same day: a Replit session merged its
   separately-migrated copy of this repo into `origin/develop`, deleting `src/`/`web/`
   and replacing `package.json` with a bare workspace stub. Caught before further
   commits landed on top; fixed with a forward-only `git revert` (PR #145), zero data
   loss, `staging`/`master` never touched. Full incident record:
   `WORK/LOOP_STATE.md`'s "NEW 2026-08-02 — incident" row. This is exactly the kind of
   guardrail the master prompt asked for ("AI Agent Guardrails... never modify
   production data directly") — except grounded in what actually happened here, not a
   hypothetical.
2. **DONE, 2026-08-02: table-name collision prevention.** Flagged as a backlog candidate
   back in Phase 0 (2026-07-19, "worth a lint/CI check... Not built this wave") after
   the bug class hit 3 times. Confirmed already built and running as
   `npm run table:scan` (`tools/table-collision-scan.mjs`) — part of the standard gate
   sequence now. No new work needed; noting closure here so the Phase 0 flag isn't
   mistaken for still-open.
3. **NEEDS-SRI, not code-addressable: production infrastructure confirmation.** See the
   refreshed Deployment readiness section above — this is the single highest-impact gap
   for "no deployment surprises." Every other item on this list is secondary to knowing
   where production actually runs.
4. **NEEDS-SRI, not code-addressable: one real backup-restore drill.** `PROD_DATABASE_URL`
   has never been set, so the backup cron has never produced a real artifact and restore
   has never been tested end-to-end. Code-side (the backup/restore scripts themselves)
   is built per Phase 4a; what's missing is running it once for real.
5. **OPEN, code-addressable, not yet scoped: a `WORK/audits/` completion-audit template
   check.** Every phase in this document ends with "a dated completion audit records
   what shipped" — true in practice (dozens exist), but nothing enforces the format
   stays consistent (evidence citations, real test counts, explicit out-of-scope
   notes). Not queuing a CI check for this without Sri confirming it's worth the
   overhead — named here as a candidate, same treatment Phase 0 gave the table-collision
   check before it was built.

**Explicitly not adopted from the source template** (with reasons, matching Phase 4a/6's
own convention of naming rejected scope rather than silently dropping it):

- The full per-phase Business Objective/Current State/Backend/Frontend/Database/
  Security/Testing/Deployment section template — this document's existing phases
  already carry equivalent information in a denser, evidence-cited form specific to
  each phase; forcing every future phase into 8 subsections regardless of size would
  add ceremony without adding information.
- "Thousands of stores, millions of products" scale planning — per this repo's own CTO
  doctrine (evidence beats aspiration): Postgres with this schema's tenant-leading
  indexes comfortably serves ~10k tenants / 50k users / 2k concurrent / 30k sales-per-day
  at current scale assumptions. Nothing in this codebase or its traffic is anywhere near
  that ceiling. Designing past a measured bottleneck is explicitly against this
  document's own "Avoid" list philosophy. Revisit if/when a real metric approaches a
  real limit, not preemptively.
- A generic "AI Agent Guardrails" checklist disconnected from this repo — replaced with
  item 1 above, which is the same intent grounded in a real incident and a real fix.
- Re-explaining the procurement-vs-demand-planning architectural separation the source
  template asked for — Phase 6 and Phase 7's own scoping already draws exactly this
  line (supplier→PO→receiving→ledger vs. sales-history→snapshot→forecast), and
  ADR-006 already governs the UOM-conversion boundary the template warned not to mix in.
  Nothing new to add.

Exit criteria for Phase 8 (this slice):

- Items 1-2 above: done, verifiable by reading this document's own top blockquote and
  running `npm run table:scan`.
- Items 3-4: remain NEEDS-SRI until Sri acts — not blocked on any future agent's code
  work, do not attempt to "solve" these with more application code.
- Item 5: not started — needs Sri's go/no-go before scoping.

#### Next agent starting point

If you are picking up work on Ascend with no other context:

1. Read this document's top blockquote (execution rules), then `WORK/LOCK.md`'s
   currently-`ACTIVE` claims (if any), then the newest 2-3 files in `WORK/audits/`.
2. Check `git log --oneline -10` on `develop` and compare against this document's "Last
   reviewed" date — if substantial work has landed since, this document is stale again;
   say so explicitly rather than planning against outdated status, the same way this
   Phase 8 update corrected the 2026-07-18 Security/Deployment sections.
3. There is no current NEEDS-SRI-free code backlog item waiting to be picked up
   speculatively. The two highest-value real gaps (production infra confirmation, one
   backup-restore drill) both require Sri's direct dashboard/browser access — a future
   agent cannot close them. If Sri has not supplied a specific initiative, the honest
   move is to say so, not invent scope.
4. If Sri does supply a new initiative or another "master prompt" style template: follow
   this document's own established pattern (Phase 4a/6/7/8) — audit the real codebase
   first, write a dated gap-analysis audit in `WORK/audits/`, propose a narrow approved
   scope back to Sri, then execute strictly in that order with regression gates between
   each item. Do not build the template's full scope speculatively.

## Suggested better architecture decisions moving forward

Keep:

- Modular monolith.
- TypeScript.
- PostgreSQL.
- Integer cents for money.
- Domain modules.
- Event/workflow layer.

Improve:

- Consider Drizzle or Prisma only if raw SQL becomes too hard to maintain. Do not migrate ORM just for style.
- Introduce a formal API contract generation workflow so frontend types always match backend routes.
- Keep orchestration, but avoid making every simple CRUD operation a saga.
- Create one shared permission registry used by backend, frontend, and docs.
- Create one shared business-pack registry used by backend, frontend, onboarding, and docs.
- Add a capabilities endpoint that returns effective modules, features, required fields,
  workflows, and permissions for the current tenant/user.
- Add a business-mode impact endpoint before allowing a company to switch packs in production.
- Use a strict module readiness checklist before calling anything built.
- Separate demo/mock mode from production mode at build and runtime.

Avoid:

- Microservices.
- More vertical modules before core reliability and business-pack enforcement.
- Adding AI features before data correctness.
- Treating docs as proof of implementation.
- Treating Vercel deployment success as production readiness.

## Human-language status labels to use from now on

Use these labels in docs:

- Built and verified: implemented, tested, and working against real backend/data.
- Built but not verified: implemented, typechecks, but lacks full tests/e2e.
- UI-only: screen exists but does not prove backend behavior.
- Mocked: works through MSW/demo data only.
- Partial: some backend/frontend exists but missing important behavior.
- Planned: documented but not implemented.
- Not production-ready: works locally/demo but lacks security/ops/testing requirements.

## Reusable prompt for the next end-to-end audit

Use this prompt with a coding agent when you want a fresh project audit:

```text
Audit the Ascend project end-to-end.

Work from the repository, not from assumptions. Inspect the backend, frontend, database migrations, contracts, docs, tests, CI/CD, deployment scripts, environment examples, and mock/demo layers.

Write a plain-English report that answers:

1. What is the current state of the Ascend application?
2. What is genuinely implemented?
3. What is only mocked, partial, static, or documented but not built?
4. What is the architecture and schema direction?
5. What are the biggest security risks?
6. Is the app deployment-ready? Be direct and honest.
7. What development areas need the most work?
8. What should the forward plan be for design, development, implementation, testing, security, and deployment?
9. Is the app going in the right direction, or is the project spreading too wide?

Use evidence from files and commands. Run at least:

- backend typecheck
- backend tests if available
- frontend typecheck
- frontend lint
- frontend build
- e2e tests if practical

Do not overwrite existing work-state docs. Write the audit as a new dated file at WORK/AUDIT_YYYY-MM-DD.md and follow the rules in WORK/README.md. Be brutally honest but practical. Separate "built", "verified", "mocked", "partial", and "planned". End with a prioritized phase plan and release gate checklist.
```

## Release gate checklist

Ascend should not be considered production-ready until all of these are true:

- Backend typecheck passes.
- Backend tests pass.
- Frontend typecheck passes.
- Frontend lint passes.
- Frontend build passes.
- Playwright golden paths pass.
- No production UI depends on MSW mocks.
- Core POS flow works on real backend.
- Payment/refund flow is tested.
- Inventory ledger is immutable and tested.
- Tenant isolation is tested.
- RBAC is tested.
- RLS is enabled or tenant isolation is otherwise proven.
- Production secrets are configured and rotated.
- Redis or equivalent shared rate limiting is configured.
- Metrics are protected.
- Webhook secrets are encrypted.
- Backups and restore are tested.
- Staging deploy passes smoke tests.
- Production rollback procedure exists.

## Final honest assessment

Ascend has strong bones. The project is ambitious and technically serious. The stack choice is reasonable and the modular monolith direction is correct.

But the app is not ready for real production use yet. The current risk is not lack of features. The current risk is too many features without enough proof. For POS software, correctness, security, auditability, and operational reliability matter more than breadth.

The best path forward is to stop expanding temporarily, verify the truth, harden the core retail workflow, and then grow outward from a stable base.
