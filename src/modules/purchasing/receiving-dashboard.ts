import type { DB } from "../../shared/db.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Executive receiving dashboard — real aggregates over POs, sessions, lots,
 * and 3-way match bills. Future AI hooks can consume the same shape.
 */
export class ReceivingDashboardService {
  constructor(private readonly db: DB) {}

  async summary(tenantId: string) {
    const startOfDay = Date.now() - (Date.now() % DAY_MS);

    const todayReceipts = await this.db.one<{ n: number; units: number }>(
      `SELECT COUNT(*)::int AS n, COALESCE(SUM(pol.received_qty),0)::int AS units
         FROM purchase_orders po
         JOIN purchase_order_lines pol ON pol.tenant_id = po.tenant_id AND pol.po_id = po.id
        WHERE po.tenant_id = @t
          AND po.status IN ('received','partially_received')
          AND COALESCE(po.received_at, po.created_at) >= @start`,
      { t: tenantId, start: startOfDay },
    );

    const pending = await this.db.one<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM purchase_orders
        WHERE tenant_id = @t AND status IN ('ordered','partially_received')`,
      { t: tenantId },
    );

    const latePos = await this.db.one<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM purchase_orders po
        WHERE po.tenant_id = @t
          AND po.status IN ('ordered','partially_received')
          AND po.created_at < @cutoff`,
      { t: tenantId, cutoff: Date.now() - 7 * DAY_MS },
    );

    const activeSessions = await this.db.one<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM receiving_sessions
        WHERE tenant_id = @t AND status IN ('open','docked','receiving','quality_hold')`,
      { t: tenantId },
    );

    const qualityHolds = await this.db.one<{ n: number; units: number }>(
      `SELECT COUNT(*)::int AS n, COALESCE(SUM(held_qty),0)::int AS units
         FROM receiving_session_lines rsl
         JOIN receiving_sessions rs ON rs.tenant_id = rsl.tenant_id AND rs.id = rsl.session_id
        WHERE rsl.tenant_id = @t AND rsl.held_qty > 0
          AND rs.status IN ('open','docked','receiving','quality_hold')`,
      { t: tenantId },
    );

    const invoicesPending = await this.db.one<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM po_bills
        WHERE tenant_id = @t AND status IN ('draft','held')`,
      { t: tenantId },
    );

    const varianceBills = await this.db.one<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM po_bills
        WHERE tenant_id = @t AND status IN ('draft','held','approved')`,
      { t: tenantId },
    );

    const nearExpiry = await this.db.one<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM inventory_lots
        WHERE tenant_id = @t AND qty_on_hand > 0
          AND expiry_date IS NOT NULL
          AND expiry_date > @now
          AND expiry_date <= @soon`,
      { t: tenantId, now: Date.now(), soon: Date.now() + 30 * DAY_MS },
    );

    const expiredLots = await this.db.one<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM inventory_lots
        WHERE tenant_id = @t AND qty_on_hand > 0
          AND expiry_date IS NOT NULL AND expiry_date <= @now`,
      { t: tenantId, now: Date.now() },
    );

    const scanErrors = await this.db.one<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM receiving_scan_events
        WHERE tenant_id = @t AND created_at >= @start
          AND result IN ('unknown','over_qty','expired','cost_variance')`,
      { t: tenantId, start: startOfDay },
    );

    const avgReceiveMs = await this.db.one<{ avg_ms: number | null }>(
      `SELECT AVG(completed_at - started_at)::float AS avg_ms
         FROM receiving_sessions
        WHERE tenant_id = @t AND status = 'completed'
          AND completed_at IS NOT NULL AND completed_at >= @start`,
      { t: tenantId, start: Date.now() - 30 * DAY_MS },
    );

    // Accuracy: posted accepted qty / expected qty across completed sessions (30d)
    const accuracy = await this.db.one<{ expected: number; accepted: number }>(
      `SELECT COALESCE(SUM(expected_qty),0)::int AS expected,
              COALESCE(SUM(accepted_qty),0)::int AS accepted
         FROM receiving_session_lines rsl
         JOIN receiving_sessions rs ON rs.tenant_id = rsl.tenant_id AND rs.id = rsl.session_id
        WHERE rsl.tenant_id = @t AND rs.status = 'completed'
          AND rs.completed_at >= @start`,
      { t: tenantId, start: Date.now() - 30 * DAY_MS },
    );
    const receivingAccuracyPct =
      accuracy && accuracy.expected > 0
        ? Number(((accuracy.accepted / accuracy.expected) * 100).toFixed(1))
        : null;

    const trend = await this.db.query<{ day: string; receipts: number }>(
      `SELECT to_char(to_timestamp(COALESCE(po.received_at, po.created_at) / 1000.0) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
              COUNT(*)::int AS receipts
         FROM purchase_orders po
        WHERE po.tenant_id = @t
          AND po.status IN ('received','partially_received')
          AND COALESCE(po.received_at, po.created_at) >= @start
        GROUP BY 1
        ORDER BY 1 ASC`,
      { t: tenantId, start: Date.now() - 14 * DAY_MS },
    );

    return {
      generated_at: Date.now(),
      todays_receipts: todayReceipts?.n ?? 0,
      todays_units_received: todayReceipts?.units ?? 0,
      pending_receipts: pending?.n ?? 0,
      late_pos: latePos?.n ?? 0,
      active_sessions: activeSessions?.n ?? 0,
      quality_holds: qualityHolds?.n ?? 0,
      quality_hold_units: qualityHolds?.units ?? 0,
      invoices_pending: invoicesPending?.n ?? 0,
      bills_open: varianceBills?.n ?? 0,
      near_expiry_lots: nearExpiry?.n ?? 0,
      expired_lots: expiredLots?.n ?? 0,
      receiving_errors_today: scanErrors?.n ?? 0,
      avg_receiving_time_ms: avgReceiveMs?.avg_ms != null ? Math.round(avgReceiveMs.avg_ms) : null,
      receiving_accuracy_pct: receivingAccuracyPct,
      receiving_trend: trend,
      // Future AI procurement hooks (no models yet — clean extension points)
      ai_suggestions: {
        reorder: null,
        fraud_signals: null,
        price_anomalies: null,
        putaway_locations: null,
        status: "interface_ready" as const,
      },
    };
  }
}
