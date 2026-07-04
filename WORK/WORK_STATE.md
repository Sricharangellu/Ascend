# FinderPOS — Work State
> Last updated: 2026-07-03  |  Location: `WORK/` (canonical AI work folder — see `WORK/README.md`)

---

## Active task

**Phase 1: Truth and cleanup** per `WORK/FORWARD_PLAN.md`. Feature/module expansion is
**PAUSED** until Phase 2 (core release spine) exit criteria pass.

2026-07-03 session B (deep verification — full findings in `WORK/AUDIT_2026-07-03B.md`):
live-stack proof DONE on local Postgres 15. Smoke 13/13 green (real POS lifecycle).
Endpoint probe: ~464/484 frontend-declared endpoints exist on the real backend.
**First-ever complete e2e run** (production build, mocks OFF, real backend):
**25 passed / 22 failed** — 10 core-flow failures (checkout/receive/invoice-pay/logout;
partly stale locators) + 12 vertical-page failures (some crash without mocks).
Agent instructions created (`AGENTS.md` repo + workspace; `WORK/RULES.md` = standing
policy). Cleanups: tracked `src/shared/db 2.ts` removed, 9 clean+merged agent worktrees
pruned (15 remain, need manual review — 10 unmerged branches). `NEXT_PUBLIC_MOCK` made
env-overridable (default still "true"). Stale e2e locators fixed (setup + login spec).

**Confirmed defects (priority order — each is one session's work item)**
1. **Orchestration dead vs real DB**: `workflow_instances`/`saga_instances` tables missing
   from migrations; every workflow trigger fails silently at runtime; 21 commands
   unregistered. Fix migrations + registration + make failures loud, or quarantine layer.
2. **e2e core-flow failures (10/47)**: triage checkout ×3, inventory-receive ×3,
   invoice-pay ×3, logout ×1 — separate stale locators from real integration gaps; fix
   until core specs green against production build + real backend.
3. **8 stale vitest tests**: `web/tests/catalogCart.test.tsx` (5), `web/tests/reportsDashboard.test.tsx` (3).
4. **~14 mock-only endpoints** incl. core `POST /inventory/transfers`, `POST /inventory/adjustments`,
   `POST /team`, `GET /team/:id`, `GET /workflows/templates`, Vendor-360 family (6 routes).
5. **RLS gap**: `withTenant()` adopted in only ~10/46 modules; policy permissive when unset.
6. **Mock default flip decision**: deployed frontend is 100% mock; needs real-backend
   deployment target + staging DB before flipping `NEXT_PUBLIC_MOCK` default.
7. **Vertical pages crash without mocks (12 e2e failures)** — deprioritized per RULES.md
   expansion pause; do not fix before items 1–6.

**Blockers:** none.

---

## Enterprise Domain Roadmap (reference — sequencing PAUSED per FORWARD_PLAN Phase 1)

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

---

## Full-Stack Audit — 2026-07-02

> Audited by: Claude Sonnet 4.6 | Commit at audit time: `efefd76`
> Scope: 129 pages · 465 API handlers · auth · security headers · offline · notifications · RBAC · error handling

---

### SECURITY

#### ✅ PASSING

| Area | Detail |
|---|---|
| **Auth guard (frontend)** | `middleware.ts` checks `finder_session_hint` cookie on every protected route; redirects to `/login?next=<path>` if absent |
| **Auth guard (React)** | `(protected)/layout.tsx` reads `useAuth().status`; renders null + redirects on `"unauthenticated"` — double layer |
| **JWT verification (backend)** | `gateway/auth.ts` — `jsonwebtoken.verify()` on every request; rejects missing or invalid Bearer tokens with HTTP 401 |
| **httpOnly refresh token** | `finder_refresh` cookie is httpOnly (JS-unreadable); `finder_session_hint` is non-httpOnly hint only — actual auth secret never exposed to JS |
| **Token refresh race protection** | `_refreshPromise` singleton in `api-client/client.ts` prevents concurrent refreshes (lines 40, 90–95) |
| **Rate limiting** | `src/gateway/rateLimit.ts` — IP-based token-bucket (60 req burst / 20 RPS sustained); Redis-backed in prod (Lua atomic script prevents TOCTOU); per-tenant tiered limiter (standard/premium/enterprise) |
| **CORS** | Allowlist-based; defaults to `finder-pos.vercel.app` + `finder-pos-web.vercel.app` in prod; configurable via `ALLOWED_ORIGINS` env var; dev-only wildcard |
| **Security headers (frontend)** | `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera/mic/geo disabled) |
| **CSP** | Restrictive in prod: `script-src 'self' 'unsafe-inline'`; `connect-src` limited to self + `NEXT_PUBLIC_API_BASE_URL`; `frame-ancestors 'none'` |
| **SQL injection** | All queries use `@named` / `?` placeholder compilation (`src/shared/db.ts` `compile()`); no raw string interpolation found in service layer |
| **Tenant isolation** | `db.withTenant(tenantId)` sets Postgres `app.tenant_id` config per transaction; RLS policies enforce at DB layer; every query in `custom_roles/service.ts` scopes to `tenant_id` |
| **Parameterized secrets check** | No hardcoded API keys, tokens, or passwords found in `web/app/` source code |
| **Helmet (backend)** | `helmet` imported and applied in `src/app.ts` — adds baseline HTTP security headers on backend |
| **No XSS via React** | Zero `dangerouslySetInnerHTML` in any page component; React escapes all interpolated values |
| **Offline outbox** | IndexedDB (not localStorage); carries idempotency key on every queued checkout for safe replay |
| **SSE notifications** | `useNotifications()` uses `EventSource` (not polling); per-tenant broker in `src/shared/sse.ts`; 25s heartbeat keeps proxies alive; cleanup on `close`/`error` |
| **gitignore** | `.env`, `node_modules/`, `dist/`, `.vercel`, `*.db` all ignored |
| **No competitor brand names** | Zero references found in source tree |

---

#### 🔴 CRITICAL — Must Fix Before Production

| ID | File | Issue | Risk |
|---|---|---|---|
| **SEC-1** | `.env` (repo root) | A `VERCEL_TOKEN` is stored in `.env` which IS in `.gitignore` but the file EXISTS on disk. If the repo is ever archived, zipped, or deployed via `git archive`, this token leaks. **Rotate this token immediately via the Vercel dashboard.** | Token compromise → unauthorized deploys |
| **SEC-2** | `web/middleware.ts:54` | CSP uses `'unsafe-eval'` in development. If the dev build is ever accidentally deployed to staging/prod (e.g., via `NODE_ENV` misconfiguration), eval-based XSS becomes possible. Should be `NODE_ENV === "production"` guard verified at deploy time, not runtime. | XSS if wrong build deployed |
| **SEC-3** | `web/middleware.ts` | **Missing `Strict-Transport-Security` (HSTS) header.** The middleware sets `X-Frame-Options`, `CSP`, etc., but no HSTS. Without it, browsers may downgrade to HTTP on first load before the cookie is set. Add: `Strict-Transport-Security: max-age=31536000; includeSubDomains` | HTTPS downgrade on first visit |

---

#### 🟠 HIGH — Fix Before Launch

| ID | File | Issue | Risk |
|---|---|---|---|
| **SEC-4** | `web/app/(protected)/catalog/_components/PrintLabelsModal.tsx:9` | Uses `win.document.write()` to inject product `name`, `sku`, `barcode` values into a popup window without escaping. If any product field contains `</script>` or `<img onerror=…>`, it executes in the popup context. Mitigation: use `textContent` assignment or sanitize all fields before injection. | Stored XSS via product data |
| **SEC-5** | `web/middleware.ts` | `middleware.ts` allows `/api` path prefix through without auth check (line: `"/api"` in `PUBLIC_PATH_PREFIXES`). This is correct for MSW in dev, but means all Next.js API routes (`/api/*`) are publicly accessible. If any server-side API routes are added under `web/app/api/`, they must implement their own auth. Currently no real API routes exist there, but this is a silent footgun. | Future API routes exposed |
| **SEC-6** | `src/app.ts` | CORS uses `isDev = process.env.NODE_ENV !== "production"` — any non-production NODE_ENV value (e.g., `"staging"`, `"test"`) opens CORS to all origins. Should be `isDev = process.env.NODE_ENV === "development"` for safety. | CORS bypass in staging |

---

#### 🟡 MEDIUM — Tech Debt

| ID | Issue |
|---|---|
| **SEC-7** | No `SameSite=Strict` or `SameSite=Lax` attribute documented for `finder_refresh` cookie. CSRF risk if backend ever adds state-mutating GET endpoints. |
| **SEC-8** | `imports-exports/page.tsx:116` attaches `Authorization: Bearer <token>` via a direct `fetch()` call outside `apiFetch` — bypasses the 401-refresh retry logic. If token expires mid-upload, the request fails silently with no refresh. |
| **SEC-9** | Rate limiter uses `Math.floor(Date.now() / windowMs)` for Redis fixed-window. This means all clients reset simultaneously at window boundaries — a "thundering herd" burst is possible. Upgrade to sliding window for sensitive endpoints (login, password reset). |
| **SEC-10** | Password reset and signup pages have no client-side rate limiting UI feedback. Backend rate limits, but UX shows no "too many attempts" state — users retry excessively. |

---

### BUGS

#### 🔴 CONFIRMED BUGS

| ID | File | Bug | Impact |
|---|---|---|---|
| **BUG-1** | `web/mocks/mockHandlers.ts:4244 + 5517` | **Duplicate `customer-invoices` handlers** — `GET /customer-invoices`, `GET /customer-invoices/:id`, `POST /customer-invoices`, `PATCH /customer-invoices/:id/status`, `GET /customer-invoices/lookup-upc` all registered **twice** (10 duplicate registrations total). MSW matches the FIRST handler; the second block (lines 5517–5587) is dead code. The second block may have different seed data — silently wrong data if someone edits it thinking it's live. | Wrong/stale mock data; confusing to maintain |
| **BUG-2** | `web/app/(protected)/warehouse/page.tsx` | All 6 tab data-fetch calls (`apiGet(...).then(...)`) have **no `.catch()`**. If any endpoint returns an error, the `loading` state stays `true` forever — the tab shows infinite skeleton. Pages freeze with no user-visible error. | Infinite loading on API failure |
| **BUG-3** | `web/app/(protected)/pricing/page.tsx` | Same as BUG-2 — all 5 tab fetches (`PriceBooksTab`, `TierPricingTab`, etc.) use `.then()` with no `.catch()`. Error state `setError` is defined in some tabs (`ContractPricesTab`) but not all. `PriceBooksTab` and `TierPricingTab` have no error state at all — failures silently set `loading=false` with empty data. | Silent empty UI on error |
| **BUG-4** | `web/app/(protected)/inventory/transfers/page.tsx` | **1-line stub** — `export { default } from "../../operations/page"`. The `/inventory/transfers` route renders the full Operations page, not a transfers page. Users navigating to "Transfers" from inventory sub-nav land on the wrong page. | Confusing UX — wrong page shown |
| **BUG-5** | `web/mocks/mockHandlers.ts` | `GET /orders` handler filters by status but the seed orders (`ord_s_1`–`ord_s_6`) are defined inside the IIFE that also creates `termOrders`. If the orders page filter is used before the IIFE runs (race), 0 orders return. In practice no race, but the handler at line 3851 filters `termOrders` which may not include the 6 seed orders if they were added to a different array. Needs cross-check. | Potential empty orders list |
| **BUG-6** | Multiple stub pages (see list below) | **36 pages are 1-line re-exports** pointing to other modules. Some are intentional (setup/* → settings), but others (finance/bills, finance/payment-made, ecommerce/customers, ecommerce/orders, etc.) render the wrong parent page. Users who bookmark or navigate directly to these URLs see unexpected content. | Confusing UX; SEO/link confusion |

**Stub pages that render wrong content (not intentional aliases):**
`/inventory/count` → operations, `/finance/bills` → finance, `/finance/payment-made` → finance, `/finance/settings` → finance, `/ecommerce/customers` → ecommerce, `/ecommerce/products` → ecommerce, `/ecommerce/shipping` → ecommerce, `/ecommerce/promotions` → ecommerce, `/ecommerce/orders` → ecommerce, `/ecommerce/categories` → ecommerce, `/catalog/gift-cards` → gift-cards, `/catalog/products` → catalog, `/catalog/suppliers` → vendors

---

#### 🟡 MEDIUM BUGS

| ID | File | Bug |
|---|---|---|
| **BUG-7** | `web/app/(protected)/customers/[id]/_components/OrdersTab.tsx:42` | Fetches `GET /orders?limit=200` and client-filters by `customerId`. If a customer has >200 orders, earlier ones are silently dropped. No pagination or "showing N of M" indicator. |
| **BUG-8** | `web/app/(protected)/pricing/page.tsx` (SimulatorTab) | `SimulatorTab` `runSim()` is not wrapped in try/catch. If the API call fails, `loading` stays `true` and the button shows "Resolving…" indefinitely. |
| **BUG-9** | `web/lib/offlineOutbox.ts` | IDB sort uses `(req.result as T[]).sort((a: any, b: any) => ...)` — `any` cast bypasses type safety. If IDB returns non-array (corrupt store), this throws uncaught runtime error. |
| **BUG-10** | `web/lib/offlineOutbox.ts:176` | `(registration as any).sync.register("checkout-replay")` — Background Sync API is typed `as any`, so TypeScript won't catch breaking changes. Also: no fallback check whether Background Sync is actually supported before calling. |

---

### API ENDPOINT COVERAGE

#### Summary
- **Total mock handlers:** 465 routes across `mockHandlers.ts` (7,475 lines)
- **All routes use `await lat()`** — simulated latency on every handler ✅
- **`/api` prefix passthrough** — all real API calls go to `NEXT_PUBLIC_API_BASE_URL`; MSW intercepts `*/api/v1/*` in dev/test ✅

#### Endpoints by domain

| Domain | Count | Notes |
|---|---|---|
| Catalog / Products | ~45 | Full CRUD + variants, batches, expiry, pricing, suppliers, images, analytics, audit |
| Orders | ~12 | Create, list, get, refund, void, email-receipt, timeline, split, kitchen-course |
| Payments | 3 | Create payment, register open/close sessions |
| Customers | ~15 | CRUD, loyalty tier, product prices, adjustments |
| Customer Invoices | 5 (×2 duplicate — BUG-1) | lookup-upc, list, get, create, status patch |
| Purchasing / POs | ~10 | PO CRUD, receive, billing, credits |
| Vendors | ~10 | List, detail, products, POs, invoices, credits, receiving |
| Inventory | ~20 | Serials, reorder, counts, count lines, batches, store-locations, product-locations |
| Inventory Pipeline | 9 | Overview, pending, receiving, reorder, issues (patch), history |
| WMS (Warehouse) | 6 | Dashboard, locations, receiving, putaway, picks, cycle-counts |
| Pricing Engine | 6 | Price books, tier rules, contracts, scheduled, margin rules, simulate |
| EDI Imports | 7 | Queue, upload, validate, process, history, errors, partner config |
| Fulfillment | 7 | Locations, assign, pick-lists CRUD, pack |
| Sales (quotes/orders) | ~12 | Quotations CRUD + workflow, sales orders CRUD + approve/assign/invoice/cancel |
| Accounting | ~10 | Accounts, COA tree, journal entries, reconciliation |
| Team / Roles | ~10 | CRUD, clock-in/out, time entries, custom roles, assign |
| Workforce | ~8 | Employees, shifts, time-off |
| Loyalty | ~10 | Tiers, members, rewards CRUD, adjustments |
| Notifications | 4 | List, mark-read, mark-all-read, create |
| Audit Log | 1 | List with filters |
| Workflows | 7 | CRUD + steps CRUD |
| Golf | ~12 | Tee sheet, bookings, members, pro-shop |
| Restaurant | ~10 | Dashboard, tables, tabs, kitchen queue |
| Automotive | 5 | Work orders, vehicles CRUD |
| Healthcare | 5 | Patients CRUD, dispense |
| Hospitality | 6 | Rooms, charges, settle |
| Education | 6 | Students CRUD, fees, collect |
| Entertainment | 5 | Events, tickets, redeem |
| Manufacturing | 4 | Orders CRUD + status |
| Rental | 5 | Assets, contracts, return |
| Appointments | 2 | List, create |
| Shipping / Ecommerce | 3 | Webhooks CRUD |
| Sync | 3 | Status, queue, push |
| Service Orders | ~5 | CRUD + status patch |
| Promotions | ~5 | CRUD |
| Reports / Insights | ~5 | Sales reps + performance, scheduled reports |
| SSE Stream | 1 | `/api/v1/stream` — MSW mock returns empty stream |

#### Missing mock handlers (FE calls with no handler → 404 in dev)
| Route | Used by |
|---|---|
| `GET /api/v1/customers/:id/orders` | `OrdersTab.tsx` workarounds with `GET /orders?limit=200` — no dedicated endpoint |
| `GET /api/v1/pricing/simulate` | Added by this session ✅ |
| `GET /api/v1/warehouse/*` | Added by this session ✅ |
| `GET /api/v1/catalog/:id/comms` | No communications/comms tab yet |
| `GET /api/v1/customers/:id/comms` | Customer 360 Comms tab not built |

---

### FIREWALLS & NETWORK SECURITY

| Layer | Status | Detail |
|---|---|---|
| **Frontend middleware** | ✅ | Next.js middleware guards all non-`/api` routes; redirects unauthenticated → `/login` |
| **Backend JWT gate** | ✅ | `makeAuthMiddleware()` runs before every route in `src/app.ts`; 401 on invalid/missing token |
| **IP rate limiter** | ✅ | 60 burst / 20 RPS per IP; Redis-backed in prod (atomic Lua); in-memory fallback in dev |
| **Tenant rate limiter** | ✅ | Per-tenant tiered limits (standard/premium/enterprise); runs after auth so tenantId is known |
| **CORS allowlist** | ✅ | Hardcoded Vercel origins in prod; `ALLOWED_ORIGINS` env override; dev-only wildcard |
| **CSP** | ⚠️ | `unsafe-inline` for scripts/styles (required by Next.js without nonce); `unsafe-eval` in dev (SEC-2) |
| **HSTS** | 🔴 | **Missing** — no `Strict-Transport-Security` header in frontend middleware (SEC-3) |
| **XFF IP spoofing** | ✅ | `extractClientIp()` uses rightmost-N strategy based on `TRUST_PROXY_DEPTH`; prevents spoofed `X-Forwarded-For` bypassing rate limits |
| **Helmet** | ✅ | Applied in backend Express app — `X-Powered-By` removed, HSTS set for HTTPS responses |
| **Clickjacking** | ✅ | `X-Frame-Options: DENY` + `frame-ancestors 'none'` in CSP |
| **MIME sniffing** | ✅ | `X-Content-Type-Options: nosniff` |
| **Permissions policy** | ✅ | Camera, microphone, geolocation disabled; payment limited to self |

---

### FALLBACKS & SAFEGUARDS

| Area | Status | Detail |
|---|---|---|
| **Offline checkout** | ✅ | `offlineOutbox.ts` — IndexedDB queue, idempotency keys, Background Sync replay, manual retry fallback |
| **Token refresh** | ✅ | `apiFetch` retries once after 401 via `silentRefresh()`; clears session + redirects on failure |
| **Loading skeletons** | ✅ | All major pages show skeleton loaders (`animate-pulse`) during fetch |
| **Error state display** | ⚠️ | `/warehouse` and `/pricing` tab components have no `.catch()` — freeze on error (BUG-2, BUG-3) |
| **Empty states** | ✅ | All tables have explicit empty-state messages |
| **Confirmation modals** | ✅ | Void, refund, delete, archive all require confirm modal with explicit warning copy |
| **`safeLoad()` wrapper** | ✅ | `api-client/client.ts` — catches unhandled rejections; used in settings, catalog, customers |
| **Environment variable fail-fast** | ✅ | `buildApp()` throws on missing `JWT_SECRET` / `DATABASE_URL` in production before serving |
| **Redis fail-open** | ✅ | Rate limiter Redis path catches errors and calls `next()` — Redis outage doesn't block traffic |
| **SSE reconnect** | ⚠️ | `useNotifications.ts` uses `EventSource` which auto-reconnects; however, there is no max-retry or exponential backoff — on network partition it retries indefinitely at browser default interval (~3s), potentially flooding the server |
| **DB connection pooling** | ✅ | `pg.Pool` with `poolStats()` health check; transactions scoped with `withTenant()` and `withRequestId()` |
| **BIGINT parse** | ✅ | `types.setTypeParser(20, ...)` prevents silent precision loss on int8 values |
| **Order immutability** | ✅ | Orders use status transitions + `order_events` timeline; no in-place edits |
| **Inventory ledger** | ✅ | Every stock change must create an `inventory_movements` record (enforced in architecture spec) |
| **Audit log** | ✅ | `/audit-log` page wired; `audit_logs` table in schema |

---

### NOTIFICATIONS

| Feature | Status | Detail |
|---|---|---|
| **Delivery mechanism** | ✅ SSE | `useNotifications()` opens `EventSource('/api/v1/stream')`; real-time push from backend |
| **Backend broker** | ✅ | `SseBroker` in `src/shared/sse.ts`; per-tenant fan-out; 25s heartbeat; cleanup on disconnect |
| **Redis pub/sub** | ✅ | Cross-instance fan-out via `finder:events` Redis channel (multi-replica safe) |
| **Notification bell** | ✅ | `NotificationBell.tsx`; unread count badge; mark-all-read; dismiss per item |
| **Notification page** | ✅ | `/notifications` — full list, filter (all/unread), severity badges (info/warning/critical) |
| **Event types handled** | ✅ | `order_created`, `payment_captured`, `low_stock`, `tier_upgraded` |
| **Missing event types** | ⚠️ | No handlers for: `sync_error`, `purchase_order_received`, `new_order`, `order_fulfilled`, `payment_failed` — these exist in `NotificationType` enum but `buildNotification()` returns `null` (drops them silently) |
| **In-app toast** | ⚠️ | No toast/snackbar system — notifications only appear in the bell dropdown; high-priority alerts (payment failed, low stock critical) have no immediate visual pop |
| **Email/SMS** | ⚠️ | Architecture specifies email/SMS/push channels; only in-app is wired; `SENDGRID_API_KEY` warned-but-optional in `buildApp()` |
| **Notification preferences** | ✅ | `/notifications` page has channel preference UI (per-type toggles) |
| **SSE reconnect gap** | ⚠️ | If SSE connection drops, notifications between disconnect and reconnect are lost (no catch-up query on reconnect) — should `GET /notifications?since=<lastTs>` on reconnect |

---

### DOMAIN ROADMAP STATUS (updated)

| Priority | Domain | Path | Status |
|---|---|---|---|
| 1 | Sales & Order Management | `/orders`, `/orders/[id]` | ✅ Built (order list + detail + timeline) |
| 2 | Customer 360 | `/customers/[id]` | ✅ Built (8 tabs incl. Orders tab) |
| 3 | Supplier 360 | `/vendors/[id]` | ✅ Built (6 tabs) |
| 4 | Warehouse Management (WMS) | `/warehouse` | ✅ Built (6 tabs: Dashboard, Locations, Receiving, Putaway, Picks, Cycle Counts) |
| 5 | Pricing Engine | `/pricing` | ✅ Built (6 tabs: Price Books, Tier, Contracts, Scheduled, Margin Rules, Simulator) |
| 6 | Promotion Engine | `/promotions`, `/discounts` | 🔶 Basic page — needs upgrade |
| 7 | Enterprise Workflow Engine | `/workflows` | 🔶 Basic page — needs approval chain |
| 8 | Notification Center | `/notifications` | 🔶 In-app only — missing toast, email/SMS, catch-up on reconnect |
| 9 | Document Center | `/documents` | 🔲 Not started |
| 10 | Business Intelligence | `/analytics` | 🔶 Basic dashboards |
| 11 | Automation Engine | `/automations` | 🔶 Basic page |
| 12 | Integration Hub | `/integrations` | 🔶 Basic page |
| 13 | Analytics & AI | `/ai-insights` | 🔶 Basic page |

---

### NEXT PRIORITY QUEUE (post-audit)

#### Immediate fixes (before any new features)

1. **SEC-3** — Add HSTS header to `web/middleware.ts` (1 line)
2. **BUG-1** — Remove duplicate `customer-invoices` handlers from `mockHandlers.ts` (lines 5517–5627)
3. **BUG-2 / BUG-3** — Add `.catch(setError)` to all tab fetches in `/warehouse` and `/pricing`
4. **SEC-4** — Sanitize product fields before `document.write()` in `PrintLabelsModal.tsx`
5. **SEC-1** — Rotate the Vercel token in `.env` immediately

#### Next domain build

6. **Domain 6: Promotion Engine** — `/promotions` full upgrade (coupon types, stacking rules, campaign builder)
7. **Domain 7: Workflow Engine** — configurable approval chain for price changes, refunds, inventory adjustments
8. **Notification gaps** — add toast system, add `sync_error`/`payment_failed` event handlers, SSE catch-up on reconnect
