# Domain Event Catalog — authored by the BACKEND agent

Format: `event.type` | payload | producer | consumers | notes  
EventBus mirrors Kafka: topic = event type, key = aggregateId, handlers idempotent.

---

## Wave 0 — Gateway & identity foundation

| Event type | Payload | Producer | Consumers | Notes |
|---|---|---|---|---|
| `identity.login` | `{ userId, tenantId, role }` | identity | audit (future) | Emitted on successful credential verification. Aggregate id = userId. |

---

## Wave 1 — Core commerce (placeholder — will be filled by the Backend agent in Wave 1)

| Event type | Payload | Producer | Consumers | Notes |
|---|---|---|---|---|
| `order.created` | `{ orderId, orderNumber, lines[], tenantId, totalCents }` | orders | inventory, sync | Triggers stock decrement per line. |
| `order.refunded` | `{ orderId, orderNumber, totalCents, tenantId }` | orders | inventory, sync | Triggers stock restock per line. |
| `payment.captured` | `{ paymentId, orderId, method, amountCents, changeCents, tenantId }` | payments | orders, sync | Transitions order → completed. |
| `product.created` | `{ id, sku, name, priceCents, category, taxClass, tenantId }` | catalog | sync | Aggregate id = product id. |
| `product.updated` | `{ id, ...changed fields, tenantId }` | catalog | sync | Aggregate id = product id. |
| `inventory.adjusted` | `{ productId, delta, reason, stockQty, tenantId }` | inventory | sync | reason: receiving \| sale \| adjustment \| return. |

---

## Conventions

- All events published via `EventBus.publish(type, payload, aggregateId)`.
- `aggregateId` = the primary key of the changed entity (partition key for future Kafka).
- Handlers **must be idempotent** — the bus delivers at-least-once in the in-process model.
- The Sync module subscribes via `events.onAny()` and writes every event to the `sync_queue` outbox.
- When Kafka is adopted (Level 3), `topic = event.type`, `key = aggregateId`; no code changes in producers.
