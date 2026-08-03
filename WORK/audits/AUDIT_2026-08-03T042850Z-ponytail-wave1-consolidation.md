# Audit — Ponytail Wave 1 IA consolidation

| Field | Value |
|---|---|
| Date (UTC) | 2026-08-03T04:28:50Z |
| Parent | `AUDIT_2026-08-02T230500Z-ponytail-enterprise-ui.md` Wave 1 |
| Stacks on | Wave 0 honesty (`cursor/ponytail-wave0-honesty-72bc`) |
| Status | `built_unverified` — web typecheck/lint PASS; vitest 158/158; backend typecheck PASS |

## What changed

1. **Permanent redirects** (`web/next.config.mjs`): `/reporting/*` → `/reports/*` (closing → end-of-day); `/sell` → `/terminal`; `/sales` → `/orders`; `/finance/bills|settings|payment-made` → `/bills`/`/settings`; `/setup/business-profile|modules` → `/settings/modes`; `/inventory/reorder` → `/purchasing?tab=reorder`; `/ecommerce/customers` → `/customers`.
2. **Alias pages** converted from re-exports to `redirect()` for the same targets.
3. **Inventory nav trimmed** to Movements / Purchasing / Receive / Expiry / Counts / Locations / Vendors / Serials (+ partial Warehouse/Error Center). Removed peer Pipeline, Cost Entry, EDI, Reorder, Operations, Delivery.
4. **Delivery** moved under Sell; Delivery page links to `/shipping` (“All shipments”).
5. **Purchasing hub** — `?tab=` deep links + chrome links to Receive / Cost Entry / EDI / Pipeline / Vendors.
6. **Finance AP/Aging** navigate to `/bills` and `/reports/ar-aging` (not alias trees).
7. **Dashboard KPIs** → `/reports/sales`; retail-proof `low_stock` signal → `/purchasing?tab=reorder`.
8. **Checklist** deep-links: outlets/registers → `/operations`; tax/payments/receipt → `/settings`.

## Remaining (Wave 2+)

- Delete `/reporting/*` folders after redirects bake in
- Fully dissolve `/operations` into Settings outlets + inventory locations
- Merge `/shipping` list into Delivery as a tab (not just a link)
- Finance hub summary-only simplify; Accounting drop duplicate pay grids
- Promotions/Pricing quarantine (already partial from Wave 0 era)
