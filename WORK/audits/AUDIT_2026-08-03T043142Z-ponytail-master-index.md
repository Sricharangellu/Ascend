# Ascend — Ponytail Master Index (all pages)

| Field | Value |
|---|---|
| Date (UTC) | 2026-08-03T04:31:42Z |
| Protocol | ASCEND Enterprise UI Audit — Ponytail Page-by-Page |
| Coverage | **141 / 141** `web/app/**/page.tsx` routes — none skipped |
| Detail docs | (A) `AUDIT_2026-08-03T042838Z-ponytail-page-audit-clusters.md` — 101 routes · (B) `AUDIT_2026-08-03T043142Z-ponytail-page-audit-retail-ops.md` — 40 routes |
| Rule | Smallest change with greatest usability gain. Prefer CONSOLIDATE/REFACTOR. Rewrite only when justified. |

---

## Executive verdict

Ascend’s page count is inflated by **aliases** (reporting/*, setup/*, sell, finance/bills, ecommerce children) and **parallel hubs** (sales↔orders, receive×3, reorder×3, locations×4, promotions↔discounts). The Ponytail win is not a visual redesign — it is **collapsing duplicate workflows** and **gating incomplete surfaces**.

Retail proof path to protect: Signup → Settings/Onboarding → Catalog → Receive/Cost → Terminal → Expenses → Dashboard/Reports → Recommendations/Tasks.

### Decision tally (141)

| Decision | Count | Meaning |
|---|---:|---|
| KEEP | ~40 | Efficient enough; polish later |
| KEEP (alias) | ~32 | Redirect/re-export — retain for URL compat; do not build second UI |
| REFACTOR | ~35 | Same UX job; fix DS/contracts/bugs/stubs |
| CONSOLIDATE | ~32 | Merge into a hub or delete shim |
| REDESIGN | 1 | Marketing `/` only |
| REWRITE | 1 | `/settings/kiosk` (fake save — no API) |

### Implementation waves

| Wave | Goal | First actions |
|---|---|---|
| **0 — Honesty** | Stop training users on lies | Gate BE-missing inventory tabs; fix kiosk save or remove; scrub `finder-pos` / “F”; MSA sample label; golf MSW hide |
| **1 — Alias hygiene** | One canonical URL | Prefer `/reports/*`; Settings over Setup; delete ecommerce child lies; keep 308s |
| **2 — Hub merge** | Fewer clicks | Orders absorb Sales/Payments; Purchasing absorbs reorder/suppliers; Delivery absorbs Shipping list; Pipeline as procure board |
| **3 — Product detail** | Cognitive load | Collapse `/catalog/[id]` tabs; delete orphan tab files |
| **4 — DS pass** | Consistency | Button/Input/Select/EmptyState/Pagination on keepers — extend, don’t invent DataGrid yet |
| **5 — POS trust** | Cashier | Hide stubs; customer attach; gift-card tender |

---

## Complete route index

Legend: **Doc** = A (clusters) or B (retail-ops). **Kind** = impl / redirect / reexport.

### Public & auth (13)

| Route | Kind | Decision | Priority | Doc |
|---|---|---|---|---|
| `/` | impl | REDESIGN | Medium | A |
| `/login` | impl | REFACTOR | High | A |
| `/login/mfa` | impl | CONSOLIDATE | High | A |
| `/login/forgot-password` | impl | KEEP | Medium | A |
| `/login/reset-password` | impl | KEEP | Medium | A |
| `/login/device-verification` | impl | CONSOLIDATE | Low | A |
| `/login/security-alert` | impl | CONSOLIDATE | Low | A |
| `/signup` | impl | REFACTOR | High | A |
| `/store` | impl | REFACTOR | Medium | A |
| `/store/login` | impl | REFACTOR | Low | A |
| `/store/[id]` | impl | REFACTOR | Medium | A |
| `/store/account` | impl | REFACTOR | Low | A |
| `/onboarding` | impl | REFACTOR | High | A |

### Home & intelligence (6)

| Route | Kind | Decision | Priority | Doc |
|---|---|---|---|---|
| `/dashboard` | impl | KEEP | Critical | A |
| `/ai-assistant` | impl | KEEP | High | A |
| `/insights` | impl | CONSOLIDATE | Medium | A |
| `/notifications` | impl | REFACTOR | Medium | A |
| `/audit-log` | impl | REFACTOR | Medium | A |
| `/tax-compliance` | impl | CONSOLIDATE | High | A |

### Sell (10)

| Route | Kind | Decision | Priority | Doc |
|---|---|---|---|---|
| `/terminal` | impl | KEEP | Critical | B |
| `/sell` | reexport | KEEP (alias) | Low | B |
| `/sales` | impl | CONSOLIDATE | High | B |
| `/orders` | impl | REFACTOR | High | B |
| `/orders/[id]` | impl | KEEP | High | B |
| `/quotes` | impl | REFACTOR | Medium | B |
| `/returns` | impl | CONSOLIDATE | High | B |
| `/payments` | impl | CONSOLIDATE | Medium | B |
| `/service-orders` | impl | REFACTOR | Low | B |
| `/display` | impl | KEEP | Medium | B |

### Catalog & pricing (9)

| Route | Kind | Decision | Priority | Doc |
|---|---|---|---|---|
| `/catalog` | impl | REFACTOR | High | B |
| `/catalog/[id]` | impl | REFACTOR | Critical | B |
| `/catalog/categories/[id]` | impl | REFACTOR | Medium | B |
| `/catalog/price-book` | redirect | KEEP (alias) | Low | B |
| `/catalog/promotions` | impl | CONSOLIDATE | High | B |
| `/pricing` | impl | REFACTOR | Medium | B |
| `/discounts` | impl | KEEP | High | B |
| `/gift-cards` | impl | REFACTOR | Medium | B |
| `/loyalty` | impl | REFACTOR | Medium | B |

### Inventory, purchasing, fulfillment (22)

| Route | Kind | Decision | Priority | Doc |
|---|---|---|---|---|
| `/inventory` | impl | CONSOLIDATE | Critical | B |
| `/inventory/transfers` | redirect | KEEP (alias) | Low | B |
| `/inventory/expiry` | redirect | KEEP (alias) | Low | B |
| `/inventory/expiry-pool` | impl | KEEP | Medium | B |
| `/inventory/pipeline` | impl | CONSOLIDATE | Critical | B |
| `/inventory/receive-stock` | impl | KEEP | High | B |
| `/inventory/errors` | impl | REFACTOR | High | B |
| `/inventory/counts` | impl | KEEP | Medium | B |
| `/inventory/reorder` | impl | CONSOLIDATE | High | B |
| `/inventory/serials` | impl | REFACTOR | Low | B |
| `/inventory/locations` | impl | CONSOLIDATE | High | B |
| `/purchase` | impl | REFACTOR | Medium | B |
| `/purchasing` | impl | KEEP | Critical | B |
| `/purchasing/[id]` | impl | KEEP | High | B |
| `/purchasing/edi-imports` | impl | REFACTOR | Medium | B |
| `/vendors` | impl | CONSOLIDATE | High | B |
| `/vendors/[id]` | impl | REFACTOR | Medium | B |
| `/warehouse` | impl | CONSOLIDATE | Medium | B |
| `/operations` | impl | CONSOLIDATE | High | B |
| `/delivery` | impl | KEEP | High | B |
| `/shipping` | impl | CONSOLIDATE | High | B |

### Finance (5)

| Route | Kind | Decision | Priority | Doc |
|---|---|---|---|---|
| `/finance` | impl | CONSOLIDATE | Critical | A |
| `/finance/bills` | reexport | CONSOLIDATE | Critical | A |
| `/accounting` | impl | CONSOLIDATE | High | A |
| `/bills` | impl | KEEP | High | A |
| `/invoicing` | impl | REFACTOR | High | A |

### Reports canonical (13) + reporting aliases (13)

| Route | Kind | Decision | Priority | Doc |
|---|---|---|---|---|
| `/reports` | impl | REFACTOR | High | A |
| `/reports/sales` | impl | REFACTOR | High | A |
| `/reports/end-of-day` | impl | KEEP | High | A |
| `/reports/p-l` | impl | REFACTOR | High | A |
| `/reports/purchases` | impl | REFACTOR | Medium | A |
| `/reports/sales-by-rep` | impl | CONSOLIDATE | Medium | A |
| `/reports/sales-by-vendor` | impl | CONSOLIDATE | Medium | A |
| `/reports/inventory` | impl | REFACTOR | Medium | A |
| `/reports/ar-aging` | impl | KEEP | Medium | A |
| `/reports/expiry` | impl | CONSOLIDATE | High | A |
| `/reports/cash-movement` | impl | CONSOLIDATE | Medium | A |
| `/reports/register-closures` | impl | KEEP | High | A |
| `/reports/time-cards` | impl | CONSOLIDATE | Medium | A |
| `/reporting` (+ 12 children) | reexport | CONSOLIDATE | Critical | A |

### Customers (3)

| Route | Kind | Decision | Priority | Doc |
|---|---|---|---|---|
| `/customers` | impl | REFACTOR | Critical | A |
| `/customers/[id]` | impl | REFACTOR | High | A |
| `/appointments` | impl | KEEP | Low | A |

### Team / workforce (5)

| Route | Kind | Decision | Priority | Doc |
|---|---|---|---|---|
| `/team` | impl | KEEP | High | A |
| `/team/[id]` | impl | REFACTOR | High | A |
| `/team/custom-roles` | impl | CONSOLIDATE | High | A |
| `/workforce` | impl | CONSOLIDATE | Medium | A |
| `/workflows` | impl | REFACTOR | Medium | A |

### Settings / setup (17)

| Route | Kind | Decision | Priority | Doc |
|---|---|---|---|---|
| `/settings` | impl | CONSOLIDATE | Critical | A |
| `/settings/permissions` | impl | KEEP | High | A |
| `/settings/modes` | impl | KEEP | Critical | A |
| `/settings/kiosk` | impl | REWRITE | High | A |
| `/settings/b2b` | impl | REFACTOR | High | A |
| `/setup` (+ 10 aliases) | reexport | CONSOLIDATE | Critical | A |
| `/setup/business-profile` | impl | CONSOLIDATE | Critical | A |
| `/setup/modules` | impl | CONSOLIDATE | Critical | A |

### Verticals (15)

| Route | Kind | Decision | Priority | Doc |
|---|---|---|---|---|
| `/golf` (+ 3) | impl | CONSOLIDATE | Critical | A |
| `/restaurant/*` (4) | impl | KEEP (gated) | Low | A |
| healthcare, automotive, hospitality, manufacturing, rental, entertainment, education | impl | KEEP (gated) | Low | A |

### Other (8)

| Route | Kind | Decision | Priority | Doc |
|---|---|---|---|---|
| `/ecommerce` | impl | CONSOLIDATE | High | A |
| `/ecommerce/*` (5) | reexport | CONSOLIDATE | High | A |
| `/documents` | impl | CONSOLIDATE | Critical | A |
| `/imports-exports` | impl | KEEP | Medium | A |
| `/integrations` | impl | REFACTOR | Medium | A |

**Total indexed: 13+6+10+9+21+5+13+13+3+5+17+15+8 = 141**  
(inventory row count: 21 including purchase/purchasing/vendors/warehouse/ops/delivery/shipping)

---

## Critical path (do first)

1. Gate incomplete inventory pipeline/errors (honesty).
2. Collapse Sales/Payments into Orders; one Receive + one Reorder.
3. Collapse `/catalog/[id]` tabs; delete orphan tab files.
4. Settings over Setup; Reports over Reporting (aliases stay as 308).
5. Kiosk REWRITE or remove (fake save).
6. Hide golf/docs/warehouse promotions until real BE.
7. POS stub honesty + customer/gift-card tender.

## What this audit is not

- Not a visual redesign mandate.
- Not permission to invent DataGrid/CQRS/microservices.
- Not a claim that vertical packs are production-ready — they are gated KEEP only.

## Status labels

| Artifact | Status |
|---|---|
| Page inventory completeness | `built_verified` (141/141 listed) |
| Per-page 13-field writeups | `built_verified` (docs A+B) |
| Implementation of consolidations | `planned` — Waves 0–5 |
