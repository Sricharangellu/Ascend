# Audit — Dashboard sparklines from live orders

Date: 2026-07-30T221340Z
Agent: Cursor Cloud (`cursor/fix-dashboard-sparklines-4fe7`)
Status: `built_verified` (backend tests + typecheck)

## Problem

`GET /api/v1/reports/summary` filled `sparklines.revenue` / `sparklines.saleCount`
from `daily_sales_summary`. That table is never written — `aggregateDailySales()`
computes the same numbers on demand but does not persist them. Dashboard KPI
sparklines were therefore permanently empty even after real completed sales
(`Sparkline` requires ≥2 points; the CQRS query returned `[]`).

Documented in `docs/architecture/REPORTS_MODULE_REVIEW.md` finding #5; left
deferred as "don't build a CQRS job speculatively." This fix restores the
user-visible trend without inventing that job.

## Fix

`ReportsService.salesSummary` now:

1. Aggregates completed `orders` over the last 8 UTC day-buckets
   (`(created_at / 86400000)::bigint` — portable across embedded PG + PG16).
2. Dense-fills missing days with zeros so the FE sparkline can render after a
   single sale in the window.
3. Leaves `daily_sales_summary` / `product_sales_summary` / `fiscal_periods`
   untouched (future CQRS; flag-don't-drop).

## Docs honesty

- `GAPS.md`: product/inventory review row marked **Shipped** (PRs #106–#108);
  new row for the sparkline fix.
- `REPORTS_MODULE_REVIEW.md` finding #5 + priority matrix updated.

## Verification

| Gate | Result |
|---|---|
| `npm run typecheck` | PASS |
| `src/modules/reports/reports.test.ts` (16/16, incl. new sparkline test) | PASS |
| `npm run gap:scan` | PASS (pre-change; no new FE paths) |

## Not in scope

- CQRS population job for `daily_sales_summary` (still NEEDS-SRI / evidence-gated)
- Time Cards 500-row truncation notice
- AR/AP aging SQL rewrite
- Duplicate "Avg Sale Value" / "Avg Order Value" KPI cards (needs product call)
- Production heartbeat / Render reachability (NEEDS-SRI)
