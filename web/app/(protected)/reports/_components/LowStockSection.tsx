"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/api-client/client";
import type { LowStockItem } from "@/api-client/types";
import { exportCsv, Skeleton, SectionHeader } from "./reportHelpers";
import { Card } from "@/components/Card";

export function LowStockSection() {
  const [items, setItems]   = useState<LowStockItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiGet<{ items: LowStockItem[] }>("/api/v1/inventory/levels?lowStock=true&limit=50")
      .then((d) => {
        if (!cancelled) {
          setItems((d.items ?? []).filter((i) => i.stock_qty <= i.reorder_pt && i.reorder_pt > 0));
          setLoading(false);
        }
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleExport = () =>
    exportCsv("low-stock.csv", [
      ["SKU", "Name", "Category", "On Hand", "Reorder Point", "Shortage"],
      ...items.map((r) => [r.sku, r.name, r.category, String(r.stock_qty),
        String(r.reorder_pt), String(r.reorder_pt - r.stock_qty)]),
    ]);

  return (
    <Card className="overflow-hidden p-0">
      <div className="px-5 pt-5 pb-2">
        <SectionHeader title="Low Stock SKUs" subtitle="Products at or below their reorder point"
          onExport={items.length > 0 ? handleExport : undefined} />
      </div>
      {loading ? (
        <div className="px-5 pb-5 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="px-5 pb-5 flex items-center gap-2 text-sm text-slate-500">
          <span className="text-emerald-500 text-base">✓</span>
          All products are above their reorder points.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 border-y border-slate-100">
              <tr className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-[0.07em]">
                <th className="px-4 py-2.5">Product</th>
                <th className="px-4 py-2.5">Category</th>
                <th className="px-4 py-2.5 text-right">On Hand</th>
                <th className="px-4 py-2.5 text-right">Reorder Pt</th>
                <th className="px-4 py-2.5 text-right">Shortage</th>
                <th className="px-4 py-2.5 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {items.map((row) => {
                const shortage = row.reorder_pt - row.stock_qty;
                const isOut    = row.stock_qty === 0;
                return (
                  <tr key={row.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-slate-900">{row.name}</p>
                      <p className="text-[11px] text-slate-400 font-mono">{row.sku}</p>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{row.category}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-amber-700">{row.stock_qty}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{row.reorder_pt}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-red-600 font-medium">{shortage}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        isOut ? "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200"
                              : "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200"
                      }`}>
                        {isOut ? "Out of stock" : "Low stock"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
