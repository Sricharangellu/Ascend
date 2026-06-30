# FinderPOS — Work State
> Last updated: 2026-06-30  |  Last commit: `dff68d4` — fix(retail): three production blockers on the core checkout path

## Active task
None — all pages have mock handler coverage. Next: onboarding wizard wiring or backend module gaps audit.

## Files in flight
None.

## Recent decisions
- **Service Orders** — mock handlers added (GET list w/ q+status filter, POST 201, PATCH status transitions). Seeds 6 tickets across all 5 statuses. Nav item + MODULE_BY_ACTIVE already fixed in prior commit.
- **Invoicing** — nav item added (Analyze group, `module: "invoicing"`), MODULE_BY_ACTIVE fixed (was → invoicing). Handlers: lookup-upc sub-path (before /:id), GET list, GET :id with lines embedded, POST create, PATCH :id/status. Seeds 6 invoices across all 6 statuses.
- **Restaurant vertical** — 3 pages fully wired. Floor plan embeds current_session in table response. Bar Tabs uses active="bar-tabs". Kitchen is full-screen KDS (no EnterpriseShell).
- **E2E suite** — scripts/seed-e2e.ts bypasses NODE_ENV=production guard. CI seeds before Playwright run.

## Context cliff notes
- `web/mocks/mockHandlers.ts` — all mock handlers (NOT lightspeedHandlers.ts)
- MSW IIFE spread pattern: `...(() => { ... return [...handlers]; })(),`
- `V1 = "*/api/v1"` wildcard prefix; `await lat()` first line in every handler
- Sub-paths (e.g. /lookup-upc) must be registered BEFORE `/:id` in handler order
- `MODULE_BY_ACTIVE` maps active page key → nav key to highlight; wrong mapping = wrong sidebar item

## Modules with NO handlers (next targets)
| Module | Page | Endpoints needed |
|---|---|---|
| Workforce | `/workforce` | GET /workforce/employees, GET/POST/PATCH/DELETE /workforce/shifts, GET/PATCH /workforce/time-off — NOTE: page calls `/workforce/...` (missing `/api/v1/` prefix — bug to fix) |
| Loyalty (gaps) | `/loyalty` | Handlers exist for /customers/:id/loyalty + /customers/loyalty-tiers but loyalty page itself may have additional calls |
| Audit Log | `/audit-log` | 2 API calls — likely GET /audit-log with filters |
| Reporting | `/reporting` | Unknown — needs audit |

## Next 3 actions
1. Fix workforce page — update API calls from `/workforce/...` → `/api/v1/workforce/...`
2. Add workforce mock handlers (employees, shifts, time-off)
3. Audit loyalty page calls and fill any gaps

## Completed modules (handlers + nav + typecheck)
- dashboard, terminal/register, orders, customers+detail, catalog, inventory
- sales, purchasing+detail, vendors, gift-cards, discounts, ecommerce, shipping
- returns, payments, quotes, operations, finance, accounting, insights, reports
- team, custom-roles, workflows, settings, integrations, tax-compliance, imports-exports
- onboarding, service-orders, invoicing ← NEW
- restaurant (floor-plan, kitchen, bar-tabs) ← NEW

## INF items (all closed)
INF-1 through INF-11 — see prior WORK_STATE for details.

## Blockers
None
