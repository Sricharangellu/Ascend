import type { DB } from "../../shared/db.js";
import type { JobRow } from "../types.js";
import { DemandPlanningService } from "../../modules/demand_planning/service.js";
import { moduleLogger } from "../../shared/logger.js";

const log = moduleLogger("demand-snapshot");
const DAY_MS = 86_400_000;

/**
 * Demand Snapshot Job — Phase 7 item 2 (`WORK/FORWARD_PLAN.md`).
 *
 * Runs once daily (self-re-enqueued, same pattern as
 * inventory-reconciliation/outbox-retention/idempotency-expiry): snapshots
 * *yesterday's* completed sales into `demand_snapshots`, across every tenant
 * in one pass — system-scoped like `inventory-reconciliation.job.ts`, not
 * per-tenant like `ar-dunning.job.ts`, since this is a pure aggregation sweep
 * with no per-tenant business rules or side effects.
 *
 * Snapshots *yesterday* rather than *today* deliberately: today is still
 * accumulating sales, so snapshotting it would freeze a partial, understated
 * day. Idempotent either way (`DemandPlanningService.snapshotDay()` upserts),
 * so a missed run or a manual backfill via `POST /demand-planning/snapshot`
 * can safely re-cover any day.
 */
export const DEMAND_SNAPSHOT_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily

export async function demandSnapshotJob(_job: JobRow, db: DB): Promise<void> {
  const service = new DemandPlanningService(db);
  const yesterday = Date.now() - DAY_MS;
  const result = await service.snapshotDay(yesterday);

  log.info(
    { dayStart: result.dayStart, rowsWritten: result.rowsWritten, tenantsAffected: result.tenantsAffected },
    "demand snapshot sweep complete",
  );
}
