
/**
 * /reports/sales-by-vendor — Sales performance by vendor.
 */

import { useEffect, useState } from "react";
import { apiGet, ApiResponseError } from "@/api-client/client";
import { getUser } from "@/lib/auth";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { Card } from "@/components/Card";
import { formatMoney } from "@/lib/money";
import { ReportsSubNav } from "@/components/reports/ReportsSubNav";

type Range = "today" | "7d" | "30d";

interface VendorItem {
  vendorId: string; vendorName: string; orderCount: number; revenueCents: number; unitsSold: number;
}

function RangeToggle({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  const labels: Record<Range, string> = { today: "Today", "7d": "7 days", "30d": "30 days" };
  return (
    <div className="inline-flex rounded-xl border p-1 shadow-[var(--shadow-sm)]"
      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
      {(["today", "7d", "30d"] as const).map((r) => (
        <button key={r} type="button" onClick={() => onChange(r)}
          className={`min-h-[38px] rounded-lg px-4 text-[13px] font-medium transition-colors ${
            value === r ? "bg-brand-600 text-white" : "hover:bg-[var(--color-surface-subtle)]"
          }`}
          style={value !== r ? { color: "var(--color-text-secondary)" } : {}}>
          {labels[r]}
        </button>
      ))}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading sales by vendor data" className="space-y-2 px-1 py-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-4">
          {Array.from({ length: 4 }).map((__, j) => (
            <div key={j} className="h-5 flex-1 animate-skeleton rounded" style={{ opacity: 1 - i * 0.15 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export default function SalesByVendorPage() {
  const [range, setRange] = useState<Range>("today");
  const [items, setItems] = useState<VendorItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const role = getUser()?.role ?? "cashier";
  const allowed = role === "owner" || role === "manager";
  const rangeLabel = range === "today" ? "Today" : range === "7d" ? "Last 7 days" : "Last 30 days";

  useEffect(() => {
    if (!allowed) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true); setError(null);
    (async () => {
      try {
        const data = await apiGet<{ items: VendorItem[] }>(`/api/v1/reports/sales-by-vendor?range=${range}`);
        if (!cancelled) setItems([...(data.items ?? [])].sort((a, b) => b.revenueCents - a.revenueCents));
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiResponseError ? err.message : "Failed to load sales by vendor report.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [allowed, range]);

  const totalOrders = items.reduce((s, v) => s + v.orderCount, 0);
  const totalRevenue = items.reduce((s, v) => s + v.revenueCents, 0);
  const totalUnits = items.reduce((s, v) => s + v.unitsSold, 0);

  return (
    <EnterpriseShell active="reports" title="Sales by Vendor"
      subtitle={`Sales by vendor · Demo Store · ${rangeLabel}`} contentClassName="overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-5 sm:px-6">
        <div className="border-b pb-4" style={{ borderColor: "var(--color-border)" }}>
          <div className="mb-3">
            <h1 className="text-[20px] font-bold tracking-tight" style={{ color: "var(--color-text-primary)" }}>Sales by Vendor</h1>
            <p className="mt-1 text-[13px]" style={{ color: "var(--color-text-secondary)" }}>Revenue and units sold broken down by vendor / supplier.</p>
          </div>
          <ReportsSubNav />
        </div>

        {!allowed ? (
          <Card><p role="alert" className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
            You don&apos;t have access to reports. Ask an owner or manager.
          </p></Card>
        ) : (
          <>
            <RangeToggle value={range} onChange={setRange} />
            <Card noPadding>
              <div className="p-5">
                {loading ? <TableSkeleton />
                : error ? <p role="alert" className="text-[13px] text-red-600">{error}</p>
                : items.length === 0 ? (
                  <p className="text-[13px]" style={{ color: "var(--color-text-muted)" }}>No sales data for this period.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[13px]">
                      <thead>
                        <tr className="text-left text-[10px] font-semibold uppercase tracking-[0.06em]"
                          style={{ borderBottom: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}>
                          <th className="pb-2 pr-4">#</th>
                          <th className="pb-2 pr-4">Vendor</th>
                          <th className="pb-2 pr-4 text-right">Orders</th>
                          <th className="pb-2 pr-4 text-right">Revenue</th>
                          <th className="pb-2 text-right">Units Sold</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--color-table-border)]">
                        {items.map((item, idx) => (
                          <tr key={item.vendorId} className="transition-colors hover:bg-[var(--color-table-row-hover)]">
                            <td className="py-2.5 pr-4" style={{ color: "var(--color-text-muted)" }}>{idx + 1}</td>
                            <td className="py-2.5 pr-4 font-medium" style={{ color: "var(--color-text-primary)" }}>{item.vendorName}</td>
                            <td className="py-2.5 pr-4 text-right" style={{ color: "var(--color-text-secondary)" }}>{item.orderCount}</td>
                            <td className="py-2.5 pr-4 text-right font-semibold" style={{ color: "var(--color-text-primary)" }}>{formatMoney(item.revenueCents)}</td>
                            <td className="py-2.5 text-right" style={{ color: "var(--color-text-secondary)" }}>{item.unitsSold.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="font-semibold" style={{ borderTop: "2px solid var(--color-border)", backgroundColor: "var(--color-table-header)", color: "var(--color-text-primary)" }}>
                          <td className="py-2.5 pr-4" />
                          <td className="py-2.5 pr-4">Total</td>
                          <td className="py-2.5 pr-4 text-right">{totalOrders}</td>
                          <td className="py-2.5 pr-4 text-right">{formatMoney(totalRevenue)}</td>
                          <td className="py-2.5 text-right">{totalUnits.toLocaleString()}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            </Card>
          </>
        )}
      </div>
    </EnterpriseShell>
  );
}
