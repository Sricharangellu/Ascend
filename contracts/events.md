# Domain Event Catalog — authored by the BACKEND agent.

Format: `event.type` | payload | producer | consumers | notes
EventBus mirrors Kafka: topic = event type, key = aggregateId, handlers idempotent.

## Wave 1 (placeholder)
- order.created | {orderId, lines[], tenantId} | orders | inventory, sync | decrement stock
- payment.captured | {paymentId, orderId, tenantId} | payments | orders, sync | complete order
