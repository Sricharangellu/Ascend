/**
 * /inventory — normalisation and summary aggregation.
 *
 * These guard one rule: an unknown figure is NOT zero.
 *
 * Purchase orders carry no quantity (`listOrders` is `SELECT * FROM
 * purchase_orders`, which has no qty column) and transfers carry no cost. Both
 * were previously normalised to `0`, so the page's summary line asserted
 * "total qty 0" on the Orders tab and "total cost $0.00" on Transfers —
 * reporting missing data as an emphatic zero on the screen a retailer uses to
 * answer "what is in stock and what did it cost".
 *
 * Nothing about that failure is visible to a typecheck or a visual pass: the
 * numbers rendered, they were just wrong. Only an assertion catches it.
 */

import { describe, it, expect } from "vitest";
import { normalize, summarizeMovements, type StockMovement } from "@/app/(protected)/inventory/_lib/movements";

const NOW = 1_760_000_000_000;

const RAW_ORDERS = [
  {
    id: "po_1",
    po_number: 1,
    supplier_id: "sup_acme",
    status: "ordered",
    total_cost_cents: 12_500,
    created_at: NOW,
    received_at: null,
  },
  {
    id: "po_2",
    po_number: 2,
    supplier_id: "sup_tea",
    status: "received",
    total_cost_cents: 7_500,
    created_at: NOW - 1000,
    received_at: NOW,
  },
];

const RAW_TRANSFERS = [
  {
    id: "trf_1",
    transfer_number: "TRF-1",
    from_location: "Warehouse",
    to_location: "Main Store",
    status: "in_transit",
    qty: 40,
    created_at: NOW,
    due_date: null,
  },
];

describe("inventory normalisation", () => {
  it("marks purchase-order quantity as unknown, not zero", () => {
    const rows = normalize(RAW_ORDERS, "orders");
    expect(rows.every((r) => r.total_qty === null)).toBe(true);
    // Cost IS carried by purchase orders, so it must survive.
    expect(rows.map((r) => r.total_cost_cents)).toEqual([12_500, 7_500]);
  });

  it("marks transfer cost as unknown, not zero", () => {
    const rows = normalize(RAW_TRANSFERS, "transfers");
    expect(rows[0]!.total_cost_cents).toBeNull();
    expect(rows[0]!.total_qty).toBe(40);
  });

  it("leaves the supplier id unresolved so it can be mapped at render", () => {
    // Resolving inside normalize made `load` depend on the fetched vendor map,
    // which refetched the entire list once names arrived.
    expect(normalize(RAW_ORDERS, "orders")[0]!.from_location).toBe("sup_acme");
  });
});

describe("summarizeMovements", () => {
  const mk = (over: Partial<StockMovement>): StockMovement => ({
    id: "x",
    number: "N-1",
    from_location: "A",
    to_location: "B",
    status: "pending",
    created_at: NOW,
    total_qty: null,
    total_cost_cents: null,
    ...over,
  });

  it("reports qty as unknown when no row carries one", () => {
    const s = summarizeMovements(normalize(RAW_ORDERS, "orders"));
    expect(s.qty).toBeNull(); // NOT 0 — the bug this file exists for
    expect(s.cost).toBe(20_000);
    expect(s.count).toBe(2);
  });

  it("reports cost as unknown when no row carries one", () => {
    const s = summarizeMovements(normalize(RAW_TRANSFERS, "transfers"));
    expect(s.cost).toBeNull();
    expect(s.qty).toBe(40);
  });

  it("distinguishes a genuine zero from a missing figure", () => {
    // A row that really does total zero must still aggregate as 0, not null.
    const s = summarizeMovements([mk({ total_qty: 0, total_cost_cents: 0 })]);
    expect(s.qty).toBe(0);
    expect(s.cost).toBe(0);
  });

  it("sums only the rows that carry a figure, ignoring unknown ones", () => {
    const s = summarizeMovements([
      mk({ total_qty: 10, total_cost_cents: 100 }),
      mk({ total_qty: null, total_cost_cents: 250 }),
      mk({ total_qty: 5, total_cost_cents: null }),
    ]);
    expect(s.qty).toBe(15);
    expect(s.cost).toBe(350);
    expect(s.count).toBe(3);
  });

  it("returns null for both figures on an empty list", () => {
    const s = summarizeMovements([]);
    expect(s).toEqual({ count: 0, qty: null, cost: null });
  });
});
