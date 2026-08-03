"use client";

import { useEffect, useRef, useState } from "react";

interface NumpadModalProps {
  initialValue: number;
  productName: string;
  onConfirm: (qty: number) => void;
  onClose: () => void;
}

const MAX_DIGITS = 4;
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"] as const;

export function NumpadModal({ initialValue, productName, onConfirm, onClose }: NumpadModalProps) {
  const [digits, setDigits] = useState(String(initialValue > 0 ? initialValue : 1));

  const qty = parseInt(digits, 10) || 0;
  const valid = qty >= 1;

  const append = (d: string) => {
    setDigits((prev) => {
      if (prev === "0" || prev === "1" && initialValue === 1 && prev.length === 1) {
        return d === "0" ? "0" : d;
      }
      if (prev.length >= MAX_DIGITS) return prev;
      return prev + d;
    });
  };

  const backspace = () => setDigits((prev) => (prev.length <= 1 ? "0" : prev.slice(0, -1)));
  const clear = () => setDigits("0");

  const handleKey = (key: typeof KEYS[number]) => {
    if (key === "⌫") backspace();
    else if (key === "C") clear();
    else append(key);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") { e.preventDefault(); append(e.key); }
      else if (e.key === "Backspace") { e.preventDefault(); backspace(); }
      else if (e.key === "Escape") onClose();
      else if ((e.key === "Enter" || e.key === "NumpadEnter") && valid) onConfirm(qty);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valid, qty]);

  const displayRef = useRef<HTMLDivElement>(null);
  useEffect(() => { displayRef.current?.focus(); }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Set quantity for ${productName}`}
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" aria-hidden="true" onClick={onClose} />

      <div className="relative flex w-full max-w-xs flex-col gap-4 rounded-2xl bg-white p-5 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <h3 className="max-w-[200px] truncate text-sm font-semibold text-gray-900" title={productName}>
            {productName}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close numpad"
            className="flex h-8 w-8 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 min-h-[44px] min-w-[44px]"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Display */}
        <div
          ref={displayRef}
          tabIndex={-1}
          role="status"
          aria-live="polite"
          aria-atomic="true"
          aria-label={`Quantity: ${digits}`}
          className="flex h-14 items-center justify-end rounded-lg border border-gray-300 bg-gray-50 px-4 text-3xl font-bold tabular-nums text-gray-900 focus:outline-none"
        >
          {digits}
        </div>

        {/* 3×4 grid */}
        <div className="grid grid-cols-3 gap-2">
          {KEYS.map((key) => {
            const isAction = key === "⌫" || key === "C";
            return (
              <button
                key={key}
                type="button"
                onClick={() => handleKey(key)}
                aria-label={key === "⌫" ? "Backspace" : key === "C" ? "Clear" : key}
                className={`flex min-h-[52px] items-center justify-center rounded-xl border text-lg font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 ${
                  isAction
                    ? "border-gray-200 bg-gray-100 text-gray-500 hover:bg-gray-200 active:bg-gray-300"
                    : "border-gray-200 bg-white text-gray-900 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 active:bg-brand-100"
                }`}
              >
                {key}
              </button>
            );
          })}
        </div>

        {/* Confirm */}
        <button
          type="button"
          disabled={!valid}
          onClick={() => onConfirm(qty)}
          className="flex min-h-[48px] w-full items-center justify-center rounded-xl bg-brand-600 text-base font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
          aria-label={valid ? `Set quantity to ${qty}` : "Enter a valid quantity"}
        >
          {valid ? `Set Qty — ${qty}` : "Enter quantity"}
        </button>
      </div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" aria-hidden="true">
      <path d="M18 6 6 18" /><path d="m6 6 12 12" />
    </svg>
  );
}
