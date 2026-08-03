import type { DB } from "../../shared/db.js";
import { badRequest, notFound } from "../../shared/http.js";
import type { PurchasingService } from "../purchasing/index.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Tenant-wide views over the purchasing pipeline for the Inventory > Pipeline
 * pages. Built 2026-07-18 alongside the FE↔BE gap-closure pass; see
 * WORK/audits/AUDIT_2026-07-18T005030Z-fe-be-gap-audit.md.
 *
 * 2026-08-03: Receiving tab is now real — backed by `receiving_sessions` /
 * `receiving_session_lines` (Phase 8 enterprise receiving rewrite). Issues /
 * Errors / 9-stage Overview funnel remain deferred (still need a detection
 * engine / status-model decision).
 */
export class PipelineViewsService {
  constructor(
    private readonly db: DB,
    private readonly purchasing: PurchasingService,
  ) {}

  /**
   * Open PO lines not yet fully received. `expected_date` and `outlet` are
   * honestly approximated: there is no ETA (lead-time-derived expected
   * arrival) or location-assignment concept on purchase orders in this
   * schema, so expected_date falls back to the order date and days_overdue
   * always reads 0 rather than fabricating a number. status is this
   * endpoint's own two-value contract (not POStatus) — 'partial' here means
   * "some but not all lines received" (POStatus 'partially_received').
   */
  async pending(tenantId: string) {
    const rows = await this.db.query<{
      id: string; po_number: number; supplier_name: string;
      product_name: string | null; sku: string | null;
      qty_ordered: number; qty_received: number;
      unit_cost_cents: number; total_cost_cents: number;
      ordered_at: number; po_status: string;
    }>(
      `SELECT pol.id, po.po_number, s.name AS supplier_name,
              COALESCE(pol.product_name, p.name, '') AS product_name,
              COALESCE(p.sku, '') AS sku,
              pol.quantity AS qty_ordered, pol.received_qty AS qty_received,
              pol.unit_cost_cents, pol.line_cost_cents AS total_cost_cents,
              po.created_at AS ordered_at, po.status AS po_status
         FROM purchase_order_lines pol
         JOIN purchase_orders po ON po.tenant_id = pol.tenant_id AND po.id = pol.po_id
         JOIN suppliers s ON s.tenant_id = po.tenant_id AND s.id = po.supplier_id
         LEFT JOIN products p ON p.tenant_id = pol.tenant_id AND p.id = pol.product_id
        WHERE pol.tenant_id = @t AND po.status IN ('ordered', 'partially_received')
        ORDER BY po.created_at DESC`,
      { t: tenantId },
    );
    return {
      items: rows.map((r) => ({
        id: r.id,
        po_number: String(r.po_number ?? ""),
        supplier_name: r.supplier_name,
        product_name: r.product_name ?? "",
        sku: r.sku ?? "",
        qty_ordered: Number(r.qty_ordered),
        qty_received: Number(r.qty_received),
        unit_cost_cents: Number(r.unit_cost_cents),
        total_cost_cents: Number(r.total_cost_cents),
        expected_date: Number(r.ordered_at),
        status: (r.po_status === "ordered" ? "ordered" : "partial") as "ordered" | "partial",
        days_overdue: 0,
        outlet: "",
      })),
    };
  }

  /**
   * Fully received POs. `receiver` is honestly empty — receive() records no
   * acting-user column on the PO/line today. cost_variance_cents is always 0
   * for the same reason: receive() never revises unit_cost_cents, so there is
   * no captured "billed vs. ordered cost" delta to report yet.
   */
  async history(tenantId: string) {
    const rows = await this.db.query<{
      id: string; po_number: number; supplier_name: string;
      product_name: string | null; sku: string | null;
      qty_ordered: number; qty_received: number; total_cost_cents: number;
      ordered_at: number; received_at: number | null;
    }>(
      `SELECT pol.id, po.po_number, s.name AS supplier_name,
              COALESCE(pol.product_name, p.name, '') AS product_name,
              COALESCE(p.sku, '') AS sku,
              pol.quantity AS qty_ordered, pol.received_qty AS qty_received,
              pol.line_cost_cents AS total_cost_cents,
              po.created_at AS ordered_at, po.received_at
         FROM purchase_order_lines pol
         JOIN purchase_orders po ON po.tenant_id = pol.tenant_id AND po.id = pol.po_id
         JOIN suppliers s ON s.tenant_id = po.tenant_id AND s.id = po.supplier_id
         LEFT JOIN products p ON p.tenant_id = pol.tenant_id AND p.id = pol.product_id
        WHERE pol.tenant_id = @t AND po.status = 'received'
        ORDER BY po.received_at DESC NULLS LAST`,
      { t: tenantId },
    );
    return {
      items: rows.map((r) => {
        const receivedAt = r.received_at ?? r.ordered_at;
        const leadDays = Math.max(0, Math.round((receivedAt - r.ordered_at) / DAY_MS));
        const short = Number(r.qty_received) < Number(r.qty_ordered);
        return {
          id: r.id,
          po_number: String(r.po_number ?? ""),
          supplier_name: r.supplier_name,
          product_name: r.product_name ?? "",
          sku: r.sku ?? "",
          qty_ordered: Number(r.qty_ordered),
          qty_received: Number(r.qty_received),
          total_cost_cents: Number(r.total_cost_cents),
          ordered_at: Number(r.ordered_at),
          received_at: Number(receivedAt),
          lead_time_days: leadDays,
          status: (short ? "closed_short" : "closed") as "closed" | "closed_short",
          cost_variance_cents: 0,
          receiver: "",
        };
      }),
    };
  }

  /**
   * Tenant-wide reorder alerts — the same underlying signal as
   * InventoryService.getReorderSuggestions(), extended with the extra fields
   * this page's contract expects (avg_daily_sales, days_until_stockout,
   * estimated_cost_cents, urgency, open_po_qty). `id` is the product_id: this
   * page has one alert per product, not a separate alert entity. safety_stock
   * mirrors reorder_point and suggested_qty falls back to it — no distinct
   * "safety stock" or "reorder quantity" concept exists in the schema (same
   * approximation already applied to inventory/reorder-suggestions).
   */
  async reorderAlerts(tenantId: string) {
    const rows = await this.db.query<{
      product_id: string; name: string; sku: string | null;
      stock_qty: number; reorder_pt: number;
      preferred_vendor_id: string | null; preferred_vendor_name: string | null;
      preferred_cost_cents: number | null;
    }>(
      `SELECT i.product_id, COALESCE(p.name, '') AS name, p.sku,
              COALESCE(i.stock_qty, 0) AS stock_qty, i.reorder_pt,
              ps.supplier_id AS preferred_vendor_id, s.name AS preferred_vendor_name,
              ps.cost_cents AS preferred_cost_cents
         FROM inventory i
         JOIN products p ON p.id = i.product_id AND p.tenant_id = i.tenant_id
         LEFT JOIN product_suppliers ps
           ON ps.tenant_id = i.tenant_id AND ps.product_id = i.product_id AND ps.is_preferred = true
         LEFT JOIN suppliers s ON s.tenant_id = ps.tenant_id AND s.id = ps.supplier_id
        WHERE i.tenant_id = @t AND i.reorder_pt > 0 AND COALESCE(i.stock_qty, 0) <= i.reorder_pt
        ORDER BY i.stock_qty ASC`,
      { t: tenantId },
    );
    if (rows.length === 0) return { items: [] };

    const productIds = rows.map((r) => r.product_id);
    const [velocityRows, incomingRows] = await Promise.all([
      this.db.query<{ product_id: string; units: number }>(
        `SELECT ol.product_id, COALESCE(SUM(ol.quantity), 0) AS units
           FROM order_lines ol JOIN orders o ON o.tenant_id = ol.tenant_id AND o.id = ol.order_id
          WHERE ol.tenant_id = @t AND ol.product_id = ANY(@ids) AND o.status = 'completed'
            AND o.created_at >= @cutoff
          GROUP BY ol.product_id`,
        { t: tenantId, ids: productIds, cutoff: Date.now() - 30 * DAY_MS },
      ),
      // received_qty-based remaining, not billed_qty — see the 2026-07-18 fix
      // in catalog/detail-views.ts's reorderSuggestions() for why.
      this.db.query<{ product_id: string; qty: number }>(
        `SELECT pol.product_id, COALESCE(SUM(pol.quantity - COALESCE(pol.received_qty, 0)), 0) AS qty
           FROM purchase_order_lines pol JOIN purchase_orders po ON po.tenant_id = pol.tenant_id AND po.id = pol.po_id
          WHERE pol.tenant_id = @t AND pol.product_id = ANY(@ids) AND po.status IN ('ordered', 'partially_received')
          GROUP BY pol.product_id`,
        { t: tenantId, ids: productIds },
      ),
    ]);
    const velocity = new Map(velocityRows.map((v) => [v.product_id, Number(v.units)]));
    const incoming = new Map(incomingRows.map((v) => [v.product_id, Number(v.qty)]));

    return {
      items: rows.map((r) => {
        const stock = Number(r.stock_qty);
        const reorderPt = Number(r.reorder_pt);
        const avgDaily = (velocity.get(r.product_id) ?? 0) / 30;
        const daysUntilStockout = avgDaily > 0 ? Math.floor(stock / avgDaily) : -1;
        const suggestedQty = reorderPt > 0 ? reorderPt : Math.max(1, Math.ceil(avgDaily * 14));
        const costCents = r.preferred_cost_cents != null ? Number(r.preferred_cost_cents) : 0;
        return {
          id: r.product_id,
          product_id: r.product_id,
          product_name: r.name,
          sku: r.sku ?? "",
          current_stock: stock,
          reorder_point: reorderPt,
          safety_stock: reorderPt,
          avg_daily_sales: Math.round(avgDaily * 100) / 100,
          days_until_stockout: daysUntilStockout,
          preferred_supplier: r.preferred_vendor_name ?? "",
          suggested_qty: suggestedQty,
          estimated_cost_cents: suggestedQty * costCents,
          urgency: (stock <= 0 ? "critical" : "warning") as "critical" | "warning",
          open_po_qty: incoming.get(r.product_id) ?? 0,
        };
      }),
    };
  }

  /** Creates a PO for one reorder alert's suggested qty with its preferred vendor. */
  async createPoFromAlert(productId: string, tenantId: string, actor?: { id: string | null; role: string }) {
    const alerts = await this.reorderAlerts(tenantId);
    const alert = alerts.items.find((a) => a.product_id === productId);
    if (!alert) throw notFound(`no open reorder alert for product '${productId}'`);
    if (!alert.preferred_supplier) {
      throw badRequest("this product has no preferred supplier — add one from its Suppliers tab before creating a PO");
    }
    const supplierRow = await this.db.one<{ id: string }>(
      `SELECT ps.supplier_id AS id
         FROM product_suppliers ps
        WHERE ps.tenant_id = @t AND ps.product_id = @p AND ps.is_preferred = true`,
      { t: tenantId, p: productId },
    );
    if (!supplierRow) throw notFound("preferred supplier link no longer exists");
    const po = await this.purchasing.createOrder(
      supplierRow.id,
      [{
        productId,
        productName: alert.product_name,
        quantity: alert.suggested_qty,
        unitCostCents: alert.estimated_cost_cents > 0 ? Math.round(alert.estimated_cost_cents / alert.suggested_qty) : 0,
      }],
      tenantId,
      actor,
    );
    return { po_number: String(po.po_number) };
  }

  /**
   * Active receiving-session lines for Inventory > Pipeline > Receiving.
   * Shape matches the existing FE ReceivingTab contract.
   */
  async receiving(tenantId: string) {
    const rows = await this.db.query<{
      id: string; session_id: string; po_number: number | null;
      supplier_name: string | null; product_name: string | null; sku: string | null;
      expected_qty: number; accepted_qty: number; held_qty: number; rejected_qty: number;
      unit_cost_cents: number | null; po_unit_cost_cents: number;
      started_at: number; receiver_name: string | null; dock_code: string | null;
      session_number: string; line_status: string; session_status: string;
    }>(
      `SELECT rsl.id, rsl.session_id, po.po_number, s.name AS supplier_name,
              COALESCE(pol.product_name, p.name, '') AS product_name,
              COALESCE(p.sku, '') AS sku,
              rsl.expected_qty, rsl.accepted_qty, rsl.held_qty, rsl.rejected_qty,
              rsl.unit_cost_cents, pol.unit_cost_cents AS po_unit_cost_cents,
              rs.started_at, rs.receiver_name, rs.dock_code, rs.session_number,
              rsl.status AS line_status, rs.status AS session_status
         FROM receiving_session_lines rsl
         JOIN receiving_sessions rs ON rs.tenant_id = rsl.tenant_id AND rs.id = rsl.session_id
         JOIN purchase_orders po ON po.tenant_id = rs.tenant_id AND po.id = rs.po_id
         LEFT JOIN suppliers s ON s.tenant_id = po.tenant_id AND s.id = po.supplier_id
         JOIN purchase_order_lines pol ON pol.tenant_id = rsl.tenant_id AND pol.id = rsl.po_line_id
         LEFT JOIN products p ON p.tenant_id = rsl.tenant_id AND p.id = rsl.product_id
        WHERE rsl.tenant_id = @t
          AND rs.status IN ('open','docked','receiving','quality_hold')
          AND rsl.status <> 'posted'
        ORDER BY rs.started_at DESC, rsl.created_at ASC`,
      { t: tenantId },
    );
    return {
      items: rows.map((r) => {
        const remaining = Math.max(
          0,
          Number(r.expected_qty) - Number(r.accepted_qty) - Number(r.held_qty) - Number(r.rejected_qty),
        );
        return {
          id: r.id,
          session_id: r.session_id,
          po_number: String(r.po_number ?? ""),
          supplier_name: r.supplier_name ?? "",
          product_name: r.product_name ?? "",
          sku: r.sku ?? "",
          qty_ordered: Number(r.expected_qty),
          qty_received: Number(r.accepted_qty),
          qty_remaining: remaining,
          unit_cost_cents: Number(r.unit_cost_cents ?? r.po_unit_cost_cents ?? 0),
          started_at: Number(r.started_at),
          receiver: r.receiver_name ?? "",
          outlet: r.dock_code ?? "",
          batch_id: r.session_number,
          status: r.line_status,
          session_status: r.session_status,
        };
      }),
    };
  }

  /** Increment accepted qty on an active session line (scan desk helper). */
  async updateReceivingLine(lineId: string, tenantId: string, qtyScanned: number) {
    if (qtyScanned <= 0) throw badRequest("qty_scanned must be positive");
    const line = await this.db.one<{
      id: string; session_id: string; expected_qty: number;
      accepted_qty: number; held_qty: number; rejected_qty: number; status: string;
    }>(
      `SELECT id, session_id, expected_qty, accepted_qty, held_qty, rejected_qty, status
         FROM receiving_session_lines WHERE id = @id AND tenant_id = @t`,
      { id: lineId, t: tenantId },
    );
    if (!line) throw notFound(`receiving line '${lineId}' not found`);
    if (line.status === "posted") throw badRequest("line already posted");
    const remaining =
      Number(line.expected_qty) - Number(line.accepted_qty) - Number(line.held_qty) - Number(line.rejected_qty);
    if (qtyScanned > remaining) {
      throw badRequest(`qty_scanned ${qtyScanned} exceeds remaining ${remaining}`);
    }
    const now = Date.now();
    await this.db.query(
      `UPDATE receiving_session_lines
          SET accepted_qty = accepted_qty + @qty,
              scanned_qty = scanned_qty + @qty,
              status = 'scanning',
              updated_at = @now
        WHERE id = @id AND tenant_id = @t`,
      { qty: qtyScanned, now, id: lineId, t: tenantId },
    );
    await this.db.query(
      `UPDATE receiving_sessions
          SET status = CASE WHEN status IN ('open','docked') THEN 'receiving' ELSE status END,
              updated_at = @now
        WHERE id = @sid AND tenant_id = @t`,
      { now, sid: line.session_id, t: tenantId },
    );
    const items = await this.receiving(tenantId);
    const updated = items.items.find((i) => i.id === lineId);
    if (!updated) throw notFound(`receiving line '${lineId}' not found after update`);
    return updated;
  }

  /**
   * Honest pipeline summary KPIs that can be computed from real tables.
   * Stages that don't map onto POStatus are omitted rather than fabricated.
   */
  async summary(tenantId: string) {
    const open = await this.db.one<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM purchase_orders
        WHERE tenant_id = @t AND status IN ('ordered','partially_received')`,
      { t: tenantId },
    );
    const partial = await this.db.one<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM purchase_orders
        WHERE tenant_id = @t AND status = 'partially_received'`,
      { t: tenantId },
    );
    const received = await this.db.one<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM purchase_orders
        WHERE tenant_id = @t AND status = 'received'`,
      { t: tenantId },
    );
    const receivingActive = await this.db.one<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM receiving_sessions
        WHERE tenant_id = @t AND status IN ('open','docked','receiving','quality_hold')`,
      { t: tenantId },
    );
    const qualityHolds = await this.db.one<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM receiving_session_lines
        WHERE tenant_id = @t AND held_qty > 0 AND status <> 'posted'`,
      { t: tenantId },
    );
    return {
      open_pos: open?.n ?? 0,
      partially_received_pos: partial?.n ?? 0,
      received_pos: received?.n ?? 0,
      receiving_active: receivingActive?.n ?? 0,
      quality_holds: qualityHolds?.n ?? 0,
      // Explicitly not inventing stages the schema cannot support:
      stages_unsupported: ["suggested", "draft", "sent", "confirmed", "in_transit", "billed", "closed"],
    };
  }
}
