# REST API overview

## Base URL

```
https://your-domain.com
```

All business routes are versioned under `/api/v1/`. Infrastructure routes are at root.

## API modules

| Tag | Base path | Description |
|---|---|---|
| Platform | `/healthz`, `/readyz`, `/metrics` | Health probes and metrics |
| Identity | `/api/identity/` | Auth, users, MFA, API keys, SSO |
| Catalog | `/api/v1/catalog/` | Products, variants, categories, barcodes |
| Inventory | `/api/v1/inventory/` | Stock levels, receiving, adjustments, cycle counts |
| Orders | `/api/v1/orders/` | POS orders, refunds, voids |
| Payments | `/api/v1/payments/` | Capture, Stripe Terminal |
| Customers | `/api/v1/customers/` | Profiles, addresses, store credit, loyalty, custom prices |
| Loyalty | `/api/v1/loyalty/` | Tiers, members, rewards |
| Discounts | `/api/v1/discounts/` | Rules, promo codes, evaluation |
| Billing | `/api/v1/billing/` | Invoices, bills, AP/AR |
| Purchasing | `/api/v1/purchasing/` | Suppliers, purchase orders, vendor credits |
| Sales | `/api/v1/sales/` | Quotations, sales orders, tier pricing, reps |
| Fulfillment | `/api/v1/fulfillment/` | Pick lists, packing, shipping |
| Shipping | `/api/v1/shipping/` | Shipments, tracking, delivery |
| Reports | `/api/v1/reports/` | All analytics endpoints |
| Insights | `/api/v1/insights/` | Scheduled reports, reorder recommendations |
| Settings | `/api/v1/settings/` | Business profile, feature flags, receipts, tax |
| Outlets | `/api/v1/outlets/` | Outlets, registers, shifts, cash movements |
| Webhooks | `/api/v1/webhooks/` | Subscription management |
| Notifications | `/api/v1/notifications/` | In-app notifications |
| Workforce | `/api/v1/workforce/` | Employees, shifts, time off, time entries |
| Gift Cards | `/api/v1/giftcards/` | Issue, redeem, void |
| Accounting | `/api/v1/accounting/` | Chart of accounts, deposits |
| Sync | `/api/v1/sync/` | Offline sync queue |
| Audit Log | `/api/v1/audit_log/` | Change history |
| E-Commerce | `/api/v1/ecommerce/` | Online catalog, checkout, orders |
| SSO | `/api/v1/sso/` | OIDC initiation and callback |
| Service Orders | `/api/v1/service-orders/` | Repair tickets |
| Appointments | `/api/v1/appointments/` | Calendar bookings |
| Healthcare | `/api/v1/healthcare/` | Patients, prescriptions |
| Automotive | `/api/v1/automotive/` | Vehicles, work orders |
| Hospitality | `/api/v1/hospitality/` | Rooms, charges, settlement |
| Manufacturing | `/api/v1/manufacturing/` | Production orders, BOM |
| Rental | `/api/v1/rental/` | Assets, contracts |
| Entertainment | `/api/v1/entertainment/` | Events, tickets, redemption |
| Education | `/api/v1/education/` | Students, fees |

## Full OpenAPI spec

The machine-readable spec is at [`contracts/openapi.yaml`](../../contracts/openapi.yaml).

Generate a typed client:
```bash
npx openapi-typescript contracts/openapi.yaml -o web/api-client/schema.d.ts
```

## Global conventions

### Authentication
See [Authentication](authentication.md).

### Tenant isolation
Every JWT carries a `tenantId` claim. All data is automatically scoped to the caller's tenant. Never pass `tenantId` as a request parameter.

### Money
All money values are **integer cents** (e.g. `$10.99 = 1099`). The API never uses floating-point for money.

### Timestamps
All timestamps are **Unix epoch milliseconds** (integer, not ISO string).

### IDs
All IDs are UUID v7 strings with a resource-type prefix:
- `usr_` — users
- `tnt_` — tenants
- `ord_` — orders
- `prod_` — products
- `cust_` — customers
- `veh_` — vehicles
- `wo_` — work orders
- `room_` — rooms
- `evt_` — events
- `tkt_` — tickets

### Roles
Three system roles control access: `owner > manager > cashier`. Endpoints that require elevated roles return `403 Forbidden` if the caller's role is insufficient.

### Pagination
List endpoints use cursor-based pagination. See [Pagination](pagination.md).

### Error envelope
All errors use a consistent structure:
```json
{
  "error": {
    "code": "machine_readable_code",
    "message": "Human readable description",
    "requestId": "correlates to backend logs"
  }
}
```
See [Error codes](error-codes.md).
