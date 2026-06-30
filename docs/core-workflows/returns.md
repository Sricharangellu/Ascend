# Returns & refunds

## Who can process returns

| Action | Minimum role |
|---|---|
| Full refund to original tender | Manager |
| Partial refund | Manager |
| Exchange (refund + new sale) | Manager |
| Void (same-day, before close) | Manager |
| Issue store credit | Manager |

Cashiers cannot initiate returns without a manager override PIN.

## Full refund

1. Go to **Orders** → find the original order (search by receipt number, customer, or date)
2. Click **Refund**
3. Select lines to refund (or "Refund all")
4. Choose refund method:
   - **Original tender** — most common; reverses the card charge or returns cash
   - **Store credit** — issues credit to the customer's account
5. Confirm — inventory is restocked, loyalty points are reversed

## Partial refund

Same flow as full refund; deselect the lines you are not refunding, or reduce the quantity on each line before confirming.

## Void (same-day)

Voiding is faster than refunding — it cancels the transaction before it settles.

1. Go to **Orders** → find the order (must be today's date and status `open` or `completed`)
2. Click **Void**
3. Enter your manager PIN
4. Confirm — the order is marked `voided`; no settlement occurs

Voiding is only available until end-of-day close. After that, use a refund.

## Exchange

An exchange is a return + new sale in one flow:

1. Open the original order → **Refund**
2. Check "Apply as store credit"
3. Open the register and select the customer
4. Add the replacement item(s) — the store credit auto-applies at tender

## Restocking

By default, returned items are restocked to inventory automatically. To mark a returned item as damaged (do not restock):

- In the refund flow, uncheck **Return to stock** for that line

## Common error codes

| Code | Meaning |
|---|---|
| `already_refunded` | This order (or line) has already been refunded |
| `refund_exceeds_original` | Refund amount is more than the original payment |
| `void_window_expired` | Order is from a previous day; use refund instead |
| `insufficient_role` | Your role cannot perform this action |
