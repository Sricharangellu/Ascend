"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { apiGet, apiPost, ApiResponseError } from "@/api-client/client";
import type { CatalogProduct } from "@/api-client/types";
import { GeneralTab } from "./_components/GeneralTab";
import { InventoryTab } from "./_components/InventoryTab";
import { MarketingTab } from "./_components/MarketingTab";

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = "general" | "inventory" | "marketing";

const STATUS_BADGE = { active: "green", draft: "yellow", archived: "gray" } as const;

const TABS: { key: Tab; label: string }[] = [
  { key: "general",   label: "General" },
  { key: "inventory", label: "Inventory" },
  { key: "marketing", label: "Marketing" },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [product, setProduct] = useState<CatalogProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("general");
  const [duplicating, setDuplicating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const prod = await apiGet<CatalogProduct>(`/api/v1/catalog/${id}`);
      setProduct(prod);
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : "Failed to load product.");
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const handleDuplicate = async () => {
    if (!product) return;
    setDuplicating(true);
    try {
      const copy = await apiPost<CatalogProduct>(`/api/v1/catalog/${id}/duplicate`, {});
      router.push(`/catalog/${copy.id}`);
    } catch { /* ignore — button re-enables */ }
    finally { setDuplicating(false); }
  };

  if (loading) {
    return (
      <EnterpriseShell active="catalog" title="Product" subtitle="Loading…" contentClassName="overflow-y-auto">
        <div className="mx-auto max-w-4xl space-y-4 px-4 py-5 sm:px-6">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-100" />)}
        </div>
      </EnterpriseShell>
    );
  }

  if (error || !product) {
    return (
      <EnterpriseShell active="catalog" title="Product" subtitle="Not found" contentClassName="overflow-y-auto">
        <div className="mx-auto max-w-4xl px-4 py-5 sm:px-6">
          <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error ?? "Product not found."}</p>
          <Button variant="secondary" size="sm" onClick={() => router.back()} className="mt-4">← Back</Button>
        </div>
      </EnterpriseShell>
    );
  }

  return (
    <EnterpriseShell active="catalog" title={product.name} subtitle={product.sku} contentClassName="overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-4 py-5 sm:px-6">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="text-gray-400 transition-colors hover:text-gray-600"
              aria-label="Back to catalog"
            >
              ←
            </button>
            <Badge variant={STATUS_BADGE[product.status]}>{product.status}</Badge>
            <Badge variant="gray">{product.tax_class === "exempt" ? "Tax exempt" : "Standard tax"}</Badge>
          </div>
          <Button size="sm" variant="secondary" loading={duplicating} onClick={() => void handleDuplicate()}>
            Duplicate
          </Button>
        </div>

        {/* ── Tab nav ─────────────────────────────────────────────────────── */}
        <div className="mb-5 flex gap-0 border-b border-slate-200">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === key
                  ? "border-b-2 border-[#5D5FEF] text-[#5D5FEF]"
                  : "border-b-2 border-transparent text-slate-500 hover:text-[#111]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Tab content ─────────────────────────────────────────────────── */}
        {activeTab === "general" && (
          <GeneralTab product={product} onSaved={setProduct} />
        )}
        {activeTab === "inventory" && (
          <InventoryTab product={product} onSaved={setProduct} />
        )}
        {activeTab === "marketing" && (
          <MarketingTab product={product} onSaved={setProduct} />
        )}

      </div>
    </EnterpriseShell>
  );
}
