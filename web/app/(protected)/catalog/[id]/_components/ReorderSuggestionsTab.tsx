"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { apiGet, ApiResponseError } from "@/api-client/client";
import { formatMoney } from "@/lib/money";
import { fmtDate } from "@/lib/date";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ReorderData {
  current_stock: number;
  reserved_stock: number;
  available_stock: number;
  incoming_stock: number;
  reorder_point: number;
  safety_stock: number;
  avg_daily_sales: number;
  days_until_stockout: number;
  suggested_qty: number;
  preferred_supplier_id: string;
  preferred_supplier_name: string;
  preferred_supplier_lead_days: number;
  preferred_supplier_cost_cents: number;
  best_price_supplier_id: string;
  best_price_supplier_name: string;
  best_price_supplier_cost_cents: number;
  savings_per_unit_cents: number;
  reason: string;
  last_reorder_date: number;
  open_po_qty: number;
  status: "suggested" | "in_progress" | "ordered" | "ok";
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ReorderSuggestionsTab({ productId }: { productId: string }) {
  const router  = useRouter();
  const [data, setData]       = useState<ReorderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const d = await apiGet<ReorderData>(`/api/v1/catalog/${productId}/reorder-suggestions`);
      setData(d);
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : "Failed to load reorder data.");
    } finally { setLoading(false); }
  }, [productId]);

  useEffect(() => { void load(); }, [load]);

  const stockoutUrgency = data
    ? data.days_until_stockout <= 3 ? "red"
    : data.days_until_stockout <= 7 ? "yellow"
    : "green"
    : "gray";

  const urgencyLabel = data
    ? data.days_until_stockout <= 0 ? "Out of stock"
    : data.days_until_stockout <= 3 ? `${data.days_until_stockout}d to stockout`
    : data.days_until_stockout <= 7 ? `~${data.days_until_stockout}d to stockout`
    : "Stock OK"
    : "";

  if (loading) return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse rounded-lg bg-slate-100" />)}
    </div>
  );

  if (error) return <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>;
  if (!data) return null;

  return (
    <div className="space-y-5">

      {/* ── Urgency banner ────────────────────────────────────────────────── */}
      {data.days_until_stockout <= 7 && (
        <div role="alert" className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium ${stockoutUrgency === "red" ? "bg-red-50 border border-red-200 text-red-700" : "bg-amber-50 border border-amber-200 text-amber-700"}`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          {data.reason}
        </div>
      )}

      {/* ── Stock snapshot ────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <h3 className="text-sm font-semibold text-[#111]">Stock Snapshot</h3>
          <Badge variant={stockoutUrgency}>{urgencyLabel}</Badge>
        </div>
        <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-5">
          {[
            { label: "On Hand",      value: data.current_stock,    color: "text-slate-900" },
            { label: "Reserved",     value: data.reserved_stock,   color: "text-amber-600" },
            { label: "Available",    value: data.available_stock,  color: data.available_stock <= data.reorder_point ? "text-red-600" : "text-emerald-600" },
            { label: "Incoming",     value: data.incoming_stock,   color: "text-blue-600" },
            { label: "Reorder Point",value: data.reorder_point,    color: "text-slate-500" },
          ].map(({ label, value, color }) => (
            <div key={label} className="text-center">
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              <p className="mt-0.5 text-xs text-slate-400">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Reorder formula ───────────────────────────────────────────────── */}
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-3.5">
          <h3 className="text-sm font-semibold text-[#111]">Suggested Order Quantity</h3>
        </div>
        <div className="p-5 space-y-4">
          {/* Formula display */}
          <div className="rounded-lg bg-slate-50 px-4 py-3 text-xs text-slate-500 font-mono">
            <span className="text-slate-400">Formula: </span>
            <span className="text-slate-700">(Avg Daily Sales × Lead Time) + Safety Stock − Available − Incoming</span>
          </div>
          <div className="rounded-lg bg-slate-50 px-4 py-3 text-xs font-mono">
            <span className="text-slate-400">= </span>
            <span className="text-slate-700">({data.avg_daily_sales} × {data.preferred_supplier_lead_days}d) + {data.safety_stock} − {data.available_stock} − {data.incoming_stock}</span>
            <span className="ml-2 text-lg font-bold text-[#5D5FEF]">= {data.suggested_qty} units</span>
          </div>
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3 text-center text-xs">
            <div className="rounded border border-slate-200 py-2">
              <p className="font-semibold text-slate-900">{data.avg_daily_sales}/day</p>
              <p className="text-slate-400">Avg daily sales</p>
            </div>
            <div className="rounded border border-slate-200 py-2">
              <p className="font-semibold text-slate-900">{data.safety_stock} units</p>
              <p className="text-slate-400">Safety stock</p>
            </div>
            <div className="rounded border border-slate-200 py-2">
              <p className="font-semibold text-slate-900">{data.preferred_supplier_lead_days} days</p>
              <p className="text-slate-400">Lead time</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Supplier options ──────────────────────────────────────────────── */}
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-3.5">
          <h3 className="text-sm font-semibold text-[#111]">Supplier Options</h3>
        </div>
        <div className="divide-y divide-slate-100">
          {/* Preferred supplier */}
          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-900">{data.preferred_supplier_name}</span>
                <Badge variant="blue">Preferred</Badge>
              </div>
              <div className="mt-1 flex gap-4 text-xs text-slate-500">
                <span>Cost: <strong className="text-slate-700">{formatMoney(data.preferred_supplier_cost_cents)}/unit</strong></span>
                <span>Lead time: <strong className="text-slate-700">{data.preferred_supplier_lead_days}d</strong></span>
                <span>Total: <strong className="text-slate-700">{formatMoney(data.preferred_supplier_cost_cents * data.suggested_qty)}</strong></span>
              </div>
            </div>
            <Button size="sm" variant="primary" onClick={() => router.push(`/purchasing?supplier=${data.preferred_supplier_id}&product=${productId}&qty=${data.suggested_qty}`)}>
              Create PO
            </Button>
          </div>
          {/* Best price supplier (if different) */}
          {data.best_price_supplier_id !== data.preferred_supplier_id && (
            <div className="flex items-center justify-between px-5 py-4 bg-emerald-50/50">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900">{data.best_price_supplier_name}</span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                    Best price — saves {formatMoney(data.savings_per_unit_cents)}/unit
                  </span>
                </div>
                <div className="mt-1 flex gap-4 text-xs text-slate-500">
                  <span>Cost: <strong className="text-emerald-700">{formatMoney(data.best_price_supplier_cost_cents)}/unit</strong></span>
                  <span>Total saving: <strong className="text-emerald-700">{formatMoney(data.savings_per_unit_cents * data.suggested_qty)}</strong> on {data.suggested_qty} units</span>
                </div>
              </div>
              <Button size="sm" variant="secondary" onClick={() => router.push(`/purchasing?supplier=${data.best_price_supplier_id}&product=${productId}&qty=${data.suggested_qty}`)}>
                Create PO
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ── Metadata ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-400">
        {data.last_reorder_date && <span>Last reordered: <strong className="text-slate-600">{fmtDate(data.last_reorder_date)}</strong></span>}
        {data.open_po_qty > 0 && <span>Open PO qty: <strong className="text-slate-600">{data.open_po_qty} units</strong></span>}
        <button type="button" onClick={() => router.push(`/inventory/pipeline`)} className="text-[#5D5FEF] hover:underline">
          View in Inventory Pipeline →
        </button>
      </div>
    </div>
  );
}
