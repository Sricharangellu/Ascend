
import { useCallback, useEffect, useState } from "react";
import { apiGet, ApiResponseError } from "@/api-client/client";
import { formatMoney } from "@/lib/money";
import { fmtDate } from "@/lib/date";
import type { ProductInvoice, ProductInvoicesResponse } from "@/api-client/types";

const STATUS_COLOR: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  partial: "bg-blue-100 text-blue-700",
  received: "bg-emerald-100 text-emerald-700",
  invoiced: "bg-purple-100 text-purple-700",
  cancelled: "bg-red-100 text-red-700",
};

export function InvoicesTab({ productId }: { productId: string }) {
  const [data, setData] = useState<ProductInvoicesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiGet<ProductInvoicesResponse>(`/api/v1/catalog/${productId}/invoices?limit=100`);
      setData(res);
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : "Failed to load invoices.");
    } finally { setLoading(false); }
  }, [productId]);

  useEffect(() => { void load(); }, [load]);

  const items: ProductInvoice[] = data?.items ?? [];
  const pendingCount = items.filter((i) => i.status === "pending" || i.status === "partial").length;

  const totalCost = data?.total_cost_cents ?? 0;
  const totalUnits = data?.total_units_ordered ?? 0;
  const avgCost = totalUnits > 0 ? Math.round(totalCost / totalUnits) : 0;

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Purchase orders", value: data?.total ?? 0 },
          { label: "Units ordered", value: (data?.total_units_ordered ?? 0).toLocaleString() },
          { label: "Total cost", value: data ? formatMoney(data.total_cost_cents) : "—" },
          { label: "Avg landed cost", value: formatMoney(avgCost) },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl border p-4 shadow-[var(--shadow-sm)]"
            style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
            <p className="text-[11px]" style={{ color: "var(--color-text-secondary)" }}>{label}</p>
            <p className="mt-1 text-xl font-bold" style={{ color: "var(--color-text-primary)" }}>{value}</p>
          </div>
        ))}
      </div>

      {pendingCount > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-[13px] text-blue-700">
          <span>ℹ</span>
          <span><strong>{pendingCount}</strong> order{pendingCount !== 1 ? "s" : ""} pending receipt.</span>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border overflow-hidden shadow-[var(--shadow-sm)]"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
        <div className="flex items-center justify-between border-b px-5 py-3.5"
          style={{ borderColor: "var(--color-border)" }}>
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Purchase / invoice history</h3>
          <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>{items.length} records</span>
        </div>

        {loading ? (
          <div className="space-y-2 p-4">{[1,2,3].map((i) => <div key={i} className="h-10 animate-skeleton rounded" />)}</div>
        ) : error ? (
          <p className="px-5 py-4 text-[13px] text-red-600">{error}</p>
        ) : items.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13px]" style={{ color: "var(--color-text-muted)" }}>No purchase orders for this product yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead style={{ backgroundColor: "var(--color-table-header)", borderBottom: "1px solid var(--color-border)" }}>
                <tr className="text-left text-[10px] font-semibold uppercase tracking-[0.07em]"
                  style={{ color: "var(--color-text-secondary)" }}>
                  <th className="px-4 py-3">PO #</th>
                  <th className="px-4 py-3">Invoice #</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Supplier</th>
                  <th className="px-4 py-3 text-right">Qty</th>
                  <th className="px-4 py-3 text-right">Unit cost</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3">Lot</th>
                  <th className="px-4 py-3">Expiry</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-table-border)]">
                {items.map((inv) => (
                  <tr key={inv.id} className="transition-colors hover:bg-[var(--color-table-row-hover)]">
                    <td className="px-4 py-3 font-mono text-[11px] font-semibold text-brand-600">{inv.po_number}</td>
                    <td className="px-4 py-3 text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
                      {inv.invoice_number ?? <span style={{ color: "var(--color-text-muted)" }}>—</span>}
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--color-text-secondary)" }}>{fmtDate(inv.date)}</td>
                    <td className="px-4 py-3" style={{ color: "var(--color-text-secondary)" }}>{inv.supplier_name}</td>
                    <td className="px-4 py-3 text-right font-semibold" style={{ color: "var(--color-text-primary)" }}>{inv.quantity.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right" style={{ color: "var(--color-text-secondary)" }}>{formatMoney(inv.unit_cost_cents)}</td>
                    <td className="px-4 py-3 text-right font-semibold" style={{ color: "var(--color-text-primary)" }}>{formatMoney(inv.total_cost_cents)}</td>
                    <td className="px-4 py-3 text-[11px] font-mono" style={{ color: "var(--color-text-secondary)" }}>{inv.lot_code ?? "—"}</td>
                    <td className="px-4 py-3 text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
                      {inv.expiry_date ? fmtDate(inv.expiry_date) : <span style={{ color: "var(--color-text-muted)" }}>—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${STATUS_COLOR[inv.status] ?? "bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)]"}`}>
                        {inv.status}
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
