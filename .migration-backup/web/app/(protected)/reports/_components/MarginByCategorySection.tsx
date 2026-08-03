"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/api-client/client";
import { formatMoney } from "@/lib/money";
import type { MarginByCategoryItem, MarginByCategoryResponse } from "@/api-client/types";
import { exportCsv, Skeleton, SectionHeader } from "./reportHelpers";
import { Card } from "@/components/Card";

export function MarginByCategorySection({ range }: { range: string }) {
  const [items, setItems]   = useState<MarginByCategoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiGet<MarginByCategoryResponse>(`/api/v1/reports/margin-by-category?range=${range}`)
      .then((d) => { if (!cancelled) { setItems(d.items ?? []); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range]);

  const sorted = [...items].sort((a, b) => b.marginPct - a.marginPct);

  const handleExport = () =>
    exportCsv(`margin-by-category-${range}.csv`, [
      ["Category", "Units", "Revenue", "Cost", "Margin %"],
      ...sorted.map((r) => [r.category, String(r.units),
        String((r.revenueCents / 100).toFixed(2)), String((r.costCents / 100).toFixed(2)),
        String(r.marginPct)]),
    ]);

  return (
    <Card>
      <SectionHeader title="Margin by Category" subtitle="Gross margin % per product category"
        onExport={items.length > 0 ? handleExport : undefined} />
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
        </div>
      ) : sorted.length === 0 ? (
        <p className="text-sm text-slate-500">No data available.</p>
      ) : (
        <div className="space-y-4">
          {sorted.map((row) => (
            <div key={row.category}>
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-sm font-medium text-slate-800">{row.category}</span>
                <div className="flex items-baseline gap-4">
                  <span className="text-xs text-slate-400">{formatMoney(row.revenueCents)} rev</span>
                  <span className={`font-semibold text-sm tabular-nums ${row.marginPct >= 50 ? "text-emerald-600" : row.marginPct >= 35 ? "text-slate-800" : "text-amber-600"}`}>
                    {row.marginPct}%
                  </span>
                </div>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${row.marginPct >= 50 ? "bg-emerald-500" : row.marginPct >= 35 ? "bg-blue-500" : "bg-amber-500"}`}
                  style={{ width: `${Math.min(row.marginPct, 100)}%` }}
                  aria-label={`${row.category}: ${row.marginPct}% margin`}
                />
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                {row.units.toLocaleString()} units · cost {formatMoney(row.costCents)}
              </p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
