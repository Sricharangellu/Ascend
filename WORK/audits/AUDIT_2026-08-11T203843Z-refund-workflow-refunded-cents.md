# AUDIT — RefundWorkflow `refunded_cents` (and follow-on `refunds` table)

UTC: 2026-08-11T203843Z  
Branch: `cursor/fix-refund-workflow-refunded-cents-6459`  
Status label: **built_verified** (focused real-Postgres regression + unit tests; full suite run recorded on the PR)

## Finding

`RefundWorkflow` step `validate_refund_eligibility` selected `orders.refunded_cents`. That column is not created by any migration or module DDL. Against a real database the step always failed with `column "refunded_cents" does not exist`.

The existing unit test faked `db.one` to return a `refunded_cents` value and never executed the SQL — same mock-masked class as catalog search (`q`) and earlier route-drift bugs.

## User-visible effect (proven, not inferred)

1. `POST /api/orders/:id/refund` returns **200** and sets `orders.status = 'refunded'`.
2. `WorkflowRunner.register` catches workflow errors and logs them; the HTTP path does not wait for success.
3. Inventory and accounting still react via their own `order.refunded` listeners (so restock/ledger for the live POS path continues to work).
4. The workflow instance is left `compensated`. Retries (~0.5–1s × 3) can delay the request slightly even though status stays 200.

## Fix

| Change | Why |
|---|---|
| Drop `refunded_cents` from the SELECT | Live POS refunds are a full-order status flip (`OrdersService.refund`). No partial-refund column exists or is needed. |
| Accept `totalCents` in `buildContext` | `OrdersService` publishes `{ totalCents }`; the typed payload used `refundCents`/`originalTotalCents`. Without the alias the workflow ran at **0¢**. |
| Add `refunds` table to `ORCHESTRATION_MIGRATIONS` | Next step (`check_double_refund_guard`) failed with `relation "refunds" does not exist`. Same silent-failure class; table columns match the workflow SQL. |
| Real-DB regression tests | Prove (a) validate runs without the phantom column, (b) double-refund guard can INSERT into `refunds`. |

## Deliberately not fixed here

- `customer_returns`, `transfer_orders`, `inventory_reservations` — also referenced by orchestration, also missing DDL. Filed in `WORK/LOOP_STATE.md`.
- Aligning `OrdersService.refund` payload to the typed `OrderRefundedPayload` (lines, customerId) — alias is enough for amounts; inventory restock is already handled by the inventory module listener.
- Making the HTTP path fail closed when the workflow fails — product decision; inventory/accounting are the source of truth today.

## Evidence

- Pre-fix (debug session): real PG error `column "refunded_cents" does not exist`; `information_schema` listed no such column; after dropping the column, next failure was `relation "refunds" does not exist`.
- Post-fix: focused tests in `src/orchestration/tests/refund.workflow*.test.ts`.
