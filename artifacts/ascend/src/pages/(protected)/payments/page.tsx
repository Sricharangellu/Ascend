
import { useCallback, useEffect, useMemo, useState } from "react";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { TableSkeleton } from "@/components/TableSkeleton";
import { apiGet, ApiResponseError } from "@/api-client/client";
import { formatMoney } from "@/lib/money";
import type { Order, OrderStatus, Payment, PaymentMethod } from "@/api-client/types";
import { fmtDateTime } from "@/lib/date";

interface OrdersResponse {
  items: Order[];
  total: number;
}

type PaymentFilter = "all" | PaymentMethod;

const METHOD_BADGE: Record<PaymentMethod, "green" | "blue" | "purple"> = {
  cash: "green",
  card: "blue",
  split: "purple",
  store_credit: "green",
};

const STATUS_BADGE: Record<string, "green" | "red" | "gray"> = {
  captured: "green",
  declined: "red",
  refunded: "gray",
};

export default function PaymentsPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [payments, setPayments] = useState<Payment[]>([]);
  const [filter, setFilter] = useState<PaymentFilter>("all");
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    setLoadingOrders(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "50", offset: "0" });
      const res = await apiGet<OrdersResponse>(`/api/v1/orders?${params}`);
      const nextOrders = res.items ?? [];
      setOrders(nextOrders);
      setSelectedOrderId((current) => current || nextOrders.find((order) => order.status === "completed")?.id || nextOrders[0]?.id || "");
    } catch (err) {
      setError(err instanceof ApiResponseError ? err.message : "Could not load recent orders.");
    } finally {
      setLoadingOrders(false);
    }
  }, []);

  const loadPayments = useCallback(async (orderId: string) => {
    if (!orderId) {
      setPayments([]);
      return;
    }
    setLoadingPayments(true);
    setError(null);
    try {
      const res = await apiGet<Payment[]>(`/api/v1/payments?orderId=${encodeURIComponent(orderId)}`);
      setPayments(res ?? []);
    } catch (err) {
      setPayments([]);
      setError(err instanceof ApiResponseError ? err.message : "Could not load payments for this order.");
    } finally {
      setLoadingPayments(false);
    }
  }, []);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    void loadPayments(selectedOrderId);
  }, [loadPayments, selectedOrderId]);

  const selectedOrder = orders.find((order) => order.id === selectedOrderId);
  const filteredPayments = payments.filter((payment) => filter === "all" || payment.method === filter);
  const summary = useMemo(() => {
    return {
      captured: payments.filter((payment) => payment.status === "captured").reduce((sum, payment) => sum + payment.amountCents, 0),
      cash: payments.reduce((sum, payment) => sum + payment.cashCents, 0),
      card: payments.reduce((sum, payment) => sum + payment.cardCents, 0),
      change: payments.reduce((sum, payment) => sum + payment.changeCents, 0),
      declined: payments.filter((payment) => payment.status === "declined").length,
    };
  }, [payments]);
  const balanceCents = Math.max((selectedOrder?.totalCents ?? 0) - summary.captured, 0);

  return (
    <EnterpriseShell active="payments" title="Payments" subtitle="Order tender reconciliation and payment audit" contentClassName="overflow-y-auto">
      <div className="mx-auto w-full max-w-7xl space-y-5 px-4 py-5 sm:px-6">
        {error && (
          <div className="rounded-md border border-danger-100 bg-danger-50 px-4 py-3 text-sm text-danger-700" role="alert">
            {error}
          </div>
        )}

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <Metric label="Order total" value={formatMoney(selectedOrder?.totalCents ?? 0)} helper={selectedOrder?.orderNumber ?? "No order selected"} tone="neutral" />
          <Metric label="Captured" value={formatMoney(summary.captured)} helper={`${payments.length} tender record${payments.length === 1 ? "" : "s"}`} tone="success" />
          <Metric label="Balance due" value={formatMoney(balanceCents)} helper={balanceCents === 0 ? "Paid in full" : "Still open"} tone={balanceCents > 0 ? "warning" : "success"} />
          <Metric label="Cash / change" value={formatMoney(summary.cash)} helper={`${formatMoney(summary.change)} change`} tone="brand" />
          <Metric label="Card captured" value={formatMoney(summary.card)} helper={`${summary.declined} declined`} tone={summary.declined > 0 ? "warning" : "neutral"} />
        </section>

        <section className="grid gap-5 xl:grid-cols-[23rem_minmax(0,1fr)]">
          <Card className="overflow-hidden p-0">
            <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
              <h2 className="text-base font-semibold" style={{ color: "var(--color-text-primary)" }}>Recent Orders</h2>
              <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Select an order to inspect tender records.</p>
            </div>
            {loadingOrders ? (
              <TableSkeleton headers={["Order #", "Status", "Total"]} rows={8} />
            ) : orders.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm font-medium text-[var(--color-text-primary)]">No orders yet.</p>
              </div>
            ) : (
              <div className="max-h-[34rem] divide-y divide-[var(--color-table-border)] overflow-y-auto">
                {orders.map((order) => (
                  <OrderButton
                    key={order.id}
                    order={order}
                    selected={order.id === selectedOrderId}
                    onClick={() => setSelectedOrderId(order.id)}
                  />
                ))}
              </div>
            )}
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
              <div>
                <h2 className="text-base font-semibold" style={{ color: "var(--color-text-primary)" }}>Tender Records</h2>
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                  {selectedOrder ? `${selectedOrder.orderNumber} · ${selectedOrder.status}` : "No order selected"}
                </p>
              </div>
              <div className="flex gap-1 overflow-x-auto" role="group" aria-label="Payment method filter">
                {(["all", "cash", "card", "split"] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setFilter(item)}
                    aria-pressed={filter === item}
                    className={`min-h-[36px] rounded-md px-3 text-sm font-medium capitalize transition-colors ${
                      filter === item ? "text-white" : "hover:bg-[var(--color-surface-subtle)]"
                    }`}
                    style={filter === item
                      ? { backgroundColor: "var(--color-sidebar-bg)" }
                      : { backgroundColor: "var(--color-surface-subtle)", color: "var(--color-text-secondary)" }}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            {loadingPayments ? (
              <TableSkeleton headers={["Payment", "Method", "Amount", "Status", "Date"]} rows={5} />
            ) : filteredPayments.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm font-medium text-[var(--color-text-primary)]">No payment records for this view.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs font-semibold uppercase tracking-[0.08em]" style={{ borderBottom: "1px solid var(--color-border)", backgroundColor: "var(--color-table-header)", color: "var(--color-text-muted)" }}>
                    <tr>
                      <th className="px-4 py-3">Payment</th>
                      <th className="px-4 py-3">Method</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-4 py-3 text-right">Cash</th>
                      <th className="px-4 py-3 text-right">Card</th>
                      <th className="px-4 py-3 text-right">Change</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-table-border)]">
                    {filteredPayments.map((payment) => (
                      <tr key={payment.id} className="hover:bg-[var(--color-surface-subtle)]">
                        <td className="px-4 py-3">
                          <p className="font-mono text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>{payment.id}</p>
                          <p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>{fmtDateTime(payment.createdAt)}</p>
                          {payment.authCode && <p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>{payment.authCode}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={METHOD_BADGE[payment.method]}>{payment.method}</Badge>
                            {payment.cardLast4 && <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>•••• {payment.cardLast4}</span>}
                          </div>
                        </td>
                        <MoneyCell cents={payment.amountCents} />
                        <MoneyCell cents={payment.cashCents} muted={payment.cashCents === 0} />
                        <MoneyCell cents={payment.cardCents} muted={payment.cardCents === 0} />
                        <MoneyCell cents={payment.changeCents} muted={payment.changeCents === 0} />
                        <td className="px-4 py-3">
                          <Badge variant={STATUS_BADGE[payment.status] ?? "gray"}>{payment.status}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </section>
      </div>
    </EnterpriseShell>
  );
}

function OrderButton({ order, selected, onClick }: { order: Order; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full border-l-4 px-4 py-3 text-left transition-colors ${
        selected ? "border-l-brand-600 bg-brand-50" : "border-l-transparent hover:bg-[var(--color-surface-subtle)]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>{order.orderNumber}</p>
          <p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>{fmtDateTime(order.createdAt)}</p>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span style={{ color: "var(--color-text-muted)" }}>{order.lines.length} line{order.lines.length === 1 ? "" : "s"}</span>
        <span className="font-semibold tabular-nums" style={{ color: "var(--color-text-primary)" }}>{formatMoney(order.totalCents)}</span>
      </div>
    </button>
  );
}

function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const variant = status === "completed" ? "green" : status === "open" ? "blue" : status === "refunded" ? "yellow" : "gray";
  return <Badge variant={variant}>{status}</Badge>;
}

function MoneyCell({ cents, muted = false }: { cents: number; muted?: boolean }) {
  return (
    <td className="px-4 py-3 text-right font-medium tabular-nums" style={{ color: muted ? "var(--color-border)" : "var(--color-text-primary)" }}>
      {formatMoney(cents)}
    </td>
  );
}

function Metric({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: string;
  helper: string;
  tone: "neutral" | "success" | "warning" | "brand";
}) {
  const toneClass = {
    neutral: "border-[var(--color-border)] bg-[var(--color-surface)]",
    success: "border-success-200 bg-success-50",
    warning: "border-warning-200 bg-warning-50",
    brand: "border-brand-200 bg-brand-50",
  }[tone];
  return (
    <div className={`rounded-md border p-4 shadow-sm ${toneClass}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--color-text-muted)" }}>{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums" style={{ color: "var(--color-text-primary)" }}>{value}</p>
      <p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>{helper}</p>
    </div>
  );
}
