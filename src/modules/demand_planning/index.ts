import type { PosModule } from "../types.js";
import type { DB } from "../../shared/db.js";
import type { Router } from "express";
import { DemandPlanningService } from "./service.js";
import { registerRoutes } from "./routes.js";

/**
 * Demand Planning module — Phase 7 items 2–3 (`WORK/FORWARD_PLAN.md`):
 *   2. `demand_snapshots` — persisted daily actual units sold
 *   3. `demand_forecasts` — persisted predictions + accuracy read path
 *      (measurement layer before any forecasting model)
 * Item 4 consumes covering `demand_forecasts` rows via
 * `src/shared/demand-rate.ts` (reorder surfaces; velocity fallback).
 *
 * See `service.ts` for why snapshots are deliberately separate from
 * `src/shared/sales-velocity.ts` (Phase 7 item 1).
 *
 * Integration posture: reads `order_lines`/`orders` directly (read-only),
 * same pattern as `reports`/`insights`. The nightly
 * `orchestration/jobs/demand-snapshot.job.ts` imports this module's service
 * (orchestration layer, not a module-to-module import).
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

const CREATE_DEMAND_FORECASTS = `
CREATE TABLE IF NOT EXISTS demand_forecasts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  store_id TEXT NOT NULL DEFAULT '',
  period_type TEXT NOT NULL CHECK (period_type IN ('day', 'week', 'month')),
  period_start BIGINT NOT NULL,
  forecast_units INTEGER NOT NULL CHECK (forecast_units >= 0),
  method TEXT NOT NULL DEFAULT 'manual',
  created_at BIGINT NOT NULL,
  created_by TEXT,
  UNIQUE (tenant_id, product_id, store_id, period_type, period_start, method)
);
CREATE INDEX IF NOT EXISTS demand_forecasts_tenant_product_idx
  ON demand_forecasts (tenant_id, product_id, period_start DESC);
CREATE INDEX IF NOT EXISTS demand_forecasts_tenant_period_idx
  ON demand_forecasts (tenant_id, period_type, period_start DESC);
`;

export const demandPlanningModule: PosModule = {
  name: "demand-planning",
  mountPath: "/api/v1/demand-planning",
  migrations: [CREATE_DEMAND_SNAPSHOTS, CREATE_DEMAND_FORECASTS],
  register({ db, router }: { db: DB; router: Router }) {
    const service = new DemandPlanningService(db);
    registerRoutes(router, service);
  },
};
