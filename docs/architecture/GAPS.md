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

## Verified existing capability (do not rebuild)

Confirmed present and actively used — recorded here so a future pass doesn't
propose rebuilding it as a "gap" (exactly the mistake this file's intro
describes correcting once already):

- **Sales velocity / reorder suggestion inputs**: `inventory/pipeline-views.ts::reorderAlerts()` already computes 30-day units sold → `avg_daily_sales` → `days_until_stockout` → `suggested_qty`, and `ai_assistant/service.ts`'s `gatherBestSellersSignal`/`gatherSlowMoversSignal` already rank products by 30-day revenue/units. A "Sales Velocity Service" proposal should be checked against these first — the core calculation exists; a real gap here would be narrower (e.g. unit-normalized velocity, per-location breakdown), not a new service.
- **Progress intelligence (truth-tracking) loop**: complete end-to-end as of 2026-08-06. `src/modules/progress` owns all four `progress_*` tables and the whole `Hypothesis → Plan → Task → Evidence → Verified Result → Decision` model; `/progress` (hypotheses, evidence, decisions) and the dashboard's `ProgressPanel` (tasks, evidence, system-verify) are the two frontends. A decision **requires** attached evidence, and `evidence_attached`/`system_verified`/`validated`/`invalidated` can only be earned through their own endpoints — never set by hand. Do not propose "add a progress/OKR/task-verification model"; extend this one. See `AUDIT_2026-08-06T165353Z-progress-intelligence-loop.md`.
- **Stock movement ledger**: `inventory_movements` (`id, tenant_id, product_id, delta, reason ∈ {receiving, sale, adjustment, return, cycle_count}, ref, created_at`, indexed by tenant+product+time) is real and actively written to by `inventory/service.ts` — not an unused stub (unlike `product_units` or `product_barcodes.pack_size` were before this session's UOM work). Sufficient to reconstruct stock-qty-over-time and detect stockout moments (replay deltas, find when the running balance hits zero) without introducing a new movement table.

## Known open criticals (operational floor, outrank feature work)

From `docs/architecture/CTO_CHARTER.md` / `PLATFORM_ROADMAP.md`, still true as of this pass:
- **C-1** — backup restore drill never run against real infra. **Refined
  2026-08-06:** the *mechanism* was drilled end-to-end 2026-08-05 and works
  (backup 0.168s → 501KB, restore ~1s, 193 tables verified identical, app
  booted against the restored DB). What has never happened is a **production**
  backup — `PROD_DATABASE_URL` is unset, so `backup.yml` has reported success
  16 times while skipping every real step. Honest RPO is total loss, not ≤24h.
- **C-2** — background workers still `setInterval`-based in the general orchestration layer outside the M1.2 job-tick path; runtime move to a long-lived process (Level 5/E3 step 6) not done.
- **C-3** — DB TLS: production connects with `PG_SSL_NO_VERIFY`-style trust in some paths; the *code* supports proper `PG_CA_CERT`/`PG_CA_CERT_B64` verification (used correctly for the new Supabase project this session) but isn't universally enforced yet.
- **C-4** — no alerting between deploys beyond the `uptime.yml` heartbeat.

## Infrastructure gaps (added 2026-08-06, code-verified)

From the 12-phase infrastructure audit —
`WORK/audits/AUDIT_2026-08-06T170650Z-erp-infrastructure-audit.md`. Only items
still open are listed; what that pass fixed is in the audit's §12.6 and in
ADR-008/009/010, not repeated here.

| Item | Status | What's actually missing |
|---|---|---|
| Authorization: 14 ungated mutating routes | Open | `tools/route-guard-scan.mjs` finds 76 mutating routes with no authorization middleware; 62 are correct (POS/floor/self-service/public-auth), 14 are real debt — every one classified `GAP:` in `tools/route-guard-allowlist.json`. Worst: `catalog POST /` (a cashier can create products), `billing POST /bills` + `/invoices` (a cashier can create AP/AR documents while the *pay* route is guarded), `quotes DELETE /:id` and `PATCH /:id/status` (that module imports no guard at all). Not a wiring gap — each needs a product decision about who may do it. |
| Object storage | Open — **blocks 4 other items** | No S3/R2/GCS/Blob credential or SDK anywhere. This is why EDI import can never parse a file (the frontend has nowhere to upload bytes to), and it equally blocks invoice OCR, receipt OCR, product images and document search. Highest-leverage single prerequisite in the integration backlog. |
| Observability: signals produced, nothing consumes them | Open | `/metrics` renders Prometheus text that nothing scrapes; W3C `traceparent` is generated and exported nowhere; structured JSON logs go to stdout with no aggregator; the Sentry integration is a hand-rolled envelope with no releases, source maps, breadcrumbs or user context, and no frontend coverage at all (`web/app/error.tsx` still says "when wired in production"). Worse than absent — it reads as covered. |
| No IaC | Open — **root cause of the DEPLOYMENTS.md incident** | No Terraform, Pulumi or `render.yaml`. Every piece of infrastructure was created by hand in a dashboard, which is exactly why nobody can say where production runs. Deliberately NOT added in the 2026-08-06 pass: codifying a topology this repo cannot confirm is worse than codifying none. Blocked on `DEPLOYMENTS.md` P1. |
| No rollback path | Open | `db/migrations/*.down.sql` exist for the 3 foundation files only — the 186 module-owned tables have none. Combined with C-1's production half, a data-affecting mistake is currently permanent. Needs either down-migrations or an explicit, documented forward-only + restore policy. |
| Testing: no load, a11y, visual, contract or performance layer | Open | No k6/Artillery, no `@axe-core/playwright` (though `axe-core` is already a transitive dep), no visual regression, and nothing asserts the running server matches `contracts/openapi.yaml` despite the frontend consuming it via codegen. `AGENTS.md` mandates WCAG 2.1 AA as non-negotiable and nothing verifies it. |
| No SAST / container image scanning | Open | CodeQL on a private repo needs GitHub Advanced Security — a licensing decision, therefore Sri's; Semgrep is the no-GHAS alternative. CI builds the container image and never scans it (Trivy). Both must be proven green on a branch before gating, per ADR-008. |
| No secrets manager | Open | GitHub Actions secrets + host env vars; no central rotation, access audit or expiry. Sharpest edge: **per-tenant OIDC client secrets live in the `settings_kv` table** — deliberate (see `ARCHITECTURE.md`) but it puts customer IdP credentials in the application database. |
| `errorEnvelopeMiddleware` is dead code | Open | `app.ts` mounts `errorMiddleware` first; it always responds and never calls `next(err)`, so the envelope middleware after it never runs. The documented `{error:{code,message,requestId}}` contract is never delivered — no error response carries a `requestId`, so a customer reporting an error has nothing to correlate against the logs. No test asserts it, which is why it survived. |
| `compile()` binds NULL for unmatched `@named` params | Open (latent) | `src/shared/db.ts` silently binds `undefined` → NULL when a placeholder has no matching key. Already caused a total module outage once (`customer_invoices.create()`, iteration 19 — every invoice creation with lines 500'd). Invisible until a specific write path is exercised. |
| Job tick runs **daily** | Open | `vercel.json` schedules `/jobs/tick` at `0 6 * * *`, so worst-case latency for outbox redelivery and every scheduled job is ~24h. Left unchanged deliberately: Vercel Hobby permits only daily crons. If the backend is on Render, the `crons` block should be **deleted**, not tuned — see ADR-010. |

## How to keep this file honest

- Before adding an item: `grep` the relevant module/route, don't just recall an old assessment.
- Before removing an item: confirm via a real request/test, not a code skim (a route existing doesn't mean it's wired end-to-end — verify the actual call path, the way BE-9's `committed` field looked stale in a comment but was actually live in the query below it).
- This file shrinks over time. If it's not shrinking, something's wrong with how work is being tracked, not with the codebase.
