import type { DB } from "../../shared/db.js";
import { badRequest } from "../../shared/http.js";

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

/**
 * Demand Planning module — Phase 7 items 2–3 (`WORK/FORWARD_PLAN.md`).
 *
 * Item 2 (`demand_snapshots`): persisted daily actual units sold. Deliberately
 * NOT built on `computeSalesVelocity()` — that answers "how much sold in the
 * last N days from right now" (a shifting trailing window). Snapshots need a
 * stable calendar-day aggregate. See
 * `AUDIT_2026-07-28T203748Z-phase7-demand-planning-foundation-gap.md`.
 *
 * Item 3 (`demand_forecasts` + accuracy read path): the measurement layer
 * **before** any prediction model. Callers persist a forecast (qty + period +
 * method); accuracy is computed by joining closed periods against snapshot
 * actuals. No ML — just "was our forecast correct?"
 */

export interface SnapshotDayResult {
  dayStart: number;
  rowsWritten: number;
  tenantsAffected: number;
}

export interface DemandHistoryPoint {
  periodStart: number;
  unitsSold: number;
  revenueCents: number;
}

export interface DemandHistoryOptions {
  tenantId: string;
  productId: string;
  /** Omit for all stores combined. */
  storeId?: string | null;
  periodType: "day" | "week" | "month";
  fromMs: number;
  toMs: number;
}

export type ForecastPeriodType = "day" | "week" | "month";

export interface CreateForecastInput {
  tenantId: string;
  productId: string;
  storeId?: string | null;
  periodType: ForecastPeriodType;
  periodStart: number;
  forecastUnits: number;
  /** Label for how the forecast was produced — not a model. Default `manual`. */
  method?: string;
  createdBy?: string | null;
}

export interface DemandForecast {
  id: string;
  tenantId: string;
  productId: string;
  storeId: string;
  periodType: ForecastPeriodType;
  periodStart: number;
  periodEnd: number;
  forecastUnits: number;
  method: string;
  createdAt: number;
  createdBy: string | null;
}

export interface ForecastAccuracyRow {
  forecastId: string;
  productId: string;
  storeId: string;
  periodType: ForecastPeriodType;
  periodStart: number;
  periodEnd: number;
  method: string;
  forecastUnits: number;
  actualUnits: number;
  /** actual − forecast (negative = over-forecast). */
  varianceUnits: number;
  /**
   * ((actual − forecast) / forecast) × 100. `null` when forecast was 0 and
   * actual was not (undefined relative error).
   */
  variancePct: number | null;
  /**
   * 100 × (1 − |actual − forecast| / max(actual, forecast, 1)), floored at 0.
   * Both-zero → 100.
   */
  accuracyPct: number;
}

export interface ForecastAccuracyOptions {
  tenantId: string;
  productId?: string | null;
  storeId?: string | null;
  periodType: ForecastPeriodType;
  fromMs: number;
  toMs: number;
  /** When true (default), only periods that have already ended. */
  closedOnly?: boolean;
}

function dayStartOf(ms: number): number {
  return Math.floor(ms / DAY_MS) * DAY_MS;
}

/** Exclusive end of a period starting at `periodStart` for the given grain. */
export function periodEndMs(periodType: ForecastPeriodType, periodStart: number): number {
  if (periodType === "day") return periodStart + DAY_MS;
  if (periodType === "week") return periodStart + WEEK_MS;
  // Calendar month: advance one month from the UTC month containing periodStart.
  const d = new Date(periodStart);
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  return next;
}

export function computeAccuracyMetrics(
  forecastUnits: number,
  actualUnits: number,
): Pick<ForecastAccuracyRow, "varianceUnits" | "variancePct" | "accuracyPct"> {
  const varianceUnits = actualUnits - forecastUnits;
  let variancePct: number | null;
  if (forecastUnits === 0) {
    variancePct = actualUnits === 0 ? 0 : null;
  } else {
    variancePct = (varianceUnits / forecastUnits) * 100;
  }
  const denom = Math.max(actualUnits, forecastUnits, 1);
  const accuracyPct =
    forecastUnits === 0 && actualUnits === 0
      ? 100
      : Math.max(0, 100 * (1 - Math.abs(varianceUnits) / denom));
  return { varianceUnits, variancePct, accuracyPct };
}

export class DemandPlanningService {
  constructor(private readonly db: DB) {}

  /**
   * Aggregate real completed sales for the UTC calendar day containing
   * `anyMsInDay` into `demand_snapshots`, across every tenant/product/store
   * in one pass (same "system"-scoped shape as
   * `orchestration/jobs/inventory-reconciliation.job.ts` — a sweep, not a
   * per-request query, so it is not tenant-filtered). Idempotent: re-running
   * for the same day upserts the same rows (`ON CONFLICT` on the
   * tenant/product/store/day unique key), so a nightly job re-run or a manual
   * backfill can never double-count.
   */
  async snapshotDay(anyMsInDay: number): Promise<SnapshotDayResult> {
    const dayStart = dayStartOf(anyMsInDay);
    const dayEnd = dayStart + DAY_MS;
    const now = Date.now();

    const rows = await this.db.query<{
      tenant_id: string;
      product_id: string;
      store_id: string;
      units: number;
      revenue: number;
    }>(
      `SELECT ol.tenant_id,
              ol.product_id,
              COALESCE(o.store_id, '') AS store_id,
              COALESCE(SUM(ol.quantity), 0)::int   AS units,
              COALESCE(SUM(ol.line_cents), 0)::int AS revenue
         FROM order_lines ol
         JOIN orders o ON o.tenant_id = ol.tenant_id AND o.id = ol.order_id
        WHERE o.status = 'completed'
          AND o.created_at >= @dayStart
          AND o.created_at < @dayEnd
        GROUP BY ol.tenant_id, ol.product_id, COALESCE(o.store_id, '')`,
      { dayStart, dayEnd },
    );

    const tenants = new Set<string>();
    for (const r of rows) {
      tenants.add(r.tenant_id);
      const id = `dsnap_${r.tenant_id}_${r.product_id}_${r.store_id || "_all"}_${dayStart}`.slice(0, 200);
      await this.db.query(
        `INSERT INTO demand_snapshots
           (id, tenant_id, product_id, store_id, snapshot_date, units_sold, revenue_cents, computed_at, created_at)
         VALUES (@id, @tenantId, @productId, @storeId, @snapshotDate, @units, @revenue, @now, @now)
         ON CONFLICT (tenant_id, product_id, store_id, snapshot_date)
         DO UPDATE SET units_sold = EXCLUDED.units_sold,
                       revenue_cents = EXCLUDED.revenue_cents,
                       computed_at = EXCLUDED.computed_at`,
        {
          id,
          tenantId: r.tenant_id,
          productId: r.product_id,
          storeId: r.store_id,
          snapshotDate: dayStart,
          units: Number(r.units),
          revenue: Number(r.revenue),
          now,
        },
      );
    }

    return { dayStart, rowsWritten: rows.length, tenantsAffected: tenants.size };
  }

  /**
   * Read persisted demand history for one product, aggregated into the
   * requested period grain. Rows are always stored at day grain; week/month
   * are computed here rather than stored separately (single source, same
   * bucket-shape convention `computeSalesVelocity()` uses: day/week are
   * fixed-duration integer-division buckets, month is calendar-based via
   * `date_trunc`).
   */
  async getDemandHistory(opts: DemandHistoryOptions): Promise<DemandHistoryPoint[]> {
    const params: Record<string, unknown> = {
      tenantId: opts.tenantId,
      productId: opts.productId,
      fromMs: opts.fromMs,
      toMs: opts.toMs,
    };
    const where = [
      "tenant_id = @tenantId",
      "product_id = @productId",
      "snapshot_date >= @fromMs",
      "snapshot_date < @toMs",
    ];
    if (opts.storeId) {
      where.push("store_id = @storeId");
      params["storeId"] = opts.storeId;
    }

    if (opts.periodType === "day") {
      const rows = await this.db.query<{ snapshot_date: string; units: number; revenue: number }>(
        `SELECT snapshot_date,
                COALESCE(SUM(units_sold), 0)::int    AS units,
                COALESCE(SUM(revenue_cents), 0)::int AS revenue
           FROM demand_snapshots
          WHERE ${where.join(" AND ")}
          GROUP BY snapshot_date
          ORDER BY snapshot_date ASC`,
        params,
      );
      return rows.map((r) => ({
        periodStart: Number(r.snapshot_date),
        unitsSold: Number(r.units),
        revenueCents: Number(r.revenue),
      }));
    }

    const periodExpr =
      opts.periodType === "month"
        ? "(EXTRACT(EPOCH FROM date_trunc('month', to_timestamp(snapshot_date / 1000.0))) * 1000)::bigint"
        : `(snapshot_date / ${WEEK_MS}) * ${WEEK_MS}`;

    const rows = await this.db.query<{ period_start: string; units: number; revenue: number }>(
      `SELECT ${periodExpr} AS period_start,
              COALESCE(SUM(units_sold), 0)::int    AS units,
              COALESCE(SUM(revenue_cents), 0)::int AS revenue
         FROM demand_snapshots
        WHERE ${where.join(" AND ")}
        GROUP BY period_start
        ORDER BY period_start ASC`,
      params,
    );
    return rows.map((r) => ({
      periodStart: Number(r.period_start),
      unitsSold: Number(r.units),
      revenueCents: Number(r.revenue),
    }));
  }

  // ── Phase 7 item 3: forecast persistence + accuracy ───────────────────────

  /**
   * Persist a forecast for a future (or historical) period. Upserts on the
   * unique (tenant, product, store, period_type, period_start, method) key so
   * re-recording the same method for the same period replaces the qty rather
   * than inserting a duplicate.
   */
  async createForecast(input: CreateForecastInput): Promise<DemandForecast> {
    if (!Number.isInteger(input.forecastUnits) || input.forecastUnits < 0) {
      throw badRequest("forecastUnits must be a non-negative integer");
    }
    if (!Number.isFinite(input.periodStart)) {
      throw badRequest("periodStart must be a finite epoch ms");
    }
    const storeId = input.storeId ?? "";
    const method = (input.method?.trim() || "manual").slice(0, 64);
    const now = Date.now();
    const id = `dfcst_${input.tenantId}_${input.productId}_${storeId || "_all"}_${input.periodType}_${input.periodStart}_${method}`
      .replace(/[^a-zA-Z0-9_.:-]/g, "_")
      .slice(0, 200);

    await this.db.query(
      `INSERT INTO demand_forecasts
         (id, tenant_id, product_id, store_id, period_type, period_start, forecast_units, method, created_at, created_by)
       VALUES (@id, @tenantId, @productId, @storeId, @periodType, @periodStart, @forecastUnits, @method, @now, @createdBy)
       ON CONFLICT (tenant_id, product_id, store_id, period_type, period_start, method)
       DO UPDATE SET forecast_units = EXCLUDED.forecast_units,
                     created_at = EXCLUDED.created_at,
                     created_by = EXCLUDED.created_by`,
      {
        id,
        tenantId: input.tenantId,
        productId: input.productId,
        storeId,
        periodType: input.periodType,
        periodStart: input.periodStart,
        forecastUnits: input.forecastUnits,
        method,
        now,
        createdBy: input.createdBy ?? null,
      },
    );

    return {
      id,
      tenantId: input.tenantId,
      productId: input.productId,
      storeId,
      periodType: input.periodType,
      periodStart: input.periodStart,
      periodEnd: periodEndMs(input.periodType, input.periodStart),
      forecastUnits: input.forecastUnits,
      method,
      createdAt: now,
      createdBy: input.createdBy ?? null,
    };
  }

  async listForecasts(opts: {
    tenantId: string;
    productId?: string | null;
    storeId?: string | null;
    periodType?: ForecastPeriodType | null;
    fromMs: number;
    toMs: number;
  }): Promise<DemandForecast[]> {
    const params: Record<string, unknown> = {
      tenantId: opts.tenantId,
      fromMs: opts.fromMs,
      toMs: opts.toMs,
    };
    const where = [
      "tenant_id = @tenantId",
      "period_start >= @fromMs",
      "period_start < @toMs",
    ];
    if (opts.productId) {
      where.push("product_id = @productId");
      params["productId"] = opts.productId;
    }
    if (opts.storeId != null && opts.storeId !== "") {
      where.push("store_id = @storeId");
      params["storeId"] = opts.storeId;
    }
    if (opts.periodType) {
      where.push("period_type = @periodType");
      params["periodType"] = opts.periodType;
    }

    const rows = await this.db.query<{
      id: string;
      tenant_id: string;
      product_id: string;
      store_id: string;
      period_type: ForecastPeriodType;
      period_start: string;
      forecast_units: number;
      method: string;
      created_at: string;
      created_by: string | null;
    }>(
      `SELECT id, tenant_id, product_id, store_id, period_type, period_start,
              forecast_units, method, created_at, created_by
         FROM demand_forecasts
        WHERE ${where.join(" AND ")}
        ORDER BY period_start ASC, product_id ASC`,
      params,
    );

    return rows.map((r) => {
      const periodStart = Number(r.period_start);
      const periodType = r.period_type;
      return {
        id: r.id,
        tenantId: r.tenant_id,
        productId: r.product_id,
        storeId: r.store_id,
        periodType,
        periodStart,
        periodEnd: periodEndMs(periodType, periodStart),
        forecastUnits: Number(r.forecast_units),
        method: r.method,
        createdAt: Number(r.created_at),
        createdBy: r.created_by,
      };
    });
  }

  /**
   * Compare persisted forecasts against `demand_snapshots` actuals for the
   * same tenant/product/store/period. Only closed periods are scored by
   * default (a period still accumulating sales has no fair "actual" yet).
   */
  async getForecastAccuracy(opts: ForecastAccuracyOptions): Promise<ForecastAccuracyRow[]> {
    const forecasts = await this.listForecasts({
      tenantId: opts.tenantId,
      productId: opts.productId,
      storeId: opts.storeId,
      periodType: opts.periodType,
      fromMs: opts.fromMs,
      toMs: opts.toMs,
    });

    const now = Date.now();
    const closedOnly = opts.closedOnly !== false;
    const out: ForecastAccuracyRow[] = [];

    for (const f of forecasts) {
      if (closedOnly && f.periodEnd > now) continue;

      // Actuals: sum daily snapshots in [periodStart, periodEnd).
      // When the forecast is store-scoped, match that store; otherwise sum all stores.
      const points = await this.getDemandHistory({
        tenantId: opts.tenantId,
        productId: f.productId,
        storeId: f.storeId || null,
        periodType: "day",
        fromMs: f.periodStart,
        toMs: f.periodEnd,
      });
      const actualUnits = points.reduce((sum, p) => sum + p.unitsSold, 0);
      const metrics = computeAccuracyMetrics(f.forecastUnits, actualUnits);

      out.push({
        forecastId: f.id,
        productId: f.productId,
        storeId: f.storeId,
        periodType: f.periodType,
        periodStart: f.periodStart,
        periodEnd: f.periodEnd,
        method: f.method,
        forecastUnits: f.forecastUnits,
        actualUnits,
        ...metrics,
      });
    }

    return out;
  }
}
