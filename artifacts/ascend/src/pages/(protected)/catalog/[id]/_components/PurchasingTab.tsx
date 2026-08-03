
/**
 * Unified Purchasing tab — consolidates Suppliers, Purchase by Supplier, and
 * Supplier Price Comparison into one workspace so all supplier/purchasing data
 * for this product is in one place.
 */

import { useState } from "react";
import { SuppliersTab } from "./SuppliersTab";
import { PurchasesTab } from "./PurchasesTab";
import { SupplierPriceComparisonTab } from "./SupplierPriceComparisonTab";

type PTab = "purchase-orders" | "suppliers" | "price-comparison";

const PTABS: { key: PTab; label: string; description: string }[] = [
  { key: "purchase-orders",   label: "Purchase Orders",    description: "All POs for this product, status, and receiving history" },
  { key: "suppliers",         label: "Suppliers",          description: "Approved suppliers and vendor SKU mappings for this product" },
  { key: "price-comparison",  label: "Price Comparison",   description: "Compare supplier quoted prices and find the best landed cost" },
];

export function PurchasingTab({ productId }: { productId: string }) {
  const [tab, setTab] = useState<PTab>("purchase-orders");

  const current = PTABS.find((t) => t.key === tab)!;

  return (
    <div className="space-y-4">
      {/* Sub-tab picker */}
      <div className="flex flex-wrap gap-1 rounded-xl border p-1 shadow-[var(--shadow-sm)]"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-subtle)" }}>
        {PTABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={["rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors",
              tab === t.key ? "bg-white text-brand-600 shadow-sm dark:bg-slate-700" : "hover:bg-[var(--color-surface)]"
            ].join(" ")}
            style={tab !== t.key ? { color: "var(--color-text-secondary)" } : {}}>
            {t.label}
          </button>
        ))}
      </div>

      <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>{current.description}</p>

      {/* Content */}
      {tab === "purchase-orders"  && <PurchasesTab productId={productId} />}
      {tab === "suppliers"        && <SuppliersTab productId={productId} />}
      {tab === "price-comparison" && <SupplierPriceComparisonTab productId={productId} />}
    </div>
  );
}
