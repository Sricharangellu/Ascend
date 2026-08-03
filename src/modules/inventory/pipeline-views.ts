import type { DB } from "../../shared/db.js";
import { badRequest, notFound } from "../../shared/http.js";
import { roundToOrderQuantity } from "../../shared/reorder-quantity.js";
import { computeSalesVelocity } from "../../shared/sales-velocity.js";
import type { PurchasingService } from "../purchasing/index.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Tenant-wide views over the purchasing pipeline for the Inventory > Pipeline
 * pages. Built 2026-07-18 alongside the FE↔BE gap-closure pass; see
 * WORK/audits/AUDIT_2026-07-18T005030Z-fe-be-gap-audit.md.
 *
 * Scope note: this deliberately covers Pending / History / Reorder Alerts
 * only. Receiving, Issues, Errors, and the 9-stage Pipeline Overview funnel
 * are NOT built here — each implies a subsystem that doesn't exist in the
 * schema yet (a stateful "receiving session" with a receiver/batch concept;
 * an issue/error *detection* engine with categories like sku_mapping,
 * price_mismatch, duplicate_doc; a pipeline funnel with stages that don't map
 * onto the real 4-value POStatus enum). Inventing those would mean making up
 * business logic no one asked for — same call as catalog's `/credits` gap.
 * Left allowlisted; see WORK/LOOP_STATE.md NEEDS-SRI.
 */
export class PipelineViewsService {
  constructor(
    private readonly db: DB,
    private readonly purchasing: PurchasingService,
  ) {}

  /**
   * Open PO lines not yet fully received. `outlet` stays honestly empty —
   * there is no location-assignment concept on purchase orders in this
   * schema. `expected_date` (Phase 6 item 3, WORK/FORWARD_PLAN.md) is now a
   * real lead-time-derived promise: ordered_at + lead_time_days, where
   * lead_time_days prefers the specific (product, supplier) pairing from
   * `product_suppliers`, falls back to the product's general
   * `products.lead_time_days`, and finally to a 7-day default (same fallback
   * `catalog/detail-views.ts`'s reorderRecommendations() already uses).
   * days_overdue is now real too: days past the promised date for a line
   * that's still open. status is this endpoint's own two-value contract (not
   * POStatus) — 'partial' here means "some but not all lines received"
   * (POStatus 'partially_received').
   */
  async pending(tenantId: string) {
    const rows = await this.db.query<{
      id: string; po_number: number; supplier_name: string;
      product_name: string | null; sku: string | null;
      qty_ordered: number; qty_received: number;
      unit_cost_cents: number; total_cost_cents: number;
      ordered_at: number; po_status: string;
      lead_time_days: number;
    }>(
      `SELECT pol.id, po.po_number, s.name AS supplier_name,
              COALESCE(pol.product_name, p.name, '') AS product_name,
              COALESCE(p.sku, '') AS sku,
              pol.quantity AS qty_ordered, pol.received_qty AS qty_received,
              pol.unit_cost_cents, pol.line_cost_cents AS total_cost_cents,
              po.created_at AS ordered_at, po.status AS po_status,
              COALESCE(ps.lead_time_days, p.lead_time_days, 7) AS lead_time_days
         FROM purchase_order_lines pol
         JOIN purchase_orders po ON po.tenant_id = pol.tenant_id AND po.id = pol.po_id
         JOIN suppliers s ON s.tenant_id = po.tenant_id AND s.id = po.supplier_id
         LEFT JOIN products p ON p.tenant_id = pol.tenant_id AND p.id = pol.product_id
         LEFT JOIN product_suppliers ps
           ON ps.tenant_id = pol.tenant_id AND ps.product_id = pol.product_id AND ps.supplier_id = po.supplier_id
        WHERE pol.tenant_id = @t AND po.status IN ('ordered', 'partially_received')
        ORDER BY po.created_at DESC`,
      { t: tenantId },
    );
    const now = Date.now();
    return {
      items: rows.map((r) => {
        const leadDays = Number(r.lead_time_days);
        const expectedDate = Number(r.ordered_at) + leadDays * DAY_MS;
        return {
          id: r.id,
          po_number: String(r.po_number ?? ""),
          supplier_name: r.supplier_name,
          product_name: r.product_name ?? "",
          sku: r.sku ?? "",
          qty_ordered: Number(r.qty_ordered),
          qty_received: Number(r.qty_received),
          unit_cost_cents: Number(r.unit_cost_cents),
          total_cost_cents: Number(r.total_cost_cents),
          expected_date: expectedDate,
          lead_time_days: leadDays,
          status: (r.po_status === "ordered" ? "ordered" : "partial") as "ordered" | "partial",
          days_overdue: now > expectedDate ? Math.floor((now - expectedDate) / DAY_MS) : 0,
          outlet: "",
        };
      }),
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
   * is now a real, independently configurable buffer (Phase 6 item 2,
   * `inventory.safety_stock`, settable via `PUT /:productId/safety-stock`) —
   * it defaults to 0 for any product that hasn't configured one, so existing
   * data is unaffected. suggested_qty's raw target is reorder_pt (or a
   * 14-day-cover fallback) plus safety_stock, then rounded up to a quantity
   * the preferred supplier can fulfil (MOQ / case_pack, via
   * `shared/reorder-quantity.ts` — Phase 6 item 1) — both are no-ops when
   * unconfigured, preserving prior behavior exactly. expected_delivery_date
   * (Phase 6 item 3) is now + the preferred supplier's lead time (falling
   * back to the product's general lead_time_days, then a 7-day default) —
   * "if I ordered today, when would this arrive," null when there's no
   * preferred supplier to promise against.
   */
  async reorderAlerts(tenantId: string) {
    const rows = await this.db.query<{
      product_id: string; name: string; sku: string | null;
      stock_qty: number; reorder_pt: number; safety_stock: number;
      preferred_vendor_id: string | null; preferred_vendor_name: string | null;
      preferred_cost_cents: number | null;
      preferred_moq: number | null; preferred_case_pack: number | null;
      preferred_lead_time_days: number | null;
    }>(
      `SELECT i.product_id, COALESCE(p.name, '') AS name, p.sku,
              COALESCE(i.stock_qty, 0) AS stock_qty, i.reorder_pt,
              COALESCE(i.safety_stock, 0) AS safety_stock,
              ps.supplier_id AS preferred_vendor_id, s.name AS preferred_vendor_name,
              ps.cost_cents AS preferred_cost_cents,
              ps.moq AS preferred_moq, ps.case_pack AS preferred_case_pack,
              COALESCE(ps.lead_time_days, p.lead_time_days) AS preferred_lead_time_days
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
    // Phase 7 item 1 (WORK/FORWARD_PLAN.md): velocity now comes from the
    // shared sales-velocity service (src/shared/sales-velocity.ts) instead of
    // a locally-duplicated query — same consolidation as catalog/
    // detail-views.ts's reorderSuggestions().
    const [velocity, incomingRows] = await Promise.all([
      computeSalesVelocity(this.db, { tenantId, productIds, lookbackDays: 30 }),
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
    const incoming = new Map(incomingRows.map((v) => [v.product_id, Number(v.qty)]));

    return {
      items: rows.map((r) => {
        const stock = Number(r.stock_qty);
        const reorderPt = Number(r.reorder_pt);
        const safetyStock = Number(r.safety_stock ?? 0);
        const avgDaily = velocity.get(r.product_id)?.velocityPerDay ?? 0;
        const daysUntilStockout = avgDaily > 0 ? Math.floor(stock / avgDaily) : -1;
        const baseTargetQty = reorderPt > 0 ? reorderPt : Math.max(1, Math.ceil(avgDaily * 14));
        // Phase 6 item 2: safety_stock is additive to the base target before
        // MOQ/case_pack rounding — 0 (the default) is a no-op.
        const suggestedQty = roundToOrderQuantity(baseTargetQty + safetyStock, {
          moq: r.preferred_moq, casePack: r.preferred_case_pack,
        });
        const costCents = r.preferred_cost_cents != null ? Number(r.preferred_cost_cents) : 0;
        // Phase 6 item 3: only promise a delivery date when there's an actual
        // preferred supplier to promise against; 7-day default matches
        // pending()'s fallback when neither side has a configured lead time.
        const expectedDeliveryDate = r.preferred_vendor_id
          ? Date.now() + (r.preferred_lead_time_days ?? 7) * DAY_MS
          : null;
        return {
          id: r.product_id,
          product_id: r.product_id,
          product_name: r.name,
          sku: r.sku ?? "",
          current_stock: stock,
          reorder_point: reorderPt,
          safety_stock: safetyStock,
          avg_daily_sales: Math.round(avgDaily * 100) / 100,
          days_until_stockout: daysUntilStockout,
          preferred_supplier: r.preferred_vendor_name ?? "",
          preferred_supplier_moq: r.preferred_moq ?? null,
          preferred_supplier_case_pack: r.preferred_case_pack ?? null,
          expected_delivery_date: expectedDeliveryDate,
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
