# Error codes

## Error envelope

All errors return a JSON body with this structure:

```json
{
  "error": {
    "code": "machine_readable_code",
    "message": "Human readable explanation",
    "requestId": "01935abc-dead-7f00-b33f-01234567890a"
  }
}
```

Use `code` for programmatic handling. Use `message` for display. Use `requestId` when contacting support.

## HTTP status → error category

| Status | Category | When it fires |
|---|---|---|
| 400 | Validation error | Request body or params failed schema validation |
| 401 | Unauthenticated | Missing, malformed, or expired access token |
| 403 | Forbidden | Valid token but insufficient role |
| 404 | Not found | Resource does not exist or belongs to another tenant |
| 409 | Conflict | Business rule violation (see codes below) |
| 422 | Unprocessable | Semantically invalid (e.g. refund > original amount) |
| 429 | Rate limited | Too many requests |
| 500 | Server error | Unexpected error — report with `requestId` |
| 503 | Unavailable | Database or dependency unavailable |

## Common error codes

### Auth & identity

| Code | Status | Meaning |
|---|---|---|
| `unauthenticated` | 401 | No or malformed Authorization header |
| `token_expired` | 401 | Access token has expired — refresh it |
| `token_invalid` | 401 | Token signature or structure is invalid |
| `forbidden` | 403 | Role does not have permission for this action |
| `invalid_credentials` | 401 | Email or password is incorrect |
| `mfa_required` | 401 | Account has MFA enabled; provide TOTP code |
| `mfa_invalid` | 401 | TOTP code is incorrect or expired |

### Catalog & inventory

| Code | Status | Meaning |
|---|---|---|
| `sku_conflict` | 409 | A product with this SKU already exists |
| `barcode_conflict` | 409 | A product with this barcode already exists |
| `product_in_use` | 409 | Cannot delete a product that appears on orders |
| `insufficient_stock` | 409 | Not enough on-hand inventory for this sale |
| `lot_expired` | 409 | The batch/lot for this product has expired |
| `category_not_empty` | 409 | Cannot delete a category that has products |

### Orders & payments

| Code | Status | Meaning |
|---|---|---|
| `order_not_found` | 404 | Order ID does not exist |
| `already_refunded` | 409 | Order or line has already been refunded |
| `refund_exceeds_original` | 422 | Refund amount exceeds original payment |
| `void_window_expired` | 409 | Order is from a previous day; cannot void |
| `payment_failed` | 409 | Card payment was declined |
| `idempotency_conflict` | 409 | Duplicate idempotency key with different payload |

### Compliance

| Code | Status | Meaning |
|---|---|---|
| `age_restricted` | 409 | Product requires age verification |
| `state_restricted` | 409 | Product is blocked in the outlet's state |
| `msa_required` | 409 | MSA reporting required for this product type |

### Vertical-specific

| Code | Status | Meaning |
|---|---|---|
| `asset_unavailable` | 409 | Rental asset is not in Available status |
| `insufficient_capacity` | 409 | Event ticket quantity exceeds remaining capacity |
| `already_redeemed` | 409 | Ticket QR code has already been scanned |
| `ticket_not_found` | 404 | Ticket QR code not found |
| `prescription_exhausted` | 409 | No refills remaining on this prescription |
| `prescription_expired` | 409 | Prescription has passed its expiry date |
| `already_paid` | 409 | Fee or invoice has already been collected/paid |
| `room_not_available` | 409 | Room is not in a status that allows check-in |

### Gift cards & store credit

| Code | Status | Meaning |
|---|---|---|
| `gift_card_not_found` | 404 | Gift card code does not exist |
| `gift_card_voided` | 409 | Gift card has been voided |
| `gift_card_insufficient` | 409 | Gift card balance is less than requested amount |
| `insufficient_store_credit` | 409 | Customer store credit balance is too low |
