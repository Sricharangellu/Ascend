# Audit — Ponytail Wave 3 alias cleanup + Pricing quarantine

| Field | Value |
|---|---|
| Date (UTC) | 2026-08-03T04:43:31Z |
| Parent | Wave 2 hubs + original Wave 1 “delete reporting tree” leftover |
| Stacks on | `cursor/ponytail-wave2-hubs-72bc` |
| Status | `built_verified` — web typecheck/lint PASS; vitest 158/158; `next build` PASS (111 routes) |

## What changed

1. **Deleted** thin alias / re-export page trees now covered solely by `next.config.mjs` redirects: `/reporting/*`, `/sell`, `/sales`, `/shipping`, finance aliases, setup business-profile/modules, inventory reorder/expiry/transfers, ecommerce customers/promotions, catalog/price-book.
2. **Outlets ownership** — UI lives at `/setup/outlets`; `/operations` is a thin redirect (+ config 308). Removed dead `operations/_components` (StockLocationsTab).
3. **Pricing quarantine** — default surface is Customer Overrides; engine tabs gated behind `NEXT_PUBLIC_SHOW_PARTIAL_PAGES`.
4. **Delivery** stage badges/stepper use `erp` / `brand` / `warning` / `success` tokens.
5. **Hygiene** — SW shell drops `/sell`; mock module marketplace sales route → `/orders`.

## Remaining (formal Wave 3 DS + Wave 4)

- DS refactor on Terminal / Orders / Catalog ProductsTab / Receive-stock / Bills / Reports EOD / Dashboard (original Wave 3)
- Custom-roles vs permissions (NEEDS-SRI)
- Full Promotions/Pricing/Warehouse/Golf backends (Wave 4 — do not start)
