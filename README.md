# Finder POS — Year 1 Foundation (Modular Monolith)

> **Storage:** Postgres (via `node-postgres`). Set `DATABASE_URL` to a Postgres connection string. Local dev and `npm test` fall back to a throwaway **embedded Postgres** when `DATABASE_URL` is unset, so no external setup is needed to run the suite.


A runnable, offline-first Point-of-Sale backend in Node + TypeScript, implementing
the **Year 1 Foundation** scope of the Finder POS CTO Blueprint. Built as a
**modular monolith**: one process, one Postgres database, five bounded-context
modules that integrate only through a shared DB schema and an in-process event bus.

## Bounded contexts

| Module | Owns | Responsibilities |
|--------|------|------------------|
| **catalog** | `products` | Products/SKUs/categories, tax classes, grocery auto-exemption, demo seed |
| **inventory** | `inventory`, `inventory_movements` | Stock levels, PO receiving, manual adjustments, auto-decrement on sale, restock on refund |
| **orders** | `orders`, `order_lines` | Cart → order, multi-state US tax engine, discounts, refunds/voids |
| **payments** | `payments` | Cash / card (EMV sim) / split tender, change calc, capture against orders |
| **sync** | `sync_queue` | Offline-first outbox, online/offline toggle, push worker w/ exponential backoff |

Integration is **decoupled**: modules never import each other. Cross-module
behavior happens via domain events (`order.created` → inventory decrements;
`payment.captured` → order completes; every event → sync outbox). The full
contract lives in [`CONTRACTS.md`](./CONTRACTS.md).

## Order lifecycle

`open` (rung up) → `completed` (payment captured) → `refunded` / `voided`.
Inventory reacts at ring-up; a captured payment transitions the order to completed.

## Tax engine

State sales-tax rates applied to the taxable portion of (subtotal − discount):
CA 8.25% · NY 8.875% · TX 6.25% · FL 6.00%. Items with category `groceries`
are tax-exempt. All money is integer cents — never floats.

## Run it

```bash
npm install
npm start          # boots the API on http://localhost:3000  (GET /health)
npm test           # 73 unit/integration tests across all modules
npm run smoke      # end-to-end lifecycle: product → stock → order → payment → offline sync → refund
npm run typecheck  # tsc --noEmit, 0 errors
```

## API surface (mounted under `/api/<module>`)

- `catalog`: `POST /`, `GET /`, `GET /:id`, `PATCH /:id`, `DELETE /:id`
- `inventory`: `GET /`, `GET /:productId`, `POST /:productId/receive`, `POST /:productId/adjust`, `PUT /:productId/reorder-point`, `GET /:productId/movements`
- `orders`: `POST /`, `GET /`, `GET /:id`, `POST /:id/refund`, `POST /:id/void`
- `payments`: `POST /`, `GET /:id`, `GET /?orderId=`
- `sync`: `GET /status`, `POST /online`, `POST /push`, `GET /queue`, `POST /pull`

## Offline-first demo

Toggle the terminal offline (`POST /api/sync/online {"online": false}`), ring up
sales — they complete locally and queue in the outbox. Reconnect
(`{"online": true}`) and the push worker drains the queue to the cloud ledger.

## Project layout

```
src/
  shared/      money, db, events, http, types   (shared kernel — do not modify)
  modules/
    types.ts   PosModule contract
    index.ts   module registry (registration = migration order)
    <ctx>/     service.ts · routes.ts · index.ts · *.test.ts   (one per context)
  app.ts       buildApp(): migrations + route mounting + event wiring
  server.ts    HTTP entrypoint
scripts/smoke.ts   end-to-end lifecycle check
```

This is Year 1 of a 5-year roadmap. Year 2+ (Kafka event streaming, multi-tenancy,
ClickHouse analytics, microservice extraction) is documented in the blueprint and
intentionally out of scope here.
