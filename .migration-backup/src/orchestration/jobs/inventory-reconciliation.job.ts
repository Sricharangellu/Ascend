import type { JobRow } from "../types.js";
import type { DB } from "../../shared/db.js";
import { moduleLogger } from "../../shared/logger.js";

const log = moduleLogger("inventory-reconciliation");

/**
 * Reliability gap-scan (2026-07-22, WORK/audits/AUDIT_2026-07-22T013025Z-reliability-gap-scan.md,
 * FORWARD_PLAN Phase 4a #2): `inventory.stock_qty` is a maintained cache next
 * to the immutable `inventory_movements` ledger (see the comment on
 * `CREATE_INVENTORY_TABLE` in `src/modules/inventory/index.ts` — "db/ is the
 * canonical DDL owner"), not purely derived from it. `adjustTx` in
 * `inventory/service.ts` keeps them in lockstep by writing both in the same
 * transaction, but this repo has real prior bugs in exactly this area
 * (AUDIT_2026-07-16T063000Z-inventory-oversell-race.md,
 * AUDIT_2026-07-16T134500Z-transfer-number-race.md) — this job is the
 * standing detector so the *next* drift is caught automatically instead of
 * by incident.
 *
 * Known, deliberate exception (not a bug when found): `adjustTx` allows a
 * negative delta to record a movement row WITHOUT creating/touching an
 * `inventory` row when the product isn't tracked yet ("Negative delta on
 * untracked product: skip row creation, record movement only"). If that
 * product later starts being tracked, its `inventory` row begins at whatever
 * qty the first receive established, ignoring the untracked-era movement
 * history — SUM(movements.delta) legitimately won't equal stock_qty in that
 * case. This job still reports it (cheap to check by hand — the product's
 * earliest movement row's `created_at` vs when its `inventory` row was
 * created) rather than trying to silently special-case it, since a false
 * positive here is far cheaper than a missed real drift.
 *
 * Runs daily (self-re-enqueued, same pattern as outbox-retention /
 * idempotency-expiry). Read-only — reports drift, does not correct it;
 * correcting stock automatically would risk masking or compounding a real
 * bug instead of surfacing it for a human to look at.
 */
export const INVENTORY_RECONCILIATION_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily

export interface InventoryDriftRow {
  tenant_id: string;
  product_id: string;
  stock_qty: number;
  ledger_sum: number;
  diff: number;
}

const DRIFT_QUERY = `
  SELECT
    i.tenant_id,
    i.product_id,
    i.stock_qty,
    COALESCE(m.ledger_sum, 0)::int AS ledger_sum,
    (i.stock_qty - COALESCE(m.ledger_sum, 0))::int AS diff
  FROM inventory i
  LEFT JOIN (
    SELECT tenant_id, product_id, SUM(delta)::int AS ledger_sum
    FROM inventory_movements
    GROUP BY tenant_id, product_id
  ) m ON m.tenant_id = i.tenant_id AND m.product_id = i.product_id
  WHERE i.stock_qty <> COALESCE(m.ledger_sum, 0)
  ORDER BY tenant_id, product_id
`;

/**
 * Find every (tenant_id, product_id) where the cached `stock_qty` disagrees
 * with the immutable ledger's running total. Exported separately from the
 * job wrapper so it can be called directly (e.g. from an ops script or a
 * future admin endpoint) without going through the job queue.
 */
export async function findInventoryDrift(db: DB): Promise<InventoryDriftRow[]> {
  return db.query<InventoryDriftRow>(DRIFT_QUERY, {});
}

export async function inventoryReconciliationJob(_job: JobRow, db: DB): Promise<void> {
  const drifted = await findInventoryDrift(db);

  if (drifted.length === 0) {
    log.info({ checked: "all tenants" }, "inventory reconciliation: no drift found");
    return;
  }

  for (const row of drifted) {
    log.warn(
      {
        tenantId: row.tenant_id,
        productId: row.product_id,
        stockQty: row.stock_qty,
        ledgerSum: row.ledger_sum,
        diff: row.diff,
      },
      "inventory drift: stock_qty disagrees with SUM(inventory_movements.delta)",
    );
  }

  log.warn({ driftedCount: drifted.length }, "inventory reconciliation sweep complete — drift found");
}
