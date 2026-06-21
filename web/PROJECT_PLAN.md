# Project Plan — FinderPOS
Last updated: 2026-06-20

## What we built so far

FinderPOS is a full-stack enterprise POS platform targeting retail, wholesale, and distribution businesses (tobacco, vapor, hemp specialty retail). The frontend has 32 protected pages covering every area of the business — from a real-time POS terminal to MSA compliance reporting and loyalty program management. The backend is a modular monolith with 27 domain modules, 304 integration tests, CI/CD via GitHub Actions, Docker support, and deployed live on Vercel.

---

## Done ✅

- **POS Terminal** — touch-friendly register with barcode scanner, split tender, age verification, offline sync, receipt printing/emailing; barcode scan toast; thermal receipt print template
- **Dashboard** — KPI tiles with trend indicators, Recharts revenue trend + hourly bar charts, sales-by-category breakdown, top products/customers; New Quote quick-action
- **Catalog** — product browse, filter, bulk-select, CSV import/export, barcode generation, master/variant product management
- **Inventory** — stock levels, lot/expiry tracking (FEFO), cycle counts, reorder alerts, SSE low-stock notifications; Stock Locations tab (per-outlet) with View Stock modal
- **Orders** — order list, detail drawer, status management, cursor pagination
- **Customers** — CRM list, detail page with loyalty tier card (tier badge, points, progress bar), financial summary, collapsible Addresses, Contacts, Notes sub-panels
- **Quotations (/quotes)** — create quotes with line items, send, convert to order, full status lifecycle
- **Sales / Sales Orders** — sales order create/approve/invoice workflow, credit limit enforcement
- **Purchasing** — PO create/receive (partial receive), supplier management, vendor quotes tab (feature-flagged)
- **Discounts** — rule builder (simple/volume/BXGY), coupon codes, per-customer limits
- **Gift Cards** — issue, check balance, void
- **Loyalty Program (/loyalty)** — tier configuration, points rules, member lookup, tier assignment, points adjustment with audit trail
- **Workflows** — visual workflow builder with per-outlet step configuration, step type badges, inline enable/disable
- **Insights** — velocity-based reorder recommendations, scheduled report emails, "Create Draft POs" button
- **Reports** — 8 report types (sales, P&L with BarChart, AR/AP aging, inventory, expiry, sales-by-rep, sales-by-vendor); Recharts AreaChart on sales report
- **Accounting** — chart of accounts, journal entries, batch deposits (approve flow)
- **Finance** — AR/AP aging surface with payment actions
- **Settings** — 12 sections: store profile, shipping, payment terms/modes, tax rates, feature flags, security (MFA setup), COA, deposits, loyalty tiers, API keys, currencies
- **Tax & Compliance** — tax rate management, MSA reporting table (tobacco/vapor UPC data), state tax reference, customer exemptions placeholder
- **Operations** — fulfillment locations, pick lists, outlets/registers, stock locations tab with View Stock modal
- **Notifications Center (/notifications)** — notification feed with category filters, mark-read, dismiss, SSE real-time indicator
- **Audit Log (/audit-log)** — security and change audit log with actor/action/entity filters, cursor pagination, CSV export
- **Team** — member list, role management, custom-role assignment
- **Custom Roles** — RBAC with granular permission management (/team/custom-roles)
- **Ecommerce** — storefront settings, online orders, catalog sync
- **Shipping** — shipping order list with carrier/tracking, ship action
- **Payments** — payment ledger page
- **Returns** — returns management from completed orders
- **Vendors** — vendor/supplier management page
- **Integrations** — integration provider grid (connect/disconnect), company integration management
- **Imports/Exports** — CSV import batch tracking + export buttons
- **Onboarding wizard** — post-signup 4-step setup (business type → store info → first product → done)
- **Auth** — login, signup, MFA setup (TOTP), password reset, SSO (OIDC), API keys, device registration
- **CI/CD** — GitHub Actions pipeline (typecheck → test → build → deploy), Docker, helmet.js security headers

---

## To Do 📋

### Right now (next 1–3 tasks)

- **Per-outlet inventory deduction** — Terminal checkout currently has no outlet selector and doesn't deduct stock. Add an outlet/register picker to the terminal header and fire `POST /api/v1/inventory/deduct` after every successful payment, passing the outlet's location ID and cart lines.

- **Quick stock adjustment** — Inventory page has no way to manually correct stock levels. Add an "Adjust" action per row that opens a modal: reason (cycle count / damage / theft / received / other), delta quantity (+/-), optional note. Fires `POST /api/v1/inventory/adjustments`.

- **Stock movement ledger** — Inventory detail has no history. Add a Movements tab showing a chronological log of stock in/out events (adjustments, sales deductions, PO receives) with actor, timestamp, and running balance.

### Coming up (next wave of work)

- **Deploy to Vercel** — Run `bash deploy.sh` from repo root when ready.

- **Stripe Terminal simulation** — Mock card reader in the terminal: after Charge, show a "Tap / Swipe / Insert card" animation screen with simulated 2s processing before completing payment.

- **Reorder auto-draft POs** — The Insights page has "Create Draft POs" button but it likely does nothing. Wire it to `POST /api/v1/purchasing/orders/auto-draft` which creates draft POs for all items below reorder point.

### Future ideas

- **Redis rate limiting** — Replace in-memory token bucket with Redis-backed rate limiter for multi-instance deployments.
- **Customer portal** — Separate Next.js app where B2B customers log in, view invoices, reorder.
- **Stripe Terminal (real)** — Wire actual card reader (BBPOS WisePOS E) via Stripe Terminal SDK.
- **Multi-company** — Per-tenant schemas instead of shared schema with `tenant_id`.
- **Data warehouse ETL** — Nightly aggregation for fast dashboard queries.

---

## Blocked or waiting ⏸

- **Vendor quotations backend** — vendor quotes tab in Purchasing is mock-only.
- **MFA email/SMS fallback** — TOTP built but no backup codes or email OTP path.
- **Redis** — Requires infra decision before adding.

---

## What to build next

Per-outlet inventory deduction closes the biggest operational gap — without it, the terminal records sales but never reduces stock, so inventory is always wrong after the first sale. Pairing it with quick stock adjustment and a movement ledger gives cashiers and managers a complete stock-accuracy workflow: deduct on sale, adjust for shrink, audit the trail.

---

## Files to clean up 🗑

- `web/components/ModuleBlueprint.tsx` — stub component from original placeholder pages; check if still imported before deleting.
- `web/lib/useDesignProcess.ts` — not imported anywhere; safe to remove if confirmed.
