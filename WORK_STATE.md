# FinderPOS — Work State
> Last updated: 2026-07-02  |  Last commit: `35f9133`

---

## Enterprise Domain Roadmap (authoritative)

> Full spec: [`docs/ENTERPRISE_DOMAIN_ROADMAP.md`](docs/ENTERPRISE_DOMAIN_ROADMAP.md)

**Design principle:** Build in **dependency order**, not feature order. Do not add isolated features — complete domain-by-domain so every module connects through a consistent data model, RBAC, audit logging, and shared business rules.

### Build sequence

| Priority | Domain | Path | Status |
|---|---|---|---|
| 1 | Sales & Order Management | `/sales` | 🔶 Partial — **next domain** |
| 2 | Customer 360 | `/customers/[id]` upgrade | 🔶 Partial |
| 3 | Supplier 360 | `/vendors/[id]` upgrade | 🔶 Partial |
| 4 | Warehouse Management (WMS) | `/warehouse` | 🔲 Not started |
| 5 | Pricing Engine | `/pricing` | 🔶 Embedded in Products |
| 6 | Promotion Engine | `/promotions` upgrade | 🔶 Basic page |
| 7 | Enterprise Workflow Engine | `/workflows` upgrade | 🔶 Basic page |
| 8 | Notification Center | `/notifications` upgrade | 🔶 Basic page |
| 9 | Document Center | `/documents` | 🔲 Not started |
| 10 | Business Intelligence | `/analytics` | 🔶 Basic dashboards |
| 11 | Automation Engine | `/automations` | 🔶 Basic page |
| 12 | Integration Hub | `/integrations` upgrade | 🔶 Basic page |
| 13 | Analytics & AI | `/ai-insights` | 🔶 Basic page |

### Order lifecycle (immutable — use status transitions only)
`Customer → Cart → Order → Payment → Invoice → Delivery → Return → Refund → Accounting`

### Order status state machine
`Draft → Confirmed → Processing → Packed → Shipped → Delivered → Completed | Returned | Cancelled | Backordered | On Hold`

---

## Enterprise Inventory Pipeline (authoritative)

> Full spec: [`docs/ENTERPRISE_INVENTORY_PIPELINE.md`](docs/ENTERPRISE_INVENTORY_PIPELINE.md)

### Pipeline status flow
`Suggested → Draft PO → Sent to Supplier → Confirmed → Partially Received → Fully Received → Supplier Billed → Cost Verified → Closed`

### Key design rules

| Rule | Detail |
|---|---|
| **Never blind import** | Every EDI/CSV import runs 13 safeguard checks before touching inventory |
| **Price history always** | Every PO receive → insert into `supplier_product_price_history` |
| **Preferred supplier lock** | Never overwrite preferred supplier without explicit approval |
| **Duplicate = hard block** | Duplicate PO number or invoice number = blocked, not warned |
| **Large cost change → approval** | Threshold configurable per tenant; movement held until approved |
| **Reorder formula** | `(Avg Daily Sales × Lead Time) + Safety Stock − Available − Incoming` |
| **Supplier comparison** | Always surface cheapest recent price across all linked suppliers |

### 5 new schema tables
`supplier_product_price_history`, `reorder_suggestions`, `edi_imports`, `edi_import_errors`, `purchase_invoice_matches`

### 3 new pages needed
| Page | Path | Status |
|---|---|---|
| Inventory Pipeline | `/inventory/pipeline` | Not built |
| EDI Imports | `/purchasing/edi-imports` | Not built |
| Error Check Center | `/inventory/errors` | Not built |

---

## Enterprise Product Spec (authoritative)

> Full spec: [`docs/ENTERPRISE_PRODUCT_SPEC.md`](docs/ENTERPRISE_PRODUCT_SPEC.md)

Products are the **central business entity** — every other module references them. The product module is a PIM + Inventory + Supply Chain system, not a CRUD form.

### Key design rules

| Rule | Detail |
|---|---|
| **360° workspace** | Product Detail = tabbed workspace (24 tabs), not a form. Left nav + center content + right KPI panel + sticky action bar |
| **Master → Variant split** | Master holds shared data (name, brand, images, SEO). Variant holds sellable data (SKU, barcode, price, inventory) |
| **Lifecycle state machine** | Draft → Pending Approval → Approved → Published → Selling → Low Stock → Reorder → Discontinued → Archived |
| **Tracking modes** | Per product: No/SKU/Barcode/Serial/Batch/Lot/RFID/IMEI/GTIN/Expiry tracking |
| **Warehouse granularity** | Warehouse → Zone → Aisle → Rack → Shelf → Bin → Pallet (per-location stock) |
| **List view modes** | Collapsed master / Expanded parent-child / Grid / Ecommerce / Inventory / Label |
| **Bulk safety** | Preview before apply, audit log per field, rollback, requires `products.bulk_update` permission |
| **Label printing** | Mixed-type queue, per-product-type templates, 15+ label sizes, USB/BT/Wi-Fi/ZPL/ESC/POS |

### New schema tables (label printing + ecommerce)
`ecommerce_product_settings`, `label_templates`, `product_label_settings`, `label_print_jobs`, `label_print_job_items`, `printers`, `printer_drivers`, `print_logs`

### New RBAC codes
`products.bulk_update`, `ecommerce_products.publish`, `labels.print`, `labels.manage_templates`, `printers.test`

---

## Enterprise UX Spec (authoritative)

> Full spec: [`docs/ENTERPRISE_UX_SPEC.md`](docs/ENTERPRISE_UX_SPEC.md)

### UX rules that apply on every new page/component

| Rule | Detail |
|---|---|
| **Permission-gated nav** | Hide sidebar items if user lacks `[module].view` |
| **Permission-gated buttons** | Wrap all create/edit/delete/approve in `<Can permission="...">` |
| **Page header standard** | Title + description + breadcrumb + gated import/export/create buttons |
| **Detail page tabs** | Use tab pattern from spec §4 (Product, Customer, Outlet, User, Role) |
| **Table requirements** | Search + filters + pagination + bulk actions + export + empty/loading/error states |
| **Form requirements** | Sections + required indicators + inline validation + unsaved-changes guard |
| **Confirmation modal** | Required for: refund, void, delete, archive, disable user, revoke sessions, receive inventory, change permissions |
| **Offline UX** | Terminal shows online/offline badge, last-sync time, pending queue count |
| **Page connections** | Dashboard → detail pages; Orders → Customer; PO → Vendor; etc. Always wire `href` links |
| **RBAC components** | `Can`, `CanAny`, `CanAll`, `PermissionGuard`, `RoleGuard`, `OutletAccessGuard`, `ReadOnlyWrapper` |

---

## Enterprise Architecture (authoritative)

> Full spec: [`docs/ENTERPRISE_ARCHITECTURE.md`](docs/ENTERPRISE_ARCHITECTURE.md)

### Non-negotiable design rules
| Rule | Description |
|---|---|
| **Multi-tenant first** | Every business-owned table must have `tenant_id UUID NOT NULL`. Never query without tenant filter. |
| **Inventory ledger** | Every stock change creates an `inventory_movements` record. No simple qty updates. |
| **Immutable financials** | Orders, payments, refunds: use status changes + adjustment records. Never silent edits. |
| **Offline-first POS** | IndexedDB, sync queue, idempotency keys, device IDs, conflict resolution. |
| **Event-driven** | Key actions emit events (`order.created`, `payment.completed`, `inventory.decreased`, etc.). |

### Schema table inventory (30 tables defined)

| Domain | Tables |
|---|---|
| Identity & Access | `tenants`, `tenant_settings`, `users`, `roles`, `permissions`, `role_permissions`, `user_roles`, `user_sessions` |
| Organization | `outlets`, `registers`, `cash_drawer_sessions` |
| Catalog | `categories`, `brands`, `products`, `product_variants`, `price_books`, `price_book_items` |
| Inventory Ledger | `inventory_balances`, `inventory_movements`, `stock_transfers`, `stock_transfer_items` |
| Customers | `customer_groups`, `customers` |
| Sales | `orders`, `order_items`, `payment_methods`, `payments`, `refunds` |
| Returns | `returns`, `return_items` |
| Purchasing | `vendors`, `vendor_products`, `purchase_orders`, `purchase_order_items` |
| Taxes/Promos | `tax_rates`, `discounts`, `gift_cards`, `gift_card_transactions` |
| Platform | `audit_logs`, `devices`, `sync_events`, `webhooks`, `webhook_deliveries`, `daily_sales_summary` |

### Build phases
| Phase | Status | Focus |
|---|---|---|
| 1 — Foundation | 🔶 Frontend built, backend mock | tenants, users, roles, outlets, registers, auth, audit_logs |
| 2 — Catalog & Inventory | 🔶 Frontend built, backend mock | products, variants, inventory_balances, inventory_movements |
| 3 — POS Sales | 🔶 Frontend built, backend mock | orders, order_items, payments, tax, discounts |
| 4 — Customers & Loyalty | 🔶 Frontend built, backend mock | customers, customer_groups, gift_cards, loyalty_points |
| 5 — Purchasing | 🔶 Frontend built, backend mock | vendors, purchase_orders, receiving, cost updates |
| 6 — Enterprise Layer | 🔲 Partial frontend | sync_events, devices, webhooks, reports, approval workflows |
| 7 — Scale Layer | 🔲 Not started | Read replicas, queues, analytics warehouse, search, ERP sync |

### Key architecture decisions
- **Stack**: Next.js 14 + TypeScript (frontend) · Express + TypeScript + PostgreSQL (backend, in `src/`)
- **ORM target**: Prisma or Drizzle (currently raw SQL in backend)
- **Auth**: JWT access tokens + refresh token rotation · Argon2 password hashing · MFA for owners
- **Money**: Always integer cents in DB and API, never floats · `formatMoney(cents)` on display
- **Inventory movements**: Every balance change must reference a movement type: `SALE`, `RETURN`, `PURCHASE_RECEIVE`, `TRANSFER_IN/OUT`, `ADJUSTMENT_IN/OUT`, `DAMAGE`, `LOSS`, `COUNT_CORRECTION`
- **Permissions**: 28 granular permission codes across 8 domains (see full spec)

---

## Launch-readiness status

| Area | Status | Notes |
|---|---|---|
| **Authentication** | ✅ Built | Login (368 ln), Signup (174 ln), protected layout, route guard |
| **Terminal / Register** | ✅ Built | Full checkout: barcode scan, cart, tender, receipt, offline queue, card reader screen |
| **Product Catalog** | ✅ Built | List + filters + sort + bulk update + CSV import/export + duplicate + detail page + variants + price book + **20-tab workspace**: General, Variants, Pricing, Inventory, Purchase by Supplier, Sales by Customer, Reorder, Supplier Prices, Suppliers, Expiry, Images, eCommerce, Categories, Sales, Returns, Credits, Invoices, Compliance, Analytics, Audit Log |
| **Inventory** | ✅ Built | Overview, receive stock, counts, serials, expiry, reorder suggestions, locations, transfers (via operations) |
| **Purchasing / POs** | ✅ Built | PO list + tabbed detail (lines, receive, billing, credits), reorder suggestions → PO creation |
| **Orders** | ✅ Built | Order list + status filter |
| **Customers** | ✅ Built | List + customer detail + purchase history + loyalty points |
| **Sales Analytics** | ✅ Built | Sales page, insights, reports suite (8 sub-reports) |
| **Reports** | ✅ Built | Sales, AR aging, P&L, inventory, expiry, sales-by-rep, sales-by-vendor, end-of-day, register closures, time cards |
| **Vendors** | ✅ Built | Vendor list + vendor detail |
| **Purchasing** | ✅ Built | PO list + detail tabs |
| **Loyalty** | ✅ Built | Tiers, member list, rewards management |
| **Gift Cards** | ✅ Built | Issue, balance check, transaction history |
| **Discounts / Promotions** | ✅ Built | Discounts page + catalog promotions page (full CRUD) |
| **Returns** | ✅ Built | Returns page at /returns |
| **Payments** | ✅ Built | Payment list + reconciliation |
| **Quotes** | ✅ Built | Quote builder + convert to order |
| **Service Orders** | ✅ Built | Work order list + status pipeline |
| **Invoicing** | ✅ Built | Customer invoices, line items, status workflow |
| **Workforce** | ✅ Built | Employee list, shift scheduler, time-off requests |
| **Ecommerce** | ✅ Built | Store settings, sync status, channel management |
| **Finance** | ✅ Built | P&L overview, accounts, COA |
| **Accounting** | ✅ Built | Journal entries, reconciliation |
| **Operations** | ✅ Built | Outlet management, register sessions, transfer orders |
| **Shipping** | ✅ Built | Shipment tracking, carrier config |
| **Tax Compliance** | ✅ Built | MSA/PACT reporting, state flavor ban tracking |
| **Team / Roles** | ✅ Built | Employee directory, clock in/out, 10 roles, account status, time entries, 3-tab detail modal |
| **Workflows** | ✅ Built | Automation rules, condition/action builder, step editor |
| **Settings** | ✅ Built | Mega-page: store profile, tax rates, payment modes, loyalty tiers, shipping, security, COA, receipt templates, API keys, currencies |
| **Settings → Permissions** | ✅ Built | Role-based feature toggles (Admin/Manager/Cashier/Warehouse/Read-only) with RBAC PATCH endpoint |
| **Settings → Business Modes** | ✅ Built | Enable/disable verticals (Retail/Restaurant/Golf/B2B/Ecommerce/Kiosk/etc.) — wired to moduleFlags API |
| **Settings → Kiosk Mode** | ✅ Built | Kiosk config: PIN, idle timeout, payment methods, price visibility, portal URL |
| **Settings → B2B Portal** | ✅ Built | B2B config: customer groups with discount %, payment terms, order approval, credit limits |
| **Setup** | ✅ Built | Business profile, modules toggle — sub-pages route to correct Settings section |
| **Integrations** | ✅ Built | App marketplace, connected integrations |
| **Notifications** | ✅ Built | Notification inbox + channel preferences |
| **Audit Log** | ✅ Built | System event log with actor + resource |
| **Imports / Exports** | ✅ Built | CSV/bulk import jobs, export scheduler |
| **Onboarding** | ✅ Built | First-run setup wizard |
| **Tax Compliance** | ✅ Built | PACT Act, MSA reporting, state restrictions |
| **Display** | ✅ Built | Customer-facing display screen |
| **Appointments** | ✅ Built | Appointment scheduler |

### Vertical modules

| Vertical | Status | Pages |
|---|---|---|
| **Restaurant** | ✅ Built | Floor plan, kitchen display, tabs |
| **Automotive** | ✅ Built | Vehicles, work orders |
| **Healthcare** | ✅ Built | Patients, prescriptions, dispense |
| **Hospitality** | ✅ Built | Rooms, charges, settle |
| **Education** | ✅ Built | Students, fees, collect |
| **Entertainment** | ✅ Built | Events, tickets, QR redeem |
| **Manufacturing** | ✅ Built | Production orders, BOM, status |
| **Rental** | ✅ Built | Asset register, contracts, return |
| **Golf** | ✅ Built | Tee sheet, bookings, members, pro-shop — 4 pages + nav wired |

---

## Mock handler coverage

All API routes for built modules have MSW handlers in `web/mocks/mockHandlers.ts`.

Key patterns:
- `V1 = "*/api/v1"` wildcard prefix
- `await lat()` first line in every handler
- IIFE spread pattern: `...(() => { let state; return [...handlers]; })(),`
- Sub-paths registered BEFORE `/:id` to avoid wrong matching

---

## Known bad redirects (quick fixes)

| Route | Currently redirects to | Should redirect to |
|---|---|---|
| `/inventory/returns` | `/vendors` | `/returns` |
| `/setup/loyalty` | `/settings` | `/loyalty` |

---

## Context cliff notes

- Pages: `web/app/(protected)/[module]/page.tsx`
- Mock handlers: `web/mocks/mockHandlers.ts` (NOT lightspeedHandlers.ts)
- Types: `web/api-client/types.ts`
- API client: `web/api-client/client.ts` → `apiGet / apiPost / apiPatch / apiDelete`
- Nav shell: `web/components/EnterpriseShell.tsx` — 3 places to update per new nav item
- Money: `formatMoney(cents)` from `@/lib/money`
- Catalog products in mock: `prod_1`–`prod_8`
- Settings page covers: taxes, payment modes, loyalty tiers, shipping, security, COA, receipts, API keys

---

## Next targets (priority order for launch)

1. **Golf vertical** ✅ DONE — 4 pages + nav wired; `module: "golf"` → `module: "tee_sheet"` fixed
2. **FE-R4: Restaurant Dashboard** ✅ DONE — `/restaurant/dashboard` with KPIs, hourly chart, top items, active sessions (2026-07-01)
3. **UX-2: Module marketplace** ✅ DONE — `/setup/modules` page already complete
4. **UX-3: Vertical dashboard widgets** ✅ DONE — `VerticalWidgets.tsx` already complete
5. **Split oversized pages** — reports/page.tsx ✅ DONE (866→246 ln); next: customers/page.tsx (810 ln), dashboard (803 ln), discounts (765 ln)
6. **Settings page split** ✅ DONE — CoaSection, DepositsSection, LoyaltyTiersSection extracted (2026-07-01)

---

## Enterprise Guardian — Last Audit

> Run: 2026-06-30 (post customers/[id] split)  |  Score: 94/100  |  Status: ✅ LAUNCH-READY (≥88, zero CRITICAL)
> Prior score: 93/100 → +1 pt (customers/[id] split 1705→441 ln, 9 extracted _components files, zero TS errors)

### Domain Scores

| Domain | Score | Grade | Top Finding |
|---|---|---|---|
| TypeScript strictness | 100/100 | ✅ | Zero `error TS`, zero unguarded `any` in production code |
| Security | 98/100 | ✅ | Zero secrets, no XSS, no dangerouslySetInnerHTML |
| API contract | 92/100 | ✅ | All FE-51/FE-52 handlers correct; `await lat()` on all |
| Component quality | 88/100 | ✅ | customers/[id] split (1705→441 ln); catalog (1498) next |
| Accessibility | 95/100 | ✅ | `role="alert"` on all errors; icon buttons labeled |
| Performance | 89/100 | ✅ | 2 page splits done; catalog (1498), inventory (1229), purchasing still >800 ln |
| Design system | 86/100 | ✅ | `web/lib/date.ts` created; 5 import sites fixed; formatMoney + border-slate-200 done |
| Nav/routing | 97/100 | ✅ | All stubs verified valid; no bad redirects remaining |

### CRITICAL (blocks launch — fix first)

_None. TypeScript clean, security clean, all stubs point to real files._

### HIGH (degrading enterprise readiness)

_None._

### MEDIUM (tech debt — fix before v2)

- [x] **Design system — local date helpers** — ✅ DONE: `web/lib/date.ts` created with `fmtDate`, `fmtDateShort`, `fmtDateTime`, `fmtTime`; 5 import sites fixed (payments, appointments, imports-exports, inventory/counts, inventory/serials). Remaining pages (insights, ecommerce, purchasing, quotes, workforce) still have local definitions — audit these next.

- [x] **Design system — date helpers migration** — ✅ DONE: all 44 raw `new Date(x).toLocale*()` calls across 26 files replaced with `fmtDate`/`fmtTime`/`fmtDateTime` from `@/lib/date`. 3 custom-format sites kept intentionally (weekday header, 2-digit year, appointment picker). Zero TS errors. Commit `46e1a89`.

- [ ] **Design system — money in form inputs** — `(cents / 100).toFixed(2)` used to seed edit-form inputs in `catalog/page.tsx` (ln 94, 98, 99, 843–845), `customers/[id]/page.tsx` (ln 680, 699), `accounting/page.tsx` (ln 336). Correct for edit inputs (need dollar string), but comment-document why to avoid false audit flags.

- [ ] **Page size — split required** — pages exceeding 800-line threshold:
  - `settings/page.tsx` — ✅ DONE: 1818→644 ln (CoaSection, DepositsSection, LoyaltyTiersSection extracted)
  - `customers/[id]/page.tsx` — ✅ DONE: 1705→441 ln, 9 files in `customers/[id]/_components/`
  - `reports/page.tsx` — ✅ DONE: 866→246 ln (4 section files + reportHelpers.tsx)
  - `customers/page.tsx` — 810 ln — next split candidate
  - `dashboard/page.tsx` — 803 ln — next split candidate

### LOW (polish — backlog)

- [ ] `web/lib/offlineOutbox.ts` — IDB typing `(req.result as T[]).sort((a: any, b: any)...)` — use `IDBRequest<T[]>`.
- [ ] `web/lib/offlineOutbox.ts:176` — `(registration as any).sync.register(...)` — add ambient `BackgroundSyncManager` type.
- [ ] 9 stub pages report "no loading state" — these are pure re-exports with zero async work; false positive for that check. No action needed.

### Next session must-do (Claude's priority queue)

Score: 94/100 — launch-ready, zero CRITICAL.

#### Catalog detail page — DONE (2026-07-01)

| # | What | Status |
|---|---|---|
| 1 | Stock by location (`GET /catalog/:id/stock`) | ✅ DONE — InventoryTab StockByLocation panel, on-hand/committed/available/avg-cost |
| 2 | Richer expiry (`/catalog/:id/expiry`) | ✅ DONE — ExpiryTab rewritten: 4-tier status, lot_code, location, notes, pre-computed days |
| 3 | Compliance endpoint (`PATCH /catalog/:id/compliance`) | ✅ DONE — already wired in MarketingTab |
| 4 | Hidden fields (tags, dims, ecommerce, vendor_upc) | ✅ DONE — all present in GeneralTab/InventoryTab |
| 5 | Live margin calculator | ✅ DONE — already in GeneralTab price table |
| 6 | Tab badges (expiry alert count) | ✅ DONE — red pill on Expiry tab when expired/critical batches |
| 7 | Margin + price on product header | ✅ DONE — price pill + colour-coded margin % in header |
| 8 | Barcode test button | ✅ DONE — in Actions menu, 3s inline pass/fail result |

#### Page splits still pending
- `customers/page.tsx` — 810 ln — extract filter bar, table, customer detail drawer
- `dashboard/page.tsx` — 803 ln — extract KPI section, top products, payment breakdown
- `discounts/page.tsx` — 765 ln — extract discount form, promotions section

**Done this session (2026-07-01, page splits):**
- workflows, terminal, quotes, operations, workforce, receive-stock, insights all split (7 pages)
- insights: 515→55 ln; ScheduledReportsTab + ForecastingTab + insightsTypes extracted; commit `aba0197`

**Done this session (2026-07-01, continued):**
- Date migration: 44 raw `toLocale*()` calls across 26 files → `fmtDate`/`fmtTime`/`fmtDateTime`; 3 custom formats intentionally kept; zero TS errors; commit `46e1a89`

**Done this session (2026-07-01):**
- Settings page split: CoaSection + DepositsSection + LoyaltyTiersSection → `_components/` (1003→644 ln)
- FE-R4 Restaurant Dashboard: `/restaurant/dashboard` — covers, avg ticket, table turns, peak hour, hourly revenue chart, top items, active sessions
- reports/page.tsx split: 4 sections → `_components/` (866→246 ln); shared helpers in reportHelpers.tsx
- catalog/[id]/page.tsx restructured: 3-tab editor (General | Inventory | Marketing) — 763→136 ln; GeneralTab (price table w/ markup/margin), InventoryTab (supplier, replenish, variants), MarketingTab (loyalty, compliance)
