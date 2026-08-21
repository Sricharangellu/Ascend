# Phase 7 Item 4 — Replace reorder placeholder (first surface)

Date: 2026-08-03
Scope: `WORK/FORWARD_PLAN.md` → Phase 7 item 4
Branch: `cursor/phase7-reorder-forecast-demand-57b8`
Depends on: Phase 7 items 1–3 (velocity SoT, `demand_snapshots`, `demand_forecasts` + accuracy)

## Evaluation (per approved Phase 7 framing)

Item 4 said replacing the trailing-window velocity proxy with a “real forecast
engine” gets **evaluated** only after items 1–3. Constraints from the Phase 7
gap audit still bind:

- No ML / seasonal / weighted-average forecast models in this phase
  (“Deferred beyond this”).
- Swap carefully, **one surface at a time**, with velocity remaining a safe
  fallback so existing flows do not regress when no forecast is persisted.

**Decision shipped:** do **not** invent a prediction model. Consume what items
2–3 already produce — a covering row in `demand_forecasts` — as the demand
rate for reorder math; otherwise keep Phase 7 item 1 velocity.

## What shipped

1. **`src/shared/demand-rate.ts`** — `resolveDemandRates()`:
   - Prefer a tenant-wide (`store_id = ''`) forecast whose period covers
     `asOfMs`; newest `created_at` wins when multiple methods overlap.
   - Convert `forecast_units / period_days` → `ratePerDay`.
   - Fall back to `computeSalesVelocity()` for products with no covering
     forecast.
2. **First surface cutover:** `inventory/pipeline-views.ts` `reorderAlerts()`
   now uses `resolveDemandRates` for `avg_daily_sales` / days-until-stockout.
   Additive response field `demand_source: "forecast" | "velocity"`.
3. **Tests:** `demand-rate.test.ts` (5) + one new pipeline reorder-alerts case;
   existing pipeline reorder-alerts cases still green (velocity path unchanged
   when no forecast exists).

## Surfaces not yet migrated (intentionally)

Still on direct `computeSalesVelocity` / non-forecast demand:

- `catalog/detail-views.ts` `reorderSuggestions()`
- `insights/service.ts` `reorderRecommendations()`
- `purchasing/service.ts` `priceHistory()` suggested-qty
- `inventory/service.ts` `getReorderSuggestions()` (uses reorder_pt target,
  not velocity)

Migrate the same way when ready — one surface, same helper, same fallback.

## Verification

| Gate | Result |
|---|---|
| hygiene | pass (1105 files) |
| typecheck | clean |
| `demand-rate.test.ts` + `pipeline-views.test.ts` | **13/13** |

## Status label

`built_verified` (focused gates). Full CI suite runs on the PR.
Explicitly **not** claiming Phase 7 “forecast engine” / ML complete — only the
evaluated cutover for the first reorder surface.
