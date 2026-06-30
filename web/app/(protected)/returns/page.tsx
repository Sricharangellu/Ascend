"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { TableSkeleton } from "@/components/TableSkeleton";
import { apiGet, apiPost, ApiResponseError } from "@/api-client/client";
import { formatMoney } from "@/lib/money";
import { fmtDate } from "@/lib/date";
import { hasRole } from "@/lib/auth";
import type { Order, OrderStatus } from "@/api-client/types";

interface OrdersResponse {
  items: Order[];
  total: number;
}

interface VendorReturn {
  id: string;
  supplier_id: string | null;
  reason: "damaged" | "expired" | "other";
  total_cost_cents: number;
  credit_id: string | null;
  status: "recorded";
  created_at: number;
}

type ReturnFilter = "eligible" | "refunded" | "all";

const STATUS_BADGE: Record<OrderStatus, "green" | "blue" | "yellow" | "gray"> = {
  open: "blue",
  completed: "green",
  refunded: "yellow",
  voided: "gray",
};


export default function ReturnsPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [vendorReturns, setVendorReturns] = useState<VendorReturn[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ReturnFilter>("eligible");
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canManage = hasRole("manager");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [completedRes, refundedRes, vendorReturnRes] = await Promise.all([
        apiGet<OrdersResponse>("/api/v1/orders?status=completed&limit=50&offset=0"),
        apiGet<OrdersResponse>("/api/v1/orders?status=refunded&limit=50&offset=0"),
        apiGet<{ items: VendorReturn[] }>("/api/v1/purchasing/returns").catch(() => ({ items: [] as VendorReturn[] })),
      ]);
      const nextOrders = [...(completedRes.items ?? []), ...(refundedRes.items ?? [])].sort((a, b) => b.createdAt - a.createdAt);
      setOrders(nextOrders);
      setVendorReturns(vendorReturnRes.items ?? []);
      setSelectedOrderId((current) => current || nextOrders[0]?.id || "");
    } catch (err) {
      setError(err instanceof ApiResponseError ? err.message : "Could not load return data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredOrders = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter((order) => {
      if (filter === "eligible" && order.status !== "completed") return false;
      if (filter === "refunded" && order.status !== "refunded") return false;
      if (!q) return true;
      return [order.orderNumber, order.id, order.customerId, order.stateCode]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [filter, orders, query]);

  const selectedOrder = orders.find((order) => order.id === selectedOrderId);
  const summary = useMemo(() => {
    const eligible = orders.filter((order) => order.status === "completed");
    const refunded = orders.filter((order) => order.status === "refunded");
    return {
      eligibleCount: eligible.length,
      eligibleCents: eligible.reduce((sum, order) => sum + order.totalCents, 0),
      refundedCount: refunded.length,
      refundedCents: refunded.reduce((sum, order) => sum + order.totalCents, 0),
      vendorReturnCents: vendorReturns.reduce((sum, item) => sum + item.total_cost_cents, 0),
      vendorCreditCount: vendorReturns.filter((item) => item.credit_id).length,
    };
  }, [orders, vendorReturns]);

  const refundOrder = async (order: Order) => {
    if (!canManage || order.status !== "completed") return;
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/api/v1/orders/${order.id}/refund`, {});
      await load();
    } catch (err) {
      setError(err instanceof ApiResponseError ? err.message : "Could not refund order.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <EnterpriseShell active="returns" title="Returns" subtitle="Receipt lookup, refunds, and vendor return activity" contentClassName="overflow-y-auto">
      <div className="mx-auto w-full max-w-7xl space-y-5 px-4 py-5 sm:px-6">
        {error && (
          <div className="rounded-md border border-danger-100 bg-danger-50 px-4 py-3 text-sm text-danger-700" role="alert">
            {error}
          </div>
        )}

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <Metric label="Eligible receipts" value={summary.eligibleCount} helper={formatMoney(summary.eligibleCents)} tone="success" />
          <Metric label="Refunded orders" value={summary.refundedCount} helper={formatMoney(summary.refundedCents)} tone="warning" />
          <Metric label="Vendor returns" value={vendorReturns.length} helper={formatMoney(summary.vendorReturnCents)} tone="brand" />
          <Metric label="Credit memos" value={summary.vendorCreditCount} helper="Linked vendor credits" tone="neutral" />
          <Metric label="Return mode" value="Ready" helper="POS action bar enabled" tone="neutral" />
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <Card className="overflow-hidden p-0">
            <div className="grid gap-3 border-b border-slate-200 px-4 py-3 lg:grid-cols-[minmax(220px,1fr)_auto]">
              <label>
                <span className="sr-only">Search receipts</span>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search receipt, order ID, customer, state..."
                  className="min-h-[40px] w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
              </label>
              <div className="flex gap-1 overflow-x-auto" role="group" aria-label="Return filters">
                {(["eligible", "refunded", "all"] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setFilter(item)}
                    aria-pressed={filter === item}
                    className={`min-h-[40px] whitespace-nowrap rounded-md px-3 text-sm font-medium capitalize transition-colors ${
                      filter === item ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <TableSkeleton headers={["Order #", "Status", "Total", "Date", ""]} rows={8} />
            ) : filteredOrders.length === 0 ? (
              <div className="py-14 text-center">
                <p className="text-sm font-medium text-[var(--color-text-primary)]">No orders match this view.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredOrders.map((order) => (
                  <ReturnOrderRow
                    key={order.id}
                    order={order}
                    selected={order.id === selectedOrderId}
                    canRefund={canManage && order.status === "completed"}
                    busy={busy}
                    onSelect={() => setSelectedOrderId(order.id)}
                    onRefund={() => void refundOrder(order)}
                  />
                ))}
              </div>
            )}
          </Card>

          <div className="space-y-5">
            <Card title="Receipt Detail">
              {selectedOrder ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{selectedOrder.orderNumber}</p>
                    <p className="mt-1 text-xs text-slate-500">{fmtDate(selectedOrder.createdAt)}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <MiniStat label="Status" value={selectedOrder.status} />
                    <MiniStat label="Total" value={formatMoney(selectedOrder.totalCents)} />
                    <MiniStat label="Tax" value={formatMoney(selectedOrder.taxCents)} />
                    <MiniStat label="Lines" value={String(selectedOrder.lines.length)} />
                  </div>
                  <div className="divide-y divide-slate-100 rounded-md border border-slate-200">
                    {selectedOrder.lines.slice(0, 6).map((line) => (
                      <div key={line.id} className="flex justify-between gap-3 px-3 py-2 text-xs">
                        <span className="truncate font-medium text-slate-700">{line.name}</span>
                        <span className="shrink-0 tabular-nums text-slate-500">x{line.quantity} · {formatMoney(line.lineCents)}</span>
                      </div>
                    ))}
                  </div>
                  {canManage && selectedOrder.status === "completed" && (
                    <Button variant="danger" size="sm" fullWidth disabled={busy} onClick={() => void refundOrder(selectedOrder)}>
                      Refund receipt
                    </Button>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-500">Select a receipt to inspect return detail.</p>
              )}
            </Card>

            <Card title="Vendor Returns" noPadding>
              {vendorReturns.length === 0 ? (
                <p className="px-5 py-4 text-sm text-slate-500">No vendor returns recorded.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {vendorReturns.slice(0, 8).map((item) => (
                    <div key={item.id} className="px-5 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold capitalize text-slate-950">{item.reason}</p>
                        <span className="text-sm font-semibold tabular-nums text-slate-900">{formatMoney(item.total_cost_cents)}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {fmtDate(item.created_at)} · {item.credit_id ? "credit memo linked" : "no credit memo"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </section>
      </div>
    </EnterpriseShell>
  );
}

function ReturnOrderRow({
  order,
  selected,
  canRefund,
  busy,
  onSelect,
  onRefund,
}: {
  order: Order;
  selected: boolean;
  canRefund: boolean;
  busy: boolean;
  onSelect: () => void;
  onRefund: () => void;
}) {
  return (
    <div className={`grid gap-3 border-l-4 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_auto_auto] ${
      selected ? "border-l-brand-600 bg-brand-50/50" : order.status === "refunded" ? "border-l-warning-500 hover:bg-warning-50/40" : "border-l-success-500 hover:bg-slate-50"
    }`}>
      <button type="button" onClick={onSelect} className="min-w-0 text-left">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold text-slate-950">{order.orderNumber}</p>
          <Badge variant={STATUS_BADGE[order.status]}>{order.status}</Badge>
        </div>
        <p className="mt-1 text-xs text-slate-500">{fmtDate(order.createdAt)} · {order.lines.length} line{order.lines.length === 1 ? "" : "s"}</p>
      </button>
      <button type="button" onClick={onSelect} className="text-left lg:text-right">
        <p className="text-sm font-semibold tabular-nums text-slate-950">{formatMoney(order.totalCents)}</p>
        <p className="mt-1 text-xs text-slate-500">{order.stateCode}</p>
      </button>
      <div className="flex items-center justify-end">
        <Button variant="danger" size="sm" disabled={!canRefund || busy} onClick={onRefund}>
          Refund
        </Button>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: string | number;
  helper: string;
  tone: "neutral" | "success" | "warning" | "brand";
}) {
  const toneClass = {
    neutral: "border-slate-200 bg-white",
    success: "border-success-200 bg-success-50",
    warning: "border-warning-200 bg-warning-50",
    brand: "border-brand-200 bg-brand-50",
  }[tone];
  return (
    <div className={`rounded-md border p-4 shadow-sm ${toneClass}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-slate-950">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{helper}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-100 px-2 py-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</p>
      <p className="mt-0.5 truncate text-xs font-semibold tabular-nums text-slate-800">{value}</p>
    </div>
  );
}
