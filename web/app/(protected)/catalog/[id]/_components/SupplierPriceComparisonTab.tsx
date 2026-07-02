"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { apiGet, ApiResponseError } from "@/api-client/client";
import { formatMoney } from "@/lib/money";
import { fmtDate } from "@/lib/date";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PricePoint { date: number; cost: number; }

interface SupplierPriceRow {
  supplier_id: string;
  supplier_name: string;
  is_preferred: boolean;
  vendor_sku: string | null;
  last_purchase_date: number;
  last_cost_cents: number;
  landed_cost_cents: number;
  moq: number | null;
  lead_time_days: number | null;
  price_30d_trend: "up" | "down" | "stable";
  price_history: PricePoint[];
}

interface ComparisonData {
  items: SupplierPriceRow[];
  best_price_supplier_id: string;
  current_retail_price_cents: number;
}

// ── Tiny trend sparkline ──────────────────────────────────────────────────────

function TrendSparkline({ history }: { history: PricePoint[] }) {
  if (history.length < 2) return null;
  const costs  = history.map((h) => h.cost);
  const minC   = Math.min(...costs);
  const maxC   = Math.max(...costs);
  const range  = maxC - minC || 1;
  const w = 80; const h = 28; const pad = 2;
  const pts = history.map((pt, i) => {
    const x = pad + (i / (history.length - 1)) * (w - pad * 2);
    const y = pad + ((1 - (pt.cost - minC) / range) * (h - pad * 2));
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const color = history[history.length - 1].cost <= history[0].cost ? "#10b981" : "#ef4444";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-7 w-20" aria-hidden="true">
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ── Trend label ───────────────────────────────────────────────────────────────

function TrendBadge({ trend }: { trend: "up" | "down" | "stable" }) {
  if (trend === "down")   return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">↓ Falling</span>;
  if (trend === "up")     return <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-600">↑ Rising</span>;
  return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">→ Stable</span>;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SupplierPriceComparisonTab({ productId }: { productId: string }) {
  const router = useRouter();
  const [data, setData]       = useState<ComparisonData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [sortBy, setSortBy]   = useState<"cost" | "landed" | "lead_time">("cost");

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const d = await apiGet<ComparisonData>(`/api/v1/catalog/${productId}/supplier-price-comparison`);
      setData(d);
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : "Failed to load supplier prices.");
    } finally { setLoading(false); }
  }, [productId]);

  useEffect(() => { void load(); }, [load]);

  const sorted = data
    ? [...data.items].sort((a, b) => {
        if (sortBy === "cost")      return a.last_cost_cents - b.last_cost_cents;
        if (sortBy === "landed")    return a.landed_cost_cents - b.landed_cost_cents;
        if (sortBy === "lead_time") return (a.lead_time_days ?? 999) - (b.lead_time_days ?? 999);
        return 0;
      })
    : [];

  const SELECT = "rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 outline-none focus:border-[#5D5FEF]";

  if (loading) return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-lg bg-slate-100" />)}
    </div>
  );

  if (error) return <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>;
  if (!data || data.items.length === 0) return (
    <div className="rounded-lg border border-dashed border-slate-200 py-12 text-center">
      <p className="text-sm text-slate-400">No supplier price data available. Add suppliers on the Suppliers tab.</p>
    </div>
  );

  const bestPrice = Math.min(...data.items.map((s) => s.last_cost_cents));
  const worstPrice = Math.max(...data.items.map((s) => s.last_cost_cents));

  return (
    <div className="space-y-5">

      {/* ── Best price alert ──────────────────────────────────────────────── */}
      {data.items.length > 1 && (
        (() => {
          const best = data.items.find((s) => s.supplier_id === data.best_price_supplier_id);
          const current = data.items.find((s) => s.is_preferred);
          if (!best || !current || best.supplier_id === current.supplier_id) return null;
          const saving = current.last_cost_cents - best.last_cost_cents;
          return (
            <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
              </svg>
              <span className="text-emerald-800">
                <strong>{best.supplier_name}</strong> offers a lower price — saves <strong>{formatMoney(saving)}/unit</strong> vs your preferred supplier.
              </span>
            </div>
          );
        })()
      )}

      {/* ── Sort + header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{data.items.length} supplier{data.items.length !== 1 ? "s" : ""} compared</p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Sort by</span>
          <select className={SELECT} value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
            <option value="cost">Unit cost</option>
            <option value="landed">Landed cost</option>
            <option value="lead_time">Lead time</option>
          </select>
        </div>
      </div>

      {/* ── Supplier cards ────────────────────────────────────────────────── */}
      <div className="space-y-3">
        {sorted.map((row) => {
          const isBest     = row.last_cost_cents === bestPrice;
          const isWorst    = row.last_cost_cents === worstPrice && data.items.length > 1;
          const marginVsRetail = data.current_retail_price_cents > 0
            ? ((data.current_retail_price_cents - row.last_cost_cents) / data.current_retail_price_cents) * 100
            : null;

          return (
            <div
              key={row.supplier_id}
              className={`rounded-lg border bg-white shadow-sm transition-all ${isBest ? "border-emerald-300" : row.is_preferred ? "border-[#5D5FEF]" : "border-slate-200"}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                {/* Left: supplier info */}
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">{row.supplier_name}</span>
                    {row.is_preferred && <Badge variant="blue">Preferred</Badge>}
                    {isBest && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">Best price</span>}
                    {isWorst && !isBest && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] text-red-500">Highest</span>}
                  </div>
                  {row.vendor_sku && <p className="mt-0.5 text-[11px] text-slate-400">Vendor SKU: {row.vendor_sku}</p>}
                </div>

                {/* Right: price + sparkline */}
                <div className="flex items-center gap-4">
                  <TrendSparkline history={row.price_history} />
                  <div className="text-right">
                    <p className={`text-xl font-bold ${isBest ? "text-emerald-600" : "text-slate-900"}`}>
                      {formatMoney(row.last_cost_cents)}
                    </p>
                    <p className="text-[11px] text-slate-400">per unit</p>
                  </div>
                </div>
              </div>

              {/* Stats row */}
              <div className="border-t border-slate-100 px-5 py-3">
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
                  <span>Landed cost: <strong className="text-slate-700">{formatMoney(row.landed_cost_cents)}</strong></span>
                  <span>MOQ: <strong className="text-slate-700">{row.moq ?? "—"}</strong></span>
                  <span>Lead time: <strong className="text-slate-700">{row.lead_time_days != null ? `${row.lead_time_days}d` : "—"}</strong></span>
                  <span>Last bought: <strong className="text-slate-700">{fmtDate(row.last_purchase_date)}</strong></span>
                  {marginVsRetail != null && (
                    <span>Margin at retail: <strong className={`${marginVsRetail >= 30 ? "text-emerald-600" : marginVsRetail > 0 ? "text-amber-600" : "text-red-600"}`}>{marginVsRetail.toFixed(1)}%</strong></span>
                  )}
                  <TrendBadge trend={row.price_30d_trend} />
                </div>
              </div>

              {/* Price history bar */}
              <div className="border-t border-slate-100 px-5 py-2.5">
                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                  <span>90d history:</span>
                  {row.price_history.map((pt, i) => (
                    <span key={i} className="rounded bg-slate-50 px-1.5 py-0.5">
                      {new Date(pt.date).toLocaleDateString("en-US", { month: "short" })}: <strong className="text-slate-700">{formatMoney(pt.cost)}</strong>
                    </span>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="border-t border-slate-100 px-5 py-3 flex justify-end gap-2">
                {!row.is_preferred && (
                  <button type="button" className="rounded border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
                    Set as preferred
                  </button>
                )}
                <Button
                  size="sm"
                  variant={isBest ? "primary" : "secondary"}
                  onClick={() => router.push(`/purchasing?supplier=${row.supplier_id}&product=${productId}`)}
                >
                  Create PO with this supplier
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
