"use client";

import React from "react";
import { formatMoney } from "@/lib/money";

function TerminalAction({
  label, icon, onClick, disabled = false, active = false,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={active || undefined}
      className={`inline-flex min-h-[44px] min-w-[72px] shrink-0 flex-col items-center justify-center gap-1 rounded-md border px-3 text-xs font-semibold transition-colors ${
        active
          ? "border-warning-300 bg-warning-50 text-warning-700"
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
      } disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-300`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function PercentIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 5 5 19" />
      <circle cx="7" cy="7" r="2" />
      <circle cx="17" cy="17" r="2" />
    </svg>
  );
}

function ReturnIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 14-4-4 4-4" />
      <path d="M5 10h11a4 4 0 0 1 0 8h-1" />
    </svg>
  );
}

export function TerminalActionBar({
  canCharge,
  totalCents,
  returnMode,
  hasCart,
  discountActive,
  onDiscount,
  onReturnMode,
  onCharge,
}: {
  canCharge: boolean;
  totalCents: number;
  returnMode: boolean;
  hasCart: boolean;
  discountActive: boolean;
  onDiscount: () => void;
  onReturnMode: () => void;
  onCharge: () => void;
}) {
  return (
    <div className="flex flex-none gap-2 overflow-x-auto border-t border-slate-200 bg-white px-3 py-2 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] sm:px-4">
      <TerminalAction label="Discount" disabled={!hasCart}  active={discountActive} onClick={onDiscount}     icon={<PercentIcon />} />
      <TerminalAction label={returnMode ? "Sale mode" : "Return"} active={returnMode} onClick={onReturnMode} icon={<ReturnIcon />} />
      <button
        type="button"
        disabled={!canCharge}
        onClick={onCharge}
        className="ml-auto inline-flex min-h-[44px] min-w-[150px] shrink-0 items-center justify-center rounded-md bg-brand-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {canCharge ? `Complete ${formatMoney(totalCents)}` : "Complete sale"}
      </button>
    </div>
  );
}
