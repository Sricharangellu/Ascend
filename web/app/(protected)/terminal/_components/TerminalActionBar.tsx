"use client";

import React from "react";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/Button";

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
      className={`inline-flex min-h-[44px] min-w-[72px] shrink-0 flex-col items-center justify-center gap-1 rounded-md border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 ${
        active
          ? "border-warning-300 bg-warning-50 text-warning-700"
          : "border-erp-table-border bg-white text-erp-text-secondary hover:border-erp-table-border hover:bg-erp-table-header"
      } disabled:cursor-not-allowed disabled:bg-erp-table-header disabled:text-erp-text-secondary disabled:opacity-50`}
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

function UserIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

export function TerminalActionBar({
  canCharge,
  totalCents,
  hasCart,
  discountActive,
  customerAttached,
  onDiscount,
  onAttachCustomer,
  onCharge,
}: {
  canCharge: boolean;
  totalCents: number;
  hasCart: boolean;
  discountActive: boolean;
  customerAttached: boolean;
  onDiscount: () => void;
  onAttachCustomer: () => void;
  onCharge: () => void;
}) {
  return (
    <div className="flex flex-none gap-2 overflow-x-auto border-t border-erp-table-border bg-white px-3 py-2 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] sm:px-4">
      <TerminalAction label="Discount" disabled={!hasCart} active={discountActive} onClick={onDiscount} icon={<PercentIcon />} />
      <TerminalAction
        label={customerAttached ? "Customer" : "Customer"}
        active={customerAttached}
        onClick={onAttachCustomer}
        icon={<UserIcon />}
      />
      <Button
        type="button"
        variant="primary"
        size="lg"
        disabled={!canCharge}
        onClick={onCharge}
        className="ml-auto min-w-[150px] shrink-0"
      >
        {canCharge ? `Complete ${formatMoney(totalCents)}` : "Complete sale"}
      </Button>
    </div>
  );
}
