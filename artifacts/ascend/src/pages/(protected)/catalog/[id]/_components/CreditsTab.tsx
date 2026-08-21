
import { useCallback, useEffect, useState } from "react";
import { apiGet, ApiResponseError } from "@/api-client/client";
import { formatMoney } from "@/lib/money";
import { fmtDate } from "@/lib/date";
import type { ProductCredit, ProductCreditsResponse } from "@/api-client/types";

const STATUS_COLOR: Record<string, string> = {
  issued: "bg-blue-100 text-blue-700",
  applied: "bg-emerald-100 text-emerald-700",
  expired: "bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)]",
  voided: "bg-red-100 text-red-700",
};

export function CreditsTab({ productId }: { productId: string }) {
  const [data, setData] = useState<ProductCreditsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiGet<ProductCreditsResponse>(`/api/v1/catalog/${productId}/credits?limit=100`);
      setData(res);
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : "Failed to load credits.");
    } finally { setLoading(false); }
  }, [productId]);

  useEffect(() => { void load(); }, [load]);

  const items: ProductCredit[] = data?.items ?? [];
  const issuedCount = items.filter((c) => c.status === "issued").length;

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: "Total credits", value: data?.total ?? 0 },
          { label: "Outstanding credits", value: data ? formatMoney(data.total_credits_cents) : "—" },
          { label: "Issued (outstanding)", value: issuedCount },
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
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Credit notes</h3>
          <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>{items.length} records</span>
        </div>

        {loading ? (
          <div className="space-y-2 p-4">{[1,2,3].map((i)=><div key={i} className="h-10 animate-skeleton rounded-lg"/>)}</div>
        ) : error ? (
          <p className="px-5 py-4 text-[13px]" style={{ color: "var(--color-danger-text)" }}>{error}</p>
        ) : items.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13px]" style={{ color: "var(--color-text-muted)" }}>No credit notes for this product.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead style={{ backgroundColor: "var(--color-table-header)", borderBottom: "1px solid var(--color-border)" }}>
                <tr className="text-left text-[10px] font-semibold uppercase tracking-[0.06em]"
                  style={{ color: "var(--color-text-secondary)" }}>
                  <th className="px-4 py-3">Credit #</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Expires</th>
                  <th className="px-4 py-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-table-border)]">
                {items.map((c) => (
                  <tr key={c.id} className="transition-colors hover:bg-[var(--color-table-row-hover)]">
                    <td className="px-4 py-3 font-mono text-[11px] font-semibold text-brand-600">{c.credit_number}</td>
                    <td className="px-4 py-3 text-[11px]" style={{ color: "var(--color-text-secondary)" }}>{fmtDate(c.date)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-600">{formatMoney(c.amount_cents)}</td>
                    <td className="max-w-[160px] truncate px-4 py-3 text-[11px]" style={{ color: "var(--color-text-secondary)" }}>{c.reason}</td>
                    <td className="px-4 py-3 text-[11px]" style={{ color: "var(--color-text-secondary)" }}>{c.customer_name ?? <span style={{ color: "var(--color-text-muted)" }}>—</span>}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${STATUS_COLOR[c.status] ?? "bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)]"}`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
                      {c.expires_at ? fmtDate(c.expires_at) : <span style={{ color: "var(--color-text-muted)" }}>No expiry</span>}
                    </td>
                    <td className="max-w-[120px] truncate px-4 py-3 text-[11px]" style={{ color: "var(--color-text-muted)" }}>{c.notes ?? "—"}</td>
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
