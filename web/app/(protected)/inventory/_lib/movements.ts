/**
 * Stock-movement normalisation and aggregation for /inventory.
 *
 * Lives beside the page rather than inside it because Next.js only permits a
 * known set of named exports from a `page.tsx`, and these need to be unit
 * tested — the rule they encode is not visible to a typecheck or a visual pass.
 */

export type TabKey = "orders" | "transfers" | "returns";

/**
 * `total_qty` and `total_cost_cents` are nullable ON PURPOSE.
 *
 * `null` means "this movement type does not carry that figure", which is a
 * different fact from `0`. Purchase orders have no quantity column
 * (`listOrders` is `SELECT * FROM purchase_orders`) and transfers carry no
 * cost. Modelling both as `0` made the page's summary assert "total qty 0" on
 * the Orders tab and "total cost $0.00" on Transfers — reporting an unknown as
 * an emphatic zero, on the screen a retailer uses to answer "what is in stock
 * and what did it cost".
 */
export interface StockMovement {
  id: string;
  number: string;
  due_date?: number | null;
  from_location: string;
  to_location: string;
  status: string;
  created_at: number;
  total_qty: number | null;
  total_cost_cents: number | null;
  note?: string | null;
}

export interface RawOrder {
  id: string; po_number: number; supplier_id: string; status: string;
  total_cost_cents: number; created_at: number; received_at: number | null;
}
export interface RawTransfer {
  id: string; transfer_number: string; from_location: string; to_location: string;
  status: string; qty: number; created_at: number; due_date: number | null; note?: string | null;
}
export interface RawReturn {
  id: string; number: string; from_location: string; to_location: string;
  status: string; total_qty: number; total_cost_cents: number; created_at: number;
  due_date?: number | null; note?: string | null;
}

/**
 * Raw API shape → StockMovement. Pure on purpose: it used to close over the
 * fetched vendor map, which made the page's `load` change identity the moment
 * vendor names arrived and refetched the whole list a second time. Supplier ids
 * are resolved to names at render instead — see `resolveParty`.
 */
export function normalize(raw: unknown[], tab: TabKey): StockMovement[] {
  if (tab === "orders") {
    return (raw as RawOrder[]).map((o) => ({
      id: o.id,
      number: `PO-${o.po_number}`,
      due_date: o.received_at,
      from_location: o.supplier_id, // an id; resolved to a name at render
      to_location: "Main Store",
      status: o.status,
      created_at: o.created_at,
      total_qty: null, // purchase_orders has no quantity column
      total_cost_cents: o.total_cost_cents,
    }));
  }
  if (tab === "transfers") {
    return (raw as RawTransfer[]).map((t) => ({
      id: t.id,
      number: t.transfer_number,
      due_date: t.due_date,
      from_location: t.from_location,
      to_location: t.to_location,
      status: t.status,
      created_at: t.created_at,
      total_qty: t.qty,
      total_cost_cents: null, // transfers move stock, not money
      note: t.note,
    }));
  }
  return (raw as RawReturn[]).map((r) => ({
    id: r.id,
    number: r.number,
    due_date: r.due_date ?? null,
    from_location: r.from_location,
    to_location: r.to_location,
    status: r.status,
    created_at: r.created_at,
    total_qty: r.total_qty,
    total_cost_cents: r.total_cost_cents,
    note: r.note,
  }));
}

/**
 * Supplier ids resolve to names; outlet names pass through untouched (they are
 * already names, so the lookup simply misses).
 */
export function resolveParty(value: string, names: Record<string, string>): string {
  return names[value] ?? value;
}

/**
 * Aggregate the visible rows, returning `null` — not `0` — for a figure this
 * movement type does not carry. See the note on `StockMovement`.
 */
export function summarizeMovements(rows: StockMovement[]): {
  count: number;
  qty: number | null;
  cost: number | null;
} {
  const qtyRows = rows.filter((r) => r.total_qty !== null);
  const costRows = rows.filter((r) => r.total_cost_cents !== null);
  return {
    count: rows.length,
    qty: qtyRows.length > 0 ? qtyRows.reduce((s, r) => s + (r.total_qty ?? 0), 0) : null,
    cost: costRows.length > 0 ? costRows.reduce((s, r) => s + (r.total_cost_cents ?? 0), 0) : null,
  };
}
