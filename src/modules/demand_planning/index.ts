import type { PosModule } from "../types.js";
import type { DB } from "../../shared/db.js";
import type { Router } from "express";
import { DemandPlanningService } from "./service.js";
import { registerRoutes } from "./routes.js";

/**
 * Demand Planning module — Phase 7 item 2 ("Demand snapshot foundation",
 * `WORK/FORWARD_PLAN.md`). Owns `demand_snapshots`, the persisted daily
 * actual-units-sold history that a future forecast-accuracy framework
 * (Phase 7 item 3) will compare predictions against. See `service.ts`'s
 * module doc comment for why this is deliberately separate from
 * `src/shared/sales-velocity.ts` (Phase 7 item 1) rather than built on it.
 *
 * Integration posture, per shared architecture rule (modules never import
 * each other's code): reads `order_lines`/`orders` directly (read-only),
 * same pattern every other analytics-style module (`reports`, `insights`)
 * already uses. `orchestration/jobs/demand-snapshot.job.ts` imports this
 * module's service directly to run the nightly sweep — that's the
 * orchestration layer, not a module, so it's not subject to the
 * module-to-module import rule (same precedent as `ar-dunning.job.ts`
 * importing `BillingService`).
 */

const CREATE_DEMAND_SNAPSHOTS = `
CREATE TABLE IF NOT EXISTS demand_snapshots (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  store_id TEXT NOT NULL DEFAULT '',
  snapshot_date BIGINT NOT NULL,
  units_sold INTEGER NOT NULL DEFAULT 0,
  revenue_cents INTEGER NOT NULL DEFAULT 0,
  computed_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  UNIQUE (tenant_id, product_id, store_id, snapshot_date)
);
CREATE INDEX IF NOT EXISTS demand_snapshots_tenant_product_idx ON demand_snapshots (tenant_id, product_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS demand_snapshots_tenant_date_idx ON demand_snapshots (tenant_id, snapshot_date DESC);
`;

export const demandPlanningModule: PosModule = {
  name: "demand-planning",
  mountPath: "/api/v1/demand-planning",
  migrations: [CREATE_DEMAND_SNAPSHOTS],
  register({ db, router }: { db: DB; router: Router }) {
    const service = new DemandPlanningService(db);
    registerRoutes(router, service);
  },
};
