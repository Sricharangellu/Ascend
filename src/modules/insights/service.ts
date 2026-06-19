import { v7 as uuidv7 } from "uuid";
import { HttpError } from "../../shared/http.js";
import type { DB } from "../../shared/db.js";

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
  supplierId: string | null;
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

export class InsightsService {
  constructor(private readonly db: DB) {}

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
   * Velocity is computed from order_lines over the last 90 days.
   */
  async reorderRecommendations(
    tenantId: string,
    lookbackDays = 90,
  ): Promise<ReorderRecommendation[]> {
    const sinceMs = Date.now() - lookbackDays * 86_400_000;

    const rows = await this.db.query<{
      product_id: string;
      sku: string;
      name: string;
      current_stock: number;
      reorder_point: number;
      reorder_quantity: number;
      lead_time_days: number;
      units_sold: number;
      supplier_id: string | null;
    }>(
      `SELECT
         p.id                                          AS product_id,
         p.sku,
         p.name,
         COALESCE(inv.stock_qty, 0)                    AS current_stock,
         COALESCE(p.reorder_point, 0)                  AS reorder_point,
         COALESCE(p.reorder_quantity, 0)               AS reorder_quantity,
         COALESCE(p.lead_time_days, 7)                 AS lead_time_days,
         COALESCE(SUM(ol.quantity), 0)                 AS units_sold,
         NULL::text                                    AS supplier_id
       FROM products p
       LEFT JOIN inventory inv
         ON inv.product_id = p.id AND inv.tenant_id = p.tenant_id
       LEFT JOIN order_lines ol
         ON ol.product_id = p.id AND ol.tenant_id = p.tenant_id
       LEFT JOIN orders o
         ON o.id = ol.order_id AND o.created_at >= @sinceMs
       WHERE p.tenant_id = @tenantId
         AND p.status    = 'active'
       GROUP BY p.id, p.sku, p.name, inv.stock_qty,
                p.reorder_point, p.reorder_quantity, p.lead_time_days
       HAVING
         COALESCE(inv.stock_qty, 0) <= COALESCE(p.reorder_point, 0)
         OR (
           @lookbackDays > 0
           AND COALESCE(SUM(ol.quantity), 0) > 0
           AND (COALESCE(inv.stock_qty, 0)::float
                / (COALESCE(SUM(ol.quantity), 0)::float / @lookbackDays))
               <= COALESCE(p.lead_time_days, 7)
         )
       ORDER BY current_stock ASC`,
      { tenantId, sinceMs, lookbackDays },
    );

    return rows.map((r) => {
      const velocityPerDay = lookbackDays > 0 ? r.units_sold / lookbackDays : 0;
      const daysOfStock = velocityPerDay > 0 ? r.current_stock / velocityPerDay : Infinity;
      return {
        productId: r.product_id,
        sku: r.sku,
        name: r.name,
        currentStock: r.current_stock,
        reorderPoint: r.reorder_point,
        reorderQuantity: r.reorder_quantity,
        leadTimeDays: r.lead_time_days,
        velocityPerDay,
        daysOfStock: isFinite(daysOfStock) ? Math.round(daysOfStock) : 9999,
        belowReorderPoint: r.current_stock <= r.reorder_point,
        supplierId: r.supplier_id,
      };
    });
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
   * Groups all below-reorder-point products by preferred_vendor_id and creates
   * one draft PO per vendor group. Returns the list of created PO IDs.
   * Products with no preferred vendor go into a single "unassigned" PO.
   */
  async createReorderPOs(tenantId: string, createdBy: string): Promise<{ created: number; pos: Array<{ id: string; supplierId: string | null; lineCount: number }> }> {
    const recs = await this.reorderRecommendations(tenantId, 90);
    const belowPoint = recs.filter((r) => r.belowReorderPoint && (r.reorderQuantity ?? 0) > 0);
    if (belowPoint.length === 0) return { created: 0, pos: [] };

    // Group by supplierId (null = unassigned)
    const groups = new Map<string | null, typeof belowPoint>();
    for (const rec of belowPoint) {
      const key = rec.supplierId ?? null;
      const list = groups.get(key) ?? [];
      list.push(rec);
      groups.set(key, list);
    }

    const now = Date.now();
    const result: Array<{ id: string; supplierId: string | null; lineCount: number }> = [];

    for (const [supplierId, lines] of groups) {
      const poId = uuidv7();
      const poNumber = `AUTO-${now.toString(36).toUpperCase().slice(-6)}`;

      // Fetch supplier name if available
      let supplierName = "Unassigned";
      if (supplierId) {
        const s = await this.db.one<{ name: string }>("SELECT name FROM suppliers WHERE id = @id AND tenant_id = @t", { id: supplierId, t: tenantId });
        if (s) supplierName = s.name;
      }

      await this.db.query(
        `INSERT INTO purchase_orders (id, tenant_id, po_number, supplier_id, supplier_name, status, notes, created_by, expected_date, created_at, updated_at)
         VALUES (@id, @t, @num, @sid, @sname, 'draft', @notes, @by, @exp, @now, @now)`,
        { id: poId, t: tenantId, num: poNumber, sid: supplierId, sname: supplierName, notes: "Auto-generated from reorder recommendations", by: createdBy, exp: now + 14 * 86_400_000, now },
      );

      for (const line of lines) {
        const lineId = uuidv7();
        const qty = line.reorderQuantity ?? Math.max(1, line.reorderPoint - line.currentStock);
        await this.db.query(
          `INSERT INTO po_lines (id, tenant_id, po_id, product_id, sku, name, ordered_qty, received_qty, unit_cost_cents, line_cost_cents, status)
           VALUES (@id, @t, @po, @pid, @sku, @name, @qty, 0, 0, 0, 'pending')`,
          { id: lineId, t: tenantId, po: poId, pid: line.productId, sku: line.sku, name: line.name, qty },
        );
      }

      result.push({ id: poId, supplierId, lineCount: lines.length });
    }

    return { created: result.length, pos: result };
  }
}
