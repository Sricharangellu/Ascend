"use client";

/**
 * Stock workspace — on-hand inventory controls + expiry batches in one place.
 */

import { useState } from "react";
import type { CatalogProduct } from "@/api-client/types";
import { InventoryTab } from "./InventoryTab";
import { ExpiryTab } from "./ExpiryTab";

type STab = "on-hand" | "expiry";

const STABS: { key: STab; label: string; description: string }[] = [
  { key: "on-hand", label: "On hand", description: "Location stock, reorder point, and cost" },
  { key: "expiry", label: "Expiry", description: "Lot/batch expiry status and alerts" },
];

export function StockWorkspace({
  product,
  onSaved,
  initialSubTab,
  expiryAlertCount = 0,
}: {
  product: CatalogProduct;
  onSaved: (p: CatalogProduct) => void;
  initialSubTab?: STab;
  expiryAlertCount?: number;
}) {
  const [tab, setTab] = useState<STab>(initialSubTab ?? "on-hand");
  const current = STABS.find((t) => t.key === tab)!;

  return (
    <div className="space-y-4">
      <div
        className="flex flex-wrap gap-1 rounded-xl border border-erp-table-border bg-erp-page p-1"
        role="tablist"
        aria-label="Stock sections"
      >
        {STABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={[
              "inline-flex min-h-touch items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600",
              tab === t.key
                ? "bg-white text-brand-600 shadow-sm"
                : "text-erp-text-secondary hover:text-erp-text-primary",
            ].join(" ")}
          >
            {t.label}
            {t.key === "expiry" && expiryAlertCount > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-600 px-1 text-[10px] font-bold text-white">
                {expiryAlertCount}
              </span>
            )}
          </button>
        ))}
      </div>

      <p className="text-xs text-erp-text-secondary">{current.description}</p>

      {tab === "on-hand" && <InventoryTab product={product} onSaved={onSaved} />}
      {tab === "expiry" && <ExpiryTab productId={product.id} />}
    </div>
  );
}
