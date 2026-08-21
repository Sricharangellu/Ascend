# Ascend — Gaps (current, code-verified)

Single source of truth for "what's actually still missing." Replaces the
2026-06-15 `orchestration/gaps/*.md` assessment files, which described a
snapshot over a month stale — every specific item they proposed as "worth
building" (BE-9 reservations, BE-11/12 partial receiving + bill variance,
BE-13 credit limits, BE-15 tracking/carrier, BE-16 age verification, BE-17
register sessions, BE-18 edition presets, purchase requisitions, PO approval
routing, cycle counts, location transfers, MFA, SSO, API keys, custom-roles
permissions, job scheduling) was independently verified **already built**
during this consolidation pass (grep + live API checks against running
staging, 2026-07-20). Those old files are archived under `_archive/` —
historical record only, not a task list.

**Rule going forward:** don't propose a gap without checking the code first.
`grep`/read the relevant module before writing "worth building" — this file
existed for a month claiming things were missing that had already shipped.

## Real, current gaps (verified still open)

These are the actual open items, cross-checked against `WORK/FORWARD_PLAN.md`'s
NEEDS-SRI list (the authoritative day-to-day backlog) as of this pass:

| Item | Status | What's actually missing |
|---|---|---|
| Catalog `/catalog/:id/credits` | Open | No backing concept anywhere in the schema (not customer_invoices, not store credit). Needs a design decision on what a product-level "credit" even means before building — not a wiring gap. |
| Inventory pipeline: Receiving tab | Open | Implies a stateful "receiving session" (start receiving, scan qty progressively, batch_id) that doesn't exist — POs today go create → receive() in one atomic call. Needs a decision on whether the workflow is worth building. |
| Inventory pipeline: Issues + Errors tabs | Open | FE has GET+PATCH only (no POST) implying an unbuilt *detection* engine (sku_mapping, price_mismatch, duplicate_doc, edi_parse categories) — nothing currently computes these. Needs a decision on what should populate them. |
| Inventory pipeline: Overview/Summary funnel | Open | FE's 9-stage funnel doesn't map onto the real 4-value `POStatus` enum; several KPIs depend on the two items above. |
| Real EDI parsing (`purchasing/edi-imports`) | Open | Frontend upload form never sends file bytes (no FormData/base64) — `/process` is an honest state-machine transition, not real parsing, because there's nothing to parse yet. Needs (a) frontend file-upload fix and (b) a parser library or defined subset format decision. |
| Approval chains / run-history: trigger wiring | Open | `approval_chains` and `workflow_run_history` are real, persisted, tested — but nothing invokes them. Needs a decision on which real action (price override? refund threshold? new vendor? discount threshold?) should check a chain and log a run. |
| Custom-roles / permissions-page contract | Open | Frontend permissions matrix (`{name,color,features}`) vs backend `custom_roles` (`{name,permissions}` fixed vocab, no color) — a genuine contract mismatch, not a missing feature. Needs a decision on which model wins. |
| E2 procurement: GRN / GRNI | Partial | Requisitions ✅ and 3-way match ✅ both shipped (this session). Goods-Received-Not-Invoiced tracking may already be partially covered by the 3-way match's `not_invoiced` variance flag — needs a specific check before calling this done or open. |
| Ecommerce storefront auth | Decided, gated | `NEXT_PUBLIC_STORE_AUTH_ENABLED=1` re-enables; real customer-auth backend deferred until the storefront is prioritized. Not an oversight — a deliberate Preview gate. |
| ~~Product/inventory pages: dead routes, broken transfers redirect, duplicate batch/expiry models~~ | **CLOSED — this row was stale** (corrected 2026-08-06) | Every item is marked **shipped** in [PRODUCT_MODULE_REVIEW.md](PRODUCT_MODULE_REVIEW.md)'s own §12 roadmap and §13 priority matrix: dead-route removal + transfers-redirect fix + nav links (PR #106), `Pagination` in `ProductsTab` (PR #106), keyset pagination for inventory transfers/returns (PR #108), tab-bar group labels, the `/inventory/expiry` retirement, and the `Product`/`CatalogProduct` type consolidation. The row survived here after the review was completed. Exactly the failure mode this file's intro warns about — left as a struck-through record rather than deleted, so the correction is visible. |
| Reorder-effectiveness analytics (buyer accept/modify/reject rate) | Documented, not scheduled | **Finding:** cannot currently be measured because POs created outside the one-click reorder flow are never correlated with the reorder suggestion that (may have) prompted them. `createPoFromAlert()` (`inventory/pipeline-views.ts`) sets PO quantity to `alert.suggested_qty` directly — by construction that path can never show an "override." A manually-created PO carries no reference to any reorder alert or its suggested quantity. **Potential future instrumentation (deferred):** when a PO originates from a reorder alert, persist the alert id + suggested quantity as immutable metadata so recommended-vs-ordered can be compared later. **Status: no implementation scheduled — revisit only when production usage demonstrates a need for reorder-effectiveness analytics**, per the 2026-07-28 architecture review that produced this finding. |

## Scalability gaps (added 2026-08-15, measured — see [SCALABILITY.md](SCALABILITY.md))

Every row below was produced by measurement against a production-shaped dataset
(2.1M order lines), not by reading code. Fixed items are recorded in
`SCALABILITY.md` §2; only what is still OPEN is listed here.

| Item | Severity | What's actually missing |
|---|---|---|
| **POS checkout runs a synchronous orchestration workflow in the HTTP request** | **Blocker for the 20k target** | `EventBus._dispatch` awaits subscribers sequentially, and `order.created` runs a workflow-engine cycle + accounting posting + inventory application inline. Profiler attributes **90%** of checkout latency to it; throughput is flat at ~110 req/s from concurrency 40 to 400. Fix: move the workflow run, accounting posting and notification fan-out onto the existing `job_queue`, keep only the order write + inventory decrement synchronous. |
| No idempotency key on `POST /api/v1/orders` | High | A POS terminal retrying after a network timeout creates a **second order**. Payments have idempotency; order creation does not. This is the one acceptance criterion a retry can violate silently. |
| Outbox rows written outside the business transaction | High | `orders.create` publishes after commit, so a crash between the two loses the event — the durability hole the outbox exists to close. `EventBus.stage()` already exists for exactly this and is unused on this path. |
| 53 unbounded `SELECT`s in service code | Medium | Catalogued, not capped. The ones that grow without bound: `permission_requests`, `product_batches`, `workforce` shifts/time-off, `team` members (an org with 20,000 users returns all of them), and the reports that scan every product. Each needs its own decision — pagination vs. background export — which is why none were changed blind. |
| No alert definitions | Medium | The metrics exist (`db_pool_connections`, job-queue depth, outbox age, request latency); nothing declares thresholds or routes them anywhere. |
| No partitioning / retention on append-only tables | Medium (year 2+) | `inventory_movements`, `audit_log` and `event_outbox` are append-only and time-ordered. Modelled growth reaches ~765M rows in 3 years. Not urgent at 20k users in year one; cheaper to design now than retrofit. |
| 17 unindexed foreign keys; 10 tables with `tenant_id` but no index leading with it | Low | Mostly covered for tenant-scoped reads by `(tenant_id, fk)` composites; they still matter for `ON DELETE CASCADE`, which matches the FK column alone. Deliberately **not** fixed — no measurement showed it mattering, and adding 17 indexes on suspicion is the speculative indexing this audit avoided. `event_outbox` and `workflow_steps` are the two worth looking at first. |

## Verified existing capability (do not rebuild)

Confirmed present and actively used — recorded here so a future pass doesn't
propose rebuilding it as a "gap" (exactly the mistake this file's intro
describes correcting once already):

- **Sales velocity / reorder suggestion inputs**: `inventory/pipeline-views.ts::reorderAlerts()` already computes 30-day units sold → `avg_daily_sales` → `days_until_stockout` → `suggested_qty`, and `ai_assistant/service.ts`'s `gatherBestSellersSignal`/`gatherSlowMoversSignal` already rank products by 30-day revenue/units. A "Sales Velocity Service" proposal should be checked against these first — the core calculation exists; a real gap here would be narrower (e.g. unit-normalized velocity, per-location breakdown), not a new service.
- **Progress intelligence (truth-tracking) loop**: complete end-to-end as of 2026-08-06. `src/modules/progress` owns all four `progress_*` tables and the whole `Hypothesis → Plan → Task → Evidence → Verified Result → Decision` model; `/progress` (hypotheses, evidence, decisions) and the dashboard's `ProgressPanel` (tasks, evidence, system-verify) are the two frontends. A decision **requires** attached evidence, and `evidence_attached`/`system_verified`/`validated`/`invalidated` can only be earned through their own endpoints — never set by hand. Do not propose "add a progress/OKR/task-verification model"; extend this one. See `AUDIT_2026-08-06T165353Z-progress-intelligence-loop.md`.
- **Stock movement ledger**: `inventory_movements` (`id, tenant_id, product_id, delta, reason ∈ {receiving, sale, adjustment, return, cycle_count}, ref, created_at`, indexed by tenant+product+time) is real and actively written to by `inventory/service.ts` — not an unused stub (unlike `product_units` or `product_barcodes.pack_size` were before this session's UOM work). Sufficient to reconstruct stock-qty-over-time and detect stockout moments (replay deltas, find when the running balance hits zero) without introducing a new movement table.

## Platform/infrastructure gaps (added 2026-08-06, enterprise platform audit)

Verified by command against this checkout, not carried over from an older doc. Full
evidence: `WORK/audits/AUDIT_2026-08-06T170227Z-enterprise-platform-audit.md`.

| Item | Status | What's actually missing |
|---|---|---|
| Infrastructure as Code | Open — **zero** (narrowed 2026-08-10, not closed) | No Terraform/Pulumi/`render.yaml`/`fly.toml`/Helm anywhere. Every environment (Vercel projects, the backend host, both Supabase projects, all env vars) is dashboard-only state. Already bit once: the staging Vercel projects were deleted and `scripts/deploy.sh` still holds their IDs. **Deliberately not fixed by that audit** — codifying a host nobody has confirmed would add a *fourth* conflicting picture of production; resolve `DEPLOYMENTS.md` first, then IaC the winner. **Partially addressed 2026-08-10:** this row also carried "no record anywhere of what Render env vars would need to be set", and Render is now confirmed, so `PIPELINE.md` gained a "Production backend host (Render) env vars" section derived from `src/app.ts` — every var by name, with its severity tier (crash-on-boot / fail-closed-503 / silently-degrades). **That documents the contract; it does not create IaC, and no row in it is verified against the live service.** The dashboard-only-state gap is unchanged. |
| Nothing scrapes `/metrics` | Open | The endpoint emits correct Prometheus exposition and, since the 2026-08-06 audit, covers DB pool, job-queue depth, outbox backlog, event-loop delay and build sha. **No collector reads it, so none of it is retained or alertable.** This is a configuration task, not an engineering one — Grafana Cloud free tier + `METRICS_TOKEN`. Highest-leverage open observability item. |
| Alert fan-out (C-4) | Open | Still only "a GitHub Actions run went red". No paging, no routing, no on-call, no status page. |
| Load / capacity data | Open — none exists | No load test has ever run. Throughput, p95, and the concurrency at which the pool exhausts are all unknown. For a product pitched on high-volume POS, "how many tills can check out at once" is currently unanswerable. `scripts/smoke.ts` already scripts the full lifecycle — it is ~90% of a k6 script. |
| ~~Restore validation in CI~~ | **CLOSED 2026-08-11** | Was: drilled by hand once (2026-08-05), nothing re-proving it, so the path could rot silently. Now `db/backup/drill.sh` runs the whole sequence — fingerprint → backup → `--verify` → restore → compare → boot the app against the result → report RTO — and `.github/workflows/restore-drill.yml` runs it weekly **and on every change to `db/backup/**`**, which is the highest-risk moment for this machinery. The comparison is a per-table row count **and content md5**, so `users.password_hash` is proven intact byte for byte rather than merely present. Verified locally: 193 tables / 324 rows identical, RTO 3s. **Both guards were proven to fail before being trusted** — an empty source is refused, and the post-restore verifier was caught passing against a database with nothing restored into it (see the row below). |
| Down-migrations for module migrations | **Decided, not built — ADR-013 (Proposed)** | `db/migrations/` has 3 `.down.sql` files; the 53 module migration sets that run at boot have none, and per [ADR-013](ADR/ADR-013-schema-is-forward-only-recovery-is-by-restore.md) they will not get any. The decisive argument is not cost: **a down-migration does not recover data.** Reversing a migration that dropped a column recreates an empty column; the values are gone either way. Schema is forward-only; recovery is a point-in-time restore, with an explicit pre-migration backup checkpoint required for any destructive migration. `PIPELINE.md`'s Rollback section is corrected accordingly — it previously implied `git revert` on `master` rolled back the database. ADR status is **Proposed**: the mechanics are done, the standing architectural commitment is Sri's to accept. |
| `web` dependency advisories | Open — 1 critical, 6 high | All resolve only through `next` 14→16 and `vitest` 2→4 (F-24/F-25). The `next` advisories include **SSRF and HTTP request smuggling in `rewrites()`** — the mechanism this app proxies *all* backend traffic through — and middleware-bypass/cache-poisoning against `middleware.ts`, its auth gate. Root is at 0 and is now a CI gate at `high`. |
| Audit logging coverage | Open — 14 of 53 modules | The money paths `AGENTS.md` names are covered. Privileged mutations elsewhere are unattributable. Best fixed with a helper at the `requireRole`-guarded route layer so coverage follows authorization instead of being remembered per-module. |
| Frontend CSP allows `'unsafe-inline'` scripts | Open | Required by the current Next App Router setup; nonce-based CSP is materially easier on Next 15+, so fold it into the 14→16 migration rather than doing it twice. |
| GDPR erasure / export | Open | Tenant isolation, transit encryption and audit logging exist. No right-to-erasure, no data-portability export, no retention policy. Blocks EU enterprise sales. |
| `artifacts/` — 1,005 tracked files | Open — NEEDS-SRI | Five complete projects on an incompatible stack (Vite/Radix/Drizzle/pnpm), 55% of tracked files, built and deployed by nothing. Direct cause of five root-manifest-hijack CI incidents in two days; `hygiene-check.mjs` check 8 guards the symptom, not the cause. Extraction needs sign-off — it is user work. |

**Closed by the 2026-08-06 audit:** two CI guards that could never fail (F-1 SQL injection,
fixed earlier in `c00a485`; **F-2 unguarded mutation routes**, replaced with
`tools/route-authz-scan.mjs` — which found 4 genuine unguarded mutations the grep never
could, one of them fixed in code). No SAST of any kind existed; CodeQL + dependency review
now run per-PR and weekly. `/metrics` had no visibility into the pool, job queue or outbox.
The container image declared no health probe. There was no `SECURITY.md`.

## Known open criticals (operational floor, outrank feature work)

From `docs/architecture/CTO_CHARTER.md` / `PLATFORM_ROADMAP.md`, still true as of this pass:
- **C-1** — backup restore drill never run against real infra. **Refined
  2026-08-06:** the *mechanism* was drilled end-to-end 2026-08-05 and works
  (backup 0.168s → 501KB, restore ~1s, 193 tables verified identical, app
  booted against the restored DB). What has never happened is a **production**
  backup — `PROD_DATABASE_URL` is unset, so `backup.yml` has reported success
  16 times while skipping every real step. Honest RPO is total loss, not ≤24h.
  **Mechanism half CLOSED 2026-08-11:** that one hand drill is now automated and
  continuous — `db/backup/drill.sh` (fingerprint → backup → verify → restore →
  compare → boot the app against the result → RTO) run weekly and on every
  change to `db/backup/**` by `.github/workflows/restore-drill.yml`. The
  comparison now includes a per-table **content checksum**, not just row counts,
  so `users.password_hash` is proven intact byte for byte. Both guards were
  proven to fail before being trusted. **The production half is UNCHANGED and
  still the whole point of C-1**: there is nothing to restore *from* until
  `PROD_DATABASE_URL` is set. Do not read the green drill as C-1 closed — it
  proves the path, not the artifact.
- **C-2** — background workers still `setInterval`-based in the general orchestration layer outside the M1.2 job-tick path; runtime move to a long-lived process (Level 5/E3 step 6) not done.
- **C-3** — DB TLS: production connects with `PG_SSL_NO_VERIFY`-style trust in some paths; the *code* supports proper `PG_CA_CERT`/`PG_CA_CERT_B64` verification (used correctly for the new Supabase project this session) but isn't universally enforced yet.
- **C-4** — no alerting between deploys beyond the `uptime.yml` heartbeat.

## Infrastructure gaps (added 2026-08-06, code-verified)

From the 12-phase infrastructure audit —
`WORK/audits/AUDIT_2026-08-06T170650Z-erp-infrastructure-audit.md`. Only items
still open are listed; what that pass fixed is in the audit's §12.6 and in
ADR-010/011/012, not repeated here.

| Item | Status | What's actually missing |
|---|---|---|
| Authorization: ungated **POST** mutations are covered by no scanner | Open | `tools/route-authz-scan.mjs` (ADR-008) deliberately checks only `PUT`/`PATCH`/`DELETE`, on the sound reasoning that in a POS a `POST` is usually the normal cashier action. That is right for most of them and leaves a real hole for the rest. A parallel sweep (PR #197) that *did* include `POST` found 314 mutating routes, 76 with no authorization middleware — 62 correctly open, and these still-open POST-side gaps that no CI check will catch today: **`catalog POST /`** (a cashier can create a product; every sibling bulk path is `requireRole("manager")`), **`catalog POST /:id/barcodes`** (attaches a pack-size/UOM conversion, ADR-006), **`catalog PUT /:id/categories`**, **`billing POST /bills`** and **`POST /invoices`** (a cashier can raise AP/AR documents, while the sibling *pay* route **is** guarded), **`outlets POST /`** and **`POST /:outletId/registers`** (setup actions, not till actions), and **`inventory POST /pipeline/reorder-alerts/:id/create-po`** (creates a real PO while purchasing's own PO routes are mgr-guarded). `quotes DELETE /:id` from that list was fixed in PR #198. Not a wiring gap — each needs a product decision about who may do it. Two options when it is picked up: extend the scanner to POST with a per-route allowlist, or gate these individually. |
| Object storage | Open — **blocks 4 other items** | No S3/R2/GCS/Blob credential or SDK anywhere. This is why EDI import can never parse a file (the frontend has nowhere to upload bytes to), and it equally blocks invoice OCR, receipt OCR, product images and document search. Highest-leverage single prerequisite in the integration backlog. |
| Observability: signals produced, nothing consumes them | Open — **narrowed 2026-08-10** | `/metrics` renders Prometheus text that nothing scrapes; W3C `traceparent` is generated and exported nowhere; structured JSON logs go to stdout with no aggregator; the Sentry integration is a hand-rolled envelope with no releases, source maps, breadcrumbs or user context, and no frontend coverage at all (`web/app/error.tsx` still says "when wired in production"). Worse than absent — it reads as covered. **What changed:** the *producing* side had a hole nothing had named — there was no per-request logging at all, which is why the 2026-07-18 incident investigation got three boot lines for a ten-minute run. `gateway/accessLog.ts` now emits one structured line per request (method/path/status/duration/requestId/traceId/tenantId), severity tracking the response so `level>=warn` finds every rejection, probes at debug so the heartbeat cannot flood. The consuming half — a collector and an aggregator — is still the open item, and is a configuration task, not an engineering one. |
| No IaC | Open — **root cause of the DEPLOYMENTS.md incident** | No Terraform, Pulumi or `render.yaml`. Every piece of infrastructure was created by hand in a dashboard, which is exactly why nobody can say where production runs. Deliberately NOT added in the 2026-08-06 pass: codifying a topology this repo cannot confirm is worse than codifying none. Blocked on `DEPLOYMENTS.md` P1. |
| No rollback path | **Narrowed 2026-08-11 — policy chosen, production still exposed** | The ask was "either down-migrations or an explicit, documented forward-only + restore policy". The policy now exists (ADR-013) and the restore mechanism it depends on is continuously proven (`restore-drill.yml`). **What is NOT fixed: production still has nothing to restore from.** `PROD_DATABASE_URL` is unset, so `backup.yml` reports success in ~5s having backed up nothing and the RPO is unbounded — total loss, not ≤24h. So "a data-affecting mistake is currently permanent" **remains true in production** and closes only when that secret is set (NEEDS-SRI). A drill proves the path; it cannot conjure a backup nobody took. |
| Testing: no load, a11y, visual, contract or performance layer | Open | No k6/Artillery, no `@axe-core/playwright` (though `axe-core` is already a transitive dep), no visual regression, and nothing asserts the running server matches `contracts/openapi.yaml` despite the frontend consuming it via codegen. `AGENTS.md` mandates WCAG 2.1 AA as non-negotiable and nothing verifies it. |
| No SAST / container image scanning | Open | CodeQL on a private repo needs GitHub Advanced Security — a licensing decision, therefore Sri's; Semgrep is the no-GHAS alternative. CI builds the container image and never scans it (Trivy). Both must be proven green on a branch before gating, per ADR-008. |
| No secrets manager | Open | GitHub Actions secrets + host env vars; no central rotation, access audit or expiry. Sharpest edge: **per-tenant OIDC client secrets live in the `settings_kv` table** — deliberate (see `ARCHITECTURE.md`) but it puts customer IdP credentials in the application database. |
| ~~`errorEnvelopeMiddleware` is dead code~~ | **CLOSED 2026-08-10** | Was: `app.ts` mounts `errorMiddleware` first; it always responds and never calls `next(err)`, so the envelope middleware after it never ran, and the documented `{error:{code,message,requestId}}` contract was never delivered. Fixed by folding the envelope's behaviour into `errorMiddleware` and deleting `src/gateway/errorEnvelope.ts` — **not** by reordering the two, which would have been a breaking change (the envelope renames 5xx `internal` → `internal_error` and drops the `details` array validation errors carry). **A second defect surfaced while verifying this one:** `contextFromRequest` reads `req.id` and the `x-trace-id`/`x-span-id` *request* headers, none of which this app ever sets — `requestIdMiddleware` writes `res.locals` and emits *response* headers — so **every 500 ever logged also carried `requestId: undefined`**. Both sides of the correlation were broken, not just the response side; both are fixed. 5xx `HttpError`s are now logged too (previously only the unreachable handler did that). `src/gateway/errorEnvelope.test.ts` pins all of it — the row's own note that "no test asserts it, which is why it survived" is why the regression test was verified to fail 4/4 against the pre-fix code before being accepted. |
| `compile()` binds NULL for unmatched `@named` params | Open (latent) | `src/shared/db.ts` silently binds `undefined` → NULL when a placeholder has no matching key. Already caused a total module outage once (`customer_invoices.create()`, iteration 19 — every invoice creation with lines 500'd). Invisible until a specific write path is exercised. |
| ~~Job tick runs **daily**~~ | **CLOSED 2026-08-10 — and the diagnosis was too kind** | This row said worst-case latency was ~24h. With production confirmed on Render (Sri, 2026-08-08), the truth was worse: a Vercel cron cannot reach a Render service, so `/jobs/tick` was being called **not at all** in production — the outbox never redelivered and no scheduled job ever ran. Fixed as this row and ADR-012 both prescribed: `vercel.json`'s `crons` block deleted, replaced by `.github/workflows/jobs-tick.yml` (`*/15`, via the `JOBS_TICK_SECRET` / `X-Jobs-Tick-Secret` path ADR-012 created for non-Vercel schedulers). **Residual, tracked not closed:** the secret must be set on the Render service *and* as a repo secret before the replacement processes anything; until then the workflow warns loudly and ticks nothing, following `backup.yml`'s precedent rather than reporting a false green. |

## How to keep this file honest

- Before adding an item: `grep` the relevant module/route, don't just recall an old assessment.
- Before removing an item: confirm via a real request/test, not a code skim (a route existing doesn't mean it's wired end-to-end — verify the actual call path, the way BE-9's `committed` field looked stale in a comment but was actually live in the query below it).
- This file shrinks over time. If it's not shrinking, something's wrong with how work is being tracked, not with the codebase.
