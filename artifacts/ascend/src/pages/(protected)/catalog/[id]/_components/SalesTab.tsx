
import { useCallback, useEffect, useState, useMemo } from "react";
import { apiGet, ApiResponseError } from "@/api-client/client";
import { formatMoney } from "@/lib/money";
import { fmtDate } from "@/lib/date";
import type { ProductSaleRecord, ProductSalesResponse } from "@/api-client/types";

const METHOD_LABEL: Record<string, string> = {
  cash: "Cash", card: "Card", gift_card: "Gift Card", split: "Split",
};

const METHOD_COLOR: Record<string, string> = {
  cash: "bg-emerald-100 text-emerald-700",
  card: "bg-blue-100 text-blue-700",
  gift_card: "bg-purple-100 text-purple-700",
  split: "bg-amber-100 text-amber-700",
};

type Period = "7d" | "30d" | "90d" | "all";

const PERIODS: { key: Period; label: string }[] = [
  { key: "7d",  label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
  { key: "all", label: "All time" },
];

const DAY = 86_400_000;
const CUTOFF: Record<Period, number> = {
  "7d":  Date.now() - 7  * DAY,
  "30d": Date.now() - 30 * DAY,
  "90d": Date.now() - 90 * DAY,
  "all": 0,
};

export function SalesTab({ productId }: { productId: string }) {
  const [data, setData]       = useState<ProductSalesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [period, setPeriod]   = useState<Period>("all");

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiGet<ProductSalesResponse>(`/api/v1/catalog/${productId}/sales?limit=500`);
      setData(res);
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : "Failed to load sales.");
    } finally { setLoading(false); }
  }, [productId]);

  useEffect(() => { void load(); }, [load]);

  const items = useMemo<ProductSaleRecord[]>(() => {
    const all = data?.items ?? [];
    const cut = CUTOFF[period];
    return cut > 0 ? all.filter((s) => s.date >= cut) : all;
  }, [data, period]);

  const totalRevenue = useMemo(() => items.reduce((s, r) => s + r.total_cents, 0), [items]);
  const totalUnits   = useMemo(() => items.reduce((s, r) => s + r.quantity, 0), [items]);
  const avgOrder     = items.length > 0 ? Math.round(totalRevenue / items.length) : 0;

  return (
    <div className="space-y-4">

      {/* Period filter */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 rounded-xl border p-1 shadow-[var(--shadow-sm)]"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
          {PERIODS.map(({ key, label }) => (
            <button key={key} type="button" onClick={() => setPeriod(key)}
              className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                period === key ? "bg-brand-600 text-white" : "hover:bg-[var(--color-surface-subtle)]"
              }`}
              style={period !== key ? { color: "var(--color-text-secondary)" } : {}}>
              {label}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => void load()} className="text-[11px] transition-colors hover:text-[var(--color-text-primary)]"
          style={{ color: "var(--color-text-muted)" }}>
          Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Transactions",  value: items.length },
          { label: "Units sold",    value: totalUnits.toLocaleString() },
          { label: "Revenue",       value: formatMoney(totalRevenue) },
          { label: "Avg order",     value: formatMoney(avgOrder) },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl border p-4 shadow-[var(--shadow-sm)]"
            style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
            <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>{label}</p>
            <p className="mt-1 text-[20px] font-bold" style={{ color: "var(--color-text-primary)" }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border shadow-[var(--shadow-sm)]"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
        <div className="flex items-center justify-between border-b px-5 py-3.5" style={{ borderColor: "var(--color-border)" }}>
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Sales history</h3>
          <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>{items.length} records</span>
        </div>

        {loading ? (
          <div className="space-y-2 p-4">{[1,2,3,4].map((i)=><div key={i} className="h-10 animate-skeleton rounded-lg"/>)}</div>
        ) : error ? (
          <p className="px-5 py-4 text-[13px]" style={{ color: "var(--color-danger-text)" }}>{error}</p>
        ) : items.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13px]" style={{ color: "var(--color-text-muted)" }}>
            No sales in the selected period.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead style={{ backgroundColor: "var(--color-table-header)", borderBottom: "1px solid var(--color-border)" }}>
                <tr className="text-left text-[10px] font-semibold uppercase tracking-[0.06em]"
                  style={{ color: "var(--color-text-secondary)" }}>
                  <th className="px-4 py-3">Sale #</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-right">Qty</th>
                  <th className="px-4 py-3 text-right">Unit price</th>
                  <th className="px-4 py-3 text-right">Tax</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Cashier</th>
                  <th className="px-4 py-3">Payment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-table-border)]">
                {items.map((s) => (
                  <tr key={s.id} className="transition-colors hover:bg-[var(--color-table-row-hover)]">
                    <td className="px-4 py-3 font-mono text-[11px] font-semibold text-brand-600">{s.sale_number}</td>
                    <td className="px-4 py-3 text-[11px]" style={{ color: "var(--color-text-secondary)" }}>{fmtDate(s.date)}</td>
                    <td className="px-4 py-3 text-right font-semibold" style={{ color: "var(--color-text-primary)" }}>{s.quantity}</td>
                    <td className="px-4 py-3 text-right text-[11px]" style={{ color: "var(--color-text-secondary)" }}>{formatMoney(s.unit_price_cents)}</td>
                    <td className="px-4 py-3 text-right text-[11px]" style={{ color: "var(--color-text-muted)" }}>{formatMoney(s.tax_cents)}</td>
                    <td className="px-4 py-3 text-right font-semibold" style={{ color: "var(--color-text-primary)" }}>{formatMoney(s.total_cents)}</td>
                    <td className="px-4 py-3 text-[11px]" style={{ color: "var(--color-text-secondary)" }}>{s.customer_name ?? <span style={{ color: "var(--color-text-muted)" }}>Walk-in</span>}</td>
                    <td className="px-4 py-3 text-[11px]" style={{ color: "var(--color-text-secondary)" }}>{s.cashier_name}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${METHOD_COLOR[s.payment_method] ?? "bg-slate-100 text-slate-600"}`}>
                        {METHOD_LABEL[s.payment_method] ?? s.payment_method}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
