/**
 * Unit tests for cart reducer logic (pure state machine).
 * No DOM needed.
 */

import { describe, it, expect } from "vitest";
import type { Product } from "@/api-client/types";

// ── Inline the reducer logic (avoids "use client" directive issues in Node) ──

type CartLine = { product: Product; quantity: number };
type CartState = { lines: CartLine[]; order: null; syncing: boolean };
type CartAction =
  | { type: "ADD"; product: Product }
  | { type: "REMOVE"; productId: string }
  | { type: "SET_QTY"; productId: string; qty: number }
  | { type: "CLEAR" };

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "ADD": {
      const idx = state.lines.findIndex((l) => l.product.id === action.product.id);
      if (idx >= 0) {
        const lines = [...state.lines];
        lines[idx] = { ...lines[idx]!, quantity: lines[idx]!.quantity + 1 };
        return { ...state, lines };
      }
      return {
        ...state,
        lines: [...state.lines, { product: action.product, quantity: 1 }],
      };
    }
    case "REMOVE":
      return { ...state, lines: state.lines.filter((l) => l.product.id !== action.productId) };
    case "SET_QTY": {
      if (action.qty <= 0) {
        return { ...state, lines: state.lines.filter((l) => l.product.id !== action.productId) };
      }
      return {
        ...state,
        lines: state.lines.map((l) =>
          l.product.id === action.productId ? { ...l, quantity: action.qty } : l
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

describe("cartReducer — REMOVE", () => {
  it("removes the matching line", () => {
    let s = cartReducer(empty, { type: "ADD", product: P1 });
    s = cartReducer(s, { type: "ADD", product: P2 });
    s = cartReducer(s, { type: "REMOVE", productId: P1.id });
    expect(s.lines).toHaveLength(1);
    expect(s.lines[0]!.product.id).toBe(P2.id);
  });

  it("is a no-op for an unknown product id", () => {
    const s = cartReducer(empty, { type: "REMOVE", productId: "unknown" });
    expect(s.lines).toHaveLength(0);
  });
});

describe("cartReducer — SET_QTY", () => {
  it("sets the quantity directly", () => {
    let s = cartReducer(empty, { type: "ADD", product: P1 });
    s = cartReducer(s, { type: "SET_QTY", productId: P1.id, qty: 5 });
    expect(s.lines[0]!.quantity).toBe(5);
  });

  it("removes the line when qty ≤ 0", () => {
    let s = cartReducer(empty, { type: "ADD", product: P1 });
    s = cartReducer(s, { type: "SET_QTY", productId: P1.id, qty: 0 });
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
    s = cartReducer(s, { type: "SET_QTY", productId: P2.id, qty: 3 }); // 299 × 3 = 897
    const subtotal = s.lines.reduce((acc, l) => acc + l.product.priceCents * l.quantity, 0);
    expect(subtotal).toBe(499 + 897); // 1396
  });

  it("returns 0 for empty cart", () => {
    const subtotal = empty.lines.reduce((acc, l) => acc + l.product.priceCents * l.quantity, 0);
    expect(subtotal).toBe(0);
  });
});
