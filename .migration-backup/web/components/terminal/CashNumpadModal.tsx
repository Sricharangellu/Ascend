"use client";

/**
 * CashNumpadModal — touch-friendly cash entry for the TenderScreen.
 *
 * Input model: builds up cents digit-by-digit (same UX as a physical
 * cash register). Digits accumulate right-to-left in cents:
 *   press 1 → $0.01
 *   press 5 → $0.15
 *   press 0 → $1.50
 *
 * Quick-amount buttons jump to common denominations ≥ orderTotal.
 * Shows change-due in real time as the cashier types.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { formatMoney } from "@/lib/money";

interface CashNumpadModalProps {
  orderTotalCents: number;
  onConfirm: (tenderedCents: number) => void;
  onClose: () => void;
}

const DIGIT_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "⌫"] as const;

// Quick-amount denominations in cents
const QUICK_AMOUNTS_CENTS = [500, 1000, 2000, 5000, 10000];

export function CashNumpadModal({ orderTotalCents, onConfirm, onClose }: CashNumpadModalProps) {
  // Amount stored as cents integer, built digit-by-digit.
  const [cents, setCents] = useState(0);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const changeCents = cents >= orderTotalCents ? cents - orderTotalCents : null;
  const canConfirm = cents >= orderTotalCents;

  const handleDigit = useCallback((key: string) => {
    if (key === "⌫") {
      setCents((prev) => Math.floor(prev / 10));
      return;
    }
    if (key === "C") {
      setCents(0);
      return;
    }
    const digits = key === "00" ? ["0", "0"] : [key];
    setCents((prev) => {
      let next = prev;
      for (const d of digits) {
        next = next * 10 + parseInt(d, 10);
        if (next > 99_999_99) next = prev; // cap at $999,999.99
      }
      return next;
    });
  }, []);

  // Keyboard support
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "Enter" && canConfirm) { onConfirm(cents); return; }
      if (e.key === "Backspace") { handleDigit("⌫"); return; }
      if (/^[0-9]$/.test(e.key)) { handleDigit(e.key); return; }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [canConfirm, cents, handleDigit, onClose, onConfirm]);

  // Focus confirm when amount is sufficient
  useEffect(() => {
    if (canConfirm) confirmRef.current?.focus();
  }, [canConfirm]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Cash payment entry"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-xs rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-table-border)] px-4 py-3">
          <span className="text-sm font-semibold text-[var(--color-text-secondary)]">CASH PAYMENT</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cancel"
            className="rounded p-1 text-[var(--color-text-secondary)] hover:bg-gray-100"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Amount display */}
        <div className="px-4 pt-4 pb-2 text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-[var(--color-text-secondary)]">
            Tendered
          </p>
          <p className="mt-1 text-4xl font-bold tabular-nums text-[var(--color-text-primary)]">
            {formatMoney(cents)}
          </p>
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-[var(--color-text-secondary)]">
              Order total: <span className="font-medium text-[var(--color-text-primary)]">{formatMoney(orderTotalCents)}</span>
            </span>
            {changeCents !== null && (
              <span className="font-semibold text-success-600">
                Change: {formatMoney(changeCents)}
              </span>
            )}
          </div>
        </div>

        {/* Quick amounts */}
        <div className="flex gap-1.5 px-4 pb-3">
          {QUICK_AMOUNTS_CENTS.filter((a) => a >= orderTotalCents).slice(0, 4).map((amt) => (
            <button
              key={amt}
              type="button"
              onClick={() => setCents(amt)}
              className="flex-1 rounded-md border border-[#D9D9D9] bg-gray-50 py-1.5 text-[12px] font-semibold text-[var(--color-text-primary)] hover:bg-gray-100 active:bg-gray-200"
            >
              {formatMoney(amt)}
            </button>
          ))}
          {/* Exact button */}
          <button
            type="button"
            onClick={() => setCents(orderTotalCents)}
            className="flex-1 rounded-md border border-brand-600 bg-brand-50 py-1.5 text-[12px] font-semibold text-brand-700 hover:bg-brand-100"
          >
            Exact
          </button>
        </div>

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-1.5 px-4 pb-4">
          {DIGIT_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => handleDigit(key)}
              className={`flex min-h-[52px] items-center justify-center rounded-lg text-lg font-semibold transition-colors active:scale-95 ${
                key === "⌫"
                  ? "border border-[#D9D9D9] bg-white text-danger-500 hover:bg-red-50"
                  : "border border-[#D9D9D9] bg-white text-[var(--color-text-primary)] hover:bg-gray-50"
              }`}
              aria-label={key === "⌫" ? "Backspace" : key}
            >
              {key}
            </button>
          ))}
        </div>

        {/* Confirm */}
        <div className="border-t border-[var(--color-table-border)] px-4 py-3">
          <button
            ref={confirmRef}
            type="button"
            disabled={!canConfirm}
            onClick={() => onConfirm(cents)}
            className="w-full rounded-lg bg-brand-600 py-3 text-base font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
          >
            {canConfirm
              ? `Charge ${formatMoney(cents)}${changeCents ? ` · Change ${formatMoney(changeCents)}` : ""}`
              : `Enter ${formatMoney(orderTotalCents)} or more`}
          </button>
        </div>
      </div>
    </div>
  );
}
