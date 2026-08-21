# Audit — Ponytail Wave 3 alias cleanup + Pricing quarantine (on develop)

| Field | Value |
|---|---|
| Date (UTC) | 2026-08-03T06:02:25Z |
| Parent | `AUDIT_2026-08-02T230500Z-ponytail-enterprise-ui.md` |
| Base | `origin/develop` @ `7bb9ffc` (Waves 0–2 already landed via PR #160) |
| Status | `built_verified` — web typecheck / lint / vitest 174/174 / `next build` PASS |

## Collision note

Waves 0–2 were developed twice in parallel (this session on a `master` lineage,
another session on `develop` via PR #160). `develop` already carries that IA —
Movements nav, Delivery `?tab=shipments` + `ShipmentsPanel`, Finance/Accounting
hub simplify, Outlets under Setup, and the Wave 1 redirect table. This branch
therefore ships **only the Wave 3 delta develop is still missing**, rather than
replaying the duplicate work.

## What changed

1. **Deleted thin alias page twins** now covered solely by `next.config.mjs`
   redirects: the whole `/reporting/*` re-export tree (13 pages), `/sell`,
   `/sales`, `/shipping`, `/finance/{bills,settings,payment-made}`,
   `/setup/{business-profile,modules}`, `/inventory/{reorder,expiry,transfers}`,
   `/ecommerce/{customers,promotions}`, `/catalog/price-book`.
2. **New redirects** for the twins that had no config entry yet:
   `/inventory/expiry` → `/inventory/expiry-pool`, `/inventory/transfers` →
   `/inventory?tab=transfers`, `/ecommerce/promotions` → `/catalog/promotions`,
   `/catalog/price-book` → `/pricing?tab=customer-overrides`.
3. **Outlets ownership inverted** — the real page now lives at
   `/setup/outlets` (the canonical nav URL); `/operations` is a thin redirect.
   Removed the dead `operations/_components` stock-locations tab.
4. **Pricing quarantine** — default surface is Customer Overrides (real,
   backend-backed). Price books / tiers / contracts / scheduled / margin rules /
   simulator are mock-backed and now gated behind
   `NEXT_PUBLIC_SHOW_PARTIAL_PAGES`, with a banner saying so.
5. **Delivery tokens** — stage badges and the stepper use `erp` / `brand` /
   `warning` / `success` tokens instead of raw `neutral`/`amber`/`indigo`.
6. **Hygiene** — service-worker shell drops the deleted `/sell`; the mock module
   marketplace's Sales Orders route points at `/orders`.

## Verification

- `cd web && npm run typecheck` — PASS
- `cd web && npm run lint` — PASS (4 pre-existing warnings)
- `cd web && npm test` — 174/174 PASS
- `cd web && npm run build` — PASS
- Grepped for internal links to the deleted routes — none remain (`/inventory/transfers`
  hits are API paths, not routes)

## Remaining (formal Wave 3 DS + Wave 4)

- DS refactor on keepers: Terminal children, Orders, Catalog ProductsTab,
  Receive-stock, Bills, Reports EOD/register-closures, Dashboard
- Custom-roles vs permissions consolidation (NEEDS-SRI)
- Full Promotions / Pricing / Warehouse / Golf backends (Wave 4 — not yet)
