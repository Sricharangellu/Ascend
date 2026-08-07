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

## Platform/infrastructure gaps (added 2026-08-06, enterprise platform audit)

Verified by command against this checkout, not carried over from an older doc. Full
evidence: `WORK/audits/AUDIT_2026-08-06T170227Z-enterprise-platform-audit.md`.

| Item | Status | What's actually missing |
|---|---|---|
| Infrastructure as Code | Open — **zero** | No Terraform/Pulumi/`render.yaml`/`fly.toml`/Helm anywhere. Every environment (Vercel projects, the backend host, both Supabase projects, all env vars) is dashboard-only state. Already bit once: the staging Vercel projects were deleted and `scripts/deploy.sh` still holds their IDs. **Deliberately not fixed by that audit** — codifying a host nobody has confirmed would add a *fourth* conflicting picture of production; resolve `DEPLOYMENTS.md` first, then IaC the winner. |
| Nothing scrapes `/metrics` | Open | The endpoint emits correct Prometheus exposition and, since the 2026-08-06 audit, covers DB pool, job-queue depth, outbox backlog, event-loop delay and build sha. **No collector reads it, so none of it is retained or alertable.** This is a configuration task, not an engineering one — Grafana Cloud free tier + `METRICS_TOKEN`. Highest-leverage open observability item. |
| Alert fan-out (C-4) | Open | Still only "a GitHub Actions run went red". No paging, no routing, no on-call, no status page. |
| Load / capacity data | Open — none exists | No load test has ever run. Throughput, p95, and the concurrency at which the pool exhausts are all unknown. For a product pitched on high-volume POS, "how many tills can check out at once" is currently unanswerable. `scripts/smoke.ts` already scripts the full lifecycle — it is ~90% of a k6 script. |
| Restore validation in CI | Open | The backup→restore mechanism was drilled by hand once (2026-08-05) and works. Nothing re-proves it, so the path can rot silently. |
| Down-migrations for module migrations | Open | `db/migrations/` has 3 `.down.sql` files; the 53 module migration sets that actually run at boot have none. Neither rollback mechanism (Vercel promote, `git revert` on `master`) covers a schema change. |
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
- **C-1** — backup restore drill never run against real infra.
- **C-2** — background workers still `setInterval`-based in the general orchestration layer outside the M1.2 job-tick path; runtime move to a long-lived process (Level 5/E3 step 6) not done.
- **C-3** — DB TLS: production connects with `PG_SSL_NO_VERIFY`-style trust in some paths; the *code* supports proper `PG_CA_CERT`/`PG_CA_CERT_B64` verification (used correctly for the new Supabase project this session) but isn't universally enforced yet.
- **C-4** — no alerting between deploys beyond the `uptime.yml` heartbeat.

## How to keep this file honest

- Before adding an item: `grep` the relevant module/route, don't just recall an old assessment.
- Before removing an item: confirm via a real request/test, not a code skim (a route existing doesn't mean it's wired end-to-end — verify the actual call path, the way BE-9's `committed` field looked stale in a comment but was actually live in the query below it).
- This file shrinks over time. If it's not shrinking, something's wrong with how work is being tracked, not with the codebase.
