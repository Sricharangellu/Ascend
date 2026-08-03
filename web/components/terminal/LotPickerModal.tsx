"use client";

/**
 * FE-46: LotPickerModal — FEFO lot selection for lot-tracked products.
 *
 * Shows available inventory lots sorted by expiry date (earliest first = FEFO).
 * Pre-selects the earliest-expiry lot. Cashier can override the selection.
 *
 * Called by ProductGrid when a product with lotTracked=true is added to cart.
 */

import { useEffect, useState } from "react";
import { apiGet, safeLoad } from "@/api-client/client";
import type { InventoryLot } from "@/api-client/types";

interface LotPickerModalProps {
  productId: string;
  productName: string;
  onConfirm: (lotId: string, lotCode: string | null) => void;
  onCancel: () => void;
}

function formatExpiry(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function expiryStatus(ms: number): "ok" | "soon" | "expired" {
  const days = (ms - Date.now()) / 86_400_000;
  if (days < 0) return "expired";
  if (days < 30) return "soon";
  return "ok";
}

const STATUS_CLASS = {
  ok: "text-success-600",
  soon: "text-warning-600",
  expired: "text-danger-500 line-through",
};

export function LotPickerModal({ productId, productName, onConfirm, onCancel }: LotPickerModalProps) {
  const [lots, setLots] = useState<InventoryLot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    safeLoad(
      apiGet<{ items: InventoryLot[] }>(`/api/v1/inventory/${productId}/lots`)
        .then((r) => {
          const available = (r.items ?? [])
            .filter((l) => l.qty_on_hand > 0)
            .sort((a, b) => a.expiry_date - b.expiry_date); // FEFO
          setLots(available);
          if (available[0]) setSelected(available[0].id); // pre-select earliest expiry
        })
        .finally(() => setLoading(false)),
    );
  }, [productId]);

  const selectedLot = lots.find((l) => l.id === selected);

  const handleConfirm = () => {
    if (!selectedLot) return;
    onConfirm(selectedLot.id, selectedLot.lot_code);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Select lot"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="w-full max-w-sm rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-table-border)] px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">Select Lot — FEFO</p>
            <p className="text-sm font-medium text-[var(--color-text-primary)]">{productName}</p>
          </div>
          <button type="button" onClick={onCancel} aria-label="Cancel" className="rounded p-1 text-[var(--color-text-secondary)] hover:bg-gray-100">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Lot list */}
        <div className="max-h-64 overflow-y-auto px-4 py-3">
          {loading ? (
            <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 animate-pulse rounded bg-gray-100" />)}</div>
          ) : lots.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--color-text-secondary)]">No available lots for this product.</p>
          ) : (
            <ul className="space-y-1.5">
              {lots.map((lot) => {
                const status = expiryStatus(lot.expiry_date);
                const isSelected = lot.id === selected;
                return (
                  <li key={lot.id}>
                    <button
                      type="button"
                      disabled={status === "expired"}
                      onClick={() => setSelected(lot.id)}
                      className={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${
                        isSelected
                          ? "border-brand-600 bg-brand-50"
                          : status === "expired"
                          ? "border-[#D9D9D9] bg-gray-50 opacity-50 cursor-not-allowed"
                          : "border-[#D9D9D9] hover:border-brand-400 hover:bg-gray-50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-[var(--color-text-primary)]">
                          {lot.lot_code ?? "No lot code"}
                        </span>
                        <span className="text-xs font-semibold text-[var(--color-text-secondary)]">
                          {lot.qty_on_hand} units
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2">
                        <span className={`text-xs ${STATUS_CLASS[status]}`}>
                          Exp: {formatExpiry(lot.expiry_date)}
                          {status === "expired" ? " (expired)" : status === "soon" ? " (expires soon)" : ""}
                        </span>
                        {isSelected && (
                          <span className="ml-auto text-xs font-semibold text-brand-600">Selected</span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--color-table-border)] px-4 py-3 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-[#D9D9D9] py-2.5 text-sm font-medium text-[var(--color-text-primary)] hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!selected || lots.length === 0}
            onClick={handleConfirm}
            className="flex-1 rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
          >
            Add to Cart
          </button>
        </div>
      </div>
    </div>
  );
}
