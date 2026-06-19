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
  | { type: "REMOVE"; productId: string }
  | { type: "SET_QTY"; productId: string; qty: number }
  | { type: "SET_ORDER"; order: Order }
  | { type: "SET_SYNCING"; value: boolean }
  | { type: "CLEAR" };

// ─── Reducer ─────────────────────────────────────────────────────────────────

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "ADD": {
      const idx = state.lines.findIndex(
        (l) => l.product.id === action.product.id
      );
      if (idx >= 0) {
        const lines = [...state.lines];
        lines[idx] = {
          ...lines[idx]!,
          quantity: lines[idx]!.quantity + 1,
        };
        return { ...state, lines };
      }
      return {
        ...state,
        lines: [...state.lines, { product: action.product, quantity: 1 }],
      };
    }

    case "REMOVE":
      return {
        ...state,
        lines: state.lines.filter((l) => l.product.id !== action.productId),
      };

    case "SET_QTY": {
      if (action.qty <= 0) {
        return {
          ...state,
          lines: state.lines.filter((l) => l.product.id !== action.productId),
        };
      }
      return {
        ...state,
        lines: state.lines.map((l) =>
          l.product.id === action.productId
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
  /** Convenience: add a product (increments qty if already present) */
  addProduct: (product: Product) => void;
  /** Convenience: remove all lines for a product */
  removeProduct: (productId: string) => void;
  /** Convenience: set exact quantity (removes if qty <= 0) */
  setQty: (productId: string, qty: number) => void;
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
    (productId: string) => dispatch({ type: "REMOVE", productId }),
    []
  );
  const setQty = useCallback(
    (productId: string, qty: number) =>
      dispatch({ type: "SET_QTY", productId, qty }),
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
