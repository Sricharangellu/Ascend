
/**
 * /reports/p-l — Profit & Loss report.
 * Owner/manager only. Supports Today / 7d / 30d date ranges.
 */

import { useEffect, useState } from "react";
import { apiGet, ApiResponseError } from "@/api-client/client";
import { getUser } from "@/lib/auth";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { Card } from "@/components/Card";
import { formatMoney } from "@/lib/money";
import { ReportsSubNav } from "@/components/reports/ReportsSubNav";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

type Range = "today" | "7d" | "30d";

interface PLResponse {
  revenue: { grossCents: number; taxCents: number; netCents: number };
  cogs: { costCents: number };
  grossProfit: { cents: number; pct: number };
  opex: { cents: number };
  netProfit: { cents: number; pct: number };
  period: string;
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

function KpiCard({ label, value, sub, accent }: {
  label: string; value: string; sub?: string;
  accent?: "positive" | "negative" | "neutral";
}) {
  const valueColor = accent === "positive" ? "text-emerald-600" : accent === "negative" ? "text-red-600" : "";
  return (
    <Card>
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--color-text-secondary)" }}>{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${valueColor}`}
        style={!accent || accent === "neutral" ? { color: "var(--color-text-primary)" } : {}}>{value}</p>
      {sub && <p className="mt-0.5 text-[13px]" style={{ color: "var(--color-text-secondary)" }}>{sub}</p>}
    </Card>
  );
}

function KpiSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading P&L data" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-xl border p-4" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
          <div className="h-3 w-24 animate-skeleton rounded" />
          <div className="mt-2 h-7 w-32 animate-skeleton rounded" style={{ opacity: 1 - i * 0.1 }} />
          <div className="mt-1.5 h-3 w-20 animate-skeleton rounded" />
        </div>
      ))}
    </div>
  );
}

function PLChart({ pnl, rangeLabel }: { pnl: PLResponse; rangeLabel: string }) {
  const chartData = [
    { name: "Revenue",      value: pnl.revenue.grossCents },
    { name: "COGS",         value: pnl.cogs.costCents },
    { name: "Gross Profit", value: pnl.grossProfit.cents },
    { name: "Op. Expenses", value: pnl.opex.cents },
    { name: "Net Income",   value: pnl.netProfit.cents },
  ];
  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b px-4 py-3" style={{ borderColor: "var(--color-border)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>P&amp;L Overview</h3>
        <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-text-secondary)" }}>{rangeLabel}</p>
      </div>
      <div className="px-4 py-4">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid strokeDasharray="4 4" stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "var(--color-text-muted)" }} />
            <YAxis width={72} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "var(--color-text-muted)" }}
              tickFormatter={(v: number) => formatMoney(v)} />
            <Tooltip formatter={(v: unknown) => [formatMoney(typeof v === "number" ? v : 0), "Amount"]}
              contentStyle={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "8px", fontSize: "12px" }} />
            <Bar dataKey="value" fill="#5D5FEF" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

export default function PLReportPage() {
  const [range, setRange] = useState<Range>("today");
  const [data, setData] = useState<PLResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const role = getUser()?.role ?? "cashier";
  const allowed = role === "owner" || role === "manager";
  const rangeLabel = range === "today" ? "Today" : range === "7d" ? "Last 7 days" : "Last 30 days";

  useEffect(() => {
    if (!allowed) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const result = await apiGet<PLResponse>(`/api/v1/reports/p-l?range=${range}`);
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof ApiResponseError ? err.message : "Failed to load P&L report.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [allowed, range]);

  return (
    <EnterpriseShell active="reports" title="Profit & Loss" subtitle={`P&L report · Demo Store · ${rangeLabel}`}
      contentClassName="overflow-y-auto">
      <div className="mx-auto w-full max-w-7xl space-y-5 px-4 py-5 sm:px-6">
        <div className="border-b pb-4" style={{ borderColor: "var(--color-border)" }}>
          <div className="mb-3">
            <h1 className="text-[20px] font-bold tracking-tight" style={{ color: "var(--color-text-primary)" }}>Profit &amp; Loss</h1>
            <p className="mt-1 text-[13px]" style={{ color: "var(--color-text-secondary)" }}>Revenue, cost of goods, and net profit for the selected period.</p>
          </div>
          <ReportsSubNav />
        </div>

        {!allowed ? (
          <Card>
            <p role="alert" className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
              You don&apos;t have access to reports. Ask an owner or manager.
            </p>
          </Card>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <RangeToggle value={range} onChange={setRange} />
              {data && <span className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>{data.period}</span>}
            </div>

            {loading ? <KpiSkeleton /> : error ? (
              <Card><p role="alert" className="text-[13px] text-red-600">{error}</p></Card>
            ) : data ? (
              <>
                <PLChart pnl={data} rangeLabel={rangeLabel} />

                <div>
                  <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em]"
                    style={{ color: "var(--color-text-secondary)" }}>Revenue</h2>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <KpiCard label="Gross Revenue" value={formatMoney(data.revenue.grossCents)} />
                    <KpiCard label="Tax Collected" value={formatMoney(data.revenue.taxCents)} />
                    <KpiCard label="Net Revenue" value={formatMoney(data.revenue.netCents)} />
                  </div>
                </div>

                <div>
                  <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em]"
                    style={{ color: "var(--color-text-secondary)" }}>Profitability</h2>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <KpiCard label="Cost of Goods Sold" value={formatMoney(data.cogs.costCents)} accent="negative" />
                    <KpiCard label="Gross Profit" value={formatMoney(data.grossProfit.cents)}
                      sub={`${data.grossProfit.pct.toFixed(1)}% margin`}
                      accent={data.grossProfit.cents >= 0 ? "positive" : "negative"} />
                    <KpiCard label="Operating Expenses" value={formatMoney(data.opex.cents)} accent="negative" />
                    <KpiCard label="Net Profit" value={formatMoney(data.netProfit.cents)}
                      sub={`${data.netProfit.pct.toFixed(1)}% margin`}
                      accent={data.netProfit.cents >= 0 ? "positive" : "negative"} />
                  </div>
                </div>

                <Card title="P&L Summary" noPadding>
                  <div className="overflow-x-auto p-5">
                    <table className="w-full text-[13px]">
                      <tbody className="divide-y divide-[var(--color-table-border)]">
                        {[
                          { label: "Gross Revenue", value: formatMoney(data.revenue.grossCents), bold: true },
                          { label: "− Tax Collected", value: `(${formatMoney(data.revenue.taxCents)})`, indent: true, muted: true },
                          { label: "Net Revenue", value: formatMoney(data.revenue.netCents), semi: true },
                          { label: "− Cost of Goods Sold", value: `(${formatMoney(data.cogs.costCents)})`, indent: true, red: true },
                        ].map(({ label, value, bold, indent, muted, semi, red }) => (
                          <tr key={label} className="transition-colors hover:bg-[var(--color-table-row-hover)]">
                            <td className={`py-2.5 pr-4 ${indent ? "pl-4" : ""}`}
                              style={{ color: muted ? "var(--color-text-muted)" : "var(--color-text-secondary)", fontWeight: bold || semi ? 500 : 400 }}>{label}</td>
                            <td className={`py-2.5 text-right ${bold || semi ? "font-semibold" : ""}`}
                              style={{ color: red ? "rgb(220,38,38)" : "var(--color-text-primary)" }}>{value}</td>
                          </tr>
                        ))}
                        <tr className="transition-colors hover:bg-[var(--color-table-row-hover)]"
                          style={{ borderTop: "1px solid var(--color-border)", backgroundColor: "var(--color-table-header)" }}>
                          <td className="py-2.5 pr-4 font-semibold" style={{ color: "var(--color-text-primary)" }}>Gross Profit</td>
                          <td className={`py-2.5 text-right font-bold ${data.grossProfit.cents >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            {formatMoney(data.grossProfit.cents)}{" "}
                            <span className="text-[11px] font-normal" style={{ color: "var(--color-text-muted)" }}>({data.grossProfit.pct.toFixed(1)}%)</span>
                          </td>
                        </tr>
                        <tr className="transition-colors hover:bg-[var(--color-table-row-hover)]">
                          <td className="py-2.5 pr-4 pl-4" style={{ color: "var(--color-text-muted)" }}>− Operating Expenses</td>
                          <td className="py-2.5 text-right text-red-600">({formatMoney(data.opex.cents)})</td>
                        </tr>
                        <tr style={{ borderTop: "2px solid var(--color-border)", backgroundColor: "var(--color-table-header)" }}>
                          <td className="py-2.5 pr-4 font-bold" style={{ color: "var(--color-text-primary)" }}>Net Profit</td>
                          <td className={`py-2.5 text-right font-bold text-lg ${data.netProfit.cents >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            {formatMoney(data.netProfit.cents)}{" "}
                            <span className="text-[11px] font-normal" style={{ color: "var(--color-text-muted)" }}>({data.netProfit.pct.toFixed(1)}%)</span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </Card>
              </>
            ) : null}
          </>
        )}
      </div>
    </EnterpriseShell>
  );
}
