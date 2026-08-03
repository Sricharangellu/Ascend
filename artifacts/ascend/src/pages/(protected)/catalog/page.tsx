
import { useEffect, useState } from "react";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { apiGet } from "@/api-client/client";
import type { Category, CategoriesResponse } from "@/api-client/types";
import { ProductsTab } from "./_components/ProductsTab";
import { CategoriesTab } from "./_components/CategoriesTab";

type Tab = "products" | "categories";

const TABS: { label: string; value: Tab }[] = [
  { label: "Products",   value: "products"   },
  { label: "Categories", value: "categories" },
];

export default function CatalogPage() {
  const [tab, setTab]             = useState<Tab>("products");
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    apiGet<CategoriesResponse>("/api/v1/catalog/categories")
      .then((d) => setCategories(d.items ?? []))
      .catch(() => {/* non-fatal */});
  }, []);

  return (
    <EnterpriseShell
      active="catalog"
      title="Catalog"
      subtitle="Products and category management"
      contentClassName="overflow-y-auto"
    >
      <div className="mx-auto w-full max-w-6xl space-y-4 px-5 py-5 sm:px-6">

        {/* ── Page header ──────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4" style={{ borderColor: "var(--color-border)" }}>
          <div>
            <h1 className="text-[20px] font-bold tracking-tight" style={{ color: "var(--color-text-primary)" }}>Catalog</h1>
            <p className="mt-0.5 text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
              Manage products, pricing, and categories.
            </p>
          </div>
        </div>

        {/* ── Tab bar ──────────────────────────────────────────────────── */}
        <div
          className="flex gap-0 border-b"
          role="tablist"
          aria-label="Catalog sections"
          style={{ borderColor: "var(--color-border)" }}
        >
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={tab === t.value}
              onClick={() => setTab(t.value)}
              className={[
                "relative px-4 py-2.5 text-[13px] font-medium transition-colors duration-150",
                "after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:rounded-full after:transition-all",
                tab === t.value
                  ? "text-brand-600 after:bg-brand-600"
                  : "after:bg-transparent hover:after:bg-[var(--color-border)]",
              ].join(" ")}
              style={{ color: tab === t.value ? undefined : "var(--color-text-secondary)" }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "products"   && <ProductsTab   categories={categories} />}
        {tab === "categories" && <CategoriesTab />}
      </div>
    </EnterpriseShell>
  );
}
