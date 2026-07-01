"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { apiGet, ApiResponseError } from "@/api-client/client";
import type { CatalogProduct } from "@/api-client/types";
import { GeneralTab } from "./_components/GeneralTab";
import { CategoriesTab } from "./_components/CategoriesTab";
import { PricingTab } from "./_components/PricingTab";
import { VariantsTab } from "./_components/VariantsTab";

type DetailTab = "general" | "categories" | "pricing" | "variants";

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const productId = params?.id as string;

  const [product, setProduct] = useState<CatalogProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>("general");

  const loadProduct = useCallback(() => {
    const controller = new AbortController();
    setLoading(true);
    apiGet<CatalogProduct>(`/api/v1/catalog/${productId}`, { signal: controller.signal })
      .then((data) => { setProduct(data); setError(null); })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof ApiResponseError ? err.message : "Could not load product.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return controller;
  }, [productId]);

  useEffect(() => {
    const controller = loadProduct();
    return () => controller.abort();
  }, [loadProduct]);

  if (loading) {
    return (
      <EnterpriseShell active="inventory" title="Product" subtitle="Loading..." contentClassName="overflow-y-auto">
        <div className="p-6 text-sm text-slate-500">Loading...</div>
      </EnterpriseShell>
    );
  }

  if (error || !product) {
    return (
      <EnterpriseShell active="inventory" title="Product" subtitle="Error" contentClassName="overflow-y-auto">
        <div className="p-6 text-sm text-danger-700" role="alert">{error ?? "Product not found."}</div>
      </EnterpriseShell>
    );
  }

  // Suppress unused warning for router (keep for future navigate-away use)
  void router;

  return (
    <EnterpriseShell
      active="inventory"
      title={product.name}
      subtitle={`SKU: ${product.sku} · ${product.status}`}
      contentClassName="overflow-y-auto"
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-6">
        {/* Back */}
        <div>
          <Link href="/inventory" className="inline-flex items-center gap-1 text-sm text-slate-950 hover:underline">
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Back to Inventory
          </Link>
        </div>

        {/* Tab nav */}
        <div className="flex gap-1 border-b border-slate-200">
          {(["general", "categories", "pricing", "variants"] as DetailTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={[
                "border-b-2 px-4 py-2.5 text-sm font-medium capitalize transition-colors",
                activeTab === tab
                  ? "border-slate-950 text-slate-950"
                  : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700",
              ].join(" ")}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === "general" && (
          <GeneralTab product={product} onSaved={(updated) => setProduct(updated)} />
        )}
        {activeTab === "categories" && (
          <CategoriesTab productId={productId} />
        )}
        {activeTab === "pricing" && (
          <PricingTab product={product} onSaved={(updated) => setProduct(updated)} />
        )}
        {activeTab === "variants" && (
          <VariantsTab product={product} />
        )}
      </div>
    </EnterpriseShell>
  );
}
