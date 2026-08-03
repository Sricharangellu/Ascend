# Audit — Ponytail Wave 2 hubs

| Field | Value |
|---|---|
| Date (UTC) | 2026-08-03T04:35:40Z |
| Parent | `AUDIT_2026-08-02T230500Z-ponytail-enterprise-ui.md` Wave 2 |
| Stacks on | Wave 1 consolidation (`cursor/ponytail-wave1-consolidation-72bc`) |
| Status | `built_verified` — web typecheck/lint PASS; vitest 158/158; `next build` PASS |

## What changed

1. **Finance hub** (`/finance`) — Overview summaries + deep links to Invoicing/Bills; Expenses tab kept. Removed duplicate AR/AP pay tables.
2. **Accounting** (`/accounting`) — COA, deposits, AR/AP aging summaries + dunning. Invoice/bill pay grids removed (pay on `/invoicing` / `/bills`).
3. **Delivery hub** — `?tab=orders|shipments`. Shipments registry extracted to `delivery/_components/ShipmentsPanel.tsx` (from former `/shipping`).
4. **`/shipping`** — permanent redirect to `/delivery?tab=shipments` (+ thin `redirect()` page).
5. **Operations dissolve** — page is Outlets/registers only with deep links to Inventory Locations and Delivery. `/operations` → `/setup/outlets`. Setup nav gains **Outlets**. Checklist outlet/register links → `/setup/outlets`.

## Remaining (Wave 3+)

- Delete dead `/reporting/*` / thin alias folders after redirects bake
- Quarantine remaining partial catalog surfaces
- Token cleanup on legacy delivery stage badge colors (pre-existing amber/blue raw classes in stepper)
