# ADR-006: Purchasing units convert at the edge; inventory stays in one base unit

Date: 2026-07-28 · Status: Accepted

**Context:** `product_units` (tenant-wide, no `product_id`) and `product_barcodes.pack_size`
(per-product) both existed as unused stubs — neither purchasing, receiving, nor
POS ever consulted them, so "receive 5 CASE" always meant 5 in whatever unit
`stock_qty` already used. Needed: real case/box purchasing and receiving,
without touching the shape every other module (`reorderAlerts()`, accounting,
reports) already assumes `inventory.stock_qty` / `order_lines.quantity` /
`purchase_order_lines.quantity` to be.

**Decision:** `product_barcodes` (barcode + `kind` + `pack_size`, already
per-product) is the single source of a product's purchasing/selling units —
`product_units` stays unused rather than retrofitted, since it has no
per-product linkage and a tenant-wide "1 CASE = N" can't express that a case
of soda and a case of napkins hold different counts.

**Invariant: inventory always exists in exactly one canonical base unit
("each").** `stock_qty`, `order_lines.quantity`, and
`purchase_order_lines.quantity` never mean anything but base units, in every
module, unconditionally. A purchasing/receiving unit ("case", "box") is only
ever a *transaction-time* input — `PurchasingService.resolveUnitPackSize()`
converts it to base units (and divides `unitCostCents` by the same pack size)
at the API boundary, before `createOrder()`/`receive()` — the tested core
logic — ever sees it. Neither method has any unit-awareness; they cannot,
because they never receive anything but base-unit quantities. This is what
makes costing, FEFO lots, reorder points, and reporting correct without any
of them needing to know units exist.

**Consequences:** Adding a new purchasing unit for a product is pure
configuration (`POST /catalog/:id/barcodes`) — no schema or code change.
Requesting an unconfigured unit fails closed (400 `unit_not_configured`),
never silently miscalculates. Receiving's cases×units-per-case UI now
prefills from this real config instead of a generic guess, but stays
editable — a supplier under-shipping a case (10 instead of 12) is an
exception the receiving desk can override in the moment, not a reason to
edit product master data. Scope is deliberately Purchasing + Receiving only:
POS/Sales unit-aware scanning, and unit-awareness in adjustments/transfers/
cycle-counts/returns, are explicitly deferred until a real tenant need
appears for each — not built speculatively alongside this.

**Considered and deferred:** promoting "Packaging" to a first-class domain
(dimensions, weight, shipping class, hazmat, deposit, pallet pattern) above
today's barcode+pack_size model. The direction is reasonable *if* Ascend
grows into distribution/logistics, but no current tenant need justifies it —
same rationale as ADR-004: extend when a real case requires it, not ahead of
one. `product_barcodes` remains the correct, working home for units until
that evidence exists.
