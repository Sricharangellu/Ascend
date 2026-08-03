# Webhooks API

See also: [Admin guide — Webhooks](../admin/webhooks.md)

## Endpoints

All webhook endpoints require `owner` role.

### List webhooks
```http
GET /api/v1/webhooks/
Authorization: Bearer <owner-token>
```

### Create webhook
```http
POST /api/v1/webhooks/
Authorization: Bearer <owner-token>
Content-Type: application/json

{
  "url": "https://your-system.com/finder-webhook",
  "eventTypes": ["order.completed", "inventory.low_stock"],
  "secret": "optional-hmac-secret"
}
```

### Toggle webhook
```http
PATCH /api/v1/webhooks/:id
Authorization: Bearer <owner-token>
Content-Type: application/json

{ "active": false }
```

### Delete webhook
```http
DELETE /api/v1/webhooks/:id
Authorization: Bearer <owner-token>
```

### Delivery log
```http
GET /api/v1/webhooks/deliveries
Authorization: Bearer <owner-token>
```

Returns recent deliveries with `status` (delivered / failed), `responseCode`, and `responseBody`.

## Event payload examples

### `order.completed`
```json
{
  "id": "evt_01jz...",
  "type": "order.completed",
  "tenantId": "tnt_demo",
  "timestamp": 1717123456789,
  "data": {
    "orderId": "ord_01jz...",
    "totalCents": 2499,
    "lineCount": 3,
    "customerId": "cust_01jz...",
    "tenderMethod": "card"
  }
}
```

### `inventory.low_stock`
```json
{
  "id": "evt_01jz...",
  "type": "inventory.low_stock",
  "tenantId": "tnt_demo",
  "timestamp": 1717123456789,
  "data": {
    "productId": "prod_01jz...",
    "sku": "SODA-12OZ",
    "onHand": 3,
    "reorderPoint": 10
  }
}
```

### `loyalty.tier_upgraded`
```json
{
  "id": "evt_01jz...",
  "type": "loyalty.tier_upgraded",
  "tenantId": "tnt_demo",
  "timestamp": 1717123456789,
  "data": {
    "customerId": "cust_01jz...",
    "fromTier": "Bronze",
    "toTier": "Silver",
    "totalPoints": 512
  }
}
```

## SSE stream

For real-time in-app subscriptions (not webhooks to external URLs):

```http
GET /api/v1/stream
Authorization: Bearer <token>
Accept: text/event-stream
```

Events are delivered as SSE in the same envelope as webhooks. The connection is kept alive with heartbeat comments (`:`).
