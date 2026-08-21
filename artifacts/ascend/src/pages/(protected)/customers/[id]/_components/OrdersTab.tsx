
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "@/lib/router";
import { apiGet, ApiResponseError } from "@/api-client/client";
import { formatMoney } from "@/lib/money";
import { fmtDateTime } from "@/lib/date";

interface CustomerOrder {
  id: string; orderNumber: string; status: string; totalCents: number;
  subtotalCents: number; taxCents: number; discountCents: number;
  outlet_name?: string; cashier_name?: string; channel?: string; createdAt: number;
  lines?: Array<{ name: string; quantity: number; unitCents: number }>;
}

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  open:      { bg: "bg-blue-100",    text: "text-blue-700" },
  completed: { bg: "bg-emerald-100", text: "text-emerald-700" },
  refunded:  { bg: "bg-amber-100",   text: "text-amber-700" },
  voided:    { bg: "bg-red-100",     text: "text-red-600" },
};

export function OrdersTab({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [orders, setOrders]   = useState<CustomerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiGet<{ items: CustomerOrder[] }>("/api/v1/orders?limit=200");
      const customerOrders = (res.items ?? []).filter(
        (o) => (o as unknown as { customerId?: string }).customerId === customerId
      );
      setOrders(customerOrders);
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : "Failed to load orders.");
    } finally { setLoading(false); }
  }, [customerId]);

  useEffect(() => { void load(); }, [load]);

  const totalSpend  = orders.filter((o) => o.status === "completed").reduce((s, o) => s + o.totalCents, 0);
  const totalOrders = orders.length;
  const avgOrder    = totalOrders > 0 ? Math.round(totalSpend / Math.max(1, orders.filter((o) => o.status === "completed").length)) : 0;
  const lastOrder   = orders.length > 0 ? orders.reduce((a, b) => a.createdAt > b.createdAt ? a : b) : null;

  if (loading) return (
    <div className="space-y-2">{[1,2,3].map((i) => <div key={i} className="h-14 animate-skeleton rounded-lg" />)}</div>
  );

  if (error) return (
    <p role="alert" className="rounded-xl border px-4 py-3 text-[13px]"
      style={{ backgroundColor: "var(--color-danger-bg)", borderColor: "var(--color-danger-border)", color: "var(--color-danger-text)" }}>
      {error}
    </p>
  );

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total orders",   value: totalOrders,                                         cls: "" },
          { label: "Lifetime spend", value: formatMoney(totalSpend),                              cls: "text-emerald-700" },
          { label: "Avg order",      value: avgOrder > 0 ? formatMoney(avgOrder) : "—",          cls: "" },
          { label: "Last order",     value: lastOrder ? fmtDateTime(lastOrder.createdAt) : "—",  cls: "" },
        ].map(({ label, value, cls }) => (
          <div key={label} className="rounded-xl border px-4 py-3 shadow-[var(--shadow-sm)]"
            style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
            <p className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>{label}</p>
            <p className={`mt-0.5 text-[13px] font-bold ${cls}`}
              style={!cls ? { color: "var(--color-text-primary)" } : {}}>{value}</p>
          </div>
        ))}
      </div>

      {/* Orders table */}
      {orders.length === 0 ? (
        <div className="rounded-xl border border-dashed py-12 text-center"
          style={{ borderColor: "var(--color-border)" }}>
          <p className="text-[13px]" style={{ color: "var(--color-text-muted)" }}>No orders found for this customer.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border shadow-[var(--shadow-sm)]"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
          <table className="w-full text-[13px]">
            <thead style={{ backgroundColor: "var(--color-table-header)", borderBottom: "1px solid var(--color-border)" }}>
              <tr className="text-left text-[10px] font-semibold uppercase tracking-[0.07em]"
                style={{ color: "var(--color-text-secondary)" }}>
                <th className="px-5 py-2.5">Order #</th>
                <th className="px-5 py-2.5">Status</th>
                <th className="px-5 py-2.5">Outlet</th>
                <th className="px-5 py-2.5 text-right">Total</th>
                <th className="px-5 py-2.5">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-table-border)]">
              {[...orders].sort((a, b) => b.createdAt - a.createdAt).map((order) => {
                const st = STATUS_STYLES[order.status] ?? STATUS_STYLES.open;
                return (
                  <tr key={order.id} className="group cursor-pointer transition-colors hover:bg-[var(--color-table-row-hover)]"
                    onClick={() => router.push(`/orders/${order.id}`)}>
                    <td className="px-5 py-3.5">
                      <span className="font-semibold text-brand-600">{order.orderNumber}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold capitalize ${st.bg} ${st.text}`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
                      {order.outlet_name ?? "—"}
                    </td>
                    <td className="px-5 py-3.5 text-right font-semibold" style={{ color: "var(--color-text-primary)" }}>
                      {formatMoney(order.totalCents)}
                    </td>
                    <td className="px-5 py-3.5 text-[11px] whitespace-nowrap" style={{ color: "var(--color-text-muted)" }}>
                      {fmtDateTime(order.createdAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
