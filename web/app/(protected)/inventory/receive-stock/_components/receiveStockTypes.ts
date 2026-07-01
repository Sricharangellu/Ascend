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
  lotCode: string;
  highlighted?: boolean;
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

export function receiveStatusBadge(s?: string): "green" | "yellow" | "gray" {
  if (s === "received") return "green";
  if (s === "partial") return "yellow";
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
