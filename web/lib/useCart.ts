"use client";

/**
 * Cart state — managed in React context for the POS terminal.
 *
 * Rules:
 * - Quantities are always positive integers (≥ 1).
 * - Prices are integer cents; totals are derived from the API order response
 *   (not recomputed here) so tax stays server-authoritative.
 * - The cart can be cleared on payment completion or a new sale.
 */

import {
  createContext,
  useCallback,
  useContext,
  useReducer,
  type Dispatch,
} from "react";
import type { TerminalProduct as Product, Order } from "@/api-client/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CartLine {
  /** Unique per cart line — NOT the product id. A case-scan and an each-scan
   *  of the same product are two lines with two ids; quantity/remove must
   *  target this, never productId, or they'd ambiguously affect whichever
   *  line the product happens to match (a real billing-correctness bug, not
   *  cosmetic — flagged and fixed before this slice shipped). */
  id: string;
  product: Product;
  quantity: number;
}

export interface CartState {
  lines: CartLine[];
  /** The live order object returned from the API (null until first POST). */
  order: Order | null;
  /** True while an order create/update call is in-flight. */
  syncing: boolean;
}

export type CartAction =
  | { type: "ADD"; product: Product }
  | { type: "REMOVE"; lineId: string }
  | { type: "SET_QTY"; lineId: string; qty: number }
  | { type: "SET_ORDER"; order: Order }
  | { type: "SET_SYNCING"; value: boolean }
  | { type: "CLEAR" };

// ─── Reducer ─────────────────────────────────────────────────────────────────

// A case-scan and an each-scan of the same product are different cart lines
// (different price, different receipt entry) — matched for the ADD increment
// by product + unit, not product alone. Undefined unitKind on both sides (the
// default, no-packaging case) matches exactly as before. Once a line exists,
// every other action (REMOVE/SET_QTY) targets it by its own unique id, never
// by re-deriving this key — two lines for the same product must never be
// confusable, including transiently (e.g. mid-edit).
function lineKey(product: { id: string; unitKind?: string }): string {
  return `${product.id}|${product.unitKind ?? ""}`;
}

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "ADD": {
      const idx = state.lines.findIndex(
        (l) => lineKey(l.product) === lineKey(action.product)
      );
      if (idx >= 0) {
        const lines = [...state.lines];
        lines[idx] = {
          ...lines[idx]!,
          quantity: lines[idx]!.quantity + 1,
        };
        return { ...state, lines };
      }
      const id = typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `line_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      return {
        ...state,
        lines: [...state.lines, { id, product: action.product, quantity: 1 }],
      };
    }

    case "REMOVE":
      return {
        ...state,
        lines: state.lines.filter((l) => l.id !== action.lineId),
      };

    case "SET_QTY": {
      if (action.qty <= 0) {
        return {
          ...state,
          lines: state.lines.filter((l) => l.id !== action.lineId),
        };
      }
      return {
        ...state,
        lines: state.lines.map((l) =>
          l.id === action.lineId
            ? { ...l, quantity: action.qty }
            : l
        ),
      };
    }

    case "SET_ORDER":
      return { ...state, order: action.order, syncing: false };

    case "SET_SYNCING":
      return { ...state, syncing: action.value };

    case "CLEAR":
      return { lines: [], order: null, syncing: false };

    default:
      return state;
  }
}

// ─── Context ─────────────────────────────────────────────────────────────────

export interface CartContextValue {
  state: CartState;
  dispatch: Dispatch<CartAction>;
  /** Convenience: add a product (increments qty if a line for the same
   *  product+unit already exists, else creates a new line) */
  addProduct: (product: Product) => void;
  /** Convenience: remove one specific cart line by its id (not productId —
   *  a product can have more than one line, e.g. scanned as both Case and Each) */
  removeProduct: (lineId: string) => void;
  /** Convenience: set exact quantity on one specific cart line (removes if qty <= 0) */
  setQty: (lineId: string, qty: number) => void;
  /** Convenience: clear the whole cart */
  clearCart: () => void;
  /** Total item count (sum of quantities) */
  itemCount: number;
  /** Client-side subtotal in cents (for optimistic display only; use order.totalCents for authoritative total) */
  localSubtotalCents: number;
}

import { createContext as _createContext } from "react";

export const CartContext = createContext<CartContextValue | null>(null);

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}

// ─── Provider factory (used in terminal/layout) ───────────────────────────────

import { useMemo } from "react";

export function useCartReducer() {
  const [state, dispatch] = useReducer(cartReducer, {
    lines: [],
    order: null,
    syncing: false,
  });

  const addProduct = useCallback(
    (product: Product) => dispatch({ type: "ADD", product }),
    []
  );
  const removeProduct = useCallback(
    (lineId: string) => dispatch({ type: "REMOVE", lineId }),
    []
  );
  const setQty = useCallback(
    (lineId: string, qty: number) =>
      dispatch({ type: "SET_QTY", lineId, qty }),
    []
  );
  const clearCart = useCallback(() => dispatch({ type: "CLEAR" }), []);

  const itemCount = useMemo(
    () => state.lines.reduce((s, l) => s + l.quantity, 0),
    [state.lines]
  );

  const localSubtotalCents = useMemo(
    () =>
      state.lines.reduce(
        (s, l) => s + l.product.priceCents * l.quantity,
        0
      ),
    [state.lines]
  );

  const value: CartContextValue = useMemo(
    () => ({
      state,
      dispatch,
      addProduct,
      removeProduct,
      setQty,
      clearCart,
      itemCount,
      localSubtotalCents,
    }),
    [
      state,
      dispatch,
      addProduct,
      removeProduct,
      setQty,
      clearCart,
      itemCount,
      localSubtotalCents,
    ]
  );

  return value;
}
