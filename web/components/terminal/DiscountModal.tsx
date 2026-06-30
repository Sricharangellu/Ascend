"use client";

/**
 * DiscountModal — apply a % or $ discount to the current order.
 *
 * The cashier picks a mode (percent / fixed) and enters an amount.
 * The parent receives the computed discountCents and closes the modal.
 *
 * Constraints:
 *   - Percent: 0.01 – 100 (enforced; decimals accepted)
 *   - Fixed:   $0.01 – order total (enforced; must not exceed total)
 */

import { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import { formatMoney } from "@/lib/money";

interface DiscountModalProps {
  orderTotalCents: number;
  currentDiscountCents: number;
  onApply: (discountCents: number) => void;
  onRemove: () => void;
  onClose: () => void;
}

type Mode = "percent" | "fixed";

const QUICK_PERCENTS = [5, 10, 15, 20];

export function DiscountModal({
  orderTotalCents,
  currentDiscountCents,
  onApply,
  onRemove,
  onClose,
}: DiscountModalProps) {
  const [mode, setMode] = useState<Mode>(currentDiscountCents > 0 ? "fixed" : "percent");
  const [input, setInput] = useState(() => {
    if (currentDiscountCents > 0) return (currentDiscountCents / 100).toFixed(2);
    return "";
  });
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const subtotalCents = orderTotalCents + currentDiscountCents;

  function computeDiscountCents(): number | null {
    const n = parseFloat(input);
    if (isNaN(n) || n <= 0) return null;
    if (mode === "percent") {
      if (n > 100) return null;
      return Math.round((n / 100) * subtotalCents);
    }
    return Math.round(n * 100);
  }

  const previewCents = computeDiscountCents();
  const newTotalCents = previewCents !== null ? subtotalCents - previewCents : null;

  function validate(): boolean {
    const d = computeDiscountCents();
    if (d === null || d <= 0) {
      setError("Enter a valid discount amount");
      return false;
    }
    if (mode === "percent" && parseFloat(input) > 100) {
      setError("Percent cannot exceed 100%");
      return false;
    }
    if (d >= subtotalCents) {
      setError("Discount cannot equal or exceed the order total");
      return false;
    }
    return true;
  }

  function handleApply() {
    if (!validate()) return;
    onApply(computeDiscountCents()!);
  }

  function handleModeChange(m: Mode) {
    setMode(m);
    setInput("");
    setError(null);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="discount-title"
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />

      {/* Modal */}
      <div className="relative w-full max-w-sm rounded-t-lg bg-white shadow-2xl sm:rounded-lg">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 id="discount-title" className="text-base font-bold text-slate-900">Apply Discount</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:outline-none"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Mode toggle */}
          <div className="flex rounded-lg border border-slate-200 p-1 gap-1" role="group" aria-label="Discount type">
            <button
              type="button"
              role="radio"
              aria-checked={mode === "percent"}
              onClick={() => handleModeChange("percent")}
              className={clsx(
                "flex-1 rounded-md py-2 text-sm font-semibold transition-colors min-h-[40px]",
                mode === "percent"
                  ? "bg-brand-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-50"
              )}
            >
              % Percent
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={mode === "fixed"}
              onClick={() => handleModeChange("fixed")}
              className={clsx(
                "flex-1 rounded-md py-2 text-sm font-semibold transition-colors min-h-[40px]",
                mode === "fixed"
                  ? "bg-brand-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-50"
              )}
            >
              $ Fixed
            </button>
          </div>

          {/* Quick-select percent buttons */}
          {mode === "percent" && (
            <div className="grid grid-cols-4 gap-2">
              {QUICK_PERCENTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => { setInput(String(p)); setError(null); }}
                  className={clsx(
                    "rounded-lg border py-2 text-sm font-semibold transition-colors min-h-[40px]",
                    input === String(p)
                      ? "border-brand-400 bg-brand-50 text-brand-700"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-brand-50 hover:border-brand-200 hover:text-brand-700"
                  )}
                >
                  {p}%
                </button>
              ))}
            </div>
          )}

          {/* Amount input */}
          <div>
            <label htmlFor="discount-amount" className="block text-xs font-medium uppercase tracking-wide text-slate-500 mb-1.5">
              {mode === "percent" ? "Percent off" : "Dollar amount off"}
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-3.5 flex items-center font-medium text-slate-500 pointer-events-none">
                {mode === "percent" ? "%" : "$"}
              </span>
              <input
                id="discount-amount"
                ref={inputRef}
                type="number"
                inputMode="decimal"
                min={0.01}
                max={mode === "percent" ? 100 : undefined}
                step={0.01}
                value={input}
                onChange={(e) => { setInput(e.target.value); setError(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") handleApply(); }}
                placeholder={mode === "percent" ? "10" : "5.00"}
                className="w-full rounded-lg border border-slate-300 py-3 pl-9 pr-4 text-xl font-semibold focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-brand-600 min-h-[52px]"
                aria-label={mode === "percent" ? "Discount percent" : "Discount dollar amount"}
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <p role="alert" className="text-sm text-danger-600">{error}</p>
          )}

          {/* Preview */}
          {previewCents !== null && previewCents > 0 && newTotalCents !== null && newTotalCents > 0 && (
            <div className="rounded-xl bg-success-50 border border-success-200 p-3 space-y-1" aria-live="polite">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Subtotal</span>
                <span className="font-medium">{formatMoney(subtotalCents)}</span>
              </div>
              <div className="flex justify-between text-sm text-success-700">
                <span>Discount</span>
                <span className="font-semibold">−{formatMoney(previewCents)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold border-t border-success-200 pt-1 mt-1">
                <span>New total</span>
                <span className="text-success-700">{formatMoney(newTotalCents)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 border-t border-slate-100 px-5 pb-5 pt-3">
          {currentDiscountCents > 0 && (
            <button
              type="button"
              onClick={onRemove}
              className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors min-h-[44px]"
            >
              Remove
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors min-h-[44px]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!input || parseFloat(input) <= 0}
            className="flex-1 rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors min-h-[44px]"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
