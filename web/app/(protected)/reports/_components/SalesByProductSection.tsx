"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/api-client/client";
import { formatMoney } from "@/lib/money";
import type { SalesByProductItem, SalesByProductResponse } from "@/api-client/types";
import { exportCsv, Skeleton, SectionHeader } from "./reportHelpers";
import { Card } from "@/components/Card";

type SortKey = "name" | "units" | "revenueCents" | "costCents" | "marginPct";
type SortDir  = "asc" | "desc";

export function SalesByProductSection({ range }: { range: string }) {
  const [items, setItems]   = useState<SalesByProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("revenueCents");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiGet<SalesByProductResponse>(`/api/v1/reports/sales-by-product?range=${range}`)
      .then((d) => { if (!cancelled) { setItems(d.items ?? []); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range]);

  const sorted = [...items].sort((a, b) => {
    const mul = sortDir === "asc" ? 1 : -1;
    if (sortKey === "name") return mul * a.name.localeCompare(b.name);
    return mul * (a[sortKey] - b[sortKey]);
  });

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  const Indicator = ({ k }: { k: SortKey }) => (
    <span className="ml-1 opacity-40 text-[10px]">
      {sortKey === k ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}
    </span>
  );

  const handleExport = () =>
    exportCsv(`sales-by-product-${range}.csv`, [
      ["SKU", "Name", "Category", "Units", "Revenue", "Cost", "Margin %"],
      ...sorted.map((r) => [r.sku, r.name, r.category, String(r.units),
        String((r.revenueCents / 100).toFixed(2)), String((r.costCents / 100).toFixed(2)),
        String(r.marginPct)]),
    ]);

  return (
    <Card className="overflow-hidden p-0">
      <div className="px-5 pt-5 pb-2">
        <SectionHeader title="Sales by Product" subtitle="Top 20 SKUs — click column headers to sort"
          onExport={items.length > 0 ? handleExport : undefined} />
      </div>
      {loading ? (
        <div className="px-5 pb-5 space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9" />)}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 border-y border-slate-100">
              <tr className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-[0.07em]">
                <th className="px-4 py-2.5 w-7">#</th>
                <th className="px-4 py-2.5 cursor-pointer select-none hover:text-slate-800 transition-colors" onClick={() => toggleSort("name")}>
                  Product <Indicator k="name" />
                </th>
                <th className="px-4 py-2.5">Category</th>
                <th className="px-4 py-2.5 text-right cursor-pointer select-none hover:text-slate-800 transition-colors" onClick={() => toggleSort("units")}>
                  Units <Indicator k="units" />
                </th>
                <th className="px-4 py-2.5 text-right cursor-pointer select-none hover:text-slate-800 transition-colors" onClick={() => toggleSort("revenueCents")}>
                  Revenue <Indicator k="revenueCents" />
                </th>
                <th className="px-4 py-2.5 text-right cursor-pointer select-none hover:text-slate-800 transition-colors" onClick={() => toggleSort("marginPct")}>
                  Margin <Indicator k="marginPct" />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {sorted.map((row, idx) => (
                <tr key={row.productId} className="hover:bg-slate-50/70 transition-colors">
                  <td className="px-4 py-2.5 text-xs text-slate-400 tabular-nums">{idx + 1}</td>
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-slate-900 leading-tight">{row.name}</p>
                    <p className="text-[11px] text-slate-400 font-mono">{row.sku}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{row.category}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{row.units.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium text-slate-900">{formatMoney(row.revenueCents)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    <span className={`font-semibold ${row.marginPct >= 50 ? "text-emerald-600" : row.marginPct >= 35 ? "text-slate-700" : "text-amber-600"}`}>
                      {row.marginPct}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
