
/**
 * /reports/inventory — Inventory valuation report.
 * Shows summary cards and a per-SKU breakdown with cost and retail values.
 */

import { useEffect, useState } from "react";
import { apiGet, ApiResponseError } from "@/api-client/client";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { Card } from "@/components/Card";
import { formatMoney } from "@/lib/money";
import { ReportsSubNav } from "@/components/reports/ReportsSubNav";

// ─── Types ────────────────────────────────────────────────────────────────────

interface InventoryItem {
  category: string;
  sku: string;
  name: string;
  onHand: number;
  costCents: number;
  retailCents: number;
  totalCostCents: number;
  totalRetailCents: number;
}

interface InventorySummary {
  totalCostCents: number;
  totalRetailCents: number;
  totalItems: number;
}

interface InventoryValuationResponse {
  items: InventoryItem[];
  summary: InventorySummary;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <div className="animate-skeleton rounded-xl border p-5 shadow-[var(--shadow-sm)]"
      style={{ borderColor: "var(--color-border)" }}>
      <div className="mb-2 h-3 w-20 animate-skeleton rounded" />
      <div className="h-7 w-32 animate-skeleton rounded" />
    </div>
  );
}

function TableSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading data" className="space-y-2 px-1 py-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex gap-4">
          {Array.from({ length: 8 }).map((__, j) => (
            <div key={j} className="h-5 flex-1 animate-skeleton rounded" style={{ opacity: 1 - i * 0.1 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Summary card ─────────────────────────────────────────────────────────────

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border p-5 shadow-[var(--shadow-sm)]"
      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em]"
        style={{ color: "var(--color-text-secondary)" }}>{label}</p>
      <p className="mt-1 text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>{value}</p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InventoryReportPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const data = await apiGet<InventoryValuationResponse>(
          "/api/v1/reports/inventory-valuation"
        );
        if (!cancelled) {
          setItems(data.items ?? []);
          const s = data.summary ?? {};
          setSummary({
            totalCostCents: s.totalCostCents ?? 0,
            totalRetailCents: s.totalRetailCents ?? 0,
            totalItems: s.totalItems ?? (data.items?.length ?? 0),
          });
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiResponseError
              ? err.message
              : "Failed to load inventory valuation."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  return (
    <EnterpriseShell
      active="reports"
      title="Inventory Report"
      subtitle="Inventory valuation · Demo Store"
      contentClassName="overflow-y-auto"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-6 space-y-6">
        <ReportsSubNav />
        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <CardSkeleton /><CardSkeleton /><CardSkeleton />
          </div>
        ) : error ? (
          <Card>
            <p role="alert" className="text-[13px] text-red-600">{error}</p>
          </Card>
        ) : summary ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <SummaryCard label="Total SKUs" value={summary.totalItems.toLocaleString()} />
            <SummaryCard label="Total Cost Value" value={formatMoney(summary.totalCostCents)} />
            <SummaryCard label="Total Retail Value" value={formatMoney(summary.totalRetailCents)} />
          </div>
        ) : null}

        <Card title="Inventory Valuation" noPadding>
          <div className="p-5">
            {loading ? (
              <TableSkeleton />
            ) : error ? null : items.length === 0 ? (
              <p className="text-[13px]" style={{ color: "var(--color-text-muted)" }}>No inventory data available.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-left text-[10px] font-semibold uppercase tracking-[0.06em]"
                      style={{ borderBottom: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}>
                      <th className="pb-2 pr-4">SKU</th>
                      <th className="pb-2 pr-4">Name</th>
                      <th className="pb-2 pr-4">Category</th>
                      <th className="pb-2 pr-4 text-right">On Hand</th>
                      <th className="pb-2 pr-4 text-right">Cost/unit</th>
                      <th className="pb-2 pr-4 text-right">Retail/unit</th>
                      <th className="pb-2 pr-4 text-right">Total Cost</th>
                      <th className="pb-2 text-right">Total Retail</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-table-border)]">
                    {items.map((item) => (
                      <tr key={item.sku} className="transition-colors hover:bg-[var(--color-table-row-hover)]">
                        <td className="py-2.5 pr-4 font-mono text-[11px]" style={{ color: "var(--color-text-secondary)" }}>{item.sku}</td>
                        <td className="py-2.5 pr-4 font-medium" style={{ color: "var(--color-text-primary)" }}>{item.name}</td>
                        <td className="py-2.5 pr-4" style={{ color: "var(--color-text-secondary)" }}>{item.category}</td>
                        <td className="py-2.5 pr-4 text-right" style={{ color: "var(--color-text-secondary)" }}>{item.onHand}</td>
                        <td className="py-2.5 pr-4 text-right" style={{ color: "var(--color-text-secondary)" }}>{formatMoney(item.costCents)}</td>
                        <td className="py-2.5 pr-4 text-right" style={{ color: "var(--color-text-secondary)" }}>{formatMoney(item.retailCents)}</td>
                        <td className="py-2.5 pr-4 text-right font-medium" style={{ color: "var(--color-text-primary)" }}>{formatMoney(item.totalCostCents)}</td>
                        <td className="py-2.5 text-right font-semibold" style={{ color: "var(--color-text-primary)" }}>{formatMoney(item.totalRetailCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                  {summary && (
                    <tfoot>
                      <tr className="font-semibold"
                        style={{ borderTop: "2px solid var(--color-border)", backgroundColor: "var(--color-table-header)" }}>
                        <td colSpan={6} className="py-2.5 pr-4" style={{ color: "var(--color-text-secondary)" }}>Totals</td>
                        <td className="py-2.5 pr-4 text-right" style={{ color: "var(--color-text-primary)" }}>{formatMoney(summary.totalCostCents)}</td>
                        <td className="py-2.5 text-right" style={{ color: "var(--color-text-primary)" }}>{formatMoney(summary.totalRetailCents)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>
        </Card>
      </div>
    </EnterpriseShell>
  );
}
