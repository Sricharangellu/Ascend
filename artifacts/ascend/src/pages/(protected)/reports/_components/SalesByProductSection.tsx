
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
          <table className="min-w-full text-[13px]">
            <thead style={{ backgroundColor: "var(--color-table-header)", borderTop: "1px solid var(--color-border)", borderBottom: "1px solid var(--color-border)" }}>
              <tr className="text-left text-[10px] font-semibold uppercase tracking-[0.07em]"
                style={{ color: "var(--color-text-secondary)" }}>
                <th className="px-4 py-2.5 w-7">#</th>
                <th className="px-4 py-2.5 cursor-pointer select-none transition-colors hover:text-[var(--color-text-primary)]" onClick={() => toggleSort("name")}>
                  Product <Indicator k="name" />
                </th>
                <th className="px-4 py-2.5">Category</th>
                <th className="px-4 py-2.5 text-right cursor-pointer select-none transition-colors hover:text-[var(--color-text-primary)]" onClick={() => toggleSort("units")}>
                  Units <Indicator k="units" />
                </th>
                <th className="px-4 py-2.5 text-right cursor-pointer select-none transition-colors hover:text-[var(--color-text-primary)]" onClick={() => toggleSort("revenueCents")}>
                  Revenue <Indicator k="revenueCents" />
                </th>
                <th className="px-4 py-2.5 text-right cursor-pointer select-none transition-colors hover:text-[var(--color-text-primary)]" onClick={() => toggleSort("marginPct")}>
                  Margin <Indicator k="marginPct" />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-table-border)]">
              {sorted.map((row, idx) => (
                <tr key={row.productId} className="transition-colors hover:bg-[var(--color-table-row-hover)]">
                  <td className="px-4 py-2.5 text-[11px] tabular-nums" style={{ color: "var(--color-text-muted)" }}>{idx + 1}</td>
                  <td className="px-4 py-2.5">
                    <p className="font-medium leading-tight" style={{ color: "var(--color-text-primary)" }}>{row.name}</p>
                    <p className="text-[11px] font-mono" style={{ color: "var(--color-text-muted)" }}>{row.sku}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="inline-block rounded-full px-2 py-0.5 text-[11px] font-medium"
                      style={{ backgroundColor: "var(--color-surface-subtle)", color: "var(--color-text-secondary)" }}>
                      {row.category}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: "var(--color-text-secondary)" }}>{row.units.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium" style={{ color: "var(--color-text-primary)" }}>{formatMoney(row.revenueCents)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    <span className={`font-semibold ${row.marginPct >= 50 ? "text-emerald-600" : row.marginPct >= 35 ? "" : "text-amber-600"}`}
                      style={row.marginPct >= 35 && row.marginPct < 50 ? { color: "var(--color-text-secondary)" } : {}}>
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
