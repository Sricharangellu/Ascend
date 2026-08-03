# Phase 7 Item 3 Completion — Forecast Accuracy Framework

Date: 2026-08-03
Scope: `WORK/FORWARD_PLAN.md` → Phase 7 item 3
Branch: `cursor/phase7-forecast-accuracy-57b8` (on top of rebased PR #121 tip)
Depends on: Phase 7 item 2 (`demand_snapshots`) — PR #121

## What shipped

Measurement layer **before** any forecasting model:

1. **New table `demand_forecasts`** — persists predicted units for a
   (tenant, product, store, period_type, period_start, method). Upserts on
   that unique key so re-recording the same method replaces the qty.
2. **`DemandPlanningService.createForecast` / `listForecasts` /
   `getForecastAccuracy`** — accuracy joins closed-period forecasts against
   `demand_snapshots` actuals (sum of daily rows in `[periodStart, periodEnd)`).
3. **Metrics** (`computeAccuracyMetrics`, exported + unit-tested):
   - `varianceUnits = actual − forecast`
   - `variancePct = (variance / forecast) × 100` (`null` if forecast=0 and actual≠0)
   - `accuracyPct = 100 × (1 − |Δ| / max(actual, forecast, 1))`, floored at 0;
     both-zero → 100
4. **Routes** (on `/api/v1/demand-planning`):
   - `POST /forecasts` (manager-gated)
   - `GET /forecasts?periodType=&from=&to=&productId=&storeId=`
   - `GET /accuracy?periodType=&from=&to=&productId=&storeId=`
5. Open periods are **skipped by default** (`closedOnly: true`) so a day still
   accumulating sales is never scored as a false miss.

Explicitly **not** in this item: ML/seasonal models, replacing reorder
velocity with forecasts (Phase 7 item 4), or any FE UI.

## Verification

| Gate | Result |
|---|---|
| hygiene | pass (1102 files) |
| table:scan | 163 names, no collisions (+1 `demand_forecasts`) |
| gap:scan | 460/381, 21 allowlisted, clean |
| typecheck | clean |
| `demand-planning.test.ts` | **10/10** (6 item-2 + 4 item-3) |

## Status label

`built_verified` (focused gates). Full CI suite runs on the PR.
