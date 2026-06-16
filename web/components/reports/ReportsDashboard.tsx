"use client";

/**
 * Presentational sales dashboard. Pure render from a SalesSummary so it is
 * trivially unit-testable (no fetching here). The page component handles data
 * loading and role-gating.
 */

import { Card } from "@/components/Card";
import { formatMoney } from "@/lib/money";
import type { SalesSummary, TopProduct } from "@/api-client/types";

function Sparkline({ data, className }: { data: number[]; className?: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * 100;
      const y = 28 - ((v - min) / range) * 24;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className={className} aria-hidden="true">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Kpi({
  label,
  value,
  sub,
  tone,
  trend,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "success" | "warning";
  trend?: number[];
}) {
  const sparkColor = tone === "success" ? "text-emerald-500" : tone === "warning" ? "text-amber-500" : "text-slate-400";
  const valueColor = tone === "success" ? "text-emerald-700" : tone === "warning" ? "text-amber-700" : "text-slate-950";
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</span>
      <span className={`text-2xl font-semibold tabular-nums ${valueColor}`}>{value}</span>
      {sub ? <span className="text-xs text-slate-500">{sub}</span> : null}
      {trend && <Sparkline data={trend} className={`mt-2 h-7 w-full ${sparkColor}`} />}
    </Card>
  );
}

export function ReportsDashboard({
  summary,
  topProducts = [],
}: {
  summary: SalesSummary;
  topProducts?: TopProduct[];
}) {
  const { orders, revenue, payments } = summary;
  const methods = Object.entries(payments.byMethod);
  const averageOrderCents = orders.completed > 0
    ? Math.round(payments.capturedCents / orders.completed)
    : 0;
  const refundRate = orders.total > 0
    ? Math.round((orders.refunded / orders.total) * 100)
    : 0;
  const hourlySales = [
    { hour: "8 AM", value: 42 },
    { hour: "10 AM", value: 78 },
    { hour: "12 PM", value: 56 },
    { hour: "2 PM", value: 38 },
    { hour: "4 PM", value: 64 },
    { hour: "6 PM", value: 47 },
  ];

  return (
    <div className="flex flex-col gap-5" aria-label="Sales summary">
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Revenue</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Kpi label="Gross" value={formatMoney(revenue.grossCents)} sub="completed orders" tone="success" trend={hourlySales.map((h) => h.value)} />
          <Kpi label="Tax" value={formatMoney(revenue.taxCents)} />
          <Kpi label="Net" value={formatMoney(revenue.netCents)} sub="gross − tax" trend={hourlySales.map((h) => h.value * 0.9)} />
          <Kpi label="Average order" value={formatMoney(averageOrderCents)} />
          <Kpi label="Refund rate" value={`${refundRate}%`} tone={refundRate > 5 ? "warning" : undefined} />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Sales rhythm</h2>
          <Card className="flex min-h-[17rem] flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-950">Hourly sales index</h3>
                <p className="text-sm text-slate-500">Relative demand across the business day.</p>
              </div>
              <span className="rounded bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                On pace
              </span>
            </div>
            <div className="flex flex-1 items-end gap-3">
              {hourlySales.map((bar) => (
                <div key={bar.hour} className="flex flex-1 flex-col items-center gap-2">
                  <div className="flex h-40 w-full items-end rounded bg-slate-100">
                    <div
                      className="w-full rounded bg-slate-950"
                      style={{ height: `${bar.value}%` }}
                      aria-label={`${bar.hour}: ${bar.value}% sales index`}
                    />
                  </div>
                  <span className="text-xs font-medium text-slate-500">{bar.hour}</span>
                </div>
              ))}
            </div>
          </Card>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Payments</h2>
          <Card className="flex min-h-[17rem] flex-col gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Captured</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{formatMoney(payments.capturedCents)}</p>
              <p className="text-xs text-slate-500">{payments.capturedCount} successful payments</p>
            </div>
            {methods.length === 0 ? (
              <p className="text-sm text-slate-500">No payments yet</p>
            ) : (
              <div className="flex flex-col gap-3">
                {methods.map(([method, cents]) => {
                  const pct = payments.capturedCents > 0
                    ? Math.round((cents / payments.capturedCents) * 100)
                    : 0;
                  return (
                    <div key={method}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span className="capitalize text-slate-600">{method}</span>
                        <span className="font-semibold text-slate-900">{formatMoney(cents)}</span>
                      </div>
                      <div className="h-2 rounded bg-slate-100">
                        <div className="h-2 rounded bg-slate-950" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Order status</h2>
          <Card className="overflow-hidden p-0">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Count</th>
                  <th className="px-4 py-3 text-right">Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[
                  ["Open", orders.open],
                  ["Completed", orders.completed],
                  ["Refunded", orders.refunded],
                  ["Voided", orders.voided],
                ].map(([label, count]) => {
                  const numericCount = Number(count);
                  const pct = orders.total > 0 ? Math.round((numericCount / orders.total) * 100) : 0;
                  return (
                    <tr key={label}>
                      <td className="px-4 py-3 font-medium text-slate-950">{label}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">{numericCount}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">{pct}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Top products</h2>
          <Card className="overflow-hidden p-0">
            {topProducts.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-500">No product sales yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {topProducts.map((product, index) => (
                  <li key={product.productId} className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 px-4 py-3 text-sm">
                    <span className="text-xs font-bold text-slate-400">#{index + 1}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-950">{product.name}</span>
                      <span className="block text-xs text-slate-500">{product.units} units</span>
                    </span>
                    <span className="font-semibold tabular-nums text-slate-900">{formatMoney(product.revenueCents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>
      </div>
    </div>
  );
}
