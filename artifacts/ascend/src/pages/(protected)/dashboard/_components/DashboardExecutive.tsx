import { useQuery } from "@/lib/useQuery";
import { apiGet } from "@/api-client/client";
import { formatMoney } from "@/lib/money";
import { LineChart } from "@/components/charts/LineChart";
import { Link } from "wouter";

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

export function DashboardExecutive({ range, scope, topCustomers }: { range: string; scope: string; topCustomers: any[] }) {
  const { data: plData, loading: loadingPL } = useQuery(
    `dashboard:pl:${range}:${scope}`,
    () => apiGet<PLResponse>(`/api/v1/reports/p-l?range=${range}&${scope}`)
  );

  const { data: trendData, loading: loadingTrend } = useQuery(
    `dashboard:executive-trend:30d:${scope}`,
    () => apiGet<{ items: { date: string; label: string; revenueCents: number; orderCount: number }[] }>(`/api/v1/reports/revenue-trend?range=30d&${scope}`)
  );

  const { data: arData, loading: loadingAR } = useQuery(
    `dashboard:ar-aging:${scope}`,
    () => apiGet<AgingResponse>(`/api/v1/reports/ar-aging?${scope}`)
  );

  const { data: apData, loading: loadingAP } = useQuery(
    `dashboard:ap-aging:${scope}`,
    () => apiGet<AgingResponse>(`/api/v1/reports/ap-aging?${scope}`)
  );

  const { data: vendorData, loading: loadingVendors } = useQuery(
    `dashboard:vendor-sales:${range}:${scope}`,
    () => apiGet<{ items: any[] }>(`/api/v1/reports/sales-by-vendor?range=${range}&${scope}`)
  );

  // Growth & Forecast Calculation
  const items = trendData?.items ?? [];
  const last7 = items.slice(-7).reduce((acc, i) => acc + num(i.revenueCents), 0);
  const prior7 = items.slice(-14, -7).reduce((acc, i) => acc + num(i.revenueCents), 0);
  const growthPct = prior7 > 0 ? ((last7 - prior7) / prior7) * 100 : 0;
  const forecast = items.length > 0 ? (last7 / Math.min(items.length, 7)) * 7 : 0;

  const sparklineData = items.slice(-14).map(d => ({ label: d.label, value: num(d.revenueCents) }));

  // Cash Position
  const arTotal = num(arData?.totals.total);
  const apTotal = num(apData?.totals.total);
  const netCash = arTotal - apTotal;

  // P&L
  const rev = num(plData?.revenueCents);
  const expenses = num(plData?.operatingExpensesCents);
  const netIncome = num(plData?.netIncomeCents);
  const netMargin = rev > 0 ? (netIncome / rev) * 100 : 0;

  const topVendors = vendorData?.items ?? [];

  return (
    <section>
      <h2 className="mb-4 text-lg font-bold tracking-tight text-[var(--color-text-primary)]">Executive Workspace</h2>
      
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* P&L Snapshot */}
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
            <h3 className="text-[13px] font-semibold text-[var(--color-text-primary)]">P&L Snapshot</h3>
            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-[var(--color-text-secondary)]">Revenue</span>
                <span className="text-[14px] font-semibold text-[var(--color-text-primary)]">{loadingPL ? <div className="w-16 h-5 animate-skeleton rounded" /> : formatMoney(rev)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-[var(--color-text-secondary)]">Operating Expenses</span>
                <span className="text-[14px] font-semibold text-[var(--color-text-primary)]">{loadingPL ? <div className="w-16 h-5 animate-skeleton rounded" /> : formatMoney(expenses)}</span>
              </div>
              <div className="my-2 border-t border-[var(--color-border)]"></div>
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">Net Profit</span>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-medium text-[var(--color-text-muted)] bg-[var(--color-surface-subtle)] px-2 py-0.5 rounded">{loadingPL ? "--" : `${netMargin.toFixed(1)}%`}</span>
                  <span className={`text-[15px] font-bold ${netIncome >= 0 ? "text-[var(--color-success-text)]" : "text-[var(--color-danger-text)]"}`}>
                    {loadingPL ? <div className="w-16 h-5 animate-skeleton rounded" /> : formatMoney(netIncome)}
                  </span>
                </div>
              </div>
            </div>
          </div>
          
          {/* Top Vendors */}
          <div className="flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[13px] font-semibold text-[var(--color-text-primary)]">Top Vendors</h3>
              <Link href="/reports" className="text-[11px] text-[var(--color-link)] hover:underline">View all</Link>
            </div>
            <div className="flex-1 min-h-0">
              {loadingVendors ? (
                <div className="space-y-3"><div className="h-6 w-full animate-skeleton rounded" /><div className="h-6 w-full animate-skeleton rounded" /></div>
              ) : topVendors.length === 0 ? (
                <div className="flex h-full items-center justify-center text-[12px] text-[var(--color-text-muted)]">No vendor data</div>
              ) : (
                <ul className="space-y-3">
                  {topVendors.slice(0, 3).map((v, i) => (
                    <li key={i} className="flex justify-between items-center text-[13px]">
                      <span className="truncate text-[var(--color-text-primary)] font-medium pr-2">{v.name || v.vendorName || "Unknown"}</span>
                      <span className="font-semibold text-[var(--color-text-primary)] shrink-0">{formatMoney(v.totalCents ?? 0)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* Growth & Forecast */}
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm flex flex-col">
          <h3 className="text-[13px] font-semibold text-[var(--color-text-primary)] mb-4">Growth & Forecast</h3>
          
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="rounded-lg bg-[var(--color-surface-subtle)] p-3 border border-[var(--color-border)]">
              <div className="text-[11px] uppercase tracking-wider text-[var(--color-text-secondary)] mb-1">Growth (7d)</div>
              {loadingTrend ? <div className="h-6 w-16 animate-skeleton rounded" /> : (
                <div className="flex items-end gap-2">
                  <span className="text-xl font-bold text-[var(--color-text-primary)]">{growthPct > 0 ? "+" : ""}{growthPct.toFixed(1)}%</span>
                </div>
              )}
            </div>
            <div className="rounded-lg bg-[var(--color-surface-subtle)] p-3 border border-[var(--color-border)]">
              <div className="text-[11px] uppercase tracking-wider text-[var(--color-text-secondary)] mb-1">Forecast (Next 7d)</div>
              {loadingTrend ? <div className="h-6 w-20 animate-skeleton rounded" /> : (
                <div className="flex items-end gap-2">
                  <span className="text-xl font-bold text-[var(--color-primary)]">{formatMoney(forecast)}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 min-h-[160px] relative">
            {loadingTrend ? (
              <SkeletonBox className="absolute inset-0" />
            ) : sparklineData.length === 0 ? (
              <div className="flex h-full items-center justify-center rounded border border-dashed border-[var(--color-border)] text-[12px] text-[var(--color-text-muted)]">No trend data</div>
            ) : (
              <div className="absolute inset-0">
                <LineChart data={sparklineData} height={160} color="var(--color-primary)" formatValue={(v) => formatMoney(v)} />
              </div>
            )}
          </div>
        </div>

        {/* Cash Position */}
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
            <h3 className="text-[13px] font-semibold text-[var(--color-text-primary)] mb-4">Cash Position</h3>
            <div className="space-y-5">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[12px] text-[var(--color-text-secondary)]">Receivables (AR)</span>
                  <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">{loadingAR ? "--" : formatMoney(arTotal)}</span>
                </div>
                <div className="h-1.5 w-full bg-[var(--color-surface-subtle)] rounded-full overflow-hidden flex">
                  {arTotal > 0 && arData?.totals && (
                    <>
                      <div style={{ width: `${(num(arData.totals.current) / arTotal) * 100}%` }} className="h-full bg-[var(--color-success)]" />
                      <div style={{ width: `${(num(arData.totals.d1_30) / arTotal) * 100}%` }} className="h-full bg-[var(--color-success-border)]" />
                      <div style={{ width: `${((num(arData.totals.d31_60) + num(arData.totals.d61_90) + num(arData.totals.d90_plus)) / arTotal) * 100}%` }} className="h-full bg-[var(--color-warning)]" />
                    </>
                  )}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[12px] text-[var(--color-text-secondary)]">Payables (AP)</span>
                  <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">{loadingAP ? "--" : formatMoney(apTotal)}</span>
                </div>
                <div className="h-1.5 w-full bg-[var(--color-surface-subtle)] rounded-full overflow-hidden flex">
                  {apTotal > 0 && apData?.totals && (
                    <>
                      <div style={{ width: `${(num(apData.totals.current) / apTotal) * 100}%` }} className="h-full bg-[var(--color-danger-border)]" />
                      <div style={{ width: `${(num(apData.totals.d1_30) / apTotal) * 100}%` }} className="h-full bg-[var(--color-danger)]" />
                      <div style={{ width: `${((num(apData.totals.d31_60) + num(apData.totals.d61_90) + num(apData.totals.d90_plus)) / apTotal) * 100}%` }} className="h-full bg-[var(--color-danger-text)]" />
                    </>
                  )}
                </div>
              </div>
              <div className="pt-3 border-t border-[var(--color-border)] flex items-center justify-between">
                <span className="text-[12px] font-semibold text-[var(--color-text-primary)]">Net Position</span>
                <span className={`text-[14px] font-bold ${netCash >= 0 ? "text-[var(--color-success-text)]" : "text-[var(--color-danger-text)]"}`}>
                  {loadingAR || loadingAP ? "--" : formatMoney(netCash)}
                </span>
              </div>
            </div>
          </div>

          {/* Top Customers summary (copied logic from TopPerformers for Executive snippet) */}
          <div className="flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[13px] font-semibold text-[var(--color-text-primary)]">Top Customers</h3>
              <Link href="/reports" className="text-[11px] text-[var(--color-link)] hover:underline">View all</Link>
            </div>
            <div className="flex-1 min-h-0">
              {topCustomers.length === 0 ? (
                <div className="flex h-full items-center justify-center text-[12px] text-[var(--color-text-muted)]">No customer data</div>
              ) : (
                <ul className="space-y-3">
                  {topCustomers.slice(0, 3).map((c, i) => (
                    <li key={i} className="flex justify-between items-center text-[13px]">
                      <span className="truncate text-[var(--color-text-primary)] font-medium pr-2">{c.name || "Unknown"}</span>
                      <span className="font-semibold text-[var(--color-text-primary)] shrink-0">{formatMoney(c.totalCents ?? c.revenueCents ?? 0)}</span>
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
