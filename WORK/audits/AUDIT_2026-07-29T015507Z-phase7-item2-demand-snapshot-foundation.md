# Phase 7 Item 2 Completion — Demand Snapshot Foundation

Date: 2026-07-29
Scope reference: `WORK/FORWARD_PLAN.md` → "Phase 7: Demand planning
foundation", Item 2. LOCK claim: `WORK/LOCK.md` → "Phase 7 item 2: demand
snapshot foundation".

## What shipped

**New module: `src/modules/demand_planning/`** — owns one new table,
`demand_snapshots`, storing a persisted, tenant/product/store-scoped history
of *actual* completed units sold, at daily grain.

**Deliberately not built on top of `src/shared/sales-velocity.ts` (Phase 7
item 1).** That function answers "how much sold in a trailing window ending
now" — correct for live reorder suggestions, wrong for a persisted historical
record, since re-running it later describes a different window. This item
needed a stable, idempotent, calendar-day-bounded aggregate that gives the
same answer no matter when it's computed. `DemandPlanningService.snapshotDay()`
is that query: it deliberately shares item 1's correctness contract (INNER
JOIN orders, `o.status = 'completed'`, a real bounded `WHERE` date filter) so
it doesn't become a sixth drifted "how much did we sell" implementation
(see `AUDIT_2026-07-28T203748Z-phase7-demand-planning-foundation-gap.md`
Finding 1) — it's bounded by `[dayStart, dayEnd)` instead of
`[now - lookbackDays, now)`.

**Schema — one new table, additive, no collision:**

```sql
CREATE TABLE demand_snapshots (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  store_id TEXT NOT NULL DEFAULT '',   -- '' = order had no store_id recorded
  snapshot_date BIGINT NOT NULL,        -- UTC day start, ms
  units_sold INTEGER NOT NULL DEFAULT 0,
  revenue_cents INTEGER NOT NULL DEFAULT 0,
  computed_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  UNIQUE (tenant_id, product_id, store_id, snapshot_date)
);
```

`store_id` is `NOT NULL DEFAULT ''` rather than nullable — Postgres treats
`NULL` as distinct in unique constraints, which would have let a re-run
insert a second row for the same (tenant, product, day) whenever
`orders.store_id` is null, silently breaking the idempotency guarantee this
table exists to provide. Coalescing to `''` at write time keeps the unique
key meaningful and the upsert reliable.

**Population: `DemandPlanningService.snapshotDay(anyMsInDay)`** — one query,
system-scoped (all tenants/products/stores at once, same shape as
`orchestration/jobs/inventory-reconciliation.job.ts`, not per-tenant like
`ar-dunning.job.ts` — this is a pure aggregation sweep with no per-tenant
business rules), grouped by `(tenant_id, product_id, store_id)`, then
`INSERT ... ON CONFLICT ... DO UPDATE` per row. Idempotent by construction —
proven by a dedicated test that runs it twice for the same day and asserts
no double-count.

**Nightly job: `orchestration/jobs/demand-snapshot.job.ts`** — snapshots
*yesterday* (not today — today is still accumulating sales, snapshotting it
would freeze a partial day), self-re-enqueues 24h out, same pattern as
`inventory-reconciliation`/`outbox-retention`/`idempotency-expiry`. Registered
in `orchestration/index.ts` + `orchestration/queues/queue-names.ts`
(`DEMAND_SNAPSHOT` queue), enqueued once at bootstrap when
`backgroundJobsEnabled`.

**Read path: `DemandPlanningService.getDemandHistory()`** — aggregates the
persisted daily rows into day/week/month buckets at query time (day/week are
fixed-duration integer-division buckets, month is calendar-based via
`date_trunc` — same bucket-shape convention `computeSalesVelocity()` uses).
Only one grain is ever stored (day); week/month are never separately
persisted, avoiding three copies of the same fact.

**Routes** (`/api/v1/demand-planning`):
- `POST /snapshot` (manager-gated) — manual trigger for backfill/verification
  without waiting on the job scheduler. Body: `{ date? }` (ms, defaults to
  yesterday).
- `GET /history/:productId?periodType=day|week|month&from=&to=&storeId=` —
  read path for a future forecast-accuracy UI (item 3) or any other consumer.

**Not touched:** `src/shared/moduleRegistry.ts` — confirmed by precedent that
not every backend module belongs there (`insights`, a comparable real module
with a real frontend page, isn't listed either; that registry is specifically
for business-pack vertical feature-flag gating).

## Gates

- `npm run typecheck` — clean.
- `npm run table:scan` — 162 table names (was 161), no collision — one new
  table, `demand_snapshots`.
- `npm run gap:scan` — 458 backend paths (was 456, +2 for the two new
  routes), 381 frontend paths (unchanged — no frontend built this item, by
  design), 21 allowlisted (unchanged). Confirmed gap:scan only flags
  frontend→backend gaps, not backend routes without a frontend caller, so
  the two new backend-only routes needed no allowlisting.
- `npm run hygiene` — clean (1092 files scanned).

## Tests (real Postgres, via the existing Phase-6 scratch runner)

`src/modules/demand_planning/demand-planning.test.ts` — 6/6, all new:
1. `snapshotDay` aggregates only completed orders inside the target UTC day
   (excludes refunded, excludes previous/next day).
2. `snapshotDay` is idempotent — re-running the same day upserts, doesn't
   double-count.
3. `snapshotDay` separates units by `store_id` (one row per store).
4. `getDemandHistory` week aggregation correctly sums two days' snapshots.
5. `POST /snapshot` is manager-gated (403 for cashier).
6. `POST /snapshot` → `GET /history` end-to-end round trip.

## Outstanding for Sri

Same limitation as every other entry in `WORK/LOCK.md`: no GitHub push
credentials in this sandbox — not committed/pushed. Also worth noting: a
sandbox-level git bug was found and worked around earlier this session
(`.git` unlink restriction corrupting the index on `add`/`commit` in this
particular mount) — same class of issue `WORK/LOCK.md`'s 2026-07-24 entry
already describes hitting and fixing from your own machine, not a sandbox.

Phase 7 item 3 (forecast accuracy framework) is next per `FORWARD_PLAN.md`,
approved but not started — it will read `demand_snapshots` as its "actuals"
side once a forecast-value source exists to compare against.
