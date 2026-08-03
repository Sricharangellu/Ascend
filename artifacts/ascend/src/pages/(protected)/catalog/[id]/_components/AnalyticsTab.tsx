
import { useCallback, useEffect, useState } from "react";
import { apiGet, ApiResponseError } from "@/api-client/client";
import { formatMoney } from "@/lib/money";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TrendPoint {
  date: number;
  units: number;
  revenue_cents: number;
}

interface AnalyticsSummary {
  revenue_cents: number;
  units_sold: number;
  orders: number;
  avg_order_qty: number;
  return_rate_pct: number;
  gross_margin_pct: number;
  inventory_turnover: number;
  abc_class: "A" | "B" | "C";
}

interface AnalyticsData {
  period: string;
  trend: TrendPoint[];
  summary: AnalyticsSummary;
}

type Period = "7d" | "30d" | "90d" | "12m";

const PERIOD_LABELS: Record<Period, string> = { "7d": "7 Days", "30d": "30 Days", "90d": "90 Days", "12m": "12 Months" };

const ABC_COLOR: Record<string, string> = {
  A: "bg-emerald-100 text-emerald-700",
  B: "bg-amber-100 text-amber-700",
  C: "bg-red-100 text-red-700",
};

// ── Sparkline chart ───────────────────────────────────────────────────────────

function Sparkline({ data, height = 80 }: { data: TrendPoint[]; height?: number }) {
  if (data.length < 2) return null;
  const maxRevenue = Math.max(...data.map((d) => d.revenue_cents));
  if (maxRevenue === 0) return null;

  const width = 600;
  const pad   = 4;
  const pts   = data.map((d, i) => {
    const x = pad + (i / (data.length - 1)) * (width - pad * 2);
    const y = pad + ((1 - d.revenue_cents / maxRevenue) * (height - pad * 2));
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-full w-full" aria-hidden="true">
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5D5FEF" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#5D5FEF" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`${pad},${height} ${pts.join(" ")} ${width - pad},${height}`} fill="url(#spark-fill)" />
      <polyline points={pts.join(" ")} fill="none" stroke="#5D5FEF" strokeWidth="2"
        strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ── KPI tile ──────────────────────────────────────────────────────────────────

function KpiTile({ label, value, extra }: { label: string; value: string; extra?: string }) {
  return (
    <div className="rounded-xl border shadow-[var(--shadow-sm)] px-4 py-3"
      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
      <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>{label}</p>
      <p className={`mt-1 text-[18px] font-bold ${extra ?? ""}`}
        style={!extra ? { color: "var(--color-text-primary)" } : {}}>{value}</p>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AnalyticsTab({ productId }: { productId: string }) {
  const [period, setPeriod]   = useState<Period>("30d");
  const [data, setData]       = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const d = await apiGet<AnalyticsData>(`/api/v1/catalog/${productId}/analytics?period=${period}`);
      setData(d);
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : "Failed to load analytics.");
    } finally { setLoading(false); }
  }, [productId, period]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-5">

      {/* ── Period selector ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--color-text-secondary)" }}>Product Analytics</h3>
        <div className="flex gap-1 rounded-lg border p-1 shadow-[var(--shadow-sm)]"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
          {(["7d", "30d", "90d", "12m"] as Period[]).map((p) => (
            <button key={p} type="button" onClick={() => setPeriod(p)}
              className={`rounded-md px-3 py-1 text-[11px] font-medium transition-colors ${period === p ? "bg-brand-600 text-white" : ""}`}
              style={period !== p ? { color: "var(--color-text-secondary)" } : {}}>
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-xl border px-4 py-3 text-[13px]"
          style={{ backgroundColor: "var(--color-danger-bg)", borderColor: "var(--color-danger-border)", color: "var(--color-danger-text)" }}>
          {error}
        </p>
      )}

      {loading ? (
        <div className="space-y-4">
          <div className="h-24 animate-skeleton rounded-xl" />
          <div className="h-48 animate-skeleton rounded-xl" />
        </div>
      ) : data ? (
        <>
          {/* ── KPI cards row 1 ─────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiTile label="Revenue"      value={formatMoney(data.summary.revenue_cents)} />
            <KpiTile label="Units Sold"   value={data.summary.units_sold.toLocaleString()} />
            <KpiTile label="Orders"       value={data.summary.orders.toLocaleString()} />
            <KpiTile label="Avg Order Qty" value={String(data.summary.avg_order_qty)} />
          </div>

          {/* ── KPI cards row 2 ─────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiTile label="Gross Margin" value={`${data.summary.gross_margin_pct.toFixed(1)}%`}
              extra={data.summary.gross_margin_pct >= 30 ? "text-emerald-600" : data.summary.gross_margin_pct > 0 ? "text-amber-600" : "text-red-600"} />
            <KpiTile label="Return Rate" value={`${data.summary.return_rate_pct}%`}
              extra={data.summary.return_rate_pct < 3 ? "text-emerald-600" : data.summary.return_rate_pct < 8 ? "text-amber-600" : "text-red-600"} />
            <KpiTile label="Inventory Turnover" value={`${data.summary.inventory_turnover}×`} />
            <div className="rounded-xl border shadow-[var(--shadow-sm)] px-4 py-3"
              style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
              <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>ABC Class</p>
              <div className="mt-1">
                <span className={`rounded-full px-3 py-1 text-[13px] font-bold ${ABC_COLOR[data.summary.abc_class] ?? ""}`}
                  style={!ABC_COLOR[data.summary.abc_class] ? { backgroundColor: "var(--color-surface-subtle)", color: "var(--color-text-secondary)" } : {}}>
                  Class {data.summary.abc_class}
                </span>
              </div>
            </div>
          </div>

          {/* ── Revenue trend chart ──────────────────────────────────────── */}
          <div className="rounded-xl border shadow-[var(--shadow-sm)]"
            style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
            <div className="border-b px-5 py-3.5" style={{ borderColor: "var(--color-border)" }}>
              <h3 className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                Revenue Trend — {PERIOD_LABELS[period]}
              </h3>
            </div>
            <div className="px-5 py-4">
              <div className="relative h-40">
                <Sparkline data={data.trend} height={160} />
              </div>
              {data.trend.length > 1 && (
                <div className="mt-1 flex justify-between text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                  <span>{new Date(data.trend[0].date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                  <span>{new Date(data.trend[data.trend.length - 1].date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                </div>
              )}
            </div>
          </div>

          {/* ── Daily breakdown table ─────────────────────────────────────── */}
          <div className="rounded-xl border shadow-[var(--shadow-sm)]"
            style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
            <div className="border-b px-5 py-3.5" style={{ borderColor: "var(--color-border)" }}>
              <h3 className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Recent Daily Breakdown</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead style={{ backgroundColor: "var(--color-table-header)", borderBottom: "1px solid var(--color-border)" }}>
                  <tr className="text-left text-[10px] font-semibold uppercase tracking-[0.06em]"
                    style={{ color: "var(--color-text-secondary)" }}>
                    <th className="px-4 py-2.5">Date</th>
                    <th className="px-4 py-2.5">Units</th>
                    <th className="px-4 py-2.5">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-table-border)]">
                  {[...data.trend].reverse().slice(0, 7).map((pt) => (
                    <tr key={pt.date} className="transition-colors hover:bg-[var(--color-table-row-hover)]">
                      <td className="px-4 py-2.5" style={{ color: "var(--color-text-secondary)" }}>
                        {new Date(pt.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                      </td>
                      <td className="px-4 py-2.5 font-medium" style={{ color: "var(--color-text-primary)" }}>{pt.units}</td>
                      <td className="px-4 py-2.5 font-semibold" style={{ color: "var(--color-text-primary)" }}>{formatMoney(pt.revenue_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
