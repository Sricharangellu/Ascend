"use client";

import { useEffect } from "react";

interface ScanToastProps {
  productName: string | null;
  onDismiss: () => void;
}

/**
 * ScanToast — transient overlay that appears when a barcode is successfully
 * scanned. Auto-dismisses after 1.8 s. Visually distinct from the global
 * Toast system so the cashier gets instant scan feedback.
 */
export function ScanToast({ productName, onDismiss }: ScanToastProps) {
  useEffect(() => {
    if (!productName) return;
    const t = setTimeout(onDismiss, 1800);
    return () => clearTimeout(t);
  }, [productName, onDismiss]);

  if (!productName) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed bottom-24 left-1/2 z-50 -translate-x-1/2"
    >
      <div className="flex items-center gap-2.5 rounded-xl bg-success-700 px-5 py-3 shadow-lg">
        <svg
          width="19"
          height="19"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="shrink-0 text-white"
        >
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
        <span className="text-sm font-semibold text-white">
          Added: {productName}
        </span>
      </div>
    </div>
  );
}
