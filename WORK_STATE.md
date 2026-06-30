# FinderPOS — Work State
> Last updated: 2026-06-30  |  Last commit: `fc6aa85`

---

## Launch-readiness status

| Area | Status | Notes |
|---|---|---|
| **Authentication** | ✅ Built | Login (368 ln), Signup (174 ln), protected layout, route guard |
| **Terminal / Register** | ✅ Built | Full checkout: barcode scan, cart, tender, receipt, offline queue, card reader screen |
| **Product Catalog** | ✅ Built | List + filters + sort + bulk update + CSV import/export + duplicate + image + detail page + variants + price book |
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
| **Team / Roles** | ✅ Built | Staff list, custom roles, permissions |
| **Workflows** | ✅ Built | Automation rules, condition/action builder, step editor |
| **Settings** | ✅ Built | Mega-page: store profile, tax rates, payment modes, loyalty tiers, shipping, security, COA, receipt templates, API keys, currencies |
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
| **Golf** | ❌ Missing | Tee sheet, bookings, members, pro-shop — 0 pages |

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

1. **Golf vertical** ← IN PROGRESS (mock handlers done, pages + nav pending)
2. **Fix `as any` in 4 production files** (TypeScript — HIGH)
3. **Add `role="alert"` to error messages** (Accessibility — widespread)
4. **Replace `(cents / 100).toFixed(2)` with `formatMoney()`** (Design system)
5. **Replace `#D9D9D9` with `border-slate-200`** (Design system)

---

## Enterprise Guardian — Last Audit

> Run: 2026-06-30  |  Score: 82/100  |  Status: ⚠️ NOT LAUNCH-READY (3 domains below threshold)

### Domain Scores

| Domain | Score | Grade | Top Finding |
|---|---|---|---|
| TypeScript strictness | 90/100 | ⚠️ | 6 `as any` / `: any` uses in production code |
| Security | 98/100 | ✅ | Zero secrets, no XSS, no console.log — clean |
| API contract | 88/100 | ✅ | All stubs redirect to valid targets; Golf handlers added |
| Component quality | 76/100 | ❌ | 5 pages >1200 ln need splitting; ecommerce tab loads ok |
| Accessibility | 68/100 | ❌ | 269 error messages missing `role="alert"` — widespread |
| Performance | 85/100 | ✅ | Tab-scoped loads inside useEffect([]) are fine; memoization ok |
| Design system | 74/100 | ❌ | `#D9D9D9` in 15+ files; `toFixed(2)` instead of `formatMoney()` in 12+ files |
| Nav/routing | 92/100 | ⚠️ | Golf dir has no NavKey; all other stubs verified valid |

### CRITICAL (blocks launch — fix first)

_None found. TypeScript is clean._

### HIGH (degrades enterprise readiness — fix this session)

- [ ] **web/app/(protected)/golf/** — Golf vertical has zero nav wiring. `golf` dir is unreachable from the nav shell. Add NavKey, ALL_NAV_ITEMS entry, MODULE_BY_ACTIVE mapping, NavIcon case, and build 4 pages: tee sheet, bookings, members, pro shop.

- [ ] **web/app/(protected)/ecommerce/page.tsx:300-301** — `(r as any).storeName` and `(r as any).acceptOnlineOrders`. The store settings API response is not typed. Add a `StoreSettings` interface to `types.ts` and replace `as any`.

- [ ] **web/app/(protected)/purchasing/[id]/page.tsx:329** — `apiGet<{ items: any[] }>("/api/v1/inventory/expired")`. The expired lots response is untyped. Define `ExpiredLot` interface and use it.

- [ ] **Accessibility: `role="alert"` missing on ~269 error displays** — Pattern `{error && <p className="text-red...">` throughout the codebase. Enterprise a11y requirement: every programmatic error must announce via `role="alert"`. Affects all async pages.

### MEDIUM (tech debt — fix before v2)

- [ ] **web/app/(protected)/inventory/page.tsx:1134, 1158** — `children?: any` in two local component interfaces. Replace with `React.ReactNode`.

- [ ] **web/app/(protected)/purchasing/[id]/page.tsx:954** — `lot: any` in `.map()`. Replace with typed `ExpiredLot` once defined.

- [ ] **Design system — money formatting** — 12+ files use `(cents / 100).toFixed(2)` or define local `fmt()` helpers instead of `formatMoney()`. Worst offenders: `catalog/page.tsx` (3 instances + local reimplementation at lines 23 and 281), `catalog/promotions/page.tsx`, `customers/[id]/page.tsx`, `accounting/page.tsx`.

- [ ] **Design system — hard-coded `#D9D9D9`** — Used for form input borders across 15+ files. Replace with `border-slate-200` (Tailwind token). Worst: `customers/page.tsx` (3×), `hospitality/page.tsx` (6×), all reporting pages.

- [ ] **Page size — split required** — Enterprise standard: no page file >800 lines. Violators:
  - `settings/page.tsx` — 1818 ln → split into `<GeneralSettingsTab>`, `<TaxSettingsTab>`, `<PaymentSettingsTab>`, etc.
  - `customers/[id]/page.tsx` — 1705 ln → split tabs into separate components
  - `catalog/page.tsx` — 1501 ln → `<ProductsTab>`, `<VariantsTab>` etc. already done; extract further
  - `inventory/page.tsx` — 1231 ln
  - `purchasing/page.tsx` — 1202 ln

### LOW (polish — backlog)

- [ ] `web/lib/offlineOutbox.ts` — `(req.result as T[]).sort((a: any, b: any)...)` — IDB typing limitation, acceptable but could use `IDBRequest<T[]>` typing.

- [ ] `web/lib/offlineOutbox.ts:176` — `(registration as any).sync.register(...)` — ServiceWorker Background Sync API not typed in TS lib. Add `@types/serviceworker` or a local ambient declaration.

### Next session must-do (Claude's priority queue)

1. **Complete Golf vertical** — nav wiring + 4 pages (tee sheet, bookings, members, pro shop)
2. **Fix HIGH `as any` items** — ecommerce StoreSettings type, purchasing ExpiredLot type
3. **Batch `role="alert"` fix** — add to all `{error && <p ...>}` patterns across protected pages
4. **Money formatting sweep** — replace all `toFixed(2)` with `formatMoney()`, delete local `fmt()` helpers
5. **`#D9D9D9` → `border-slate-200` sweep** — global find/replace across app files
6. Do not start new vertical features until score ≥ 88 and Golf is in nav
