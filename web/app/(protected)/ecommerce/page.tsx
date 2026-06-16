"use client";

import { useCallback, useEffect, useState } from "react";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { Card } from "@/components/Card";
import { formatMoney } from "@/lib/money";
import { apiGet } from "@/api-client/client";

interface CatalogItem { id: string; sku: string; name: string; price_cents: number; category: string; }

export default function EcommercePage() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    try {
      setError(null);
      const r = await apiGet<{ items: CatalogItem[] }>("/api/v1/catalog?limit=500&status=active");
      const all = r.items ?? [];
      setItems(q ? all.filter(p => p.name.toLowerCase().includes(q.toLowerCase()) || p.sku.toLowerCase().includes(q.toLowerCase())) : all);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load catalog");
    }
  }, [q]);

  useEffect(() => { void load(); }, [load]);

  return (
    <EnterpriseShell active="ecommerce" title="Ecommerce" subtitle="Online storefront catalog" contentClassName="overflow-y-auto">
      <div className="mx-auto w-full max-w-7xl space-y-5 px-4 py-5 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-950">Storefront catalog</h1>
            <p className="mt-1 text-sm text-slate-500">Review active products available for online merchandising.</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Published items</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-slate-950">{items.length}</p>
          </div>
        </div>
        {error && <div className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}
        <Card title="Online Catalog" description="Products flagged for ecommerce appear in the storefront." noPadding>
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search online products…"
              className="min-h-[44px] w-full max-w-sm rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-slate-950 focus:ring-2 focus:ring-slate-950"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  <th className="px-5 py-3">SKU</th><th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Category</th><th className="px-5 py-3 text-right">Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.length === 0 && <tr><td colSpan={4} className="px-5 py-8 text-center text-slate-500">No products published online yet</td></tr>}
                {items.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-5 py-3 font-mono text-xs font-semibold text-slate-700">{p.sku}</td>
                    <td className="px-4 py-3 font-medium text-slate-950">{p.name}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">{p.category}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-right font-semibold tabular-nums text-slate-950">{formatMoney(p.price_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </EnterpriseShell>
  );
}
