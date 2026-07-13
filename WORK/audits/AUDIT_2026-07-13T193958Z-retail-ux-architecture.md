# Audit — Retail (B2C) Architecture & UX Review

Date: 2026-07-13T19:39:58Z
Session: Claude session A
Status label: **Audit complete; fix slice 1 shipped** (duplicate product editor + duplicate sales report). Remaining findings are prioritized below and unfixed unless marked.

Scope: the full web app (143 page routes) reviewed for duplicates, orphans, dead
ends, nav reachability, and retail/B2B isolation, per the "Retail (B2C) Complete
Architecture & UX Redesign" PRD.

## Inventory

- **143 page routes** under `web/app`.
- **35 are deliberate one-line alias pages** (`export { default } from …`) kept for
  URL compatibility — e.g. `/setup/* → /settings|/team|/integrations`,
  `/reporting/{p-l,ar-aging,…} → /reports/*`, `/catalog/gift-cards → /gift-cards`,
  `/inventory/count → /inventory/counts`. These are NOT duplicates of logic;
  they're routing shims. Leave them.
- **Vertical packages** (golf ×4, restaurant ×4, automotive, education,
  entertainment, healthcare, hospitality, rental, manufacturing, appointments)
  are module-gated in `EnterpriseShell` (`moduleGate` + `enabledModules`), so a
  retail tenant does not see them. Retail/B2B isolation therefore exists at nav
  level; `accountMode` (RETAIL/WHOLESALE/ENTERPRISE) comes from feature-flag groups.

## Confirmed real duplicates

1. **FIXED — Two complete product editors.** `/catalog/[id]` (rich 16-tab page)
   vs `/inventory/products/[id]` + `/inventory/products/new` (second editor with
   its own cruder `VariantsTab` — paste-product-IDs textarea; the source of the
   "create variant vs generate variants" inconsistency). Fix shipped: legacy
   routes now `redirect()` to `/catalog/[id]` / `/catalog?new=1`; the duplicate
   `_components` (General/Pricing/Categories/Variants tabs) deleted; all 5
   inbound links (dashboard quick action + top lists, inventory CatalogTab ×2,
   reports/sales) repointed; catalog ProductsTab opens its create modal on
   `?new=1`.
2. **FIXED — Two different Sales reports.** `/reporting/sales` (155-line
   group-by list, linked from ReportsSubNav) vs `/reports/sales` (457-line
   category/customer/product/trend report, linked from main nav). Fix shipped:
   `/reporting/sales` is now an alias of `/reports/sales`, matching its sibling
   alias pages.

## Remaining findings (prioritized)

3. **Promotions vs Discounts split.** `/catalog/promotions` ("Promotion Engine",
   1090 lines, `/api/v1/promotions` + coupons) and `/discounts` ("Discounts",
   167 lines, `/api/v1/discounts`) are separate engines with separate backends.
   `/ecommerce/promotions` aliases discounts (not promotions!) — at minimum the
   alias should point at the promotion engine, or the two engines need a merge
   decision. Needs product decision before code.
4. **Reports tree split.** Real pages live in BOTH `/reports/*` (sales, p-l,
   ar-aging, inventory, expiry, end-of-day, sales-by-rep, sales-by-vendor) and
   `/reporting/*` (purchases, cash-movement, register-closures, time-cards) with
   aliases crossing between them. Consolidate on ONE physical tree (keep
   aliases for old URLs) and one sub-nav (`ReportsSubNav` currently lists only 9
   of the 12 reports — purchases/cash-movement/register-closures/time-cards are
   reachable only by URL → near-dead-ends).
5. **`/pricing` ("Pricing Engine", 691 lines) vs `/catalog/price-book` (188).**
   Overlapping price-management surfaces; price-book is not in the nav
   (orphan-ish). Decide: fold price-book into Pricing as a tab.
6. **POS surfaces**: `/terminal` (canonical, aliased by `/sell`), plus
   `/display` (customer display?) and `/store/*` (public storefront) — verify
   purpose labels; no action yet.
7. **`/bills` (69 lines) vs `/finance` hub** — `/finance/bills` aliases
   `/finance`, while a separate thin `/bills` page exists. Consolidate on the
   richer surface.
8. **Breadcrumbs/back-nav** are inconsistent across detail pages (catalog has
   them; purchasing/[id], orders/[id], customers/[id] vary). Standardize via a
   shared header component.
9. **Two settings trees** — `/setup/*` (15 aliases) vs `/settings/*` (real).
   Aliases fine, but `/settings` itself packs many panes; audit which setup
   aliases point at the right settings section (several all point at the root).

## Verification (fix slice 1)

- PASS: `cd web && npm run typecheck && npm run build` (redirects compile; no
  dangling imports after deleting the duplicate editor's components).
- Grep-verified: zero remaining references to `/inventory/products/*` outside
  the redirect stubs.

## Notes

- The 35 alias pages inflate the "duplicate pages" impression; the true
  duplication was concentrated in findings 1–5.
- Browser e2e remains blocked by the local auth harness (standing constraint).
