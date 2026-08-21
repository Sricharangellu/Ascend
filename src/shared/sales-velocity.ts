import type { DB } from "./db.js";

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

export type VelocityBucket = "day" | "week" | "month";

export interface VelocityOptions {
  tenantId: string;
  /** How many days back from now to look for completed sales. */
  lookbackDays: number;
  /** Restrict to specific products. Omit/null to cover every product with a sale in the window. */
  productIds?: string[] | null;
  /** Restrict to a single outlet via orders.store_id. Omit/null for all stores. */
  storeId?: string | null;
  /** Restrict to a single flat products.category value. Omit/null for all categories. */
  category?: string | null;
  /**
   * When set, also returns a per-period breakdown (`buckets`) in addition to
   * the whole-window total — "day"/"week" are fixed-duration buckets (cheap
   * integer division); "month" is calendar-based (date_trunc), since months
   * aren't a fixed number of days. Omit for whole-window totals only.
   */
  bucket?: VelocityBucket;
}

export interface VelocityBucketRow {
  /** Epoch ms marking the start of this bucket. */
  periodStart: number;
  units: number;
  revenueCents: number;
}

export interface ProductVelocity {
  productId: string;
  /** Total units sold over the whole lookback window. */
  unitsSold: number;
  /** Total gross revenue (line_cents) over the whole lookback window. */
  revenueCents: number;
  /** unitsSold / lookbackDays — the single number every reorder-suggestion surface actually needs. */
  velocityPerDay: number;
  /** Present only when `bucket` was requested. */
  buckets?: VelocityBucketRow[];
}

/**
 * The single, shared sales-velocity computation (Phase 7 item 1,
 * `WORK/FORWARD_PLAN.md`) — replaces five independently-maintained
 * "how much do we expect to sell" queries that had drifted apart (three used
 * a 30-day INNER JOIN on `o.status = 'completed'`; `insights/service.ts`'s
 * `reorderRecommendations()` used a LEFT JOIN with its date filter in the
 * JOIN's ON clause — which a LEFT JOIN never actually excludes on, so its
 * "lookback window" had no effect and it never filtered by order status
 * either; `purchasing/service.ts`'s `priceHistory()` also never filtered by
 * order status). See `WORK/audits/
 * AUDIT_2026-07-28T203748Z-phase7-demand-planning-foundation-gap.md` Finding 1
 * for the full inventory of what each surface used to do.
 *
 * Correctness contract (deliberately the same for every caller — this is the
 * "trusted sales data" foundation, not a place for per-surface quirks):
 *   - INNER JOIN orders (a LEFT JOIN here reintroduces the exact bug above).
 *   - `o.status = 'completed'` — refunded/open/cancelled orders never count
 *     as "sold" units for a velocity computation.
 *   - The lookback window is a real WHERE-clause filter on `o.created_at`.
 *
 * Deliberately NOT unified in this pass: the *number* of lookback days each
 * caller uses. The three surfaces Phase 6 already touched
 * (`catalog/detail-views.ts`'s `reorderSuggestions()`,
 * `inventory/pipeline-views.ts`'s `reorderAlerts()`,
 * `inventory/service.ts`'s `getReorderSuggestions()`) pass 30;
 * `insights/service.ts`'s `reorderRecommendations()` and
 * `purchasing/service.ts`'s `priceHistory()` pass 90, preserving each
 * surface's previously-established window. Picking one universal number is
 * a real product decision (a shorter window reacts faster but is noisier),
 * not a plumbing fix — left for Sri to decide explicitly if wanted.
 */
export async function computeSalesVelocity(
  db: DB,
  opts: VelocityOptions,
): Promise<Map<string, ProductVelocity>> {
  const sinceMs = Date.now() - Math.max(0, opts.lookbackDays) * DAY_MS;
  const needsProductsJoin = Boolean(opts.category);

  const params: Record<string, unknown> = { tenantId: opts.tenantId, sinceMs };
  const where: string[] = [
    "ol.tenant_id = @tenantId",
    "o.status = 'completed'",
    "o.created_at >= @sinceMs",
  ];
  if (opts.productIds && opts.productIds.length > 0) {
    where.push("ol.product_id = ANY(@productIds)");
    params["productIds"] = opts.productIds;
  }
  if (opts.storeId) {
    where.push("o.store_id = @storeId");
    params["storeId"] = opts.storeId;
  }
  if (opts.category) {
    where.push("p.category = @category");
    params["category"] = opts.category;
  }

  const productsJoin = needsProductsJoin
    ? "JOIN products p ON p.tenant_id = ol.tenant_id AND p.id = ol.product_id"
    : "";

  if (!opts.bucket) {
    const rows = await db.query<{ product_id: string; units: number; revenue: number }>(
      `SELECT ol.product_id,
              COALESCE(SUM(ol.quantity), 0)   AS units,
              COALESCE(SUM(ol.line_cents), 0) AS revenue
         FROM order_lines ol
         JOIN orders o ON o.tenant_id = ol.tenant_id AND o.id = ol.order_id
         ${productsJoin}
        WHERE ${where.join(" AND ")}
        GROUP BY ol.product_id`,
      params,
    );
    const out = new Map<string, ProductVelocity>();
    for (const r of rows) {
      const unitsSold = Number(r.units);
      out.set(r.product_id, {
        productId: r.product_id,
        unitsSold,
        revenueCents: Number(r.revenue),
        velocityPerDay: opts.lookbackDays > 0 ? unitsSold / opts.lookbackDays : 0,
      });
    }
    return out;
  }

  // Bucketed mode: day/week are fixed-duration integer-division buckets
  // (same pattern catalog/detail-views.ts's analytics() already uses for its
  // daily trend); month is calendar-based via date_trunc, since months are
  // not a fixed number of days.
  const periodExpr =
    opts.bucket === "month"
      ? "(EXTRACT(EPOCH FROM date_trunc('month', to_timestamp(o.created_at / 1000.0))) * 1000)::bigint"
      : `(o.created_at / ${opts.bucket === "week" ? WEEK_MS : DAY_MS}) * ${opts.bucket === "week" ? WEEK_MS : DAY_MS}`;

  const rows = await db.query<{ product_id: string; period_start: string; units: number; revenue: number }>(
    `SELECT ol.product_id,
            ${periodExpr} AS period_start,
            COALESCE(SUM(ol.quantity), 0)   AS units,
            COALESCE(SUM(ol.line_cents), 0) AS revenue
       FROM order_lines ol
       JOIN orders o ON o.tenant_id = ol.tenant_id AND o.id = ol.order_id
       ${productsJoin}
      WHERE ${where.join(" AND ")}
      GROUP BY ol.product_id, period_start
      ORDER BY ol.product_id, period_start ASC`,
    params,
  );

  const out = new Map<string, ProductVelocity>();
  for (const r of rows) {
    const productId = r.product_id;
    const units = Number(r.units);
    const revenue = Number(r.revenue);
    const existing = out.get(productId);
    const bucketRow: VelocityBucketRow = { periodStart: Number(r.period_start), units, revenueCents: revenue };
    if (existing) {
      existing.unitsSold += units;
      existing.revenueCents += revenue;
      existing.buckets!.push(bucketRow);
    } else {
      out.set(productId, {
        productId,
        unitsSold: units,
        revenueCents: revenue,
        velocityPerDay: 0, // finalized below, once the full-window total is known
        buckets: [bucketRow],
      });
    }
  }
  for (const v of out.values()) {
    v.velocityPerDay = opts.lookbackDays > 0 ? v.unitsSold / opts.lookbackDays : 0;
  }
  return out;
}

/** Convenience wrapper for the common single-product case (avoids callers building a 1-element array). */
export async function computeSalesVelocityForProduct(
  db: DB,
  opts: Omit<VelocityOptions, "productIds"> & { productId: string },
): Promise<ProductVelocity> {
  const { productId, ...rest } = opts;
  const result = await computeSalesVelocity(db, { ...rest, productIds: [productId] });
  return (
    result.get(productId) ?? {
      productId,
      unitsSold: 0,
      revenueCents: 0,
      velocityPerDay: 0,
      ...(opts.bucket ? { buckets: [] } : {}),
    }
  );
}
