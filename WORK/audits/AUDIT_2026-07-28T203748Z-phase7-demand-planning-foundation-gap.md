# Ascend — Phase 7 Candidate: Demand Planning Foundation — Gap Analysis

Date: 2026-07-28
Trigger: after Phase 6 (procurement intelligence — MOQ/pack-size rounding,
safety stock, promised delivery date; see
`WORK/audits/AUDIT_2026-07-28T194619Z-phase6-procurement-intelligence-completion.md`)
shipped and was reviewed, Sri proposed a **Phase 7 candidate — "Demand
Planning Foundation"** ahead of any real forecasting/ML: a sales-velocity
service, demand-snapshot shape, and forecast-accuracy framework, explicitly
**not** introducing ML yet ("build the forecasting contract first"). Sri
chose to run a gap analysis first, mirroring how Phase 6 started — **no code
changed to produce this document.**

Basis: direct code inspection of every place in the codebase that currently
computes a demand/velocity signal (`catalog/detail-views.ts`,
`inventory/pipeline-views.ts`, `inventory/service.ts`, `insights/service.ts`,
`purchasing/service.ts`), the schema tables that could back a sales-velocity
service (`orders`, `order_lines`, `inventory_movements`, `inventory_stock`),
and the `reports`/`insights` modules for anything resembling a
forecast-accuracy (predicted-vs-actual) concept.

---

## 1. Finding: demand-signal logic is already duplicated five ways

Before Phase 6, "how much do we expect to sell" was computed independently in
at least five places, each with its own lookback window and formula. Phase 6
unified three of them (all three surfaces that feed the reorder-suggestion
UIs Phase 6 touched); the other two were out of scope for Phase 6 and remain
divergent:

| Surface | Module | Lookback | Formula | Touched by Phase 6? |
|---|---|---|---|---|
| `reorderSuggestions()` | `catalog/detail-views.ts` | 30 days | `avgDaily = units/30`; target = `reorder_qty` or `ceil(avgDaily*14)`; + safety_stock; MOQ/case_pack rounded | Yes |
| `reorderAlerts()` | `inventory/pipeline-views.ts` | 30 days | same shape as above | Yes |
| `getReorderSuggestions()` | `inventory/service.ts` | none (no velocity fallback) | target = `reorder_pt` + `safety_stock`; MOQ/case_pack rounded | Yes |
| `reorderRecommendations()` | `insights/service.ts` | **90 days** (default param) | `velocityPerDay = units/90`; `daysOfStock = stock/velocityPerDay`; no safety stock, no MOQ/case_pack rounding, no promised-delivery-date | **No** |
| `priceHistory()` (per-PO-line suggested qty) | `purchasing/service.ts` | **90 days** | `target = reorder_point + velocityPerDay*lead_time_days`; floored by `reorder_quantity`; no safety stock, no MOQ/case_pack rounding | **No** |

`orderRecommendations()` (also in `insights/service.ts`, a *different* method
— "top sellers," 30-day default) is a sixth, adjacent computation: total
units/revenue sold per product over a window, for ranking rather than
reordering. Listed for completeness, not counted as a duplicate of the
reorder-quantity logic above.

**Why this matters for Phase 7:** building a single "sales velocity service"
is not just a nice-to-have consolidation — it is the only way to stop this
number from growing to six-plus independent, silently-diverging
implementations. Any Phase 7 work should have all five (six, counting
`orderRecommendations()`) of the surfaces above as its migration targets, not
just a subset. Building a new, seventh implementation without retiring the
old ones would make the fragmentation worse, not better.

## 2. Finding (critical, pre-existing, unrelated to Phase 6): a live button calls a broken endpoint

While tracing the `insights/service.ts` surface above, `createReorderPOs()`
(wired to the "Create Draft POs" button on the live `/insights` →
Forecasting tab, `web/app/(protected)/insights/_components/
ForecastingTab.tsx`) was found to:

- `INSERT INTO po_lines (...)` — **`po_lines` does not exist anywhere in the
  schema.** The real table, created by the purchasing module
  (`src/modules/purchasing/index.ts`), is `purchase_order_lines`. Every call
  to this endpoint will throw a Postgres "relation does not exist" error.
- `INSERT INTO purchase_orders (..., supplier_name, notes, created_by,
  expected_date, ...)` — several of these columns (`supplier_name`, `notes`,
  `created_by`) are not present on the real `purchase_orders` table as
  defined in `purchasing/index.ts` either (that table is
  `id, tenant_id, supplier_id, status, total_cost_cents, created_at,
  received_at`, plus additive columns from later `ALTER TABLE`s such as
  `po_number`/`receive_status` — `supplier_name`/`notes`/`created_by` were
  not found in any migration).
- Generates its own PO number (`` `AUTO-${now.toString(36)...}` ``) instead
  of the shared, race-free `shared/docnumber.ts` primitive every other PO
  path uses, and hardcodes `unit_cost_cents = 0` / `line_cost_cents = 0` for
  every line (no cost data is looked up at all).
- Bypasses `purchasing.createOrder()` entirely — none of Phase 6's
  safety-stock/MOQ/case-pack rounding, none of the approval-status gating
  the real PO creation path enforces, and none of the accounting-ledger
  posting `createOrder()` triggers on receipt would apply to a PO created
  this way (if it could complete at all).

**Correction (added after the standalone bug-fix claim below was completed):**
the module itself is not untested — `insights.test.ts` and
`health-scores.test.ts` both exist and cover scheduled reports, the
`/reorder` and `/order-recommendations` GETs, and health scores. The
original claim above was based on a Glob search rooted in the wrong working
directory. What's actually true, and still the reason this shipped
unnoticed: `createReorderPOs()` specifically had zero test coverage — no
test in either file ever called `POST /create-reorder-pos`. This is a
standalone, currently-live bug, not something introduced by or in scope for
Phase 6; flagging it here because it was found while auditing the same
"reorder recommendation" surface area Phase 7 would touch, and because it
directly overlaps: `insights/service.ts`'s `reorderRecommendations()` is one
of the two un-migrated demand-signal surfaces from Finding 1 above.

**Recommendation:** treat this as a bug-fix decision independent of Phase 7's
scope-approval — Sri should decide whether to (a) fix `createReorderPOs()` to
route through `purchasing.createOrder()` (recommended — reuses the hardened,
tested path and inherits Phase 6's improvements for free), or (b) remove the
button/endpoint until Phase 7 consolidation happens anyway. Not fixed in this
audit; no code was changed.

## 3. What already exists that a sales-velocity service could reuse

No new tables are required to compute historical demand at a daily grain —
the raw data already exists and is already queried this way in one place:

- **`order_lines` / `orders`** (`src/modules/orders/index.ts`): every sale is
  a row with `product_id`, `quantity`, `line_cents`, joined to `orders` for
  `created_at` and `status`. `orders.store_id` (added via an additive
  `ALTER TABLE`, nullable for legacy rows) gives a location dimension at the
  order level — every `order_lines` row inherits its order's `store_id` via
  the join, so per-location demand history is derivable without a schema
  change.
- **`inventory_movements`** (`src/modules/inventory/index.ts`): a global,
  append-only ledger (`delta`, `reason`, `ref`, `created_at`) — every
  `reason = 'sale'` row is an independent, already-durable historical demand
  event. Not location-scoped (unlike `inventory_stock`), but a real
  time-series source distinct from `order_lines` (covers adjustments/returns
  too, useful for reconciliation).
- **`catalog/detail-views.ts`'s `analytics()` method already computes a real
  daily-grain trend**: `(o.created_at / 86400000) * 86400000` buckets units
  and revenue per day per product, for a caller-selected period
  (`7d`/`30d`/`90d`/`12m`). It also already computes a genuine ABC
  classification (cumulative revenue-share Pareto ranking across all
  products in the same window — `abcClass = pct<=0.2 ? "A" : pct<=0.5 ? "B" :
  "C"`). This is the strongest existing building block in the codebase for a
  "sales velocity service": the query shape is right, it's just scoped to
  one product per call (not batchable) and computed fresh on every request
  (not materialized/stored anywhere), so it can't yet be reused as a shared
  service by the other five surfaces in Finding 1.
- **`inventory_stock`** (`src/modules/inventory/index.ts`) is location-scoped
  (`tenant_id, location_id, product_id` primary key) but is a **live
  current-state table**, overwritten in place (`updated_at`, no history
  retained) — it can tell you today's on-hand per location, not what demand
  looked like last month per location. Its own `reorder_level`/
  `reorder_quantity` columns are dead (never written by any route, per the
  Phase 6 completion audit) — not usable as-is for anything.

**Conclusion:** a first-cut sales-velocity service is a consolidation/
generalization of `analytics()`'s existing query shape (batch it across
products, extract it into a shared module, let the five reorder-suggestion
surfaces and the two `insights` methods all call it) rather than new
plumbing over raw tables. This matches the "no new tables without need"
principle Sri validated after Phase 6.

## 4. What is a genuine gap: forecast accuracy, demand snapshots

Two of Sri's three proposed Phase 7 pieces have **no existing counterpart
anywhere in the codebase** — confirmed by grepping `forecast`, `predicted`,
`variance_pct` across `src/modules/reports` and every other module (zero
matches outside this audit and `WORK/FORWARD_PLAN.md`'s own prose):

- **Demand snapshot (SKU × location × period, historical demand +
  forecast period).** Nothing stores a forecast value anywhere today — every
  surface in Finding 1 computes a live number from a formula each time it's
  called; none of them are ever compared against what actually happened.
  This genuinely needs a new table if "forecast period" is to mean anything
  more than "the number `analytics()` would return right now."
- **Forecast accuracy framework (predicted qty, actual qty, variance %).**
  Same conclusion — this requires persisting a prediction at the time it was
  made, then a later job to compare it against realized `order_lines`/
  `inventory_movements` data. No existing table or job does anything like
  this.

Both are legitimate new-schema work, not something to derive from existing
tables — unlike the sales-velocity service in §3.

## 5. Proposed phased breakdown (for Sri's approval — not started)

Mirroring Phase 6's discipline (each item complete, tested, and
regression-clean before the next starts; no ML yet, per Sri's own framing):

1. **Consolidate the sales-velocity computation** into one shared,
   batchable function (generalizing `analytics()`'s existing daily-bucket
   query), and migrate the two un-migrated surfaces from Finding 1
   (`insights.reorderRecommendations()`, `purchasing.priceHistory()`'s
   suggested-qty calc) onto it — bringing all five/six demand-signal call
   sites down to one implementation, one lookback-window convention. No new
   tables.
2. **Demand snapshot table** (SKU, location where available, period,
   historical demand, forecast period) — additive migration, populated by a
   scheduled job reading from the consolidated service in item 1. This is
   where "forecast period" starts meaning something persisted rather than
   computed fresh each time.
3. **Forecast accuracy framework** (predicted qty, actual qty, variance %) —
   depends on item 2 existing first (needs a persisted prediction to compare
   against); a comparison job runs after each period closes.
4. **Replace the current reorder placeholder carefully** — only after 1–3
   are shipped and regression-clean, swap the "trailing-window velocity" the
   five/six surfaces use for whatever item 1–3 produce, one surface at a
   time, each gated the same way Phase 6 gated its three items.

Deferred beyond this: seasonal adjustment, weighted-average/other forecast
models, any AI/ML model — explicitly out of scope per Sri's own framing
("build the forecasting contract first").

**Separately, and not blocking the above:** the `insights.createReorderPOs()`
bug in Finding 2 is a standalone fix Sri may want prioritized independently,
since it's a currently-broken live button, not new work.

## 6. Not yet decided

This document proposes a shape; it does not commit to it. Per the
established pattern, the next step is Sri's explicit scope approval
(which items, in what order, and whether the Finding 2 bug fix rides along or
is handled separately) before any code changes begin — same as Phase 6's
"audit first, approve scope, then implement item 1" sequence.
