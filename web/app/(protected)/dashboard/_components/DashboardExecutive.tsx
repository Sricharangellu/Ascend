"use client";

import Link from "next/link";
import { useQuery } from "@/lib/useQuery";
import { apiGet } from "@/api-client/client";
import { formatMoney } from "@/lib/money";
import { LineChart } from "@/components/charts/LineChart";

const CHART_COLOR = "#5D5FEF";

interface PLResponse {
  revenueCents: number;
  cogsCents: number;
  grossProfitCents: number;
  operatingExpensesCents: number;
  netIncomeCents: number;
}

interface AgingResponse {
  totals: { current: number; d1_30: number; d31_60: number; d61_90: number; d90_plus: number; total: number };
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);

function SkeletonBox({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-skeleton rounded border border-[var(--color-border)] ${className}`} />;
}

export function DashboardExecutive({
  range,
  scope,
  topCustomers,
}: {
  range: string;
  scope: string;
  topCustomers: Array<{ name?: string; totalCents?: number; revenueCents?: number }>;
}) {
  const { data: plData, loading: loadingPL } = useQuery(`dashboard:pl:${range}:${scope}`, () =>
    apiGet<PLResponse>(`/api/v1/reports/p-l?range=${range}&${scope}`),
  );

  const { data: trendData, loading: loadingTrend } = useQuery(`dashboard:executive-trend:30d:${scope}`, () =>
    apiGet<{ items: { date: string; label: string; revenueCents: number; orderCount: number }[] }>(
      `/api/v1/reports/revenue-trend?range=30d&${scope}`,
    ),
  );

  const { data: arData, loading: loadingAR } = useQuery(`dashboard:ar-aging:${scope}`, () =>
    apiGet<AgingResponse>(`/api/v1/reports/ar-aging?${scope}`),
  );

  const { data: apData, loading: loadingAP } = useQuery(`dashboard:ap-aging:${scope}`, () =>
    apiGet<AgingResponse>(`/api/v1/reports/ap-aging?${scope}`),
  );

  const { data: vendorData, loading: loadingVendors } = useQuery(`dashboard:vendor-sales:${range}:${scope}`, () =>
    apiGet<{ items: Array<{ vendorName?: string; name?: string; totalCents?: number }> }>(
      `/api/v1/reports/sales-by-vendor?range=${range}&${scope}`,
    ),
  );

  const items = trendData?.items ?? [];
  const last7 = items.slice(-7).reduce((acc, i) => acc + num(i.revenueCents), 0);
  const prior7 = items.slice(-14, -7).reduce((acc, i) => acc + num(i.revenueCents), 0);
  const growthPct = prior7 > 0 ? ((last7 - prior7) / prior7) * 100 : 0;
  const forecast = items.length > 0 ? (last7 / Math.min(items.length, 7)) * 7 : 0;

  const sparklineData = items.slice(-14).map((d) => ({ label: d.label, value: num(d.revenueCents) }));

  const arTotal = num(arData?.totals.total);
  const apTotal = num(apData?.totals.total);
  const netCash = arTotal - apTotal;

  const rev = num(plData?.revenueCents);
  const expenses = num(plData?.operatingExpensesCents);
  const netIncome = num(plData?.netIncomeCents);
  const netMargin = rev > 0 ? (netIncome / rev) * 100 : 0;

  const topVendors = vendorData?.items ?? [];

  return (
    <section>
      <h2 className="mb-4 text-lg font-bold tracking-tight text-[var(--color-text-primary)]">Executive Workspace</h2>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
            <h3 className="text-[13px] font-semibold text-[var(--color-text-primary)]">P&L Snapshot</h3>
            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-[var(--color-text-secondary)]">Revenue</span>
                <span className="text-[14px] font-semibold text-[var(--color-text-primary)]">
                  {loadingPL ? <div className="h-5 w-16 animate-skeleton rounded" /> : formatMoney(rev)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-[var(--color-text-secondary)]">Operating Expenses</span>
                <span className="text-[14px] font-semibold text-[var(--color-text-primary)]">
                  {loadingPL ? <div className="h-5 w-16 animate-skeleton rounded" /> : formatMoney(expenses)}
                </span>
              </div>
              <div className="my-2 border-t border-[var(--color-border)]"></div>
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">Net Profit</span>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-[var(--color-surface-subtle)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-text-muted)]">
                    {loadingPL ? "--" : `${netMargin.toFixed(1)}%`}
                  </span>
                  <span
                    className={`text-[15px] font-bold ${
                      netIncome >= 0 ? "text-[var(--color-success-text)]" : "text-[var(--color-danger-text)]"
                    }`}
                  >
                    {loadingPL ? <div className="h-5 w-16 animate-skeleton rounded" /> : formatMoney(netIncome)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[13px] font-semibold text-[var(--color-text-primary)]">Top Vendors</h3>
              <Link href="/reports" className="text-[11px] text-[var(--color-link)] hover:underline">
                View all
              </Link>
            </div>
            <div className="min-h-0 flex-1">
              {loadingVendors ? (
                <div className="space-y-3">
                  <div className="h-6 w-full animate-skeleton rounded" />
                  <div className="h-6 w-full animate-skeleton rounded" />
                </div>
              ) : topVendors.length === 0 ? (
                <div className="flex h-full items-center justify-center text-[12px] text-[var(--color-text-muted)]">No vendor data</div>
              ) : (
                <ul className="space-y-3">
                  {topVendors.slice(0, 3).map((v, i) => (
                    <li key={i} className="flex items-center justify-between text-[13px]">
                      <span className="truncate pr-2 font-medium text-[var(--color-text-primary)]">
                        {v.vendorName || v.name || "Unknown"}
                      </span>
                      <span className="shrink-0 font-semibold text-[var(--color-text-primary)]">
                        {formatMoney(v.totalCents ?? 0)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
          <h3 className="mb-4 text-[13px] font-semibold text-[var(--color-text-primary)]">Growth & Forecast</h3>

          <div className="mb-6 grid grid-cols-2 gap-4">
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-3">
              <div className="mb-1 text-[11px] uppercase tracking-wider text-[var(--color-text-secondary)]">Growth (7d)</div>
              {loadingTrend ? (
                <div className="h-6 w-16 animate-skeleton rounded" />
              ) : (
                <div className="flex items-end gap-2">
                  <span className="text-xl font-bold text-[var(--color-text-primary)]">
                    {growthPct > 0 ? "+" : ""}
                    {growthPct.toFixed(1)}%
                  </span>
                </div>
              )}
            </div>
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-3">
              <div className="mb-1 text-[11px] uppercase tracking-wider text-[var(--color-text-secondary)]">Forecast (Next 7d)</div>
              {loadingTrend ? (
                <div className="h-6 w-20 animate-skeleton rounded" />
              ) : (
                <div className="flex items-end gap-2">
                  <span className="text-xl font-bold text-[var(--color-primary)]">{formatMoney(forecast)}</span>
                </div>
              )}
            </div>
          </div>

          <div className="relative min-h-[160px] flex-1">
            {loadingTrend ? (
              <SkeletonBox className="absolute inset-0" />
            ) : sparklineData.length === 0 ? (
              <div className="flex h-full items-center justify-center rounded border border-dashed border-[var(--color-border)] text-[12px] text-[var(--color-text-muted)]">
                No trend data
              </div>
            ) : (
              <div className="absolute inset-0">
                <LineChart data={sparklineData} height={160} color={CHART_COLOR} formatValue={(v) => formatMoney(v)} />
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
            <h3 className="mb-4 text-[13px] font-semibold text-[var(--color-text-primary)]">Cash Position</h3>
            <div className="space-y-5">
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[12px] text-[var(--color-text-secondary)]">Receivables (AR)</span>
                  <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">
                    {loadingAR ? "--" : formatMoney(arTotal)}
                  </span>
                </div>
                <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-subtle)]">
                  {arTotal > 0 && arData?.totals && (
                    <>
                      <div style={{ width: `${(num(arData.totals.current) / arTotal) * 100}%` }} className="h-full bg-[var(--color-success)]" />
                      <div
                        style={{ width: `${(num(arData.totals.d1_30) / arTotal) * 100}%` }}
                        className="h-full bg-[var(--color-success-border)]"
                      />
                      <div
                        style={{
                          width: `${((num(arData.totals.d31_60) + num(arData.totals.d61_90) + num(arData.totals.d90_plus)) / arTotal) * 100}%`,
                        }}
                        className="h-full bg-[var(--color-warning)]"
                      />
                    </>
                  )}
                </div>
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[12px] text-[var(--color-text-secondary)]">Payables (AP)</span>
                  <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">
                    {loadingAP ? "--" : formatMoney(apTotal)}
                  </span>
                </div>
                <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-subtle)]">
                  {apTotal > 0 && apData?.totals && (
                    <>
                      <div
                        style={{ width: `${(num(apData.totals.current) / apTotal) * 100}%` }}
                        className="h-full bg-[var(--color-danger-border)]"
                      />
                      <div style={{ width: `${(num(apData.totals.d1_30) / apTotal) * 100}%` }} className="h-full bg-[var(--color-danger)]" />
                      <div
                        style={{
                          width: `${((num(apData.totals.d31_60) + num(apData.totals.d61_90) + num(apData.totals.d90_plus)) / apTotal) * 100}%`,
                        }}
                        className="h-full bg-[var(--color-danger-text)]"
                      />
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-3">
                <span className="text-[12px] font-semibold text-[var(--color-text-primary)]">Net Position</span>
                <span
                  className={`text-[14px] font-bold ${
                    netCash >= 0 ? "text-[var(--color-success-text)]" : "text-[var(--color-danger-text)]"
                  }`}
                >
                  {loadingAR || loadingAP ? "--" : formatMoney(netCash)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[13px] font-semibold text-[var(--color-text-primary)]">Top Customers</h3>
              <Link href="/reports" className="text-[11px] text-[var(--color-link)] hover:underline">
                View all
              </Link>
            </div>
            <div className="min-h-0 flex-1">
              {topCustomers.length === 0 ? (
                <div className="flex h-full items-center justify-center text-[12px] text-[var(--color-text-muted)]">No customer data</div>
              ) : (
                <ul className="space-y-3">
                  {topCustomers.slice(0, 3).map((c, i) => (
                    <li key={i} className="flex items-center justify-between text-[13px]">
                      <span className="truncate pr-2 font-medium text-[var(--color-text-primary)]">{c.name || "Unknown"}</span>
                      <span className="shrink-0 font-semibold text-[var(--color-text-primary)]">
                        {formatMoney(c.totalCents ?? c.revenueCents ?? 0)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
