"use client";

/**
 * Product Details workspace — Product fields, variants, categories, and
 * content/compliance surfaces that used to be top-level tabs.
 */

import { useState } from "react";
import type { CatalogProduct } from "@/api-client/types";
import { GeneralTab } from "./GeneralTab";
import { VariantsTab } from "./VariantsTab";
import { CategoriesTab } from "./CategoriesTab";
import { ImagesTab } from "./ImagesTab";
import { LabelsTab } from "./LabelsTab";
import { MarketingTab } from "./MarketingTab";
import { EcommerceTab } from "./EcommerceTab";

type DTab =
  | "product"
  | "variants"
  | "categories"
  | "media"
  | "labels"
  | "compliance"
  | "online";

const DTABS: { key: DTab; label: string; description: string }[] = [
  { key: "product", label: "Product", description: "Name, SKU, barcode, status, and core attributes" },
  { key: "variants", label: "Variants", description: "Master/variant structure and option setup" },
  { key: "categories", label: "Categories", description: "Category assignments for browsing and reports" },
  { key: "media", label: "Media", description: "Product images and gallery" },
  { key: "labels", label: "Labels", description: "Shelf and barcode label printing" },
  { key: "compliance", label: "Compliance", description: "Age gates, restricted flags, and marketing notes" },
  { key: "online", label: "Online", description: "Ecommerce listing fields" },
];

export function DetailsWorkspace({
  product,
  onSaved,
  initialSubTab,
}: {
  product: CatalogProduct;
  onSaved: (p: CatalogProduct) => void;
  initialSubTab?: DTab;
}) {
  const [tab, setTab] = useState<DTab>(initialSubTab ?? "product");
  const current = DTABS.find((t) => t.key === tab)!;

  return (
    <div className="space-y-4">
      <div
        className="flex flex-wrap gap-1 rounded-xl border border-erp-table-border bg-erp-page p-1"
        role="tablist"
        aria-label="Product details sections"
      >
        {DTABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={[
              "min-h-touch rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600",
              tab === t.key
                ? "bg-white text-brand-600 shadow-sm"
                : "text-erp-text-secondary hover:text-erp-text-primary",
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </div>

      <p className="text-xs text-erp-text-secondary">{current.description}</p>

      {tab === "product" && <GeneralTab product={product} onSaved={onSaved} />}
      {tab === "variants" && <VariantsTab product={product} />}
      {tab === "categories" && <CategoriesTab productId={product.id} />}
      {tab === "media" && <ImagesTab productId={product.id} />}
      {tab === "labels" && <LabelsTab product={product} />}
      {tab === "compliance" && <MarketingTab product={product} onSaved={onSaved} />}
      {tab === "online" && <EcommerceTab product={product} />}
    </div>
  );
}
