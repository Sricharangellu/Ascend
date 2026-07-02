"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { apiGet, ApiResponseError } from "@/api-client/client";
import { formatMoney } from "@/lib/money";
import { fmtDate } from "@/lib/date";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SaleRecord {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_type: "retail" | "wholesale";
  order_id: string;
  order_number: string;
  order_date: number;
  outlet: string;
  qty_bought: number;
  unit_price_cents: number;
  discount_cents: number;
  tax_cents: number;
  total_cents: number;
  margin_pct: number;
  returned_qty: number;
  last_purchase_date: number;
}

interface SalesSummary {
  total_revenue_cents: number;
  total_qty: number;
  total_returns: number;
  unique_customers: number;
}

interface SalesResponse {
  items: SaleRecord[];
  total: number;
  summary: SalesSummary;
}

type DatePreset = "today" | "yesterday" | "7d" | "30d" | "month" | "last_month" | "quarter" | "year" | "custom";

const PRESET_LABELS: Record<DatePreset, string> = {
  today: "Today", yesterday: "Yesterday", "7d": "Last 7 days", "30d": "Last 30 days",
  month: "This month", last_month: "Last month", quarter: "This quarter", year: "This year", custom: "Custom",
};

const TYPE_BADGE: Record<string, "blue" | "purple"> = { retail: "blue", wholesale: "purple" };

// ── Component ─────────────────────────────────────────────────────────────────

export function SalesCustomerTab({ productId }: { productId: string }) {
  const router = useRouter();

  const [data, setData]         = useState<SalesResponse | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [preset, setPreset]     = useState<DatePreset>("30d");
  const [typeFilter, setTypeFilter] = useState<"all" | "retail" | "wholesale">("all");
  const [outletFilter, setOutletFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const d = await apiGet<SalesResponse>(`/api/v1/catalog/${productId}/sales-by-customer?period=${preset}`);
      setData(d);
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : "Failed to load sales data.");
    } finally { setLoading(false); }
  }, [productId, preset]);

  useEffect(() => { void load(); }, [load]);

  const outlets = data ? [...new Set(data.items.map((r) => r.outlet))] : [];

  const filtered = data?.items.filter((r) => {
    if (typeFilter !== "all" && r.customer_type !== typeFilter) return false;
    if (outletFilter !== "all" && r.outlet !== outletFilter) return false;
    return true;
  }) ?? [];

  const SELECT = "rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 outline-none focus:border-[#5D5FEF] focus:ring-1 focus:ring-[#5D5FEF]";

  return (
    <div className="space-y-5">

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Date preset pills */}
        <div className="flex flex-wrap gap-1">
          {(["today", "yesterday", "7d", "30d", "month", "quarter", "year"] as DatePreset[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPreset(p)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${preset === p ? "bg-[#5D5FEF] text-white" : "border border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700"}`}
            >
              {PRESET_LABELS[p]}
            </button>
          ))}
        </div>
        <div className="h-4 w-px bg-slate-200 hidden sm:block" />
        {/* Type filter */}
        <select className={SELECT} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}>
          <option value="all">All customers</option>
          <option value="retail">Retail</option>
          <option value="wholesale">Wholesale</option>
        </select>
        {/* Outlet filter */}
        <select className={SELECT} value={outletFilter} onChange={(e) => setOutletFilter(e.target.value)}>
          <option value="all">All outlets</option>
          {outlets.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <Button size="sm" variant="secondary" onClick={load}>Refresh</Button>
        <Button size="sm" variant="secondary" className="ml-auto">Export CSV</Button>
      </div>

      {error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {/* ── Summary cards ─────────────────────────────────────────────────── */}
      {data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Total Revenue",      value: formatMoney(data.summary.total_revenue_cents) },
            { label: "Units Sold",         value: data.summary.total_qty.toLocaleString() },
            { label: "Unique Customers",   value: data.summary.unique_customers.toString() },
            { label: "Units Returned",     value: data.summary.total_returns.toString() },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <p className="text-xs text-slate-400">{label}</p>
              <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Sales table ────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-slate-100" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 py-12 text-center">
          <p className="text-sm text-slate-400">No sales found for this period.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-3.5 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#111]">Sales by Customer</h3>
            <span className="text-xs text-slate-400">{filtered.length} record{filtered.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-4 py-2.5 text-xs font-semibold text-slate-500">Customer</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-slate-500">Order</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-slate-500">Date</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-slate-500">Outlet</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-slate-500">Qty</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-slate-500">Unit Price</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-slate-500">Discount</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-slate-500">Total</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-slate-500">Margin</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-slate-500">Returns</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-slate-500 w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => router.push(`/customers/${row.customer_id}`)}
                        className="text-left"
                      >
                        <div className="font-medium text-slate-900 hover:text-[#5D5FEF]">{row.customer_name}</div>
                        <Badge variant={TYPE_BADGE[row.customer_type]}>{row.customer_type}</Badge>
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => router.push(`/orders/${row.order_id}`)}
                        className="font-medium text-[#5D5FEF] hover:underline"
                      >
                        {row.order_number}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtDate(row.order_date)}</td>
                    <td className="px-4 py-3 text-slate-600">{row.outlet}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{row.qty_bought}</td>
                    <td className="px-4 py-3 text-slate-700">{formatMoney(row.unit_price_cents)}</td>
                    <td className="px-4 py-3">
                      {row.discount_cents > 0
                        ? <span className="text-amber-600">−{formatMoney(row.discount_cents)}</span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{formatMoney(row.total_cents)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-sm font-medium ${row.margin_pct >= 30 ? "text-emerald-600" : row.margin_pct > 0 ? "text-amber-600" : "text-red-600"}`}>
                        {row.margin_pct.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {row.returned_qty > 0
                        ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600">{row.returned_qty} returned</span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => router.push(`/customers/${row.customer_id}`)}
                          className="rounded border border-slate-200 px-2 py-0.5 text-[11px] text-slate-500 hover:bg-slate-50"
                        >
                          Customer
                        </button>
                        <button
                          type="button"
                          onClick={() => router.push(`/orders/${row.order_id}`)}
                          className="rounded border border-slate-200 px-2 py-0.5 text-[11px] text-slate-500 hover:bg-slate-50"
                        >
                          Order
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50">
                <tr>
                  <td colSpan={7} className="px-4 py-3 text-xs font-semibold text-slate-500 text-right">Totals</td>
                  <td className="px-4 py-3 text-sm font-bold text-slate-900">
                    {formatMoney(filtered.reduce((s, r) => s + r.total_cents, 0))}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-slate-500">
                    {filtered.length > 0
                      ? `${(filtered.reduce((s, r) => s + r.margin_pct, 0) / filtered.length).toFixed(1)}% avg`
                      : "—"}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
