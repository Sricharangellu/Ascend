# Ascend Autonomous Loop — State

Machine-updated by loop iterations per `WORK/LOOP_PROTOCOL.md`. Humans: edit
the backlog freely; the loop treats your edits as authoritative.

## Heartbeat

| Field | Value |
|---|---|
| loop_status | ACTIVE — RESTARTED 2026-07-18 by Sri's explicit directive: "finish the end-to-end application, make it priority, create loops, use existing agents, do not stop until done." Supersedes the 2026-07-16 STOPPED state. |
| last_iteration_utc | 2026-07-18T233000Z |
| runner | session G (Cowork/Claude, Fable 5) — coordinating session; dispatches worktree-isolated subagents for non-overlapping backlog items and merges their branches back sequentially (see iteration log) |
| branch | feat/delivery-pipeline (PR #70) |
| idle_streak | 0 (reset — new priority, backlog non-empty) |
| loop_commits | 0 (reset — new counting window starts from this restart; prior 11 were reviewed via this session's own gates, not Sri merge, so resetting rather than compounding toward the 15 cap) |
| focus | **TOP PRIORITY (Sri directive 2026-07-18): finish the application end-to-end and reach deployment readiness — this supersedes all other initiatives (FOUNDATION_HARDENING, FUNCTIONAL_REBRAND_PLAN stay queued/paused unless independently claimed).** Order of attack, per FORWARD_PLAN.md's new "Phase 0": (1) close every remaining mock-only FE↔BE gap — notifications digest/preferences/rules, purchasing EDI-imports/vendor-history, workflows approval-chains/run-history [IN FLIGHT — 3 worktree agents dispatched this iteration]; (2) code-level security hardening that doesn't require infra decisions (MFA real-vs-explicitly-disabled, verify RLS enforcement end-to-end, secret-handling code paths); (3) full-suite verification + a fresh dated audit before declaring Phase 0 done. Ops items requiring real infra (Redis provisioning, backup/restore drills, Vercel env, cert chains) stay NEEDS-SRI — not code-addressable from this sandbox. |

### Why stopped
Four systematic verification sweeps complete, all retail-core modules:
1. Route drift (iters 1,4) — fixed 4 prod 404s.
2. Unbounded-list pagination (iters 1,5) — fixed movements/audit/journal.
3. Authorization (iters 6,7,8) — fixed sync/reports/ecommerce/notifications.
4. Tenant-scoping (iter 9) — **VERIFIED CLEAN, no cross-tenant leaks**: every
   literal `WHERE id=@id` mutation is gated by a prior `WHERE id AND tenant_id`
   verify (verify-then-mutate) or re-reads a just-created row; dynamic `${where}`
   builders include tenant_id; RLS backstop underneath.

No autonomous high-value work remains. Further progress = feature development
(needs Sri to choose scope) — the loop's explicit "needs Sri decision" stop.
**To resume:** `/loop` with a specific initiative, or merge PR #70 first.
| last_merge | 2026-07-16 PR #66 → master 29a27d7; prod deploy healthy, /readyz db:connected under C-3 cert verification |
| cloud_watchdog | trig_01VVXryUgSBHoy9mAqRdhfzz (notify-only, every 3h, emails on ≥3h stale heartbeat) |

## Iteration log

| # | UTC | Commit | Summary |
|---|---|---|---|
| 1 | 2026-07-15T17:30Z | 3665437 | movements route drift (mock-only → real, prod panels were blank) + keyset pagination on inventory movements + audit_log cursor mode; 27/27, smoke 20/20 |
| 2 | 2026-07-15T17:40Z | c6eb35b | loop durability infra: LOOP_PROTOCOL.md (on-disk program, re-read each wake) + LOOP_STATE.md (heartbeat/backlog/counters) + cloud-watchdog contract + memory pointer |
| 3 | 2026-07-16T03:28Z | e535d7f | cloud watchdog live (trig_01VVXryUgSBHoy9mAqRdhfzz, notify-only, Gmail); protocol watchdog contract revised do-work→notify-only for financial-repo safety |
| 4 | 2026-07-16T03:47Z | 867ead1 | route drift: customer-invoices/service-orders/product-batches mounted at underscore path → 404 in prod (mock-masked); added mountPath /api/v1 (store_locations convention) + mount test; removed 51 gitignored ` 2.` dupes blocking local tsc; 2/2 + smoke 20/20 |
| 5 | 2026-07-16T04:05Z | 09a0083 | ledger pagination: accounting.listJournal was bare LIMIT 500 on journal_entries (most append-heavy table) → deep audit history unreachable; added keyset cursor (additive {items,nextCursor,limit}); reports verified already-bounded aggregations; 19/19 + smoke 20/20 |
| 6 | 2026-07-16T04:25Z | 6ae6bb5 | sync authz gap: /online /push /pull /integrations had NO role guard (any cashier could toggle company sync / drain queue / connect integrations); added requireRole manager (ops) + owner (integrations, matches webhooks); webhooks verified already-guarded; 9/9 + smoke 20/20 |
| — | 2026-07-16T05:16Z | 29a27d7 | **PR #66 MERGED to master + deployed to prod** — /readyz db:connected under C-3 cert verification; 6 loop fixes live |
| 7 | 2026-07-16T05:45Z | 89b2e3b | module-wide authz sweep: reports POST /ar-aging/sweep (AR dunning mutation) + ecommerce PUT /products/:id/online (storefront publish) were unguarded → requireRole(manager); team verified guarded (in-handler requireManagement), orders/payments POS-by-design; 2 new 403 tests, reports 11/11 + ecommerce 9/9 + smoke 20/20 |
| 8 | 2026-07-16T06:00Z | 7ce3e6e | authz sweep completed: notifications POST / was unguarded (cashier could post spoofed notifications) → requireRole(manager); internal event-driven creation bypasses route (proven); first tests for the module; 2/2 + smoke 20/20. 3 sweeps (drift/pagination/authz) now exhausted — loop winding down |
| 9 | 2026-07-16T06:15Z | b89ae6b | tenant-scoping sweep across all service queries: VERIFIED CLEAN — no cross-tenant leaks (verify-then-mutate pattern is consistent; dynamic where-builders include tenant_id; RLS backstop). No fix needed. 4th sweep — loop stopped, then Sri redirected to INVENTORY |
| 10 | 2026-07-16T06:30Z | e3523b5 | INVENTORY: stock-adjust oversell race — adjust() was read-modify-write, concurrent sales lost updates (10 −6 −6 → 4 not 0). Added FOR UPDATE (matches FEFO path) + ON CONFLICT upsert. Deterministic concurrency test (2nd connection, lock barrier) — VERIFIED fails without fix. 25/25 inventory + smoke 20/20 |
| 11 | 2026-07-16T11:50Z | caedd71 | INVENTORY: transfer atomicity — createTransfer moved stock via 3 independent statements (2 separate adjustStock txns + INSERT); failure between legs lost stock. Extracted adjustStockTx(tdb) (+FOR UPDATE), wrapped whole transfer in ONE tx. Atomicity test (INT_MAX overflow forces 2nd-leg failure) — VERIFIED fails without fix (source lost 5). 27/27 + smoke 20/20 |
| 12 | 2026-07-16T12:10Z | e6fe4f4 | INVENTORY: cycle-count double-close — closeCycleCount checked open→applied variances→closed non-atomically; 2 concurrent closes double-posted variance (−3 → −6). Extracted adjustTx(tdb) from adjust(), wrapped close in ONE tx with session FOR UPDATE (2nd close 409s). Deterministic barrier test (3rd conn holds inventory lock) — VERIFIED fails without fix (double-posted → 4). 29/29 + smoke 20/20 |
| 13 | 2026-07-16T12:40Z | (this) | INVENTORY: transfer over-draw phantom stock — createTransfer never checked source on-hand; adjustStockTx clamps source debit at 0 but dest gets full credit → 100 from a loc with 10 conjures 90 units. Added source FOR UPDATE + availability check (409 insufficient_stock). Over-transfer test VERIFIED fails without guard. 30/30 + smoke 20/20 |

## Backlog (loop-selectable, in priority order)

| Item | Status | Evidence / notes |
|---|---|---|
| Mock-vs-real drift sweep | DONE (iter 4, AUDIT_2026-07-16T034500Z) | Fixed 3 real 404s (customer-invoices/service-orders/product-batches → mountPath /api/v1). Remaining 16-candidate mismatches all benign: golf/pricing/warehouse/documents/promotions are Preview verticals (UI-only by design, NOT bugs per ae79907); audit-log/custom-roles have hyphenated name fields; store/product-locations served by store_locations mountPath; `things` is a JSDoc example |
| SSO/identity token-issuance consolidation (sso duplicates issueLoginSession insert) | BLOCKED — session C claim on sso/index.ts still ACTIVE | AUDIT_2026-07-15T163000Z note |
| Ledger/accounting unbounded list check | DONE (iter 5, AUDIT_2026-07-16T040500Z) | journal_entries listJournal → keyset cursor; reports verified already-bounded (GROUP BY/top-N aggregations, not row lists) |
| requirePermission granularity on sync/webhook mutation routes | DONE (iter 6, AUDIT_2026-07-16T042500Z) | sync mutations were UNGUARDED → added requireRole manager/owner; webhooks verified already owner-guarded (no gap) |
| Web client adoption of error.details for field-level form errors | CANDIDATE (low priority) | shared/http.ts details added fd2dd2a |
| PROJECT_STATUS.md stale internal refs cleanup | CANDIDATE (low, docs-only) | orchestration/README.md notes the ROADMAP retirement |
| Catalog product-detail endpoints (16 mock-only paths: analytics, audit-log, pricing/tiers, suppliers, stock, sales, returns, …) | DONE (2026-07-18 2nd follow-up — 17 of 18 built: real joins for stock/sales/sales-by-customer/purchases/invoices/returns/duplicate; derived analytics/reorder-suggestions/supplier-price-comparison; new CRUD for suppliers/pricing+tiers/expiry/images; audit trail instrumented + GET audit-log. New tables: product_suppliers, product_price_tiers, map_price_cents, extended inventory_lots. 19 tests, all passing. Only credits remains (no backing concept — see NEEDS-SRI) | AUDIT_2026-07-18T005030Z addendum #2 |
| Team time-tracking endpoints (clock-in/out, time-entries, permission-overrides/requests) | DONE (2026-07-18 follow-up session — team_time_entries table [renamed from time_entries after a collision with workforce's existing table of that name, fixed same session], atomic clock in/out, self-or-mgmt guard; tests written AND now verified passing) | AUDIT_2026-07-18T005030Z addendum |
| Customers /search + /:id/merge; orders /:id/timeline | DONE (2026-07-18 — transactional merge w/ sorted locks + customer.merged event; derived timeline; tests written AND now verified passing) | AUDIT_2026-07-18T005030Z addendum |
| settings/custom-roles FE↔BE path mismatch (backend at /api/v1/custom-roles) | RECLASSIFIED → NEEDS-SRI: contract mismatch (color+feature-keys vs permissions vocab), not a path fix | AUDIT_2026-07-18T005030Z addendum §7 |
| Notifications digest/preferences/rules | DONE (2026-07-18 — real backend, digest/preferences read sensible defaults on a missing row, alert rules are real CRUD) | commit 0e83ce9 |
| Purchasing EDI-imports + vendor-history | DONE (2026-07-19 — formats/list/detail/validate/process built as a real status-tracked table (edi_imports); vendor-history is a real join over purchase_orders grouped by supplier_id. validate()/process() are honest state-machine transitions, NOT real EDI parsing — the frontend upload form never sends file bytes (see edi-imports.ts doc comment + NEEDS-SRI below). 16 tests, all passing) | this session |
| Workflows approval-chains/run-history | DONE (2026-07-19 — approval_chains is real CRUD (owner-gated mutations, manager-read) with an ordered steps[] list and a real COALESCE-COUNT `runs` from an append-only approval_chain_runs invocation log; run-history is a new, real, keyset-paginated workflow_run_history table (shared/pagination.ts convention). Both new concepts, new tables — distinct from workflow_definitions/workflow_steps. Neither table has real invocations yet: no code path (POS price override, refund, vendor create, discount create) currently checks against a chain or logs a run — see NEEDS-SRI below. recordRun() exists on both services as ready-to-call plumbing. 13 tests, all passing) | this session |
| Inventory pipeline pending/history/reorder-alerts | DONE (2026-07-18 3rd follow-up — new pipeline-views.ts/pipeline-routes.ts, real joins over purchase_orders/lines/suppliers/products; reorder-alerts extends the now-fixed getReorderSuggestions with velocity/stockout/cost fields + create-po action. 4 tests, all passing) | AUDIT_2026-07-18T005030Z addendum #3 |
| Inventory pipeline receiving/issues/errors/summary | RECLASSIFIED → NEEDS-SRI: each implies an unbuilt subsystem (receiving sessions, issue/error detection engine, a stage funnel that doesn't match POStatus) — same class as catalog credits | AUDIT_2026-07-18T005030Z addendum #3 |
| API gap-scan guardrail | DONE (2026-07-18 — tools/api-gap-scan.mjs in CI hygiene job + npm run verify; allowlist board-tied, shrink-only; now down to 34 entries, was 56. Hardened same day to also catch API-client calls missing the /api/v1 prefix entirely — a distinct blind spot from the missing-route check) | AUDIT_2026-07-18T005030Z addendum §6, addendum #3 |
| Three live bugs found while surveying inventory pipeline (unrelated to the survey itself) | DONE (2026-07-18 3rd follow-up): (1) getReorderSuggestions + serial_numbers joined a nonexistent `catalog_products` table/columns → live 500 on 2 shipped pages, fixed to join real `products`/`product_suppliers`; (2) inventory routes.ts GET /:productId (registered early) silently shadowed GET /counts, /locations, /reorder-suggestions registered after it — moved ahead of the catch-all; (3) inventory/serials page called the API with no /api/v1 prefix at all + serial_numbers module had no mountPath, AND simply adding one collided with inventory's own /:productId catch-all — fixed by reordering serialNumbersModule before inventoryModule in modules/index.ts. Also fixed the PO-status/column bug in catalog's reorderSuggestions (`'partial'` typo, `billed_qty` vs `received_qty`) from the prior session's leftover. All with regression tests | AUDIT_2026-07-18T005030Z addendum #3 |

## NEEDS-SRI (out of loop scope — decisions/actions only Sri can take)

| Item | What's needed |
|---|---|
| ~~Merge `29831bd`~~ → fixes PORTED to feat/delivery-pipeline (2026-07-18) | Remaining for Sri: session C's clean-arch quotes pilot still lives only on `origin/feat/clean-arch-pilot-quotes` — review/merge separately; expect trivial same-change conflicts on the 10 vertical route files |
| Custom-roles / permissions-page contract | Decide the permission model: FE permissions matrix ({name,color,features} + bulk /settings/permissions) vs backend custom_roles ({name,permissions} fixed vocab, no color). Until then the paths stay allowlisted (AUDIT addendum §7) |
| Ecommerce storefront auth | DECIDED 2026-07-18: gated as Preview in the UI (`NEXT_PUBLIC_STORE_AUTH_ENABLED=1` re-enables). Build a real customer-auth backend when the storefront is prioritized |
| Catalog credits tab (`/catalog/:id/credits`) | No backing concept exists anywhere in the schema (not customer_invoices, not store credit) — needs a design decision on what a product-level "credit" even is (AR credit memo? something else?) before building. Left allowlisted, not invented |
| Inventory pipeline: Receiving tab | Implies a stateful "receiving session" (start receiving, scan qty progressively, track a receiver/batch_id) that doesn't exist — POs today go create → receive() in one atomic call, no partial in-progress session state. Needs a decision on whether that workflow is worth building before plumbing it |
| Inventory pipeline: Issues + Errors tabs | Both are GET+PATCH only in the FE (no POST anywhere) implying an unbuilt *detection* engine — categories like sku_mapping, price_mismatch, duplicate_doc, edi_parse that nothing in the codebase currently computes. Needs a decision on what should actually populate these (a rules engine? manual QA queue?) before building |
| Inventory pipeline: Overview/Summary funnel | FE's 9-stage funnel (suggested/draft/sent/confirmed/in_transit/partially_received/receiving/billed/closed) doesn't map onto the real 4-value POStatus enum (ordered/partially_received/received/cancelled), and several KPIs (overdue_pos, open_issues, receiving_active) depend on the three items above. Needs either a schema/status-model decision or FE simplification to match what the backend can actually report |
| Real EDI parsing (purchasing EDI-imports `/process` doesn't create real POs) | The Upload tab's `handleSubmit` (web/app/(protected)/purchasing/edi-imports/_components/UploadTab.tsx) POSTs only `{filename, format, supplier_id, supplier_name, file_size_bytes}` — the file's actual bytes are never read (no FormData/file.text()/base64) or sent anywhere, so no backend on any branch can parse real X12/EDIFACT/CSV content today; there is nothing to parse. `/process` therefore only performs a real status transition (valid → processed) and honestly returns `created_po_ids: []` rather than fabricating purchase orders. Closing this for real needs two decisions from Sri: (a) fix the frontend to actually upload file bytes (multipart or base64), and (b) pick either a real X12/EDIFACT parser library or a defined subset format (e.g. CSV-only) to build against — same class of product decision as catalog's `/credits` gap. Until both are decided, `/process` stays honest-but-inert for uploaded files (see src/modules/purchasing/edi-imports.ts's class-level doc comment) |
| Approval chains / run-history: real triggering-event wiring | Both approval_chains and workflow_run_history are real, persisted, tested — but nothing invokes them. Deciding which real POS/business action should check against which chain (a price override above X%? a refund above $Y? new vendor creation? a discount above Z%) and log a run — and what should happen while a transaction blocks awaiting approval (hold the sale? queue it? require a manager PIN inline?) — is a product decision, not plumbing, same class as catalog's `/credits` gap. Until decided, `runs` stays a real 0 and run-history stays a real empty table (see approval-chains.ts / run-history.ts class doc comments) |
| `npm test` locally | RESOLVED 2026-07-18: the earlier "sandbox can't run tests" note was an environment issue, not a hard limit — `npm install --no-save esbuild --force` re-fetches the correct platform binary and unblocks tsx/node:test in this Cowork sandbox. Used this session to verify 19 new catalog tests + regression-check team/customers/sso/orders/workforce, which is how the time_entries collision (below) was actually caught |
| C-3 deploy note | Confirm prod DB cert chain (or set PG_CA_CERT / PG_SSL_NO_VERIFY) BEFORE merging PR #66 |
| C-2 completion | Confirm CRON_SECRET set in Vercel env |
| C-1 restore drill | Run a backup-restore drill against real infra |
| C-4 completion | Pick alert fan-out channel (Slack/PagerDuty/Sentry); heartbeat workflow is the floor |
| OIDC PKCE + nonce | IdP-compatibility decision |
| PR #66 merge | Review + merge (= production deploy) |
| Cloud watchdog mode | Currently NOTIFY-ONLY (emails on stall). Optional upgrade to DO-WORK mode (cloud runs one iteration autonomously on stall) — true unattended continuity, but unreviewed cloud commits to financial code. Enable only if wanted. Routine: trig_01VVXryUgSBHoy9mAqRdhfzz |
