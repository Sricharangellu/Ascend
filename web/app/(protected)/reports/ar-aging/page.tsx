"use client";

/**
 * /reports/ar-aging — Accounts Receivable Aging report.
 * Shows outstanding balances bucketed by aging period, with a totals row.
 * 60d buckets are amber-tinted; 90d+ buckets are red-tinted.
 *
 * Contract: GET /api/v1/reports/ar-aging → AgingReport { totals, parties[] }
 * (same shape accounting/AgingSummary already uses). A prior local type with
 * `items` / flat customer fields never matched the API — the page rendered
 * empty forever.
 */

import { useEffect, useState } from "react";
import { apiGet, ApiResponseError } from "@/api-client/client";
import type { AgingReport, AgingRow } from "@/api-client/types";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { formatMoney } from "@/lib/money";
import { ReportsSubNav } from "@/components/reports/ReportsSubNav";

function TableSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading AR aging data" className="animate-pulse space-y-2 px-1 py-2">
      {Array.from({ length: 7 }).map((_, i) => (
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

function partyLabel(row: AgingRow): string {
  // Backend currently returns partyId only (customer_id). Prefer a short
  // readable label until the report joins customer names.
  return row.partyId;
}

export default function ArAgingReportPage() {
  const [report, setReport] = useState<AgingReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const data = await apiGet<AgingReport>("/api/v1/reports/ar-aging");
        if (!cancelled) setReport(data);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiResponseError
              ? err.message
              : "Failed to load AR aging report.",
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

  const parties = report?.parties ?? [];
  const totals = report?.totals;

  return (
    <EnterpriseShell
      active="reports"
      title="AR Aging"
      subtitle="Accounts receivable aging"
      contentClassName="overflow-y-auto"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-6">
        <div className="mb-5"><ReportsSubNav /></div>
        <Card title="AR Aging Report" noPadding>
          <div className="p-5">
            {loading ? (
              <TableSkeleton />
            ) : error ? (
              <p role="alert" className="text-sm text-danger-700">
                {error}
              </p>
            ) : parties.length === 0 ? (
              <EmptyState
                title="No outstanding receivables"
                description="When customers have open balances, aging buckets will appear here."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-erp-table-border text-left text-xs font-semibold uppercase tracking-wide text-erp-text-secondary">
                      <th className="pb-2 pr-4">Customer</th>
                      <th className="pb-2 pr-4 text-right">Current</th>
                      <th className="pb-2 pr-4 text-right">1–30d</th>
                      <th className="pb-2 pr-4 text-right">31–60d</th>
                      <th className="pb-2 pr-4 text-right">61–90d</th>
                      <th className="pb-2 pr-4 text-right">90d+</th>
                      <th className="pb-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-erp-table-border">
                    {parties.map((row) => (
                      <tr key={row.partyId} className="hover:bg-erp-table-header">
                        <td className="py-2.5 pr-4 font-medium text-erp-text-primary">
                          <a
                            href={`/customers/${encodeURIComponent(row.partyId)}`}
                            className="text-brand-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                          >
                            {partyLabel(row)}
                          </a>
                        </td>
                        <td className="py-2.5 pr-4 text-right text-erp-text-secondary">
                          {formatMoney(row.buckets.current)}
                        </td>
                        <td className="py-2.5 pr-4 text-right text-erp-text-secondary">
                          {formatMoney(row.buckets.d1_30)}
                        </td>
                        <td
                          className={`py-2.5 pr-4 text-right font-medium ${
                            row.buckets.d31_60 > 0 ? "text-warning-700" : "text-erp-text-secondary"
                          }`}
                        >
                          {formatMoney(row.buckets.d31_60)}
                        </td>
                        <td
                          className={`py-2.5 pr-4 text-right font-medium ${
                            row.buckets.d61_90 > 0 ? "text-warning-700" : "text-erp-text-secondary"
                          }`}
                        >
                          {formatMoney(row.buckets.d61_90)}
                        </td>
                        <td
                          className={`py-2.5 pr-4 text-right font-medium ${
                            row.buckets.d90_plus > 0 ? "text-danger-700" : "text-erp-text-secondary"
                          }`}
                        >
                          {formatMoney(row.buckets.d90_plus)}
                        </td>
                        <td className="py-2.5 text-right font-semibold text-erp-text-primary">
                          {formatMoney(row.buckets.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {totals && (
                    <tfoot>
                      <tr className="border-t-2 border-erp-table-border bg-erp-table-header font-semibold text-erp-text-primary">
                        <td className="py-2.5 pr-4">Totals</td>
                        <td className="py-2.5 pr-4 text-right">{formatMoney(totals.current)}</td>
                        <td className="py-2.5 pr-4 text-right">{formatMoney(totals.d1_30)}</td>
                        <td className={`py-2.5 pr-4 text-right ${totals.d31_60 > 0 ? "text-warning-700" : ""}`}>
                          {formatMoney(totals.d31_60)}
                        </td>
                        <td className={`py-2.5 pr-4 text-right ${totals.d61_90 > 0 ? "text-warning-700" : ""}`}>
                          {formatMoney(totals.d61_90)}
                        </td>
                        <td className={`py-2.5 pr-4 text-right ${totals.d90_plus > 0 ? "text-danger-700" : ""}`}>
                          {formatMoney(totals.d90_plus)}
                        </td>
                        <td className="py-2.5 text-right">{formatMoney(totals.total)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>
        </Card>

        {!loading && !error && parties.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-4 text-xs text-erp-text-secondary">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded bg-warning-500" aria-hidden="true" />
              31–90 day overdue
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded bg-danger-500" aria-hidden="true" />
              90+ days overdue
            </span>
          </div>
        )}
      </div>
    </EnterpriseShell>
  );
}
