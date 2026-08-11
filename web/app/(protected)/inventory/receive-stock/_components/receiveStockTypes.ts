export interface POLine {
  id: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  product_barcode?: string;
  quantity: number;
  unit_cost_cents: number;
  received_qty: number;
  remaining_qty: number;
  expiry_date: number | null;
  lot_code: string | null;
  cases_ordered?: number;
  units_per_case?: number;
}

export interface PendingPO {
  id: string;
  po_number?: number;
  supplier_id: string;
  supplier_name?: string;
  status: string;
  receive_status?: string;
  total_cost_cents: number;
  created_at: number;
  lines?: POLine[];
}

export interface ReceiveEntry {
  lineId: string;
  cases: string;
  unitsPerCase: string;
  totalQty: number;
  expiryDate: string;
  lotCode?: string;
  locationId: string;   // stock location this line is received into
  highlighted?: boolean;
  /**
   * How many physical units the operator has scanned onto this line.
   * `undefined` means the line is still showing its pre-filled PO quantity and
   * has never been scanned — the distinction matters because the first scan
   * takes the line over (see `applyScanToEntries`).
   */
  scannedUnits?: number;
}

/** A selectable stock location for the receiving desk. */
export interface LocationOption {
  id: string;
  code: string;
  name: string;
}

export interface PODocument {
  id: string;
  name: string;
  type: string;
  size_bytes: number;
  uploaded_at: number;
}

export type SortMode = "insertion" | "alpha";

// ── Helpers ───────────────────────────────────────────────────────────────────

export function computeTotal(cases: string, upc: string): number {
  const c = parseInt(cases, 10);
  const u = parseInt(upc, 10);
  if (isNaN(c) || isNaN(u) || c <= 0 || u <= 0) return 0;
  return c * u;
}

/** One received line as sent to `POST /purchasing/orders/:id/receive`. */
export interface ReceiveLinePayload {
  lineId: string;
  qty: number;
  expiryDate?: number; // epoch ms
  lotCode?: string;
  locationId?: string;
}

/**
 * Build the receive payload from the desk entries: only lines with a positive
 * qty, carrying the receive-time expiry (date → epoch ms) and lot code when the
 * operator entered them. Keeping this pure makes the seam that used to silently
 * drop expiry/lot directly testable.
 */
export function buildReceiveLines(entries: ReceiveEntry[]): ReceiveLinePayload[] {
  return entries
    .filter((e) => e.totalQty > 0)
    .map((e) => {
      const line: ReceiveLinePayload = { lineId: e.lineId, qty: e.totalQty };
      const expiryMs = e.expiryDate ? new Date(e.expiryDate).getTime() : NaN;
      if (Number.isFinite(expiryMs)) line.expiryDate = expiryMs;
      if (e.lotCode?.trim()) line.lotCode = e.lotCode.trim();
      if (e.locationId) line.locationId = e.locationId;
      return line;
    });
}

export function receiveStatusBadge(s?: string): "green" | "yellow" | "gray" {
  if (s === "received") return "green";
  if (s === "partial" || s === "partially_received") return "yellow";
  return "gray";
}

export function docTypeLabel(t: string): string {
  return ({ invoice: "Invoice", delivery_note: "Delivery Note", excel: "Excel", other: "Other" } as Record<string, string>)[t] ?? t;
}

export function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Scanning ──────────────────────────────────────────────────────────────────

/**
 * The slice of `GET /api/v1/catalog/barcode/:code/pos` that receiving needs.
 *
 * That endpoint — not a local barcode table — is the authority on which product
 * a code belongs to and what unit it represents. The desk used to match codes
 * itself with `l.product_barcode === code || l.product_sku === code`, which
 * could only ever see the ONE barcode denormalised onto the PO line. Every
 * alternate code in `product_barcodes` (case UPCs, vendor UPCs, secondary
 * each-codes) read as "not on this PO", and a case UPC that did match was
 * counted as a single unit.
 */
export interface ResolvedScan {
  /** Product id — the field lines are matched on. Never match on the barcode. */
  id: string;
  sku: string;
  name: string;
  packaging?: { unit: string; displayName: string; packSize: number };
}

export type ScanOutcome =
  | { kind: "applied"; lineId: string; productName: string; addedQty: number; unitLabel: string; capped: boolean }
  | { kind: "line_complete"; productName: string; remaining: number }
  | { kind: "not_on_po"; productName: string; sku: string };

/**
 * Apply one resolved scan to the desk's entries.
 *
 * Pure, so the two rules that are easy to get wrong stay testable without a
 * network or a DOM:
 *
 *  1. A case scan adds `packSize` base units, not one. Quantities on a PO line
 *     are always base (each) units — the same invariant the backend's session
 *     scan enforces.
 *  2. The FIRST scan on a line takes the line over. Lines arrive pre-filled
 *     with the outstanding PO quantity so a keyboard operator can accept the
 *     whole delivery in one tap; once someone starts scanning, the count must
 *     come from what was physically scanned, or the first scan would ADD to a
 *     pre-filled figure nobody counted and over-receive the line.
 */
export function applyScanToEntries(
  resolved: ResolvedScan,
  poLines: POLine[],
  entries: ReceiveEntry[],
): { entries: ReceiveEntry[]; outcome: ScanOutcome } {
  const line = poLines.find((l) => l.product_id === resolved.id);
  const entry = line ? entries.find((e) => e.lineId === line.id) : undefined;

  if (!line || !entry) {
    return { entries, outcome: { kind: "not_on_po", productName: resolved.name, sku: resolved.sku } };
  }

  const packSize = Math.max(1, resolved.packaging?.packSize ?? 1);
  const unitLabel = resolved.packaging && packSize > 1 ? resolved.packaging.displayName : "each";
  const alreadyScanned = entry.scannedUnits ?? 0;

  if (alreadyScanned * packSize >= line.remaining_qty && alreadyScanned > 0) {
    return {
      entries,
      outcome: { kind: "line_complete", productName: line.product_name, remaining: line.remaining_qty },
    };
  }

  const scannedUnits = alreadyScanned + 1;
  const uncapped = scannedUnits * packSize;
  const totalQty = Math.min(uncapped, line.remaining_qty);

  return {
    entries: entries.map((e) =>
      e.lineId !== line.id
        ? { ...e, highlighted: false }
        : {
            ...e,
            scannedUnits,
            // The barcode is authoritative on pack size; whatever the PO line
            // guessed is replaced the moment a real unit is scanned.
            unitsPerCase: String(packSize),
            cases: String(scannedUnits),
            totalQty,
            highlighted: true,
          },
    ),
    outcome: {
      kind: "applied",
      lineId: line.id,
      productName: line.product_name,
      addedQty: totalQty - Math.min(alreadyScanned * packSize, line.remaining_qty),
      unitLabel,
      capped: uncapped > line.remaining_qty,
    },
  };
}
