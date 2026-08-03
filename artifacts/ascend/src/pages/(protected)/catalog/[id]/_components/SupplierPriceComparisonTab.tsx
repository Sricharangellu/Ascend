
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "@/lib/router";
import { apiGet, ApiResponseError } from "@/api-client/client";
import { formatMoney } from "@/lib/money";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PricePoint { date: number; cost: number; }

interface SupplierComparison {
  supplier_id: string;
  supplier_name: string;
  is_preferred: boolean;
  vendor_sku: string | null;
  last_purchase_date: number | null;
  last_cost_cents: number;
  landed_cost_cents: number;
  moq: number | null;
  lead_time_days: number | null;
  price_30d_trend: "up" | "down" | "stable";
  price_history: PricePoint[];
}

interface ComparisonResponse {
  items: SupplierComparison[];
  best_price_supplier_id: string;
  current_retail_price_cents: number;
}

function fmtDate(ts: number | null) {
  if (!ts) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(ts));
}

function TrendBadge({ trend }: { trend: "up" | "down" | "stable" }) {
  if (trend === "up")   return <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">↑ Rising</span>;
  if (trend === "down") return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">↓ Falling</span>;
  return (
    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={{ backgroundColor: "var(--color-surface-subtle)", color: "var(--color-text-secondary)" }}>
      → Stable
    </span>
  );
}

function MiniSparkline({ history, min, max }: { history: PricePoint[]; min: number; max: number }) {
  if (history.length < 2) return null;
  const range = max - min || 1;
  const w = 80; const h = 28;
  const pts = history.map((p, i) => {
    const x = (i / (history.length - 1)) * w;
    const y = h - ((p.cost - min) / range) * (h - 4) - 2;
    return `${x},${y}`;
  }).join(" ");
  const last = history[history.length - 1]!;
  const prev = history[history.length - 2]!;
  const color = last.cost > prev.cost ? "#ef4444" : last.cost < prev.cost ? "#10b981" : "#94a3b8";
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"/>
    </svg>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SupplierPriceComparisonTab({ productId }: { productId: string }) {
  const router = useRouter();
  const [data, setData]       = useState<ComparisonResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const d = await apiGet<ComparisonResponse>(`/api/v1/catalog/${productId}/supplier-price-comparison`);
      setData(d);
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : "Failed to load comparison data.");
    } finally { setLoading(false); }
  }, [productId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => <div key={i} className="h-20 animate-skeleton rounded-xl" />)}
    </div>
  );

  if (error) return (
    <p role="alert" className="rounded-xl border px-4 py-3 text-[13px]"
      style={{ backgroundColor: "var(--color-danger-bg)", borderColor: "var(--color-danger-border)", color: "var(--color-danger-text)" }}>
      {error}
    </p>
  );

  if (!data || data.items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed py-12 text-center" style={{ borderColor: "var(--color-border)" }}>
        <p className="text-[13px]" style={{ color: "var(--color-text-muted)" }}>No supplier pricing data available.</p>
        <button type="button" onClick={() => router.push(`/catalog/${productId}?tab=suppliers`)}
          className="mt-2 text-[13px] text-brand-600 hover:underline">
          Add a supplier
        </button>
      </div>
    );
  }

  const allCosts = data.items.flatMap((s) => s.price_history.map((p) => p.cost));
  const minCost  = Math.min(...allCosts);
  const maxCost  = Math.max(...allCosts);

  const retailMargins = data.items.map((s) => ({
    id: s.supplier_id,
    margin: ((data.current_retail_price_cents - s.last_cost_cents) / data.current_retail_price_cents) * 100,
  }));

  const sortedItems = [...data.items].sort((a, b) => a.last_cost_cents - b.last_cost_cents);
  const cheapest    = sortedItems[0];

  return (
    <div className="space-y-5">

      {/* ── Best price callout ─────────────────────────────────────────────── */}
      {cheapest && (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4">
          <svg className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <div>
            <p className="text-[13px] font-semibold text-emerald-900">
              Best price: {formatMoney(cheapest.last_cost_cents)}/unit from {cheapest.supplier_name}
            </p>
            <p className="mt-0.5 text-[11px] text-emerald-700">
              {data.items.length > 1
                ? `Saves ${formatMoney(data.items.reduce((max, s) => Math.max(max, s.last_cost_cents - cheapest.last_cost_cents), 0))}/unit vs most expensive option`
                : "Only supplier on record"}
            </p>
          </div>
        </div>
      )}

      {/* ── Comparison table ───────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border shadow-[var(--shadow-sm)]"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
        <div className="border-b px-5 py-3" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-table-header)" }}>
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Supplier pricing comparison</h3>
          <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>Retail price: {formatMoney(data.current_retail_price_cents)}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead style={{ backgroundColor: "var(--color-table-header)", borderBottom: "1px solid var(--color-border)" }}>
              <tr className="text-left text-[10px] font-semibold uppercase tracking-[0.06em]"
                style={{ color: "var(--color-text-secondary)" }}>
                <th className="px-5 py-2.5">Supplier</th>
                <th className="px-5 py-2.5">Vendor SKU</th>
                <th className="px-5 py-2.5">Unit Cost</th>
                <th className="px-5 py-2.5">Landed Cost</th>
                <th className="px-5 py-2.5">Margin</th>
                <th className="px-5 py-2.5">MOQ</th>
                <th className="px-5 py-2.5">Lead Time</th>
                <th className="px-5 py-2.5">30d Trend</th>
                <th className="px-5 py-2.5">Price History</th>
                <th className="px-5 py-2.5">Last Order</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-table-border)]">
              {sortedItems.map((s, i) => {
                const isBest = s.last_cost_cents === cheapest?.last_cost_cents;
                const margin = retailMargins.find((m) => m.id === s.supplier_id)?.margin ?? 0;
                return (
                  <tr key={s.supplier_id}
                    className="transition-colors hover:bg-[var(--color-table-row-hover)]"
                    style={isBest ? { backgroundColor: "rgba(16,185,129,0.04)" } : {}}>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        {isBest && (
                          <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-700">Best</span>
                        )}
                        {s.is_preferred && (
                          <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-blue-700">Preferred</span>
                        )}
                        <span className="font-medium" style={{ color: "var(--color-text-primary)" }}>{s.supplier_name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-[11px]" style={{ color: "var(--color-text-secondary)" }}>{s.vendor_sku ?? "—"}</td>
                    <td className="px-5 py-3.5">
                      <span className={`font-semibold ${isBest ? "text-emerald-700" : i === sortedItems.length - 1 ? "text-red-600" : ""}`}
                        style={!isBest && i !== sortedItems.length - 1 ? { color: "var(--color-text-primary)" } : {}}>
                        {formatMoney(s.last_cost_cents)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-[11px]" style={{ color: "var(--color-text-secondary)" }}>{formatMoney(s.landed_cost_cents)}</td>
                    <td className="px-5 py-3.5">
                      <span className={`text-[11px] font-semibold ${
                        margin >= 35 ? "text-emerald-700" : margin >= 20 ? "text-amber-600" : "text-red-600"
                      }`}>
                        {margin.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-[11px]" style={{ color: "var(--color-text-secondary)" }}>{s.moq ?? "—"}</td>
                    <td className="px-5 py-3.5 text-[11px]" style={{ color: "var(--color-text-secondary)" }}>{s.lead_time_days != null ? `${s.lead_time_days}d` : "—"}</td>
                    <td className="px-5 py-3.5"><TrendBadge trend={s.price_30d_trend} /></td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-end gap-2">
                        <MiniSparkline history={s.price_history} min={minCost} max={maxCost} />
                        <div className="text-right">
                          <p className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>Low: {formatMoney(Math.min(...s.price_history.map((p) => p.cost)))}</p>
                          <p className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>High: {formatMoney(Math.max(...s.price_history.map((p) => p.cost)))}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-[11px]" style={{ color: "var(--color-text-secondary)" }}>{fmtDate(s.last_purchase_date)}</td>
                    <td className="px-5 py-3.5">
                      <button type="button"
                        onClick={() => router.push(`/purchasing/new?supplier=${s.supplier_id}&product=${productId}`)}
                        className="whitespace-nowrap rounded-lg bg-brand-600 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-[#4849d0] transition-colors">
                        Create PO
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Price history detail ───────────────────────────────────────────── */}
      <div className="rounded-xl border p-5 shadow-[var(--shadow-sm)]"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
        <h3 className="mb-4 text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Price history (last 90 days)</h3>
        <div className="space-y-4">
          {sortedItems.map((s) => (
            <div key={s.supplier_id}>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[12px] font-medium" style={{ color: "var(--color-text-secondary)" }}>{s.supplier_name}</span>
                <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>Current: {formatMoney(s.last_cost_cents)}</span>
              </div>
              <div className="flex gap-3">
                {s.price_history.map((point, idx) => {
                  const prevCost = idx > 0 ? s.price_history[idx - 1]!.cost : point.cost;
                  const pct = maxCost > minCost ? ((point.cost - minCost) / (maxCost - minCost)) * 100 : 50;
                  return (
                    <div key={idx} className="flex-1 text-center">
                      <div className="mb-1 h-12 relative flex items-end justify-center">
                        <div
                          className={`w-4 rounded-t transition-all ${
                            point.cost < prevCost ? "bg-emerald-400" : point.cost > prevCost ? "bg-red-400" : "bg-slate-300"
                          }`}
                          style={{ height: `${Math.max(8, pct)}%` }}
                        />
                      </div>
                      <p className="text-[10px] font-semibold" style={{ color: "var(--color-text-primary)" }}>{formatMoney(point.cost)}</p>
                      <p className="text-[9px]" style={{ color: "var(--color-text-muted)" }}>
                        {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(point.date))}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
