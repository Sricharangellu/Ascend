import type { DB } from "./db.js";
import { computeSalesVelocity } from "./sales-velocity.js";

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

export type ForecastPeriodType = "day" | "week" | "month";
export type DemandRateSource = "forecast" | "velocity";

export interface DemandRateOptions {
  tenantId: string;
  productIds: string[];
  /**
   * Lookback window for the velocity fallback (Phase 7 item 1). Defaults to 30
   * to match the inventory/catalog reorder surfaces.
   */
  lookbackDays?: number;
  /** Instant used to decide which forecast period is "current". Defaults to now. */
  asOfMs?: number;
  /**
   * When set, only forecasts for this store_id are considered. Default `""`
   * (tenant-wide / all-stores), which is what reorder alerts use.
   */
  storeId?: string;
}

export interface DemandRate {
  productId: string;
  /** Expected units sold per day — same unit every reorder surface already uses. */
  ratePerDay: number;
  source: DemandRateSource;
  /** Present when source === "forecast". */
  method?: string;
  forecastId?: string;
  forecastUnits?: number;
  periodType?: ForecastPeriodType;
  periodStart?: number;
  periodEnd?: number;
}

/** Exclusive end of a period — mirrors DemandPlanningService.periodEndMs. */
export function forecastPeriodEndMs(periodType: ForecastPeriodType, periodStart: number): number {
  if (periodType === "day") return periodStart + DAY_MS;
  if (periodType === "week") return periodStart + WEEK_MS;
  const d = new Date(periodStart);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
}

export function forecastUnitsToRatePerDay(
  periodType: ForecastPeriodType,
  periodStart: number,
  forecastUnits: number,
): number {
  const periodEnd = forecastPeriodEndMs(periodType, periodStart);
  const days = (periodEnd - periodStart) / DAY_MS;
  if (!(days > 0)) return 0;
  return forecastUnits / days;
}

/**
 * Phase 7 item 4 — resolve the demand rate each reorder surface should use.
 *
 * Preference order (deliberately narrow; no new forecast *models* in this
 * item — those remain deferred per the Phase 7 gap audit):
 *   1. A persisted `demand_forecasts` row whose period covers `asOfMs`
 *      (tenant-wide store_id by default). If several methods cover the same
 *      period, the most recently recorded wins.
 *   2. Trailing-window sales velocity (`computeSalesVelocity`) — the Phase 7
 *      item 1 shared service. Preserves prior behavior when no forecast exists.
 *
 * Callers migrate one surface at a time. First cutover: inventory pipeline
 * `reorderAlerts()`.
 */
export async function resolveDemandRates(
  db: DB,
  opts: DemandRateOptions,
): Promise<Map<string, DemandRate>> {
  const productIds = opts.productIds;
  const out = new Map<string, DemandRate>();
  if (productIds.length === 0) return out;

  const lookbackDays = opts.lookbackDays ?? 30;
  const asOfMs = opts.asOfMs ?? Date.now();
  const storeId = opts.storeId ?? "";

  // Pull candidate forecasts that have already started; filter period-end in JS
  // so day/week/month grains share one query.
  const forecastRows = await db.query<{
    id: string;
    product_id: string;
    period_type: ForecastPeriodType;
    period_start: string;
    forecast_units: number;
    method: string;
    created_at: string;
  }>(
    `SELECT id, product_id, period_type, period_start, forecast_units, method, created_at
       FROM demand_forecasts
      WHERE tenant_id = @tenantId
        AND product_id = ANY(@productIds)
        AND store_id = @storeId
        AND period_start <= @asOfMs
      ORDER BY created_at DESC`,
    {
      tenantId: opts.tenantId,
      productIds,
      storeId,
      asOfMs,
    },
  );

  const covered = new Set<string>();
  for (const r of forecastRows) {
    const productId = r.product_id;
    if (covered.has(productId)) continue;
    const periodType = r.period_type;
    const periodStart = Number(r.period_start);
    const periodEnd = forecastPeriodEndMs(periodType, periodStart);
    if (periodEnd <= asOfMs) continue; // period already closed — not "current"
    const forecastUnits = Number(r.forecast_units);
    out.set(productId, {
      productId,
      ratePerDay: forecastUnitsToRatePerDay(periodType, periodStart, forecastUnits),
      source: "forecast",
      method: r.method,
      forecastId: r.id,
      forecastUnits,
      periodType,
      periodStart,
      periodEnd,
    });
    covered.add(productId);
  }

  const missing = productIds.filter((id) => !covered.has(id));
  if (missing.length === 0) return out;

  const velocity = await computeSalesVelocity(db, {
    tenantId: opts.tenantId,
    productIds: missing,
    lookbackDays,
  });

  for (const productId of missing) {
    const v = velocity.get(productId);
    out.set(productId, {
      productId,
      ratePerDay: v?.velocityPerDay ?? 0,
      source: "velocity",
    });
  }

  return out;
}
