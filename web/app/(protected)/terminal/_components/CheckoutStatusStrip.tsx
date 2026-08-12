"use client";

import { Button } from "@/components/Button";
import { Select } from "@/components/Select";

type Tone = "neutral" | "success" | "warning" | "brand";

function StatusPill({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  const toneClass: Record<Tone, string> = {
    neutral: "border-erp-table-border bg-erp-table-header text-erp-text-secondary",
    success: "border-success-200 bg-success-50 text-success-700",
    warning: "border-warning-200 bg-warning-50 text-warning-700",
    brand: "border-brand-200 bg-brand-50 text-brand-700",
  };
  return (
    <div className={`inline-flex min-h-[30px] items-center gap-1.5 rounded-md border px-2.5 ${toneClass[tone]}`}>
      <span className="font-semibold uppercase tracking-[0.08em] opacity-70">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

export function CheckoutStatusStrip({
  cashier,
  isOffline,
  itemCount,
  onShortcuts,
  activeOutletId,
  outlets,
  onOutletChange,
  customerName,
  onAttachCustomer,
  onClearCustomer,
}: {
  cashier: string;
  isOffline: boolean;
  itemCount: number;
  onShortcuts: () => void;
  activeOutletId: string;
  outlets: { id: string; name: string }[];
  onOutletChange: (id: string) => void;
  customerName?: string | null;
  onAttachCustomer: () => void;
  onClearCustomer: () => void;
}) {
  const activeOutlet = outlets.find((o) => o.id === activeOutletId);
  const outletName = activeOutlet?.name ?? (activeOutletId ? "Loading…" : "No outlet");

  return (
    <div className="flex flex-none flex-wrap items-center gap-2 border-b border-erp-table-border bg-white px-3 py-2 text-xs sm:px-4">
      <StatusPill label="Store" value={outletName} tone="neutral" />
      <StatusPill label="Cashier" value={cashier} tone="neutral" />
      <StatusPill label="Network" value={isOffline ? "Offline queue" : "Online"} tone={isOffline ? "warning" : "success"} />
      <StatusPill label="Cart" value={`${itemCount} item${itemCount === 1 ? "" : "s"}`} tone={itemCount > 0 ? "brand" : "neutral"} />
      {customerName ? (
        <div className="inline-flex min-h-[30px] items-center gap-1.5 rounded-md border border-brand-200 bg-brand-50 px-2.5 text-brand-700">
          <span className="font-semibold uppercase tracking-[0.08em] opacity-70">Customer</span>
          <span className="max-w-[140px] truncate font-semibold" title={customerName}>{customerName}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClearCustomer}
            aria-label={`Clear customer ${customerName}`}
            className="!min-h-0 !px-1 !py-0 text-xs"
          >
            Clear
          </Button>
        </div>
      ) : (
        <Button type="button" variant="secondary" size="sm" onClick={onAttachCustomer} aria-label="Attach customer to sale">
          Attach customer
        </Button>
      )}
      {outlets.length > 0 && (
        <div className="ml-auto min-w-[140px]">
          <Select
            size="sm"
            value={activeOutletId}
            onChange={(e) => onOutletChange(e.target.value)}
            options={outlets.map((o) => ({ value: o.id, label: o.name }))}
            aria-label="Active outlet"
            className="!min-h-[44px]"
          />
        </div>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onShortcuts}
        aria-label="Keyboard shortcuts"
        title="Keyboard shortcuts (?)"
        className="flex h-8 w-8 !min-h-[44px] !min-w-[44px] items-center justify-center !p-0 text-sm font-bold"
      >
        ?
      </Button>
    </div>
  );
}
