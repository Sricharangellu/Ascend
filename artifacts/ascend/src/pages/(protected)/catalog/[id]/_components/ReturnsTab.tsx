
import { useCallback, useEffect, useState } from "react";
import { apiGet, ApiResponseError } from "@/api-client/client";
import { formatMoney } from "@/lib/money";
import { fmtDate } from "@/lib/date";
import type { ProductReturn, ProductReturnsResponse } from "@/api-client/types";

const STATUS_COLOR: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
  restocked: "bg-blue-100 text-blue-700",
};

const REASON_LABEL: Record<string, string> = {
  defective: "Defective",
  wrong_item: "Wrong item",
  customer_changed_mind: "Changed mind",
  expired: "Expired",
  damaged: "Damaged",
  other: "Other",
};

export function ReturnsTab({ productId }: { productId: string }) {
  const [data, setData] = useState<ProductReturnsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiGet<ProductReturnsResponse>(`/api/v1/catalog/${productId}/returns?limit=100`);
      setData(res);
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : "Failed to load returns.");
    } finally { setLoading(false); }
  }, [productId]);

  useEffect(() => { void load(); }, [load]);

  const items: ProductReturn[] = data?.items ?? [];
  const pendingCount = items.filter((r) => r.status === "pending").length;

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total returns", value: data?.total ?? 0, highlight: false },
          { label: "Units returned", value: data?.total_units_returned ?? 0, highlight: false },
          { label: "Total refunded", value: data ? formatMoney(data.total_refunded_cents) : "—", highlight: false },
          { label: "Pending review", value: pendingCount, highlight: pendingCount > 0 },
        ].map(({ label, value, highlight }) => (
          <div key={label} className="rounded-xl border p-4 shadow-[var(--shadow-sm)]"
            style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
            <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>{label}</p>
            <p className={`mt-1 text-[20px] font-bold ${highlight ? "text-amber-600" : ""}`}
              style={!highlight ? { color: "var(--color-text-primary)" } : {}}>{value}</p>
          </div>
        ))}
      </div>

      {pendingCount > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-700">
          <span>ℹ</span>
          <span><strong>{pendingCount}</strong> return{pendingCount !== 1 ? "s" : ""} pending review.</span>
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border shadow-[var(--shadow-sm)]"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
        <div className="flex items-center justify-between border-b px-5 py-3.5" style={{ borderColor: "var(--color-border)" }}>
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Return history</h3>
          <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>{items.length} records</span>
        </div>

        {loading ? (
          <div className="space-y-2 p-4">{[1,2,3].map((i)=><div key={i} className="h-10 animate-skeleton rounded-lg"/>)}</div>
        ) : error ? (
          <p className="px-5 py-4 text-[13px]" style={{ color: "var(--color-danger-text)" }}>{error}</p>
        ) : items.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13px]" style={{ color: "var(--color-text-muted)" }}>No returns recorded for this product.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead style={{ backgroundColor: "var(--color-table-header)", borderBottom: "1px solid var(--color-border)" }}>
                <tr className="text-left text-[10px] font-semibold uppercase tracking-[0.06em]"
                  style={{ color: "var(--color-text-secondary)" }}>
                  <th className="px-4 py-3">Return #</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Original sale</th>
                  <th className="px-4 py-3 text-right">Qty</th>
                  <th className="px-4 py-3 text-right">Refund</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-table-border)]">
                {items.map((r) => (
                  <tr key={r.id} className="transition-colors hover:bg-[var(--color-table-row-hover)]">
                    <td className="px-4 py-3 font-mono text-[11px] font-semibold text-brand-600">{r.return_number}</td>
                    <td className="px-4 py-3 text-[11px]" style={{ color: "var(--color-text-secondary)" }}>{fmtDate(r.date)}</td>
                    <td className="px-4 py-3 text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
                      {r.original_sale_number ?? <span style={{ color: "var(--color-text-muted)" }}>—</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold" style={{ color: "var(--color-text-primary)" }}>{r.quantity}</td>
                    <td className="px-4 py-3 text-right font-semibold text-red-600">{formatMoney(r.refund_cents)}</td>
                    <td className="px-4 py-3 text-[11px]" style={{ color: "var(--color-text-secondary)" }}>{REASON_LABEL[r.reason] ?? r.reason}</td>
                    <td className="px-4 py-3 text-[11px]" style={{ color: "var(--color-text-secondary)" }}>{r.customer_name ?? <span style={{ color: "var(--color-text-muted)" }}>Walk-in</span>}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${STATUS_COLOR[r.status] ?? "bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)]"}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="max-w-[120px] truncate px-4 py-3 text-[11px]" style={{ color: "var(--color-text-muted)" }}>{r.notes ?? "—"}</td>
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
