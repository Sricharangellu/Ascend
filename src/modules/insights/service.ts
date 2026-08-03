import { v7 as uuidv7 } from "uuid";
import { HttpError } from "../../shared/http.js";
import type { DB } from "../../shared/db.js";
import type { PurchasingService, POLineInput, Actor } from "../purchasing/index.js";
import { computeSalesVelocity } from "../../shared/sales-velocity.js";

// ── Scheduled Reports ─────────────────────────────────────────────────────────

export type ReportFrequency = "daily" | "weekly" | "monthly";
export type ReportType =
  | "sales_summary"
  | "top_products"
  | "inventory_valuation"
  | "p_l"
  | "ar_aging"
  | "ap_aging";

export interface ScheduledReport {
  id: string;
  tenantId: string;
  name: string;
  reportType: ReportType;
  frequency: ReportFrequency;
  recipientEmails: string[];
  enabled: boolean;
  lastSentAt: number | null;
  nextSendAt: number;
  createdAt: number;
  updatedAt: number;
}

interface ScheduledReportRow {
  id: string;
  tenant_id: string;
  name: string;
  report_type: string;
  frequency: string;
  recipient_emails: string; // JSON
  enabled: number | boolean;
  last_sent_at: number | null;
  next_send_at: number;
  created_at: number;
  updated_at: number;
}

function parseScheduled(row: ScheduledReportRow): ScheduledReport {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    reportType: row.report_type as ReportType,
    frequency: row.frequency as ReportFrequency,
    recipientEmails: JSON.parse(row.recipient_emails) as string[],
    enabled: Boolean(row.enabled),
    lastSentAt: row.last_sent_at,
    nextSendAt: row.next_send_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function computeNextSendAt(frequency: ReportFrequency, from = Date.now()): number {
  const DAY = 86_400_000;
  switch (frequency) {
    case "daily":   return from + DAY;
    case "weekly":  return from + 7 * DAY;
    case "monthly": return from + 30 * DAY;
  }
}

// ── Forecasting ───────────────────────────────────────────────────────────────

export interface ReorderRecommendation {
  productId: string;
  sku: string;
  name: string;
  currentStock: number;
  reorderPoint: number;
  reorderQuantity: number;
  leadTimeDays: number;
  /** Units sold per day over the look-back window. */
  velocityPerDay: number;
  /** Estimated days of stock remaining at current velocity. */
  daysOfStock: number;
  /** True when stock ≤ reorder_point. */
  belowReorderPoint: boolean;
  /** The product's preferred supplier (product_suppliers.is_preferred), or null if none is configured. */
  supplierId: string | null;
  /** The preferred supplier's configured unit cost, or null if unconfigured/no preferred supplier. */
  preferredCostCents: number | null;
}

export interface OrderRecommendation {
  productId: string;
  sku: string;
  name: string;
  totalUnitsSold: number;
  revenueGrossCents: number;
  rank: number;
  belowReorderPoint: boolean;
}

// ── Service ───────────────────────────────────────────────────────────────────

export interface CreateScheduledReportInput {
  name: string;
  reportType: ReportType;
  frequency: ReportFrequency;
  recipientEmails: string[];
}

export interface UpdateScheduledReportInput {
  name?: string;
  reportType?: ReportType;
  frequency?: ReportFrequency;
  recipientEmails?: string[];
  enabled?: boolean;
}

// ── Business health scores ──────────────────────────────────────────────────

export interface HealthSegment {
  key: "catalog" | "inventory" | "sales" | "margin" | "expenses";
  label: string;
  score: number; // 0–100
  detail: string;
}

export interface HealthScores {
  generatedAt: number;
  overall: number; // 0–100, average of the segments
  segments: HealthSegment[];
  signals: {
    productCount: number;
    productsWithCost: number;
    categorizedCount: number;
    stockedCount: number;
    lowStockCount: number;
    orders30d: number;
    revenueCents: number;
    cogsCents: number;
    grossMarginPct: number;
    expenseCount: number;
    uncategorizedExpenseCount: number;
  };
}

export class InsightsService {
  constructor(
    private readonly db: DB,
    private readonly purchasing: PurchasingService,
  ) {}

  /**
   * Segmented business health scores (0–100 each, deterministic/rule-based — no
   * AI) derived from real tenant data across the retail flow. Companion to the
   * retail-proof audit: proof answers "is it set up?", health answers "how well
   * is it doing?". Weights are fixed and shown in each segment's detail so a
   * score is always explainable.
   */
  async healthScores(tenantId: string, opts?: { recentDays?: number }): Promise<HealthScores> {
    const recentDays = Math.max(1, Math.min(365, opts?.recentDays ?? 30));
    const since = Date.now() - recentDays * 86_400_000;

    const [cat] = await this.db.query<{ total: number; with_cost: number; categorized: number }>(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE raw_cost_price_cents IS NOT NULL)::int AS with_cost,
              COUNT(*) FILTER (WHERE category IS NOT NULL AND category <> 'general')::int AS categorized
         FROM products WHERE tenant_id = @tenantId AND status = 'active'`,
      { tenantId },
    );
    const [inv] = await this.db.query<{ stocked: number; low_stock: number }>(
      `SELECT COUNT(*) FILTER (WHERE COALESCE(i.stock_qty, 0) > 0)::int AS stocked,
              COUNT(*) FILTER (WHERE p.reorder_point IS NOT NULL AND p.reorder_point > 0
                               AND COALESCE(i.stock_qty, 0) <= p.reorder_point)::int AS low_stock
         FROM products p
         LEFT JOIN inventory i ON i.product_id = p.id AND i.tenant_id = p.tenant_id
        WHERE p.tenant_id = @tenantId AND p.status = 'active'`,
      { tenantId },
    );
    const [ord] = await this.db.query<{ orders30d: number; revenue: number }>(
      `SELECT COUNT(*)::int AS orders30d, COALESCE(SUM(total_cents), 0)::bigint AS revenue
         FROM orders WHERE tenant_id = @tenantId AND created_at >= @since`,
      { tenantId, since },
    );
    const [cog] = await this.db.query<{ cogs: number }>(
      `SELECT COALESCE(SUM(ol.quantity * COALESCE(p.raw_cost_price_cents, 0)), 0)::bigint AS cogs
         FROM order_lines ol
         JOIN orders o ON o.id = ol.order_id AND o.tenant_id = ol.tenant_id
         JOIN products p ON p.id = ol.product_id AND p.tenant_id = ol.tenant_id
        WHERE ol.tenant_id = @tenantId AND o.created_at >= @since`,
      { tenantId, since },
    );
    const [exp] = await this.db.query<{ cnt: number; uncat: number }>(
      `SELECT COUNT(*)::int AS cnt,
              COUNT(*) FILTER (WHERE category IS NULL OR category = '')::int AS uncat
         FROM expenses WHERE tenant_id = @tenantId`,
      { tenantId },
    );

    const total = Number(cat?.total ?? 0);
    const withCost = Number(cat?.with_cost ?? 0);
    const categorized = Number(cat?.categorized ?? 0);
    const stocked = Number(inv?.stocked ?? 0);
    const lowStock = Number(inv?.low_stock ?? 0);
    const orders30d = Number(ord?.orders30d ?? 0);
    const revenueCents = Number(ord?.revenue ?? 0);
    const cogsCents = Number(cog?.cogs ?? 0);
    const expenseCount = Number(exp?.cnt ?? 0);
    const uncat = Number(exp?.uncat ?? 0);

    const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
    const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);
    const grossMarginPct = revenueCents > 0 ? ((revenueCents - cogsCents) / revenueCents) * 100 : 0;

    // Fixed weights (documented so scores are explainable):
    const catalogScore = total === 0 ? 0 : clamp(40 + 30 * ratio(withCost, total) + 30 * ratio(categorized, total));
    const inventoryScore = total === 0 ? 0 : clamp(60 * ratio(stocked, total) + 40 * (1 - ratio(lowStock, total)));
    const salesScore = orders30d === 0 ? 0 : clamp(40 + orders30d * 6);
    const marginScore = revenueCents === 0 ? 0 : clamp(grossMarginPct * 2);
    const expensesScore = expenseCount === 0 ? 30 : clamp(60 + 40 * ratio(expenseCount - uncat, expenseCount));

    const segments: HealthSegment[] = [
      { key: "catalog", label: "Catalog", score: catalogScore, detail: total === 0 ? "No active products" : `${withCost}/${total} priced, ${categorized}/${total} categorized` },
      { key: "inventory", label: "Inventory", score: inventoryScore, detail: total === 0 ? "No products to stock" : `${stocked}/${total} in stock, ${lowStock} low` },
      { key: "sales", label: "Sales", score: salesScore, detail: orders30d === 0 ? `No sales in ${recentDays}d` : `${orders30d} orders in ${recentDays}d` },
      { key: "margin", label: "Margin", score: marginScore, detail: revenueCents === 0 ? "No revenue yet" : `${grossMarginPct.toFixed(1)}% gross margin` },
      { key: "expenses", label: "Expenses", score: expensesScore, detail: expenseCount === 0 ? "No expenses recorded" : `${expenseCount} recorded, ${uncat} uncategorized` },
    ];
    const overall = clamp(segments.reduce((s, x) => s + x.score, 0) / segments.length);

    return {
      generatedAt: Date.now(),
      overall,
      segments,
      signals: {
        productCount: total, productsWithCost: withCost, categorizedCount: categorized,
        stockedCount: stocked, lowStockCount: lowStock, orders30d, revenueCents, cogsCents,
        grossMarginPct: Math.round(grossMarginPct * 10) / 10, expenseCount, uncategorizedExpenseCount: uncat,
      },
    };
  }

  // ── Scheduled Reports CRUD ──────────────────────────────────────────────────

  async listScheduledReports(tenantId: string): Promise<ScheduledReport[]> {
    const rows = await this.db.query<ScheduledReportRow>(
      "SELECT * FROM scheduled_reports WHERE tenant_id = @tenantId ORDER BY name ASC",
      { tenantId },
    );
    return rows.map(parseScheduled);
  }

  async getScheduledReport(tenantId: string, id: string): Promise<ScheduledReport> {
    const row = await this.db.one<ScheduledReportRow>(
      "SELECT * FROM scheduled_reports WHERE id = @id AND tenant_id = @tenantId",
      { id, tenantId },
    );
    if (!row) throw new HttpError(404, "not_found", "Scheduled report not found.");
    return parseScheduled(row);
  }

  async createScheduledReport(
    tenantId: string,
    input: CreateScheduledReportInput,
  ): Promise<ScheduledReport> {
    const id = `srp_${uuidv7()}`;
    const now = Date.now();
    await this.db.query(
      `INSERT INTO scheduled_reports
         (id, tenant_id, name, report_type, frequency, recipient_emails, enabled, last_sent_at, next_send_at, created_at, updated_at)
       VALUES
         (@id, @tenantId, @name, @reportType, @frequency, @recipientEmails, TRUE, NULL, @nextSendAt, @now, @now)`,
      {
        id,
        tenantId,
        name: input.name,
        reportType: input.reportType,
        frequency: input.frequency,
        recipientEmails: JSON.stringify(input.recipientEmails),
        nextSendAt: computeNextSendAt(input.frequency, now),
        now,
      },
    );
    return this.getScheduledReport(tenantId, id);
  }

  async updateScheduledReport(
    tenantId: string,
    id: string,
    input: UpdateScheduledReportInput,
  ): Promise<ScheduledReport> {
    const existing = await this.getScheduledReport(tenantId, id);
    const frequency = input.frequency ?? existing.frequency;
    const now = Date.now();
    await this.db.query(
      `UPDATE scheduled_reports SET
         name              = @name,
         report_type       = @reportType,
         frequency         = @frequency,
         recipient_emails  = @recipientEmails,
         enabled           = @enabled,
         next_send_at      = @nextSendAt,
         updated_at        = @now
       WHERE id = @id AND tenant_id = @tenantId`,
      {
        id,
        tenantId,
        name: input.name ?? existing.name,
        reportType: input.reportType ?? existing.reportType,
        frequency,
        recipientEmails: JSON.stringify(input.recipientEmails ?? existing.recipientEmails),
        enabled: input.enabled !== undefined ? input.enabled : existing.enabled,
        nextSendAt: computeNextSendAt(frequency, now),
        now,
      },
    );
    return this.getScheduledReport(tenantId, id);
  }

  async deleteScheduledReport(tenantId: string, id: string): Promise<void> {
    await this.getScheduledReport(tenantId, id); // 404 guard
    await this.db.query(
      "DELETE FROM scheduled_reports WHERE id = @id AND tenant_id = @tenantId",
      { id, tenantId },
    );
  }

  /**
   * Mark a scheduled report as sent (updates last_sent_at + computes next_send_at).
   * In production this would be called by a cron worker after successfully
   * dispatching the email. Exposed as a POST /trigger endpoint for manual runs
   * and cron integration.
   */
  async triggerScheduledReport(tenantId: string, id: string): Promise<ScheduledReport> {
    const existing = await this.getScheduledReport(tenantId, id);
    const now = Date.now();
    await this.db.query(
      `UPDATE scheduled_reports SET
         last_sent_at = @now,
         next_send_at = @nextSendAt,
         updated_at   = @now
       WHERE id = @id AND tenant_id = @tenantId`,
      { id, tenantId, now, nextSendAt: computeNextSendAt(existing.frequency, now) },
    );
    return this.getScheduledReport(tenantId, id);
  }

  // ── Inventory Forecasting ───────────────────────────────────────────────────

  /**
   * Reorder recommendations: products where stock ≤ reorder_point, or projected
   * to reach zero within lead_time_days at current velocity.
   *
   * Phase 7 item 1 (WORK/FORWARD_PLAN.md): velocity now comes from the shared
   * `computeSalesVelocity()` (src/shared/sales-velocity.ts) instead of a
   * locally-duplicated LEFT JOIN. The old query had two real correctness
   * bugs, both fixed by this migration, not just moved: its date filter
   * lived in the LEFT JOIN's ON clause, which a LEFT JOIN never actually
   * excludes on (the `order_lines` row survives with `orders` columns NULL
   * either way) — so `lookbackDays` had no effect and `units_sold` always
   * summed every sale ever; and it had no `o.status = 'completed'` filter,
   * so refunded/open/cancelled orders counted as "sold" units. Both are
   * fixed by the shared service, which every other consumer already relied
   * on being correct. See `WORK/audits/
   * AUDIT_2026-07-28T203748Z-phase7-demand-planning-foundation-gap.md`
   * Finding 1 for the full before/after per surface.
   *
   * supplierId/preferredCostCents (bug fix, WORK/LOCK.md "standalone bug fix:
   * insights.createReorderPOs()") now resolve the real preferred supplier via
   * product_suppliers — previously `supplier_id` was hardcoded `NULL::text`,
   * silently making createReorderPOs()'s per-supplier grouping meaningless.
   * Both are null when no preferred supplier is configured; a product's
   * is_preferred link is unique (see catalog's exclusive-preferred-supplier
   * invariant), so this LEFT JOIN adds at most one row per product.
   */
  async reorderRecommendations(
    tenantId: string,
    lookbackDays = 90,
  ): Promise<ReorderRecommendation[]> {
    const rows = await this.db.query<{
      product_id: string;
      sku: string;
      name: string;
      current_stock: number;
      reorder_point: number;
      reorder_quantity: number;
      lead_time_days: number;
      supplier_id: string | null;
      preferred_cost_cents: number | null;
    }>(
      `SELECT
         p.id                                          AS product_id,
         p.sku,
         p.name,
         COALESCE(inv.stock_qty, 0)                    AS current_stock,
         COALESCE(p.reorder_point, 0)                  AS reorder_point,
         COALESCE(p.reorder_quantity, 0)               AS reorder_quantity,
         COALESCE(p.lead_time_days, 7)                 AS lead_time_days,
         ps.supplier_id                                 AS supplier_id,
         ps.cost_cents                                  AS preferred_cost_cents
       FROM products p
       LEFT JOIN inventory inv
         ON inv.product_id = p.id AND inv.tenant_id = p.tenant_id
       LEFT JOIN product_suppliers ps
         ON ps.tenant_id = p.tenant_id AND ps.product_id = p.id AND ps.is_preferred = true
       WHERE p.tenant_id = @tenantId
         AND p.status    = 'active'`,
      { tenantId },
    );
    if (rows.length === 0) return [];

    const velocity = await computeSalesVelocity(this.db, {
      tenantId, lookbackDays, productIds: rows.map((r) => r.product_id),
    });

    const out: ReorderRecommendation[] = [];
    for (const r of rows) {
      const unitsSold = velocity.get(r.product_id)?.unitsSold ?? 0;
      const velocityPerDay = lookbackDays > 0 ? unitsSold / lookbackDays : 0;
      const currentStock = Number(r.current_stock);
      const reorderPoint = Number(r.reorder_point);
      const belowReorderPoint = currentStock <= reorderPoint;
      const projectedStockoutWithinLeadTime =
        lookbackDays > 0 && unitsSold > 0 && velocityPerDay > 0 &&
        currentStock / velocityPerDay <= Number(r.lead_time_days);
      if (!belowReorderPoint && !projectedStockoutWithinLeadTime) continue;
      const daysOfStock = velocityPerDay > 0 ? currentStock / velocityPerDay : Infinity;
      out.push({
        productId: r.product_id,
        sku: r.sku,
        name: r.name,
        currentStock,
        reorderPoint,
        reorderQuantity: Number(r.reorder_quantity),
        leadTimeDays: Number(r.lead_time_days),
        velocityPerDay,
        daysOfStock: isFinite(daysOfStock) ? Math.round(daysOfStock) : 9999,
        belowReorderPoint,
        supplierId: r.supplier_id,
        preferredCostCents: r.preferred_cost_cents != null ? Number(r.preferred_cost_cents) : null,
      });
    }
    out.sort((a, b) => a.currentStock - b.currentStock);
    return out;
  }

  // ── Order Recommendations ───────────────────────────────────────────────────

  /**
   * Top-selling products (by units sold) combined with reorder-point flag.
   * Used by the "What to order next" surface in the Insights UI.
   */
  async orderRecommendations(
    tenantId: string,
    lookbackDays = 30,
    limit = 20,
  ): Promise<OrderRecommendation[]> {
    const sinceMs = Date.now() - lookbackDays * 86_400_000;

    const rows = await this.db.query<{
      product_id: string;
      sku: string;
      name: string;
      total_units_sold: number;
      revenue_gross_cents: number;
      current_stock: number;
      reorder_point: number;
    }>(
      `SELECT
         p.id                                            AS product_id,
         p.sku,
         p.name,
         COALESCE(SUM(ol.quantity), 0)                  AS total_units_sold,
         COALESCE(SUM(ol.quantity * ol.unit_cents), 0)  AS revenue_gross_cents,
         COALESCE(inv.stock_qty, 0)                     AS current_stock,
         COALESCE(p.reorder_point, 0)                   AS reorder_point
       FROM products p
       JOIN order_lines ol
         ON ol.product_id = p.id AND ol.tenant_id = p.tenant_id
       JOIN orders o
         ON o.id = ol.order_id AND o.created_at >= @sinceMs
       LEFT JOIN inventory inv
         ON inv.product_id = p.id AND inv.tenant_id = p.tenant_id
       WHERE p.tenant_id = @tenantId
         AND p.status    = 'active'
       GROUP BY p.id, p.sku, p.name, inv.stock_qty, p.reorder_point
       ORDER BY total_units_sold DESC
       LIMIT @limit`,
      { tenantId, sinceMs, limit },
    );

    return rows.map((r, i) => ({
      productId: r.product_id,
      sku: r.sku,
      name: r.name,
      totalUnitsSold: r.total_units_sold,
      revenueGrossCents: r.revenue_gross_cents,
      rank: i + 1,
      belowReorderPoint: r.current_stock <= r.reorder_point,
    }));
  }

  // ── Auto-create draft POs from reorder recommendations ──────────────────────

  /**
   * Groups all below-reorder-point products by preferred supplier and creates
   * one PO per supplier group via the real `purchasing.createOrder()` — not
   * hand-rolled INSERTs. Bug fix (WORK/LOCK.md "standalone bug fix:
   * insights.createReorderPOs()"): the prior version inserted directly into
   * `po_lines`, a table that does not exist anywhere in this schema (the real
   * table is `purchase_order_lines`), so every call 500'd; it also wrote
   * `purchase_orders` columns (`supplier_name`, `notes`, `created_by`) absent
   * from the real table, minted its own `AUTO-...` PO number instead of the
   * shared race-free doc-number sequence, hardcoded `unit_cost_cents = 0` for
   * every line, and bypassed approval-tier gating and the audit trail
   * entirely. Routing through `createOrder()` fixes all of that for free.
   *
   * Products with no preferred supplier configured can no longer be silently
   * lumped into a fake "Unassigned" PO — `purchase_orders.supplier_id` is
   * `NOT NULL` on the real table, so there is no such thing as an unassigned
   * PO. Those products are skipped and reported back in `skipped` instead
   * (additive to the response shape; existing callers reading `created`/`pos`
   * are unaffected).
   */
  async createReorderPOs(
    tenantId: string,
    createdBy: string,
    actor?: Actor,
  ): Promise<{
    created: number;
    pos: Array<{ id: string; supplierId: string | null; lineCount: number; poNumber: string }>;
    skipped: Array<{ productId: string; sku: string; name: string; reason: string }>;
  }> {
    const recs = await this.reorderRecommendations(tenantId, 90);
    const belowPoint = recs.filter((r) => r.belowReorderPoint && (r.reorderQuantity ?? 0) > 0);
    if (belowPoint.length === 0) return { created: 0, pos: [], skipped: [] };

    // Group by real preferred-supplier id; products with none configured
    // cannot become a PO (supplier_id is NOT NULL) and are reported skipped.
    const groups = new Map<string, typeof belowPoint>();
    const skipped: Array<{ productId: string; sku: string; name: string; reason: string }> = [];
    for (const rec of belowPoint) {
      if (!rec.supplierId) {
        skipped.push({ productId: rec.productId, sku: rec.sku, name: rec.name, reason: "no_preferred_supplier" });
        continue;
      }
      const list = groups.get(rec.supplierId) ?? [];
      list.push(rec);
      groups.set(rec.supplierId, list);
    }

    const result: Array<{ id: string; supplierId: string | null; lineCount: number; poNumber: string }> = [];
    const effectiveActor = actor ?? { id: createdBy, role: "manager" };

    for (const [supplierId, lines] of groups) {
      const poLines: POLineInput[] = lines.map((line) => ({
        productId: line.productId,
        productName: line.name,
        quantity: line.reorderQuantity ?? Math.max(1, line.reorderPoint - line.currentStock),
        unitCostCents: line.preferredCostCents ?? 0,
      }));
      const po = await this.purchasing.createOrder(supplierId, poLines, tenantId, effectiveActor);
      result.push({ id: po.id, supplierId, lineCount: lines.length, poNumber: String(po.po_number ?? "") });
    }

    return { created: result.length, pos: result, skipped };
  }
}
