# Standalone Bug Fix — insights.createReorderPOs()

Date: 2026-07-28
Trigger: found while writing the Phase 7 gap-analysis audit
(`WORK/audits/AUDIT_2026-07-28T203748Z-phase7-demand-planning-foundation-gap.md`,
Finding 2). Sri's explicit instruction: fix this as a standalone
production-correctness task, separate from and not combined with any Phase 7
feature work.

## The bug

`InsightsService.createReorderPOs()` (wired to the live "Create Draft POs"
button on `/insights` → Forecasting tab) previously:

- `INSERT INTO po_lines (...)` — a table that does not exist anywhere in the
  schema. The real table, owned by the purchasing module, is
  `purchase_order_lines`. Every call threw a Postgres "relation does not
  exist" error.
- `INSERT INTO purchase_orders (..., supplier_name, notes, created_by,
  expected_date, ...)` — several of those columns aren't on the real table
  either.
- Minted its own PO number (`` `AUTO-${...}` ``) instead of the shared,
  race-free `nextDocSeq` sequence every other PO-creation path uses.
- Hardcoded `unit_cost_cents = 0` / `line_cost_cents = 0` for every line —
  no cost lookup at all.
- Bypassed `purchasing.createOrder()` entirely: no approval-tier gating, no
  audit trail (`logApproval`), none of Phase 6's safety-stock/MOQ/lead-time
  logic (moot anyway since it targeted a non-existent table).
- Grouped products by `supplierId`, but `reorderRecommendations()` — the
  method it reads from — hardcoded `supplier_id` to `NULL::text` in its own
  query, so every product landed in a single, meaningless "Unassigned"
  group regardless of what supplier was actually configured.

**Correction to the Phase 7 audit's framing:** the `insights` module is not
untested in general — `insights.test.ts` (10 tests) and
`health-scores.test.ts` (3 tests) already existed and passed. The original
"zero tests" claim came from a `Glob` search rooted in the wrong working
directory. What's actually true: `createReorderPOs()` specifically had zero
coverage — nothing in either file ever called
`POST /create-reorder-pos`, consistent with a bug like this shipping
unnoticed.

## The fix

- `reorderRecommendations()`'s query now resolves the real preferred
  supplier via a `LEFT JOIN product_suppliers ps ON ... AND ps.is_preferred
  = true` (mirroring the pattern already used in `inventory/pipeline-
  views.ts`'s `reorderAlerts()`), replacing the hardcoded `NULL::text AS
  supplier_id`. Also now selects `ps.cost_cents AS preferred_cost_cents` —
  additive field on `ReorderRecommendation`, needed to remove the hardcoded
  `unit_cost_cents = 0`. A product's `is_preferred` link is unique
  (catalog's exclusive-preferred-supplier invariant), so the join adds at
  most one row per product — no row-multiplication risk with the existing
  `order_lines`/`orders` join in the same query.
- `createReorderPOs()` now groups by the real `supplierId`. Products with no
  preferred supplier configured **cannot** become a PO —
  `purchase_orders.supplier_id` is `NOT NULL` on the real table, so there is
  no such thing as a real "Unassigned" PO — they're reported back in a new
  `skipped: Array<{productId, sku, name, reason}>` field instead of being
  silently dropped or (as before) inserted into a broken record.
- Each supplier group now calls `this.purchasing.createOrder(supplierId,
  lines, tenantId, actor)` — real doc-numbering, real approval-tier gating,
  real audit trail, real per-line cost (`preferredCostCents ?? 0`, 0 only
  when the preferred supplier itself has no configured cost — matches the
  "no-op when unconfigured" pattern established in Phase 6).
- `InsightsService` now takes a `PurchasingService` constructor dependency
  (`src/modules/insights/index.ts` constructs it the same way
  `inventory/index.ts` already does: `new PurchasingService(db, events)`).
  `POLineInput`/`Actor` re-exported from `purchasing/index.ts` alongside the
  types already re-exported there, matching the existing pattern.
- Route (`insights/routes.ts`) now passes the caller's real role as `Actor`
  (added a `role(res)` helper matching the existing `userId`/`tenantId`
  helpers) instead of nothing.
- Response shape is additive only: `poNumber` and `skipped` are new fields;
  `created`/`pos[].id`/`pos[].supplierId`/`pos[].lineCount` are unchanged, so
  the existing frontend (`ForecastingTab.tsx`, which only reads `created`)
  needed no changes.

**Deliberately not touched:** the velocity/lookback-window computation
inside `reorderRecommendations()` (its 90-day default, its `HAVING` clause,
its `units_sold`/`velocityPerDay` logic) — that belongs to Phase 7 Item 1
(sales-velocity consolidation), not this bug fix, per Sri's explicit
instruction to keep the two separate. Also not touched: any Phase 7 file,
`purchasing/service.ts` (only its already-public `createOrder()` is called,
nothing inside it changed), and the excluded dirty UOM tree.

## Tests

`createReorderPOs()` had no tests before this fix. Added five, all new,
appended to the existing `src/modules/insights/insights.test.ts`:

- Creates a real, fetchable PO via `purchasing.createOrder()` — proves no
  500, a real doc-number (not `AUTO-...`), and the configured supplier cost
  (not a hardcoded 0) on the created `purchase_order_lines` row.
- A product with no preferred supplier is reported in `skipped` with reason
  `no_preferred_supplier`, not silently dropped or force-assigned.
- Two below-point products sharing one preferred supplier (by name) produce
  one PO with two lines, not two POs.
- No qualifying products → `created: 0`, `200` (not `201`), empty
  `pos`/`skipped`.
- Non-manager (cashier) is denied (403) — route-level RBAC unchanged.

## Gates

- `npm run typecheck` — clean.
- `npm run gap:scan` — clean (456/381 paths, 21 allowlisted — unchanged; no
  new frontend-called route, only backend response shape gained additive
  fields).
- `npm run table:scan` — clean (161 table names, no new tables).
- `npm run hygiene` — clean (1081 files scanned).
- Real-Postgres targeted runs (scratch runner, `--test-name-pattern` before
  the file argument): `insights.test.ts` 15/15 (10 pre-existing + 5 new,
  split across three calls to fit this sandbox's ~44s budget — the full
  15-test file does not fit in one call), `health-scores.test.ts` 3/3
  (unaffected regression check, since `InsightsService`'s constructor
  signature changed).
- Did not re-run the full `purchasing/purchasing.test.ts` suite (30 tests,
  doesn't fit one call) — scoped judgment call: the only change to that
  module is an additive type re-export line in `purchasing/index.ts`
  (`POLineInput`/`Actor`), `purchasing/service.ts` itself is byte-for-byte
  unchanged, and `createOrder()`'s own behavior is exercised by its existing
  test suite regardless of who calls it — there is no code path in
  `purchasing.test.ts` that could regress from this change.

## Outstanding for Sri

Same limitation as every other entry in `WORK/LOCK.md`: this sandbox has no
GitHub push credentials. Review and commit/push from your own machine when
ready.
