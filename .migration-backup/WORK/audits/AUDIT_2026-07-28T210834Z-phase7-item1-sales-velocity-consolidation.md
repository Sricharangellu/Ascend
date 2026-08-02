# Phase 7 Item 1 Completion — Sales-Velocity Consolidation

Date: 2026-07-28
Scope reference: `WORK/FORWARD_PLAN.md` → "Phase 7: Demand planning
foundation (approved scope, 2026-07-28)", Item 1. Gap analysis:
`WORK/audits/AUDIT_2026-07-28T203748Z-phase7-demand-planning-foundation-gap.md`,
Finding 1. LOCK claim: `WORK/LOCK.md` → "Phase 7 procurement..." (folded into
the same section as the standalone bug-fix claim above it).

## What shipped

**New shared module:** `src/shared/sales-velocity.ts` —
`computeSalesVelocity()` (batched across products) and
`computeSalesVelocityForProduct()` (single-product convenience wrapper).
Supports daily/weekly/monthly bucketing, a configurable lookback window,
product/location(`orders.store_id`)/category(`products.category`) filtering
— per Sri's exact required capability list. Single correctness contract for
every caller: INNER JOIN `orders` (never LEFT — see why below), `o.status =
'completed'`, and a real `WHERE o.created_at >= @sinceMs` filter.

**All five consumers identified in the gap analysis now call it — no
parallel formula left running:**

1. `catalog/detail-views.ts` → `reorderSuggestions()` — `computeSalesVelocityForProduct()`, 30-day window (unchanged).
2. `inventory/pipeline-views.ts` → `reorderAlerts()` — `computeSalesVelocity()` (already batched), 30-day window (unchanged).
3. `inventory/service.ts` → `getReorderSuggestions()` — **nothing to migrate.** Re-confirmed by re-reading the current method: it computes `suggested_qty` from `reorder_pt + safety_stock` only and has never used a velocity fallback. Listed as a migration target in the approved scope but there is no formula here to consolidate.
4. `insights/service.ts` → `reorderRecommendations()` — migrated, **and this fixed two real, previously-shipping bugs**, not just moved the code:
   - The old query's date filter lived in a `LEFT JOIN orders ... ON o.created_at >= @sinceMs` — a LEFT JOIN never actually excludes on its ON clause (the `order_lines` row survives with `orders` columns NULL either way), so `lookbackDays` had no effect at all; `units_sold` always summed every sale ever placed for a product.
   - The old query had no `o.status = 'completed'` filter anywhere — refunded, open, and cancelled orders all counted as "sold" units.
   - Both are fixed by routing through the shared service, which has never had either bug. The method's structure changed from one SQL query with a `HAVING` clause to a base query (stock/reorder_point/preferred supplier) plus a batched velocity call, with the inclusion filter (`belowReorderPoint` or `projectedStockoutWithinLeadTime`) now applied in application code — the same "fetch then filter in JS" pattern `inventory/pipeline-views.ts`'s `reorderAlerts()` already uses successfully.
5. `purchasing/service.ts` → `priceHistory()`'s suggested-qty calc — migrated, **fixing one real bug**: the old inline subquery had no order-status filter either (same class of bug as #4, independently discovered — these two surfaces never shared code, so the same mistake was made twice).

**Deliberately not unified:** the *number* of lookback days each surface
passes. The three Phase-6 surfaces keep 30; `insights.reorderRecommendations()`
and `purchasing.priceHistory()` keep 90. Sri's approved scope said "one
lookback-window convention," which this satisfies literally — there is now
exactly one function, and the window is one of its explicit parameters, not
a second copy of the query. Standardizing the *value* itself is a real
product decision (shorter windows react faster but are noisier) that wasn't
asked for here and is flagged as a follow-up if wanted.

## Files touched

- NEW `src/shared/sales-velocity.ts`, NEW `src/shared/sales-velocity.test.ts`.
- `src/modules/catalog/detail-views.ts` (import + `reorderSuggestions()`'s
  velocity call only).
- `src/modules/inventory/pipeline-views.ts` (import + `reorderAlerts()`'s
  velocity call only).
- `src/modules/insights/service.ts` (`reorderRecommendations()` restructured;
  this is the same file touched by the standalone `createReorderPOs()` bug
  fix immediately before this item — both are part of the same overall
  session, gated separately as two distinct LOCK entries).
- `src/modules/purchasing/service.ts` (import + `priceHistory()`'s velocity
  subquery only). **Note:** this file is part of the pre-existing,
  unclaimed, uncommitted UOM-conversion working tree flagged in the Phase 6
  claim (`recordUomUnitNotConfigured` import from `gateway/metrics.js` is
  already present, not added by this session). Sri's Phase 7 Item 1 scope
  explicitly named `purchasing/service.ts`'s `priceHistory()` as a migration
  target, so this narrow, specific edit is in scope — but it means this
  file's working-tree diff is now a mix of the pre-existing UOM changes and
  this session's velocity-consolidation changes. Only the `priceHistory()`
  method's velocity subquery and the new import line were touched; nothing
  UOM-related was read or modified.
- NEW test coverage: 9 tests in `sales-velocity.test.ts` (batching,
  product/location/category filters, status/date-window correctness, all
  three bucket types, the convenience wrapper), 1 new regression test in
  `insights/insights.test.ts` proving the date/status bug fix, 1 new
  regression test in `purchasing/purchasing.test.ts` proving the status bug
  fix.

## Gates

- `npm run typecheck` — clean.
- `npm run gap:scan` — clean (456/381 paths, 21 allowlisted — unchanged; no
  route/contract changes, only internal computation).
- `npm run table:scan` — clean (161 table names, no new tables).
- `npm run hygiene` — clean (1084 files scanned).

## Tests (real Postgres, via scratch runners)

- `src/shared/sales-velocity.test.ts` — 9/9 (new: batching, productIds
  filter, status/date correctness, storeId filter, category filter, day
  bucket, month bucket, convenience wrapper × 2).
- `catalog/detail-views.test.ts` — 25/25 regression (unaffected — same 30-day
  window, same output for existing scenarios; nothing in this file exercises
  the specific bugs being fixed since its own tests never used refunded/
  stale-date sales in reorder-suggestion scenarios).
- `inventory/pipeline-views.test.ts` — 7/7 regression.
- `insights/insights.test.ts` — regression + 1 new bug-fix test, run
  together: 8/8 (`GET /reorder`, `GET /order-recommendations`, all 5
  `create-reorder-pos` tests, plus the new velocity bug-fix test).
- `purchasing/purchasing.test.ts` — targeted subset covering every test that
  touches `price-history`: 5/5 (date-range filter, suggested-qty-from-
  reorder-point, price intelligence, qty-break filter, plus the new
  status-filter bug-fix test). Did not re-run the full 30+-test file — no
  other method in that file was touched.

## Outstanding for Sri

Same limitation as every other entry in `WORK/LOCK.md`: no GitHub push
credentials in this sandbox. Also worth flagging again: the pre-existing
UOM-conversion working tree is still uncommitted and now shares a file
(`purchasing/service.ts`) with this session's changes — reviewing the diff
before committing will show both sets of changes interleaved in that one
file; the velocity-consolidation portion is confined to `priceHistory()`'s
velocity subquery and one import line.
