/**
 * Unit tests for cart reducer logic (pure state machine).
 * No DOM needed.
 *
 * The reducer below is inlined (avoids "use client" directive issues in
 * Node) — keep it in sync with lib/useCart.ts's actual cartReducer whenever
 * that changes, or this suite silently tests dead logic instead of the real
 * one (caught happening once already: REMOVE/SET_QTY moved from keying by
 * productId to keying by a per-line id, and this file didn't know).
 */

import { describe, it, expect } from "vitest";
import type { TerminalProduct as Product } from "@/api-client/types";

// ── Inline the reducer logic (avoids "use client" directive issues in Node) ──

type CartLine = { id: string; product: Product; quantity: number };
type CartState = { lines: CartLine[]; order: null; syncing: boolean };
type CartAction =
  | { type: "ADD"; product: Product }
  | { type: "REMOVE"; lineId: string }
  | { type: "SET_QTY"; lineId: string; qty: number }
  | { type: "CLEAR" };

function lineKey(product: { id: string; unitKind?: string }): string {
  return `${product.id}|${product.unitKind ?? ""}`;
}

let __seq = 0;
function nextLineId(): string {
  return `line_${__seq++}`;
}

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "ADD": {
      const idx = state.lines.findIndex((l) => lineKey(l.product) === lineKey(action.product));
      if (idx >= 0) {
        const lines = [...state.lines];
        lines[idx] = { ...lines[idx]!, quantity: lines[idx]!.quantity + 1 };
        return { ...state, lines };
      }
      return {
        ...state,
        lines: [...state.lines, { id: nextLineId(), product: action.product, quantity: 1 }],
      };
    }
    case "REMOVE":
      return { ...state, lines: state.lines.filter((l) => l.id !== action.lineId) };
    case "SET_QTY": {
      if (action.qty <= 0) {
        return { ...state, lines: state.lines.filter((l) => l.id !== action.lineId) };
      }
      return {
        ...state,
        lines: state.lines.map((l) =>
          l.id === action.lineId ? { ...l, quantity: action.qty } : l
        ),
      };
    }
    case "CLEAR":
      return { lines: [], order: null, syncing: false };
    default:
      return state;
  }
}

const empty: CartState = { lines: [], order: null, syncing: false };

const P1: Product = {
  id: "prod_001",
  sku: "LATTE",
  name: "Latte",
  priceCents: 499,
  category: "Coffee",
  taxClass: "standard",
  status: "active",
  createdAt: 0,
  updatedAt: 0,
};

const P2: Product = {
  id: "prod_002",
  sku: "ESPRESSO",
  name: "Espresso",
  priceCents: 299,
  category: "Coffee",
  taxClass: "standard",
  status: "active",
  createdAt: 0,
  updatedAt: 0,
};

/** Same underlying product (prod_003), scanned as a Case vs. as a plain Each —
 *  distinct TerminalProduct objects (different unitKind/priceCents), exactly
 *  what normalizeTerminalProduct produces for two different barcode scans. */
const P3_CASE: Product = {
  id: "prod_003",
  sku: "OAT-MILK",
  name: "Oat Milk",
  priceCents: 5400, // 12 × $4.50
  category: "Grocery",
  taxClass: "standard",
  status: "active",
  createdAt: 0,
  updatedAt: 0,
  unitKind: "case",
  unitDisplayName: "Case",
  packSize: 12,
};

const P3_EACH: Product = {
  id: "prod_003",
  sku: "OAT-MILK",
  name: "Oat Milk",
  priceCents: 450,
  category: "Grocery",
  taxClass: "standard",
  status: "active",
  createdAt: 0,
  updatedAt: 0,
};

describe("cartReducer — ADD", () => {
  it("adds a new product with quantity 1", () => {
    const s = cartReducer(empty, { type: "ADD", product: P1 });
    expect(s.lines).toHaveLength(1);
    expect(s.lines[0]!.quantity).toBe(1);
    expect(s.lines[0]!.product.id).toBe(P1.id);
  });

  it("increments quantity when same product added twice", () => {
    let s = cartReducer(empty, { type: "ADD", product: P1 });
    s = cartReducer(s, { type: "ADD", product: P1 });
    expect(s.lines).toHaveLength(1);
    expect(s.lines[0]!.quantity).toBe(2);
  });

  it("keeps separate lines for different products", () => {
    let s = cartReducer(empty, { type: "ADD", product: P1 });
    s = cartReducer(s, { type: "ADD", product: P2 });
    expect(s.lines).toHaveLength(2);
  });
});

describe("cartReducer — mixed-unit lines for the same product (merge-blocker fix)", () => {
  it("scanning the same product as Case then as Each creates two separate lines", () => {
    let s = cartReducer(empty, { type: "ADD", product: P3_CASE });
    s = cartReducer(s, { type: "ADD", product: P3_EACH });
    expect(s.lines).toHaveLength(2);
    expect(s.lines[0]!.quantity).toBe(1);
    expect(s.lines[1]!.quantity).toBe(1);
  });

  it("incrementing the Each line does not affect the Case line's quantity", () => {
    let s = cartReducer(empty, { type: "ADD", product: P3_CASE }); // 1 Case
    s = cartReducer(s, { type: "ADD", product: P3_EACH }); // 1 Each
    s = cartReducer(s, { type: "ADD", product: P3_EACH }); // 2 Each
    s = cartReducer(s, { type: "ADD", product: P3_EACH }); // 3 Each

    const caseLine = s.lines.find((l) => l.product.unitKind === "case")!;
    const eachLine = s.lines.find((l) => l.product.unitKind === undefined)!;
    expect(caseLine.quantity).toBe(1); // untouched
    expect(eachLine.quantity).toBe(3);
  });

  it("SET_QTY on one line's id never touches the other line for the same product", () => {
    let s = cartReducer(empty, { type: "ADD", product: P3_CASE });
    s = cartReducer(s, { type: "ADD", product: P3_EACH });
    const caseLineId = s.lines.find((l) => l.product.unitKind === "case")!.id;

    s = cartReducer(s, { type: "SET_QTY", lineId: caseLineId, qty: 5 }); // 5 Cases
    const caseLine = s.lines.find((l) => l.product.unitKind === "case")!;
    const eachLine = s.lines.find((l) => l.product.unitKind === undefined)!;
    expect(caseLine.quantity).toBe(5);
    expect(eachLine.quantity).toBe(1); // unaffected — this was the actual bug
  });

  it("REMOVE on one line's id leaves the other line for the same product intact", () => {
    let s = cartReducer(empty, { type: "ADD", product: P3_CASE });
    s = cartReducer(s, { type: "ADD", product: P3_EACH });
    const caseLineId = s.lines.find((l) => l.product.unitKind === "case")!.id;

    s = cartReducer(s, { type: "REMOVE", lineId: caseLineId });
    expect(s.lines).toHaveLength(1);
    expect(s.lines[0]!.product.unitKind).toBeUndefined();
    expect(s.lines[0]!.quantity).toBe(1);
  });
});

describe("cartReducer — REMOVE", () => {
  it("removes the matching line", () => {
    let s = cartReducer(empty, { type: "ADD", product: P1 });
    s = cartReducer(s, { type: "ADD", product: P2 });
    const p1LineId = s.lines.find((l) => l.product.id === P1.id)!.id;
    s = cartReducer(s, { type: "REMOVE", lineId: p1LineId });
    expect(s.lines).toHaveLength(1);
    expect(s.lines[0]!.product.id).toBe(P2.id);
  });

  it("is a no-op for an unknown line id", () => {
    const s = cartReducer(empty, { type: "REMOVE", lineId: "unknown" });
    expect(s.lines).toHaveLength(0);
  });
});

describe("cartReducer — SET_QTY", () => {
  it("sets the quantity directly", () => {
    let s = cartReducer(empty, { type: "ADD", product: P1 });
    const lineId = s.lines[0]!.id;
    s = cartReducer(s, { type: "SET_QTY", lineId, qty: 5 });
    expect(s.lines[0]!.quantity).toBe(5);
  });

  it("removes the line when qty ≤ 0", () => {
    let s = cartReducer(empty, { type: "ADD", product: P1 });
    const lineId = s.lines[0]!.id;
    s = cartReducer(s, { type: "SET_QTY", lineId, qty: 0 });
    expect(s.lines).toHaveLength(0);
  });
});

describe("cartReducer — CLEAR", () => {
  it("empties all lines", () => {
    let s = cartReducer(empty, { type: "ADD", product: P1 });
    s = cartReducer(s, { type: "ADD", product: P2 });
    s = cartReducer(s, { type: "CLEAR" });
    expect(s.lines).toHaveLength(0);
    expect(s.order).toBeNull();
  });
});

// ── Local subtotal (client-side optimistic, integer cents) ───────────────────

describe("local subtotal (integer cents, no float)", () => {
  it("computes correctly with single product", () => {
    let s = cartReducer(empty, { type: "ADD", product: P1 }); // 499
    s = cartReducer(s, { type: "ADD", product: P1 }); // 499 × 2
    const subtotal = s.lines.reduce((acc, l) => acc + l.product.priceCents * l.quantity, 0);
    expect(subtotal).toBe(998);
  });

  it("computes correctly with multiple products", () => {
    let s = cartReducer(empty, { type: "ADD", product: P1 }); // 499
    s = cartReducer(s, { type: "ADD", product: P2 }); // 299
    const p2LineId = s.lines.find((l) => l.product.id === P2.id)!.id;
    s = cartReducer(s, { type: "SET_QTY", lineId: p2LineId, qty: 3 }); // 299 × 3 = 897
    const subtotal = s.lines.reduce((acc, l) => acc + l.product.priceCents * l.quantity, 0);
    expect(subtotal).toBe(499 + 897); // 1396
  });

  it("returns 0 for empty cart", () => {
    const subtotal = empty.lines.reduce((acc, l) => acc + l.product.priceCents * l.quantity, 0);
    expect(subtotal).toBe(0);
  });

  it("computes correctly for a Case line using the scanned unit price", () => {
    const s = cartReducer(empty, { type: "ADD", product: P3_CASE }); // 5400 × 1
    const subtotal = s.lines.reduce((acc, l) => acc + l.product.priceCents * l.quantity, 0);
    expect(subtotal).toBe(5400);
  });
});
