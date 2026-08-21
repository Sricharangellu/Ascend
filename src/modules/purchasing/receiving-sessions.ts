import { v7 as uuidv7 } from "uuid";
import type { DB } from "../../shared/db.js";
import { HttpError } from "../../shared/http.js";
import { nextDocNumber } from "../../shared/docnumber.js";
import type { PurchasingService, ReceiveLineInput } from "./service.js";

/**
 * Stateful receiving sessions — enterprise dock → scan → validate → commit flow.
 *
 * Design rules (ADR-style, see WORK/audits for the rewrite plan):
 * - Sessions are additive. Legacy `POST /orders/:id/receive` remains the commit
 *   boundary and inventory/accounting event source.
 * - Closing a session maps accepted lines into `PurchasingService.receive()`.
 * - Held / rejected qty stay on the session until disposition; they do not
 *   inflate on-hand stock.
 * - Every scan is append-only in `receiving_scan_events` for audit.
 */

export type SessionStatus =
  | "open"
  | "docked"
  | "receiving"
  | "quality_hold"
  | "completed"
  | "cancelled";

export type SessionMode = "standard" | "blind" | "asn";

export type SessionLineStatus =
  | "pending"
  | "scanning"
  | "accepted"
  | "held"
  | "rejected"
  | "posted";

export interface ReceivingSession {
  id: string;
  tenant_id: string;
  po_id: string;
  session_number: string;
  status: SessionStatus;
  mode: SessionMode;
  receiver_id: string | null;
  receiver_name: string | null;
  dock_code: string | null;
  notes: string | null;
  started_at: number;
  completed_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface ReceivingSessionLine {
  id: string;
  tenant_id: string;
  session_id: string;
  po_line_id: string;
  product_id: string;
  expected_qty: number;
  scanned_qty: number;
  accepted_qty: number;
  held_qty: number;
  rejected_qty: number;
  unit_cost_cents: number | null;
  cost_override_reason: string | null;
  lot_code: string | null;
  expiry_date: number | null;
  manufacture_date: number | null;
  location_id: string | null;
  barcode_scanned: string | null;
  status: SessionLineStatus;
  created_at: number;
  updated_at: number;
  // Joined presentation fields (list/detail)
  product_name?: string | null;
  sku?: string | null;
  barcode?: string | null;
  po_unit_cost_cents?: number | null;
}

export interface ReceivingSessionWithLines extends ReceivingSession {
  lines: ReceivingSessionLine[];
  po_number?: number | null;
  supplier_id?: string | null;
  supplier_name?: string | null;
}

export interface ScanResult {
  session: ReceivingSessionWithLines;
  matched_line_id: string | null;
  result:
    | "matched"
    | "unknown"
    | "over_qty"
    | "expired"
    | "near_expiry"
    | "cost_variance"
    | "already_complete";
  detail: string;
  intelligence?: ReceiveLineIntelligence | null;
  /**
   * Set only when the scanned code was a multi-unit pack (case/box). The
   * operator scanned `scanned_units` of `kind`; every quantity elsewhere in
   * this result — including `session.lines[].accepted_qty` — is in base (each)
   * units, so a client that shows "1 case" must read it from here rather than
   * inferring it from the accepted quantity.
   */
  unit?: ScanUnitConversion | null;
}

export interface ScanUnitConversion {
  kind: string;
  pack_size: number;
  scanned_units: number;
  base_qty: number;
}

interface ResolvedBarcode {
  id: string;
  sku: string | null;
  barcode: string | null;
  /** `product_barcodes.kind` — "each" for a plain product/SKU/vendor-UPC hit. */
  unitKind: string;
  /** Base units per scanned unit. Always ≥ 1. */
  packSize: number;
}

export interface ReceiveLineIntelligence {
  product_id: string;
  last_purchase_cost_cents: number | null;
  prev_vendor_cost_cents: number | null;
  avg_purchase_cost_cents: number | null;
  lowest_historical_cost_cents: number | null;
  highest_historical_cost_cents: number | null;
  cost_trend: "up" | "down" | "flat" | "unknown";
  variance_vs_po_pct: number | null;
  variance_band: "green" | "yellow" | "red" | "neutral";
  preferred_supplier_id: string | null;
  preferred_supplier_name: string | null;
  lead_time_days: number | null;
  moq: number | null;
  fill_rate_pct: number | null;
  stock_on_hand: number;
  previous_lot_code: string | null;
  previous_lot_expiry: number | null;
  previous_lot_qty: number | null;
  rotation_warning: string | null;
}

const COST_YELLOW_PCT = 5;
const COST_RED_PCT = 15;
const NEAR_EXPIRY_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export class ReceivingSessionService {
  constructor(
    private readonly db: DB,
    private readonly purchasing: PurchasingService,
  ) {}

  /** Begin a receiving session for an approved, open PO. One open session per PO. */
  async begin(
    poId: string,
    tenantId: string,
    actor: { id: string | null; role: string; name?: string | null },
    opts: { mode?: SessionMode; dockCode?: string | null; notes?: string | null } = {},
  ): Promise<ReceivingSessionWithLines> {
    const po = await this.purchasing.getOrder(poId, tenantId);
    if (po.status === "received") {
      throw new HttpError(409, "already_received", "purchase order already fully received");
    }
    if (po.status === "cancelled") {
      throw new HttpError(409, "cancelled", "purchase order is cancelled");
    }

    const existing = await this.db.one<ReceivingSession>(
      `SELECT * FROM receiving_sessions
        WHERE tenant_id = @t AND po_id = @po AND status IN ('open','docked','receiving','quality_hold')
        LIMIT 1`,
      { t: tenantId, po: poId },
    );
    if (existing) return this.get(existing.id, tenantId);

    const now = Date.now();
    const id = `rcs_${uuidv7()}`;
    const sessionNumber = await nextDocNumber(this.db, tenantId, "receiving_sessions", "RCV");

    await this.db.withTenant(tenantId).tx(async (tdb) => {
      await tdb.query(
        `INSERT INTO receiving_sessions (
           id, tenant_id, po_id, session_number, status, mode,
           receiver_id, receiver_name, dock_code, notes,
           started_at, completed_at, created_at, updated_at
         ) VALUES (
           @id, @t, @po, @num, 'open', @mode,
           @rid, @rname, @dock, @notes,
           @now, NULL, @now, @now
         )`,
        {
          id,
          t: tenantId,
          po: poId,
          num: sessionNumber,
          mode: opts.mode ?? "standard",
          rid: actor.id,
          rname: actor.name ?? actor.role,
          dock: opts.dockCode ?? null,
          notes: opts.notes ?? null,
          now,
        },
      );

      for (const line of po.lines) {
        const remaining = line.quantity - (line.received_qty ?? 0);
        if (remaining <= 0) continue;
        await tdb.query(
          `INSERT INTO receiving_session_lines (
             id, tenant_id, session_id, po_line_id, product_id,
             expected_qty, scanned_qty, accepted_qty, held_qty, rejected_qty,
             unit_cost_cents, cost_override_reason, lot_code, expiry_date,
             manufacture_date, location_id, barcode_scanned, status,
             created_at, updated_at
           ) VALUES (
             @id, @t, @sid, @plid, @pid,
             @expected, 0, 0, 0, 0,
             @cost, NULL, NULL, NULL,
             NULL, NULL, NULL, 'pending',
             @now, @now
           )`,
          {
            id: `rcl_${uuidv7()}`,
            t: tenantId,
            sid: id,
            plid: line.id,
            pid: line.product_id,
            expected: remaining,
            cost: line.unit_cost_cents,
            now,
          },
        );
      }
    });

    return this.get(id, tenantId);
  }

  async get(sessionId: string, tenantId: string): Promise<ReceivingSessionWithLines> {
    const session = await this.db.one<ReceivingSession & {
      po_number: number | null;
      supplier_id: string | null;
      supplier_name: string | null;
    }>(
      `SELECT rs.*, po.po_number, po.supplier_id, s.name AS supplier_name
         FROM receiving_sessions rs
         JOIN purchase_orders po ON po.tenant_id = rs.tenant_id AND po.id = rs.po_id
         LEFT JOIN suppliers s ON s.tenant_id = po.tenant_id AND s.id = po.supplier_id
        WHERE rs.id = @id AND rs.tenant_id = @t`,
      { id: sessionId, t: tenantId },
    );
    if (!session) throw new HttpError(404, "not_found", `receiving session '${sessionId}' not found`);

    const lines = await this.db.query<ReceivingSessionLine>(
      `SELECT rsl.*,
              COALESCE(pol.product_name, p.name, '') AS product_name,
              COALESCE(p.sku, '') AS sku,
              COALESCE(p.barcode, '') AS barcode,
              pol.unit_cost_cents AS po_unit_cost_cents
         FROM receiving_session_lines rsl
         JOIN purchase_order_lines pol
           ON pol.tenant_id = rsl.tenant_id AND pol.id = rsl.po_line_id
         LEFT JOIN products p
           ON p.tenant_id = rsl.tenant_id AND p.id = rsl.product_id
        WHERE rsl.session_id = @sid AND rsl.tenant_id = @t
        ORDER BY rsl.created_at ASC`,
      { sid: sessionId, t: tenantId },
    );

    return { ...session, lines };
  }

  async listActive(tenantId: string): Promise<{ items: ReceivingSessionWithLines[] }> {
    const rows = await this.db.query<{ id: string }>(
      `SELECT id FROM receiving_sessions
        WHERE tenant_id = @t AND status IN ('open','docked','receiving','quality_hold')
        ORDER BY started_at DESC
        LIMIT 100`,
      { t: tenantId },
    );
    const items: ReceivingSessionWithLines[] = [];
    for (const row of rows) {
      items.push(await this.get(row.id, tenantId));
    }
    return { items };
  }

  /** Mark dock arrival — session moves open → docked. */
  async markDocked(sessionId: string, tenantId: string, dockCode?: string | null): Promise<ReceivingSessionWithLines> {
    const session = await this.requireOpen(sessionId, tenantId);
    await this.db.query(
      `UPDATE receiving_sessions
          SET status = 'docked',
              dock_code = COALESCE(@dock, dock_code),
              updated_at = @now
        WHERE id = @id AND tenant_id = @t`,
      { dock: dockCode ?? null, now: Date.now(), id: session.id, t: tenantId },
    );
    return this.get(sessionId, tenantId);
  }

  /**
   * Scan a barcode into the session. Resolves product → open session line,
   * increments scanned/accepted qty (unless held), validates expiry/cost, and
   * returns receiving price/vendor intelligence for the matched product.
   */
  async scan(
    sessionId: string,
    tenantId: string,
    input: {
      barcode: string;
      qty?: number;
      lotCode?: string | null;
      expiryDate?: number | null;
      manufactureDate?: number | null;
      unitCostCents?: number | null;
      costOverrideReason?: string | null;
      locationId?: string | null;
      hold?: boolean;
      reject?: boolean;
    },
  ): Promise<ScanResult> {
    const session = await this.requireMutable(sessionId, tenantId);
    const qty = input.qty ?? 1;
    if (qty <= 0) throw new HttpError(400, "bad_request", "qty must be positive");

    const product = await this.resolveBarcode(input.barcode, tenantId);
    if (!product) {
      await this.recordScan(tenantId, sessionId, null, input.barcode, qty, "unknown", "No product matched barcode");
      return {
        session: await this.get(sessionId, tenantId),
        matched_line_id: null,
        result: "unknown",
        detail: `No product matched barcode '${input.barcode}'`,
        intelligence: null,
      };
    }

    // ── Unit conversion ──────────────────────────────────────────────────
    // `qty` is in the unit the operator scanned. Everything below — expected,
    // accepted, held, rejected, and the inventory movement close() posts — is
    // in base (each) units, so convert once here and use `baseQty` throughout.
    // Cost arrives per scanned unit for the same reason and is divided down,
    // matching `convertUnitLine()` on the PO-create/receive path.
    const packSize = product.packSize;
    const baseQty = qty * packSize;
    const unitConversion: ScanUnitConversion | null =
      packSize > 1
        ? { kind: product.unitKind, pack_size: packSize, scanned_units: qty, base_qty: baseQty }
        : null;
    const scannedUnitLabel = unitConversion
      ? `${qty} ${product.unitKind}${qty === 1 ? "" : "s"} (${baseQty} each)`
      : `${qty}`;

    const detail = await this.get(sessionId, tenantId);
    const line = detail.lines.find((l) => l.product_id === product.id && l.status !== "posted");
    if (!line) {
      await this.recordScan(tenantId, sessionId, null, input.barcode, baseQty, "unknown", "Product not on this PO session");
      return {
        session: detail,
        matched_line_id: null,
        result: "unknown",
        detail: `Product '${product.sku ?? product.id}' is not on this receiving session`,
        intelligence: null,
        // Reported even though nothing was received: "a case of X is not on
        // this PO" is a different problem from "an each of X is not on this
        // PO", and only the client can tell the operator which they scanned.
        unit: unitConversion,
      };
    }

    const remaining = line.expected_qty - line.accepted_qty - line.held_qty - line.rejected_qty;
    if (baseQty > remaining) {
      await this.recordScan(tenantId, sessionId, line.id, input.barcode, baseQty, "over_qty", `qty ${baseQty} exceeds remaining ${remaining}`);
      return {
        session: detail,
        matched_line_id: line.id,
        result: "over_qty",
        detail: `Quantity ${scannedUnitLabel} exceeds remaining ${remaining} on this line`,
        intelligence: await this.lineIntelligence(line.product_id, session.po_id, tenantId, line.unit_cost_cents),
        unit: unitConversion,
      };
    }

    if (input.expiryDate != null && input.expiryDate < Date.now()) {
      await this.recordScan(tenantId, sessionId, line.id, input.barcode, baseQty, "expired", "Expiry date is in the past");
      throw new HttpError(400, "expired_inventory", "Cannot receive inventory with an expiry date in the past");
    }
    if (
      input.expiryDate != null &&
      input.manufactureDate != null &&
      input.expiryDate < input.manufactureDate
    ) {
      throw new HttpError(400, "invalid_dates", "Expiry date cannot be before manufacture date");
    }

    // A cost supplied with a case scan is the case price; the line stores an
    // each price. Without this the variance band below compares a case cost to
    // an each cost and demands an override for a correctly-priced delivery.
    const scannedUnitCost =
      input.unitCostCents != null && packSize > 1
        ? Math.round(input.unitCostCents / packSize)
        : input.unitCostCents;
    const unitCost = scannedUnitCost ?? line.unit_cost_cents;
    const poCost = line.po_unit_cost_cents ?? line.unit_cost_cents ?? 0;
    let costBand: "green" | "yellow" | "red" | "neutral" = "neutral";
    if (unitCost != null && poCost > 0) {
      const variancePct = ((unitCost - poCost) / poCost) * 100;
      if (variancePct >= COST_RED_PCT) costBand = "red";
      else if (variancePct >= COST_YELLOW_PCT) costBand = "yellow";
      else costBand = "green";
      if (costBand !== "green" && !input.costOverrideReason) {
        throw new HttpError(
          400,
          "cost_override_required",
          `Unit cost exceeds ${costBand === "red" ? COST_RED_PCT : COST_YELLOW_PCT}% tolerance — provide costOverrideReason`,
        );
      }
    }

    const now = Date.now();
    const hold = Boolean(input.hold);
    const reject = Boolean(input.reject);
    const acceptedInc = hold || reject ? 0 : baseQty;
    const heldInc = hold ? baseQty : 0;
    const rejectedInc = reject ? baseQty : 0;
    const nextStatus: SessionLineStatus = reject
      ? "rejected"
      : hold
        ? "held"
        : "scanning";

    await this.db.query(
      `UPDATE receiving_session_lines SET
          scanned_qty = scanned_qty + @qty,
          accepted_qty = accepted_qty + @accepted,
          held_qty = held_qty + @held,
          rejected_qty = rejected_qty + @rejected,
          unit_cost_cents = COALESCE(@cost, unit_cost_cents),
          cost_override_reason = COALESCE(@reason, cost_override_reason),
          lot_code = COALESCE(@lot, lot_code),
          expiry_date = COALESCE(@expiry, expiry_date),
          manufacture_date = COALESCE(@mfg, manufacture_date),
          location_id = COALESCE(@loc, location_id),
          barcode_scanned = @barcode,
          status = @status,
          updated_at = @now
        WHERE id = @id AND tenant_id = @t`,
      {
        qty: baseQty,
        accepted: acceptedInc,
        held: heldInc,
        rejected: rejectedInc,
        cost: unitCost,
        reason: input.costOverrideReason ?? null,
        lot: input.lotCode ?? null,
        expiry: input.expiryDate ?? null,
        mfg: input.manufactureDate ?? null,
        loc: input.locationId ?? null,
        barcode: input.barcode,
        status: nextStatus,
        now,
        id: line.id,
        t: tenantId,
      },
    );

    await this.db.query(
      `UPDATE receiving_sessions
          SET status = CASE
                WHEN status IN ('open','docked') THEN 'receiving'
                ELSE status
              END,
              updated_at = @now
        WHERE id = @id AND tenant_id = @t`,
      { now, id: sessionId, t: tenantId },
    );

    let scanResult: ScanResult["result"] = "matched";
    let detailMsg = `Scanned ${scannedUnitLabel} onto line`;
    if (hold) {
      scanResult = "matched";
      detailMsg = `Held ${scannedUnitLabel} for quality review`;
      await this.db.query(
        `UPDATE receiving_sessions SET status = 'quality_hold', updated_at = @now WHERE id = @id AND tenant_id = @t`,
        { now, id: sessionId, t: tenantId },
      );
    }
    if (input.expiryDate != null && input.expiryDate - Date.now() < NEAR_EXPIRY_DAYS * DAY_MS) {
      scanResult = "near_expiry";
      detailMsg = `Accepted with near-expiry warning (< ${NEAR_EXPIRY_DAYS} days)`;
    }
    if (costBand === "yellow" || costBand === "red") {
      scanResult = "cost_variance";
      detailMsg = `Accepted with ${costBand} cost variance (reason recorded)`;
    }

    await this.recordScan(tenantId, sessionId, line.id, input.barcode, baseQty, scanResult, detailMsg);

    const intelligence = await this.lineIntelligence(
      line.product_id,
      session.po_id,
      tenantId,
      unitCost,
    );

    return {
      session: await this.get(sessionId, tenantId),
      matched_line_id: line.id,
      result: scanResult,
      detail: detailMsg,
      intelligence,
      unit: unitConversion,
    };
  }

  /** Patch a session line (manual qty / lot / expiry / hold disposition). */
  async updateLine(
    sessionId: string,
    lineId: string,
    tenantId: string,
    patch: {
      acceptedQty?: number;
      heldQty?: number;
      rejectedQty?: number;
      lotCode?: string | null;
      expiryDate?: number | null;
      manufactureDate?: number | null;
      unitCostCents?: number | null;
      costOverrideReason?: string | null;
      locationId?: string | null;
    },
  ): Promise<ReceivingSessionWithLines> {
    await this.requireMutable(sessionId, tenantId);
    const line = await this.db.one<ReceivingSessionLine>(
      `SELECT * FROM receiving_session_lines WHERE id = @id AND session_id = @sid AND tenant_id = @t`,
      { id: lineId, sid: sessionId, t: tenantId },
    );
    if (!line) throw new HttpError(404, "not_found", `session line '${lineId}' not found`);

    const accepted = patch.acceptedQty ?? line.accepted_qty;
    const held = patch.heldQty ?? line.held_qty;
    const rejected = patch.rejectedQty ?? line.rejected_qty;
    if (accepted < 0 || held < 0 || rejected < 0) {
      throw new HttpError(400, "bad_request", "quantities cannot be negative");
    }
    if (accepted + held + rejected > line.expected_qty) {
      throw new HttpError(400, "bad_request", "accepted+held+rejected exceeds expected qty");
    }
    if (patch.expiryDate != null && patch.expiryDate < Date.now()) {
      throw new HttpError(400, "expired_inventory", "Cannot set an expiry date in the past");
    }

    const status: SessionLineStatus =
      rejected > 0 && accepted === 0 && held === 0
        ? "rejected"
        : held > 0
          ? "held"
          : accepted > 0
            ? "scanning"
            : "pending";

    await this.db.query(
      `UPDATE receiving_session_lines SET
          accepted_qty = @accepted,
          held_qty = @held,
          rejected_qty = @rejected,
          scanned_qty = @scanned,
          lot_code = COALESCE(@lot, lot_code),
          expiry_date = COALESCE(@expiry, expiry_date),
          manufacture_date = COALESCE(@mfg, manufacture_date),
          unit_cost_cents = COALESCE(@cost, unit_cost_cents),
          cost_override_reason = COALESCE(@reason, cost_override_reason),
          location_id = COALESCE(@loc, location_id),
          status = @status,
          updated_at = @now
        WHERE id = @id AND tenant_id = @t`,
      {
        accepted,
        held,
        rejected,
        scanned: accepted + held + rejected,
        lot: patch.lotCode ?? null,
        expiry: patch.expiryDate ?? null,
        mfg: patch.manufactureDate ?? null,
        cost: patch.unitCostCents ?? null,
        reason: patch.costOverrideReason ?? null,
        loc: patch.locationId ?? null,
        status,
        now: Date.now(),
        id: lineId,
        t: tenantId,
      },
    );

    if (held > 0) {
      await this.db.query(
        `UPDATE receiving_sessions SET status = 'quality_hold', updated_at = @now WHERE id = @id AND tenant_id = @t`,
        { now: Date.now(), id: sessionId, t: tenantId },
      );
    }

    return this.get(sessionId, tenantId);
  }

  /**
   * Commit accepted quantities into inventory via existing `receive()`.
   * Held/rejected lines remain on the session for disposition and are not posted.
   * Partial close is allowed — session stays open if expected qty remains.
   */
  async close(
    sessionId: string,
    tenantId: string,
    opts: { forceComplete?: boolean } = {},
  ): Promise<ReceivingSessionWithLines> {
    await this.requireMutable(sessionId, tenantId);
    const detail = await this.get(sessionId, tenantId);
    const toPost = detail.lines.filter((l) => l.accepted_qty > 0 && l.status !== "posted");
    if (toPost.length === 0 && !opts.forceComplete) {
      throw new HttpError(400, "nothing_to_post", "No accepted quantities to post — scan or enter qty first");
    }

    if (toPost.length > 0) {
      const receiveLines: ReceiveLineInput[] = toPost.map((l) => ({
        lineId: l.po_line_id,
        qty: l.accepted_qty,
        ...(l.expiry_date != null ? { expiryDate: l.expiry_date } : {}),
        ...(l.lot_code ? { lotCode: l.lot_code } : {}),
        ...(l.unit_cost_cents != null ? { unitCostCents: l.unit_cost_cents } : {}),
        ...(l.location_id ? { locationId: l.location_id } : {}),
      }));
      await this.purchasing.receive(detail.po_id, tenantId, receiveLines);

      // Clear posted accepted qty from the session line. Held/rejected remain for
      // disposition; expected shrinks by what was posted so remaining math stays honest.
      const now = Date.now();
      for (const l of toPost) {
        const nextExpected = Math.max(0, l.expected_qty - l.accepted_qty);
        const nextStatus: SessionLineStatus =
          l.held_qty > 0
            ? "held"
            : l.rejected_qty > 0 && nextExpected <= l.rejected_qty
              ? "rejected"
              : nextExpected > 0
                ? "pending"
                : "posted";
        await this.db.query(
          `UPDATE receiving_session_lines
              SET accepted_qty = 0,
                  expected_qty = @expected,
                  status = @status,
                  updated_at = @now
            WHERE id = @id AND tenant_id = @t`,
          { expected: nextExpected, status: nextStatus, now, id: l.id, t: tenantId },
        );
      }
    }

    const refreshed = await this.get(sessionId, tenantId);
    const openWork = refreshed.lines.some(
      (l) =>
        l.status !== "posted" &&
        l.accepted_qty + l.held_qty + l.rejected_qty < l.expected_qty,
    );
    const hasHold = refreshed.lines.some((l) => l.held_qty > 0 && l.status !== "posted");

    const now = Date.now();
    if (!openWork && !hasHold) {
      await this.db.query(
        `UPDATE receiving_sessions
            SET status = 'completed', completed_at = @now, updated_at = @now
          WHERE id = @id AND tenant_id = @t`,
        { now, id: sessionId, t: tenantId },
      );
    } else if (hasHold) {
      await this.db.query(
        `UPDATE receiving_sessions SET status = 'quality_hold', updated_at = @now WHERE id = @id AND tenant_id = @t`,
        { now, id: sessionId, t: tenantId },
      );
    } else if (opts.forceComplete) {
      await this.db.query(
        `UPDATE receiving_sessions
            SET status = 'completed', completed_at = @now, updated_at = @now
          WHERE id = @id AND tenant_id = @t`,
        { now, id: sessionId, t: tenantId },
      );
    }

    return this.get(sessionId, tenantId);
  }

  async cancel(sessionId: string, tenantId: string): Promise<ReceivingSessionWithLines> {
    const session = await this.requireMutable(sessionId, tenantId);
    const posted = await this.db.one<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM receiving_session_lines
        WHERE session_id = @sid AND tenant_id = @t AND status = 'posted'`,
      { sid: session.id, t: tenantId },
    );
    if ((posted?.n ?? 0) > 0) {
      throw new HttpError(409, "already_posted", "Cannot cancel a session that has already posted inventory");
    }
    await this.db.query(
      `UPDATE receiving_sessions
          SET status = 'cancelled', completed_at = @now, updated_at = @now
        WHERE id = @id AND tenant_id = @t`,
      { now: Date.now(), id: sessionId, t: tenantId },
    );
    return this.get(sessionId, tenantId);
  }

  /** Pipeline-shaped rows for the Inventory > Receiving tab. */
  async pipelineItems(tenantId: string) {
    const sessions = await this.listActive(tenantId);
    const items = [];
    for (const s of sessions.items) {
      for (const line of s.lines) {
        if (line.status === "posted" && line.accepted_qty >= line.expected_qty) continue;
        items.push({
          id: line.id,
          session_id: s.id,
          po_id: s.po_id,
          po_number: String(s.po_number ?? ""),
          supplier_name: s.supplier_name ?? "",
          product_name: line.product_name ?? "",
          sku: line.sku ?? "",
          qty_ordered: line.expected_qty,
          qty_received: line.accepted_qty,
          qty_remaining: Math.max(0, line.expected_qty - line.accepted_qty - line.held_qty - line.rejected_qty),
          qty_held: line.held_qty,
          qty_rejected: line.rejected_qty,
          unit_cost_cents: line.unit_cost_cents ?? line.po_unit_cost_cents ?? 0,
          started_at: s.started_at,
          receiver: s.receiver_name ?? "",
          outlet: s.dock_code ?? "",
          batch_id: s.session_number,
          status: line.status,
          session_status: s.status,
        });
      }
    }
    return { items };
  }

  async lineIntelligence(
    productId: string,
    poId: string,
    tenantId: string,
    proposedCost: number | null | undefined,
  ): Promise<ReceiveLineIntelligence> {
    const po = await this.db.one<{ supplier_id: string }>(
      `SELECT supplier_id FROM purchase_orders WHERE id = @id AND tenant_id = @t`,
      { id: poId, t: tenantId },
    );

    const history = await this.db.query<{
      unit_cost_cents: number;
      received_at: number | null;
      supplier_id: string;
    }>(
      `SELECT pol.unit_cost_cents, po.received_at, po.supplier_id
         FROM purchase_order_lines pol
         JOIN purchase_orders po ON po.tenant_id = pol.tenant_id AND po.id = pol.po_id
        WHERE pol.tenant_id = @t AND pol.product_id = @pid
          AND po.status IN ('received','partially_received')
          AND (pol.received_qty IS NULL OR pol.received_qty > 0)
        ORDER BY COALESCE(po.received_at, po.created_at) DESC
        LIMIT 50`,
      { t: tenantId, pid: productId },
    );

    const costs = history.map((h) => Number(h.unit_cost_cents)).filter((c) => c > 0);
    const last = costs[0] ?? null;
    const prevVendor = history.find((h) => h.supplier_id === po?.supplier_id);
    const avg = costs.length ? Math.round(costs.reduce((a, b) => a + b, 0) / costs.length) : null;
    const lowest = costs.length ? Math.min(...costs) : null;
    const highest = costs.length ? Math.max(...costs) : null;

    let costTrend: ReceiveLineIntelligence["cost_trend"] = "unknown";
    if (costs.length >= 2) {
      if (costs[0]! > costs[1]!) costTrend = "up";
      else if (costs[0]! < costs[1]!) costTrend = "down";
      else costTrend = "flat";
    }

    const poLine = await this.db.one<{ unit_cost_cents: number }>(
      `SELECT unit_cost_cents FROM purchase_order_lines
        WHERE tenant_id = @t AND po_id = @po AND product_id = @pid LIMIT 1`,
      { t: tenantId, po: poId, pid: productId },
    );
    const base = proposedCost ?? poLine?.unit_cost_cents ?? last ?? 0;
    const compare = avg ?? poLine?.unit_cost_cents ?? base;
    let variancePct: number | null = null;
    let band: ReceiveLineIntelligence["variance_band"] = "neutral";
    if (compare > 0 && base > 0) {
      variancePct = Number((((base - compare) / compare) * 100).toFixed(2));
      if (variancePct >= COST_RED_PCT) band = "red";
      else if (variancePct >= COST_YELLOW_PCT) band = "yellow";
      else if (variancePct <= -COST_YELLOW_PCT) band = "green";
      else band = "green";
    }

    const preferred = await this.db.one<{
      supplier_id: string;
      name: string;
      lead_time_days: number | null;
      moq: number | null;
    }>(
      `SELECT ps.supplier_id, s.name, ps.lead_time_days, ps.moq
         FROM product_suppliers ps
         JOIN suppliers s ON s.tenant_id = ps.tenant_id AND s.id = ps.supplier_id
        WHERE ps.tenant_id = @t AND ps.product_id = @pid
        ORDER BY ps.is_preferred DESC NULLS LAST, ps.cost_cents ASC NULLS LAST
        LIMIT 1`,
      { t: tenantId, pid: productId },
    );

    const fill = await this.db.one<{ ordered: number; received: number }>(
      `SELECT COALESCE(SUM(pol.quantity),0)::int AS ordered,
              COALESCE(SUM(pol.received_qty),0)::int AS received
         FROM purchase_order_lines pol
         JOIN purchase_orders po ON po.tenant_id = pol.tenant_id AND po.id = pol.po_id
        WHERE pol.tenant_id = @t AND pol.product_id = @pid
          AND po.supplier_id = @sid`,
      { t: tenantId, pid: productId, sid: po?.supplier_id ?? preferred?.supplier_id ?? "" },
    );
    const fillRate =
      fill && fill.ordered > 0
        ? Number(((fill.received / fill.ordered) * 100).toFixed(1))
        : null;

    const stock = await this.db.one<{ stock_qty: number }>(
      `SELECT COALESCE(stock_qty, 0)::int AS stock_qty FROM inventory
        WHERE tenant_id = @t AND product_id = @pid`,
      { t: tenantId, pid: productId },
    );

    const prevLot = await this.db.one<{
      lot_code: string | null;
      expiry_date: number | null;
      qty_on_hand: number;
    }>(
      `SELECT lot_code, expiry_date, qty_on_hand FROM inventory_lots
        WHERE tenant_id = @t AND product_id = @pid AND qty_on_hand > 0
        ORDER BY expiry_date ASC NULLS LAST
        LIMIT 1`,
      { t: tenantId, pid: productId },
    );

    let rotationWarning: string | null = null;
    if (prevLot?.expiry_date != null && prevLot.qty_on_hand > 0) {
      rotationWarning = `Existing lot ${prevLot.lot_code ?? "(unlabeled)"} expires ${new Date(prevLot.expiry_date).toISOString().slice(0, 10)} with ${prevLot.qty_on_hand} on hand — prefer FEFO rotation`;
    }

    return {
      product_id: productId,
      last_purchase_cost_cents: last,
      prev_vendor_cost_cents: prevVendor ? Number(prevVendor.unit_cost_cents) : null,
      avg_purchase_cost_cents: avg,
      lowest_historical_cost_cents: lowest,
      highest_historical_cost_cents: highest,
      cost_trend: costTrend,
      variance_vs_po_pct: variancePct,
      variance_band: band,
      preferred_supplier_id: preferred?.supplier_id ?? null,
      preferred_supplier_name: preferred?.name ?? null,
      lead_time_days: preferred?.lead_time_days ?? null,
      moq: preferred?.moq ?? null,
      fill_rate_pct: fillRate,
      stock_on_hand: stock?.stock_qty ?? 0,
      previous_lot_code: prevLot?.lot_code ?? null,
      previous_lot_expiry: prevLot?.expiry_date ?? null,
      previous_lot_qty: prevLot?.qty_on_hand ?? null,
      rotation_warning: rotationWarning,
    };
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private async requireOpen(sessionId: string, tenantId: string): Promise<ReceivingSession> {
    const session = await this.db.one<ReceivingSession>(
      `SELECT * FROM receiving_sessions WHERE id = @id AND tenant_id = @t`,
      { id: sessionId, t: tenantId },
    );
    if (!session) throw new HttpError(404, "not_found", `receiving session '${sessionId}' not found`);
    if (session.status === "completed" || session.status === "cancelled") {
      throw new HttpError(409, "session_closed", `session is ${session.status}`);
    }
    return session;
  }

  private async requireMutable(sessionId: string, tenantId: string): Promise<ReceivingSession> {
    return this.requireOpen(sessionId, tenantId);
  }

  /**
   * Resolve a scanned code to a product AND the unit that code represents.
   *
   * `product_barcodes` is where units live (ADR-006) — a case UPC is a row with
   * `kind='case'` and `pack_size=12`. This used to SELECT only the product
   * columns and drop the pack size, so a case scan was received as one each.
   * Callers must treat `pack_size` as authoritative: it is the multiplier
   * between the unit the operator scanned and the base (each) units every
   * quantity in this module is denominated in.
   */
  private async resolveBarcode(
    code: string,
    tenantId: string,
  ): Promise<ResolvedBarcode | null> {
    const fromTable = await this.db.one<{
      id: string;
      sku: string | null;
      barcode: string | null;
      kind: string | null;
      pack_size: number | null;
    }>(
      `SELECT p.id, p.sku, p.barcode, pb.kind, pb.pack_size
         FROM product_barcodes pb
         JOIN products p ON p.tenant_id = pb.tenant_id AND p.id = pb.product_id
        WHERE pb.tenant_id = @t AND pb.barcode = @code
        LIMIT 1`,
      { t: tenantId, code },
    );
    if (fromTable) {
      // pack_size is NOT NULL DEFAULT 1, but COALESCE anyway: a 0/NULL here
      // would silently zero out every received quantity.
      const packSize = Number(fromTable.pack_size ?? 1);
      return {
        id: fromTable.id,
        sku: fromTable.sku,
        barcode: fromTable.barcode,
        unitKind: fromTable.kind ?? "each",
        packSize: Number.isFinite(packSize) && packSize > 0 ? packSize : 1,
      };
    }
    const product = await this.db.one<{ id: string; sku: string | null; barcode: string | null }>(
      `SELECT id, sku, barcode FROM products
        WHERE tenant_id = @t AND (barcode = @code OR sku = @code OR vendor_upc = @code)
          AND COALESCE(status, 'active') <> 'archived'
        LIMIT 1`,
      { t: tenantId, code },
    );
    if (!product) return null;
    return { ...product, unitKind: "each", packSize: 1 };
  }

  private async recordScan(
    tenantId: string,
    sessionId: string,
    sessionLineId: string | null,
    barcode: string,
    qty: number,
    result: string,
    detail: string,
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO receiving_scan_events (
         id, tenant_id, session_id, session_line_id, barcode, qty, result, detail, created_at
       ) VALUES (@id, @t, @sid, @lid, @barcode, @qty, @result, @detail, @now)`,
      {
        id: `rse_${uuidv7()}`,
        t: tenantId,
        sid: sessionId,
        lid: sessionLineId,
        barcode,
        qty,
        result,
        detail,
        now: Date.now(),
      },
    );
  }
}
