"use client";

/**
 * /reports/inventory — Inventory valuation report.
 * Shows summary cards and a per-SKU breakdown with cost and retail values.
 *
 * Contract: GET /api/v1/reports/inventory-valuation →
 *   { rows, totalCostCents, totalRetailCents, total? }
 * (same shape InventoryValuationSection already uses). A prior local type with
 * `items` / `summary` never matched — the dedicated page rendered empty forever.
 */

import { useEffect, useState } from "react";
import { apiGet, ApiResponseError } from "@/api-client/client";
import type { InventoryValuationResponse, InventoryValuationRow } from "@/api-client/types";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { formatMoney } from "@/lib/money";
import { ReportsSubNav } from "@/components/reports/ReportsSubNav";

function CardSkeleton() {
  return (
    <div className="animate-pulse rounded-md border border-erp-table-border bg-white p-5 shadow-sm">
      <div className="mb-2 h-3 w-20 rounded bg-erp-table-header" />
      <div className="h-7 w-32 rounded bg-erp-table-header" />
    </div>
  );
}

function TableSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading data" className="animate-pulse space-y-2 px-1 py-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex gap-4">
          {Array.from({ length: 6 }).map((__, j) => (
            <div
              key={j}
              className="h-5 flex-1 rounded bg-erp-table-header"
              style={{ opacity: 1 - i * 0.1 }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-md border border-erp-table-border bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-erp-text-secondary">{label}</p>
      <p className="mt-1 text-2xl font-bold text-erp-text-primary">{value}</p>
    </div>
  );
}

export default function InventoryReportPage() {
  const [rows, setRows] = useState<InventoryValuationRow[]>([]);
  const [totalCostCents, setTotalCostCents] = useState(0);
  const [totalRetailCents, setTotalRetailCents] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const data = await apiGet<InventoryValuationResponse>(
          "/api/v1/reports/inventory-valuation",
        );
        if (!cancelled) {
          setRows(data.rows ?? []);
          setTotalCostCents(data.totalCostCents ?? 0);
          setTotalRetailCents(data.totalRetailCents ?? 0);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiResponseError
              ? err.message
              : "Failed to load inventory valuation.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const marginPct =
    totalRetailCents > 0
      ? Math.round(((totalRetailCents - totalCostCents) / totalRetailCents) * 100)
      : null;

  return (
    <EnterpriseShell
      active="reports"
      title="Inventory Report"
      subtitle="Inventory valuation"
      contentClassName="overflow-y-auto"
    >
      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6">
        <ReportsSubNav />
        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : error ? (
          <Card>
            <p role="alert" className="text-sm text-danger-700">
              {error}
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <SummaryCard label="SKUs with stock" value={rows.length.toLocaleString()} />
            <SummaryCard label="Total Cost Value" value={formatMoney(totalCostCents)} />
            <SummaryCard
              label="Total Retail Value"
              value={`${formatMoney(totalRetailCents)}${marginPct != null ? ` · ${marginPct}% pot. margin` : ""}`}
            />
          </div>
        )}

        <Card title="Inventory Valuation" noPadding>
          <div className="p-5">
            {loading ? (
              <TableSkeleton />
            ) : error ? null : rows.length === 0 ? (
              <EmptyState
                title="No inventory on hand"
                description="Receive stock to see cost and retail valuation by product."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-erp-table-border text-left text-xs font-semibold uppercase tracking-wide text-erp-text-secondary">
                      <th className="pb-2 pr-4">Product</th>
                      <th className="pb-2 pr-4 text-right">On Hand</th>
                      <th className="pb-2 pr-4 text-right">Cost/unit</th>
                      <th className="pb-2 pr-4 text-right">Retail/unit</th>
                      <th className="pb-2 pr-4 text-right">Total Cost</th>
                      <th className="pb-2 text-right">Total Retail</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-erp-table-border">
                    {rows.map((row) => (
                      <tr key={row.productId} className="hover:bg-erp-table-header">
                        <td className="py-2.5 pr-4 font-medium text-erp-text-primary">
                          <a
                            href={`/catalog/${encodeURIComponent(row.productId)}`}
                            className="text-brand-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                          >
                            {row.name}
                          </a>
                        </td>
                        <td className="py-2.5 pr-4 text-right tabular-nums text-erp-text-secondary">
                          {row.stockQty.toLocaleString()}
                        </td>
                        <td className="py-2.5 pr-4 text-right tabular-nums text-erp-text-secondary">
                          {formatMoney(row.costCents)}
                        </td>
                        <td className="py-2.5 pr-4 text-right tabular-nums text-erp-text-secondary">
                          {formatMoney(row.retailCents)}
                        </td>
                        <td className="py-2.5 pr-4 text-right tabular-nums font-medium text-erp-text-primary">
                          {formatMoney(row.costValueCents)}
                        </td>
                        <td className="py-2.5 text-right tabular-nums font-semibold text-erp-text-primary">
                          {formatMoney(row.retailValueCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-erp-table-border bg-erp-table-header font-semibold">
                      <td colSpan={4} className="py-2.5 pr-4 text-erp-text-secondary">
                        Totals
                      </td>
                      <td className="py-2.5 pr-4 text-right text-erp-text-primary">
                        {formatMoney(totalCostCents)}
                      </td>
                      <td className="py-2.5 text-right text-erp-text-primary">
                        {formatMoney(totalRetailCents)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </Card>
      </div>
    </EnterpriseShell>
  );
}
