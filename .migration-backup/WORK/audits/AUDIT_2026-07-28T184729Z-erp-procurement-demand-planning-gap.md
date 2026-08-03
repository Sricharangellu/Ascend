# Ascend — ERP Procurement / Demand-Planning Gap Analysis

Date: 2026-07-28
Trigger: Sri supplied a generic "ASSCEND Enterprise Demand Planning & Procurement
Engine" master prompt (SAP/Oracle/Dynamics/NetSuite-scale spec: demand
forecasting, supply planning, purchase planning, PO lifecycle, receiving, lot/
expiry, buyer workspace, supplier performance, AI procurement assistant).
Sri chose **"gap analysis first"** over building any code — this document is
that analysis: what of the spec Ascend already has, what's genuinely missing,
what's already an open NEEDS-SRI decision blocking part of the spec, and a
proposed phased path. **No code was changed to produce this document.**

Basis: direct code inspection of `src/modules/purchasing`, `src/modules/
inventory`, `src/modules/catalog` (detail-views), `src/modules/workflows`,
`src/modules/insights`, `src/modules/ai_assistant`, `src/modules/accounting`,
plus the prior benchmarking work already on file:
`GAP_2026-07-13-erp-architecture-benchmark.md` and
`GAP_2026-07-13-retail-product-module-benchmark.md` (both still current — no
purchasing/inventory schema has changed shape since, only additive work:
requisitions, EDI-imports, vendor-history, pipeline-views, AI assistant).

Full backend module list as of this date is unchanged from `WORK/LOCK.md`'s
latest entries — see that file for the live claim state (clear as of this
audit: last claim, AI Assistant, is RELEASED).

---

## 0. Reading the master prompt honestly

The supplied prompt describes a generic best-in-class ERP procurement suite,
not an Ascend-specific spec — it never mentions Ascend, its module names, or
its architecture. Several of its explicit "critical requirements" already
conflict with decisions this repo has made deliberately and on the record:

- *"Do not simplify features," "build enterprise-grade comparable to
  SAP/Oracle/Dynamics/NetSuite/Infor"* — `WORK/FORWARD_PLAN.md`'s standing
  position is the opposite: "the right move is not to keep adding more pages
  ... too much feature breadth too early ... narrow temporarily." That
  document was written from a full-repo audit and is still the active
  plan (Phase 0 exit criteria are the current top priority).
- Large parts of the prompt (real EDI parsing, a stateful receiving session,
  quality-hold/rejected-qty splits, approval-chain triggering) are **already
  identified gaps in this repo**, each deliberately left unbuilt behind an
  explicit NEEDS-SRI entry in `WORK/LOOP_STATE.md` because they are product
  decisions, not plumbing — building them from this generic prompt without
  revisiting those specific decisions would silently overwrite prior,
  Sri-facing analysis.
- The prompt asks for a demand-forecasting *model* (moving averages,
  seasonality, promotion impact, ABC/XYZ, AI recommendations feeding
  quantities). Nothing like this exists in Ascend today — every "reorder
  suggestion" surface is explicit, in its own code comments, that it is a
  trailing-30-day-velocity approximation standing in for a real forecasting
  model, "documented approximation" language that appears three separate
  times in the codebase (catalog, inventory pipeline, AI assistant).

None of that means the prompt is wrong to want these things eventually — it
means adopting it wholesale would re-litigate decisions already made and
recorded, and would violate the repo's own stated engineering discipline
(narrow scope, verified before "done", no ad-hoc planning docs). The rest of
this document maps the prompt's sections onto what's real today.

---

## 1. Demand Planning (prompt §1)

**Status: Not built.** No dedicated demand-forecasting module or table exists
anywhere in `src/modules`. What exists instead, wherever a forecast-shaped
number is needed, is the same one approximation reused three times:

```
avg_daily = units_sold_last_30_days / 30
days_of_stock = current_available / avg_daily
```

Found in `catalog/detail-views.ts` (`reorderSuggestions`,
`reorderRecommendations`), `inventory/pipeline-views.ts` (`reorderAlerts`),
and consumed again by `ai_assistant`'s deterministic signal. All three carry
an explicit code comment admitting there is no dedicated forecasting model.

Missing entirely: weekly/monthly/quarterly/seasonal decomposition, promotion
impact, customer/product trend classification, ABC analysis, XYZ analysis,
true moving-average or exponential-smoothing models, forecast-horizon
selection (today/3d/7d/14d/30d/60d/90d/quarter/year/custom), and forecast
accuracy tracking (nothing records a forecast then compares it to what
actually happened).

**AI recommendations:** the `ai_assistant` module (ADR-005, shipped
2026-07-25) is the one piece of the prompt's "AI procurement assistant"
section that's real — it takes the existing deterministic reorder/low-stock/
expiry/best-and-slow-seller signals and narrates them in natural language via
the Anthropic SDK, with an honest-failure path when no API key is configured.
It explains the *existing* velocity-based signal; it does not compute a
better one. This is a real, tested foundation to extend, not a demand-planning
engine to build from.

## 2. Supply Planning (prompt §2)

**Status: Partial.** The point-in-time inputs mostly exist:

| Input | Status |
|---|---|
| Current inventory (on-hand) | Built — `inventory_stock`, `inventory` |
| Reserved/committed | Built — `quantity_committed` |
| Incoming (open PO qty not yet received) | Built — computed from `purchase_order_lines` where `status IN (ordered, partially_received)` |
| Outgoing transfers | Built — `inventory_transfers` |
| Sales orders / demand | Built as a raw join (last-30-days `order_lines`), not a first-class demand queue |
| Safety stock | **Not built as a distinct concept** — `reorderAlerts`'s own comment says `safety_stock` literally mirrors `reorder_pt`; there is no separate configurable safety-stock field anywhere in the schema |
| Lead time | Built — `product_suppliers.lead_time_days`, `products.lead_time_days` |
| Min/max stock | Partial — `reorder_level`/`reorder_point` exist; no distinct max-stock ceiling |
| Supplier MOQ, pack multiples | Built as *data* (`product_suppliers.moq`, `product_units`/barcode pack sizes) but **not consumed** by any reorder-quantity rounding logic today |

What's missing: **projected inventory by date** — a real curve over a
horizon (today through +90 days, quarter, year) combining the above. Today
every surface answers "what's the number right now," never "what will the
number be on August 18." Building this is the single largest structural gap
between the prompt and reality, and it is the direct prerequisite for
half the rest of the prompt (purchase timing, expected-stockout dates,
projected-inventory-after-delivery).

## 3. Purchase Planning (prompt §3)

**Status: Not built as a formula; a cruder proxy exists.** The prompt's
core formula —

```
Forecast Demand + Safety Stock + Lead-Time Demand − Current Inventory − Incoming
= Recommended Purchase Quantity
```

— is not implemented anywhere. What exists is `suggested_qty` in
`reorderAlerts`/`reorderSuggestions`: falls back to the location's configured
`reorder_quantity` when set, otherwise **14 days of cover at trailing
velocity**. No lead-time-demand term, no safety-stock term (see §2), and —
confirmed by direct inspection — **the suggested quantity is never rounded to
MOQ, pack size, or case quantity** even though `product_suppliers.moq` and
per-unit pack sizes already exist as data. This is a real, cheap, additive
gap: the rounding inputs exist, the rounding step doesn't.

## 4. Purchase Orders (prompt §4)

**Status: Built and verified, more complete than the prompt assumes at a
glance.** This is the strongest area of overlap.

| Prompt requirement | Ascend status |
|---|---|
| Draft / Pending Approval / Approved / Sent / Acknowledged / Partial / Complete / Closed / Cancelled | Partial — real states are `ordered → partially_received → received → cancelled` (fulfillment) crossed with `approval_status: pending/approved/rejected` (approval). There is no true pre-submission "draft" PO (a PO exists in the DB the instant it's created) and no "sent"/"acknowledged" supplier-facing states — POs go straight from created to awaiting-approval-or-approved. |
| Version history / revisions | Not built — no PO revision/versioning table |
| Approval workflow | **Built and verified** — tiered auto/manager/owner approval (`po_approval_config`), append-only audit trail (`po_approvals`), enforced at receive-time (`assertApproved`) |
| Comments | Not built |
| Attachments | **Built** — `po_documents` (name/type/size, no actual blob storage backend visible from this module alone — worth confirming upload target) |
| Email supplier / PDF generation | Not built |
| EDI export/import | **Built as a state machine, not real parsing** — `edi_imports` module tracks queued→validating→valid/invalid→processed/failed; **the frontend never uploads file bytes** (confirmed: `UploadTab.tsx` posts only filename/format/supplier_id metadata), so `process()` honestly returns `created_po_ids: []`. This is an existing, specific NEEDS-SRI (format decision + frontend upload fix), not new information. |
| API integration | Existing webhooks/API-key/integrations plumbing (per `GAP_2026-07-13-erp-architecture-benchmark.md` §12) — generic, not procurement-specific |

Also built beyond what the prompt's PO section explicitly lists: landed-cost
allocation (freight + other charges distributed proportionally across lines),
vendor bills with billing-adjustment lines (a partial three-way match: PO ↔
receipt qty ↔ bill), vendor credits (chargeback/credit memo), vendor returns
(damaged/expired/other, with a `stock.written_off` event), vendor quotes
(RFQ-lite), and **purchase requisitions** (draft→submit→approve/reject→
convert-to-PO) — the prompt doesn't ask for requisitions explicitly but
Ascend already has the full lifecycle, shipped and tested
(`AUDIT_2026-07-14T225200Z-purchase-requisitions.md`).

## 5. Receiving (prompt §5)

**Status: Partial, and the gap is an existing, named NEEDS-SRI.** Receiving
today is a single atomic call (`PurchasingService.receive`): pass
`{lineId, qty, expiryDate?, lotCode?, unitCostCents?, locationId?}` per line,
it increments `received_qty`, captures lot/expiry onto the line, and emits
`purchase_order.received` for inventory to consume. Partial and full receiving
both work and are tested. What's explicitly absent (already recorded in
`WORK/LOOP_STATE.md`'s NEEDS-SRI table, not new information): a *stateful*
receiving session (start receiving → scan progressively → track a
receiver/batch — POs go create→receive in one call, no in-progress session
state), rejected/damaged quantity splits at receive time (vendor returns
exist, but as a *separate*, later action, not a receive-time disposition),
quality hold, over-receipt approval, barcode/QR/ASN/container/batch receiving
UX. Building the session-state model is a real, scoped, code-addressable
project — but it was already flagged as needing Sri's call on whether the
workflow is worth the complexity before building it, and that call still
hasn't been made.

## 6. Inventory (prompt §6)

**Status: Built and verified for the core ledger; lot/location model is
flatter than the prompt's warehouse hierarchy.**

Real and tested: `inventory` (cached qty), `inventory_movements` (immutable
ledger — the tenant's source of truth, reconciled nightly against the cache
by a dedicated job), `inventory_lots` (lot/batch + expiry + manufacture date +
supplier + received date + cost), `expiry_writeoffs`, `inventory_locations`,
`inventory_transfers`, `cycle_count_sessions/lines`. Race conditions in this
exact area (oversell, transfer atomicity, double-close, phantom stock from
over-transfer) were found and fixed in dedicated hardening passes — this is
one of the most rigorously tested parts of the codebase.

Gap vs. the prompt: `inventory_locations` is a flat location concept, not the
prompt's full warehouse → zone → aisle → rack → shelf → bin → container →
pallet hierarchy. Buyer/PO/cost fields are present on `inventory_lots` per
the prompt's list. **Inventory only increases on receive, never on PO
approval** — this exact invariant from the prompt is already true in the
current design (confirmed: `createOrder` never touches `inventory`; only
`receive()` → `purchase_order.received` does).

## 7. Forecast Engine / Inventory Calculations (prompt §7–8)

Already covered by §1–§3 above. Summarizing what's absent as a flat list
against the prompt's per-SKU calculation checklist: Current Stock ✓,
Allocated/Reserved ✓ (as `committed`), Incoming ✓, Outgoing ✓, **Forecast ✗**
(velocity proxy only), Available ✓, **Projected (by future date) ✗**, **Safety
Stock ✗** (not distinct from reorder point), Days Remaining ✓ (`daysOfStock`),
Stock Coverage ✓ (same field), **Reorder Point** ✓ (exists, but not
consuming safety-stock/lead-time-demand), **EOQ ✗**, **Recommended Purchase
Quantity** — proxy exists, not MOQ/pack-aware (see §3).

## 8. Buyer Workspace (prompt) / Supplier Management / Price Comparison / Supplier Performance

- **Buyer workspace: not built.** No concept of "buyer" or per-buyer supplier
  assignment exists in the schema at all — `purchase_requisitions.requested_by`
  and `po_approvals.actor_id` record *who acted*, not a buyer-territory
  assignment model. Bulk PO creation from a planning grid, Excel/CSV
  export of a buyer's queue, and buyer-scoped views are all unbuilt.
- **Supplier management: built, close to the prompt's list.** `product_suppliers`
  gives per-product multi-vendor records (vendor SKU/UPC, lead time, MOQ,
  cost, `is_preferred`); `suppliers` carries terms/tax/compliance fields.
  Missing: contract/blanket-PO pricing schedules (deliberately deferred per
  the 2026-07-13 ERP benchmark — "until blanket POs are asked for"), formal
  quality/delivery/price *rating* scores (raw data to compute them exists;
  no rollup table).
- **Price comparison: built and real.** `catalog.supplierPriceComparison`
  gives per-supplier cost history, 30-day trend direction, and a computed
  best-price supplier — genuinely one of the stronger matches to the prompt
  in the whole codebase. Not present: explicit inflation/landed-cost/freight/
  tax breakdown *within* the comparison view (landed cost exists on the PO
  side, not surfaced here).
- **Supplier performance: partial.** `vendorDetail` computes `fill_rate_pct`
  (received/ordered qty) for real; `on_time_delivery_pct` and
  `dispute_rate_pct` are **hardcoded null** — the comment says "no
  promised-date tracking yet." On-time delivery cannot be computed without
  adding an expected/promised delivery date to the PO, which doesn't exist
  today.

## 9. Lot / Expiry / Location Management (prompt)

Covered above (§6) — lots and expiry are genuinely one of the best-built
areas (FEFO-oriented, automated expiry sweep to a write-off pool, dispositions
via vendor returns). Location hierarchy is flat, not the multi-level warehouse
model the prompt describes — reasonable for current single/few-warehouse
retail scale, a real gap only if a distribution/3PL business pack is prioritized.

## 10. Reporting

Existing reports/insights modules cover sales, inventory, supplier spend at a
basic level (per the 2026-07-13 ERP benchmark, §9). None of the specific
procurement-analytics dashboards the prompt lists (forecast accuracy,
lead-time analysis, buyer productivity, PPV — purchase price variance as a
named report, inventory aging) exist as dedicated views today; the underlying
joins mostly already exist piecemeal (price comparison, fill rate, vendor
spend) and would need to be assembled into report-shaped endpoints.

## 11. Workflows / Approval Chains

`approval_chains` + `approval_chain_runs` + `workflow_run_history` are real,
tested, persisted — and **wired to nothing**. No PO, price-override, refund,
or vendor-creation code path checks a chain or logs a run today. This is
already a named NEEDS-SRI ("which real action should check which chain, and
what happens to a transaction awaiting approval") — directly relevant to the
prompt's "Purchase Orders → Approval workflow" ask beyond the amount-tiered
approval that already works.

---

## 12. Consolidated status table

| Prompt module | Status | Evidence |
|---|---|---|
| Demand Planning (forecast models, seasonality, ABC/XYZ, accuracy tracking) | **Not built** | velocity-proxy comments in 3 files; no forecast/seasonality/ABC code anywhere |
| Supply Planning (projected inventory by date, safety stock) | **Not built** (inputs partially exist) | no date-horizon projection anywhere; safety_stock == reorder_pt |
| Purchase Planning (recommended-qty formula, MOQ/pack rounding) | **Partial proxy, not the formula** | `reorderAlerts`/`reorderSuggestions`; MOQ/pack data unused |
| Purchase Orders (lifecycle, approval, landed cost, requisitions) | **Built and verified** | `purchasing/service.ts`; audits `..._purchase-requisitions.md`, `..._purchase-feature.md` |
| Purchase Orders (draft/sent/acknowledged states, revisions, comments, PDF/email) | **Not built** | states are ordered/partially_received/received/cancelled × approval only |
| EDI import/export | **State machine only, no real parsing** | existing NEEDS-SRI, `edi-imports.ts` doc comment |
| Receiving (partial/over/under, cost capture, lot/expiry) | **Built and verified** | `receive()`, hardening audits |
| Receiving (sessions, quality hold, rejected-qty split) | **Not built — existing NEEDS-SRI** | `WORK/LOOP_STATE.md` |
| Inventory ledger + lots + expiry + transfers + cycle counts | **Built and verified** | multiple hardening audits, reconciliation job |
| Warehouse zone/aisle/rack/bin hierarchy | **Not built (flat location only)** | `inventory_locations` schema |
| Buyer workspace | **Not built at all** | no buyer/assignment concept in schema |
| Supplier management + price comparison | **Built, strong** | `product_suppliers`, `supplierPriceComparison` |
| Supplier performance (on-time %, ratings) | **Partial** | fill rate real; on-time/dispute hardcoded null |
| AI procurement assistant (explain existing signals) | **Built and verified** | `ai_assistant` module, ADR-005, 43/43 tests |
| Approval-chain triggering into real actions | **Built (plumbing) but unwired — existing NEEDS-SRI** | `workflows/index.ts`, `WORK/LOOP_STATE.md` |
| Procurement-specific analytics/reports | **Not built as dedicated views** | underlying joins exist scattered across modules |

---

## 13. What this means for a forward plan (proposal, not applied)

This section is a **proposal for Sri to accept, edit, or reject** — nothing
below has been added to `WORK/FORWARD_PLAN.md` itself; per this repo's own
rule, that file is the single authoritative plan and shouldn't be forked or
duplicated by an audit. If Sri wants this adopted, the right move is folding
a trimmed version of this into a new dated section of `FORWARD_PLAN.md`
(likely a "Phase 6: Procurement intelligence" after Phase 5, sequenced behind
the retail-first / business-pack-control-plane priorities already in flight),
not standing up a second planning document.

Ranked by "cheapest real gap that unlocks the most value," matching this
repo's demonstrated pattern (small, mergeable, gated slices, never a big-bang
rewrite):

1. **MOQ/pack-size-aware rounding on the existing suggested-quantity path.**
   The data (`product_suppliers.moq`, unit pack sizes) already exists and is
   simply unread by `reorderSuggestions`/`reorderAlerts`. Smallest possible
   slice, no new tables, immediately makes existing POs-from-suggestions more
   correct.
2. **A real safety-stock field, distinct from reorder point.** One column +
   a formula change (`recommended_qty = max(0, forecast_demand_over_lead_time
   + safety_stock - available - incoming)`), still using the velocity proxy
   as "forecast_demand" until a real model exists — this alone closes most of
   the gap between today's proxy and the prompt's formula without requiring
   a forecasting engine yet.
3. **Promised/expected delivery date on the PO line.** One column, unlocks
   the one supplier-performance metric that's currently hardcoded null
   (on-time delivery %) and is also the prerequisite for any real "projected
   inventory by date" work later.
4. **Resolve the standing NEEDS-SRI decisions this spec re-raises** before
   building further into their territory: real EDI format + frontend byte
   upload; whether a stateful receiving session is worth building; what
   should trigger an approval-chain run. Building around these without
   deciding them risks the same "spec says build X, repo already has an
   open decision blocking X" collision this audit exists to prevent.
5. **A real demand-forecast model (moving average / exponential smoothing),
   feeding the existing suggestion endpoints** — the actual "Demand Planning"
   module. This is the biggest, most novel piece of the prompt and the one
   with no existing scaffold at all; recommend scoping it as its own phase
   only after 1–3 land, since it's the one place where "comparable to SAP"
   genuinely means new statistical code, not wiring existing data together.
6. **Buyer workspace.** Needs a real product decision (what is a "buyer" in
   this schema — a user role, a new assignment table?) before any UI; lowest
   priority of the concrete gaps since no data model decision has been made.
7. **Projected-inventory-by-date + procurement analytics reports.** Depends
   on 2 and 3 landing first (safety stock, promised dates) to have real
   inputs; would be report-shaped work over data that mostly already exists
   once those two land.

**Explicitly not recommended to build from this prompt as written:** a
warehouse zone/aisle/rack/bin hierarchy (no evidence of multi-location need
at current scale — same "IGNORE" call the 2026-07-13 benchmark already made
for bin locations), PO version/revision history, PDF/email-supplier
generation, and a formal supplier-contract/blanket-PO module — all named in
the prompt but either already explicitly deferred with a reason on file, or
speculative ahead of a real customer need.

---

## 14. Answering the master prompt's own "before coding" checklist

The prompt itself asks for an audit, reusable-component inventory, missing
backend/DB/API list, and roadmap before any code. This document *is* that
audit. Summarizing its own requested structure:

1. **Audit the existing codebase** — done, §1–§11 above.
2. **Identify reusable components** — `purchasing` (suppliers, POs, receiving,
   requisitions, bills, credits, returns, quotes), `inventory` (ledger, lots,
   transfers, cycle counts, reconciliation), `catalog` (product_suppliers,
   price tiers, price comparison, reorder suggestions), `workflows`
   (approval_chains, ready to wire), `ai_assistant` (explanation layer),
   `sequences` (race-free doc numbering) — all directly reusable, none need
   to be rebuilt.
3. **Identify missing backend services** — a real forecast/demand-planning
   service; a projected-inventory-by-date service; buyer-assignment service;
   PPV/lead-time/buyer-productivity report services.
4. **Identify missing database tables** — none required for items #1–3 in
   §13 (column additions only); a `demand_forecasts`/`forecast_history` table
   pair would be needed for item #5; a buyer-assignment table for item #6.
5. **Identify missing APIs** — forecast endpoints, projected-inventory
   endpoint, buyer-workspace endpoints; the rest of the prompt's API surface
   already has a close analog in `purchasing`/`inventory`/`catalog` routes.
6. **Gap analysis** — this document.
7. **Implementation roadmap** — §13 (proposal, pending Sri's sequencing call).
8–10. **Build incrementally, don't regress, validate end-to-end** — this
   repo already enforces exactly this discipline harder than most (`gap:scan`,
   `table:scan`, real-Postgres test requirement, `WORK/LOCK.md` claim
   protocol) — no new process needed, just apply the existing one to
   whichever item Sri picks from §13.

**No code, schema, or route changes were made in this session.**
