import type { DB } from "../../shared/db.js";

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

/**
 * Demand Planning module — Phase 7 item 2 ("Demand snapshot foundation",
 * `WORK/FORWARD_PLAN.md`). Persists a daily, tenant/product/store-scoped
 * history of *actual* units sold, independent of `src/shared/sales-velocity.ts`
 * (Phase 7 item 1).
 *
 * Deliberately NOT built on top of `computeSalesVelocity()`: that function
 * answers "how much sold in the last N days from right now" (a live,
 * shifting trailing window — correct for reorder suggestions, wrong for a
 * persisted historical record, since re-running it later would describe a
 * different window). This module needs a stable, idempotent, calendar-day-
 * bounded aggregate that produces the same answer no matter when it's
 * computed or re-computed. `snapshotDay()` below is that query — it shares
 * `computeSalesVelocity()`'s correctness contract on purpose (INNER JOIN
 * orders, `o.status = 'completed'`, a real bounded date-range WHERE filter)
 * so it doesn't become a sixth drifted "how much did we sell" implementation
 * (see `WORK/audits/AUDIT_2026-07-28T203748Z-phase7-demand-planning-foundation-gap.md`
 * Finding 1 for the history of why that matters here) — it is just bounded
 * by `[dayStart, dayEnd)` instead of `[now - lookbackDays, now)`.
 *
 * No forecasting model lives here — this item is the "actuals" ledger a
 * future forecast-accuracy framework (Phase 7 item 3) compares predictions
 * against. `getDemandHistory()` is the only read path, and it aggregates the
 * persisted daily rows into week/month buckets at query time rather than
 * storing three copies of the same data at different grains.
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

function dayStartOf(ms: number): number {
  return Math.floor(ms / DAY_MS) * DAY_MS;
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
}
