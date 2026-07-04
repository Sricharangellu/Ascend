"use client";
import { useEffect } from "react";

interface ScanToastProps {
  productName: string | null;
  onDismiss: () => void;
}

export function ScanToast({ productName, onDismiss }: ScanToastProps) {
  useEffect(() => {
    if (!productName) return;
    const t = setTimeout(onDismiss, 2000);
    return () => clearTimeout(t);
  }, [productName, onDismiss]);

  if (!productName) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm text-white shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-green-400">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
      <span>Scanned: <strong>{productName}</strong></span>
    </div>
  );
}
