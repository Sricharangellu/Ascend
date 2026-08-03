"use client";

import { useEffect, useState } from "react";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { apiGet } from "@/api-client/client";
import type { Category, CategoriesResponse } from "@/api-client/types";
import { ProductsTab } from "./_components/ProductsTab";
import { CategoriesTab } from "./_components/CategoriesTab";

type Tab = "products" | "categories";

export default function CatalogPage() {
  const [tab, setTab] = useState<Tab>("products");
  const [categories, setCategories] = useState<Category[]>([]);

  // Pre-load categories so ProductsTab can use them for the filter dropdown
  useEffect(() => {
    apiGet<CategoriesResponse>("/api/v1/catalog/categories")
      .then((d) => setCategories(d.items ?? []))
      .catch(() => {/* non-fatal */});
  }, []);

  const tabCls = (t: Tab) =>
    `px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
      tab === t
        ? "border-blue-600 text-blue-600"
        : "border-transparent text-slate-500 hover:text-slate-700"
    }`;

  return (
    <EnterpriseShell
      active="catalog"
      title="Catalog"
      subtitle="Products and category management"
      contentClassName="overflow-y-auto"
    >
      <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-5 sm:px-6">
        <div className="flex gap-1 border-b border-slate-200">
          <button type="button" onClick={() => setTab("products")} className={tabCls("products")}>
            Products
          </button>
          <button type="button" onClick={() => setTab("categories")} className={tabCls("categories")}>
            Categories
          </button>
        </div>

        {tab === "products"   && <ProductsTab   categories={categories} />}
        {tab === "categories" && <CategoriesTab />}
      </div>
    </EnterpriseShell>
  );
}
