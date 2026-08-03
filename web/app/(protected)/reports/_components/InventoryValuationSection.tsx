"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/api-client/client";
import { formatMoney } from "@/lib/money";
import type { InventoryValuationResponse } from "@/api-client/types";
import { exportCsv, Skeleton, SectionHeader } from "./reportHelpers";
import { Card } from "@/components/Card";

export function InventoryValuationSection() {
  const [data, setData]     = useState<InventoryValuationResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiGet<InventoryValuationResponse>("/api/v1/reports/inventory-valuation")
      .then((d) => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleExport = () => {
    if (!data) return;
    exportCsv("inventory-valuation.csv", [
      ["Product", "Stock Qty", "Cost/unit", "Retail/unit", "Total Cost", "Total Retail"],
      ...data.rows.map((r) => [r.name, String(r.stockQty),
        String((r.costCents / 100).toFixed(2)), String((r.retailCents / 100).toFixed(2)),
        String((r.costValueCents / 100).toFixed(2)), String((r.retailValueCents / 100).toFixed(2))]),
    ]);
  };

  return (
    <Card className="overflow-hidden p-0">
      <div className="px-5 pt-5 pb-2">
        <SectionHeader title="Inventory Valuation" subtitle="Stock cost value on hand"
          onExport={data && data.rows.length > 0 ? handleExport : undefined} />
        {data && (
          <div className="flex flex-wrap gap-6 mb-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Cost Value</p>
              <p className="text-xl font-semibold tabular-nums text-slate-950">{formatMoney(data.totalCostCents)}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Retail Value</p>
              <p className="text-xl font-semibold tabular-nums text-slate-700">{formatMoney(data.totalRetailCents)}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Potential Margin</p>
              <p className="text-xl font-semibold tabular-nums text-emerald-600">
                {data.totalRetailCents > 0
                  ? `${Math.round(((data.totalRetailCents - data.totalCostCents) / data.totalRetailCents) * 100)}%`
                  : "—"}
              </p>
            </div>
          </div>
        )}
      </div>
      {loading ? (
        <div className="px-5 pb-5 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9" />)}
        </div>
      ) : !data || data.rows.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-slate-500">No inventory data.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 border-y border-slate-100">
              <tr className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-[0.07em]">
                <th className="px-4 py-2.5">Product</th>
                <th className="px-4 py-2.5 text-right">On Hand</th>
                <th className="px-4 py-2.5 text-right">Cost/unit</th>
                <th className="px-4 py-2.5 text-right">Retail/unit</th>
                <th className="px-4 py-2.5 text-right">Cost Value</th>
                <th className="px-4 py-2.5 text-right">Retail Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {data.rows.map((row) => (
                <tr key={row.productId} className="hover:bg-slate-50/70 transition-colors">
                  <td className="px-4 py-2.5 font-medium text-slate-900">{row.name}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{row.stockQty.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{formatMoney(row.costCents)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{formatMoney(row.retailCents)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium text-slate-900">{formatMoney(row.costValueCents)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-slate-900">{formatMoney(row.retailValueCents)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                <td colSpan={4} className="px-4 py-2.5 text-slate-700 text-sm">Totals</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-950 text-sm">{formatMoney(data.totalCostCents)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-950 text-sm">{formatMoney(data.totalRetailCents)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Card>
  );
}
