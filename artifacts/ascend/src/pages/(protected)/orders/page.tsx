
/**
 * /orders — Order history & management.
 *
 * Lists all tenant orders with status-tab filtering (all / open / completed /
 * refunded / voided). Managers and owners can refund or void orders inline.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "@/lib/router";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { Modal } from "@/components/Modal";
import { TableSkeleton } from "@/components/TableSkeleton";
import { EmptyState } from "@/components/EmptyState";
import { formatMoney } from "@/lib/money";
import { fmtDateTime } from "@/lib/date";
import { hasRole } from "@/lib/auth";
import { apiGet, apiPost, ApiResponseError } from "@/api-client/client";
import type { Order, OrderLine, OrderStatus } from "@/api-client/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrdersResponse {
  items: Order[];
  total: number;
  limit: number;
  offset: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_TABS: Array<{ label: string; value: OrderStatus | "all" }> = [
  { label: "All",       value: "all" },
  { label: "Open",      value: "open" },
  { label: "Completed", value: "completed" },
  { label: "Refunded",  value: "refunded" },
  { label: "Voided",    value: "voided" },
];

const STATUS_BADGE: Record<OrderStatus, "green" | "blue" | "red" | "gray" | "yellow" | "purple"> = {
  open:      "blue",
  completed: "green",
  refunded:  "purple",
  voided:    "gray",
};

// Status label counts (total per tab — populated when API supports it)
// For now maps to display label
const STATUS_LABEL: Record<OrderStatus | "all", string> = {
  all:       "All",
  open:      "Open",
  completed: "Completed",
  refunded:  "Refunded",
  voided:    "Voided",
};

// ─── Order lines detail table ─────────────────────────────────────────────────

function OrderLinesTable({ lines }: { lines: OrderLine[] }) {
  return (
    <table className="w-full text-left">
      <thead>
        <tr
          className="border-b"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-subtle)" }}
        >
          {["Product", "Qty", "Unit Price", "Tax", "Line Total"].map((h, i) => (
            <th
              key={h}
              className={`py-2.5 px-3 text-[11px] font-semibold uppercase tracking-[0.05em] ${i > 0 ? "text-right" : "text-left"}`}
              style={{ color: "var(--color-text-secondary)" }}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {lines.map((l) => (
          <tr key={l.id} className="border-b last:border-0" style={{ borderColor: "var(--color-border-subtle)" }}>
            <td className="py-2.5 px-3 text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>{l.name}</td>
            <td className="py-2.5 px-3 text-[13px] text-right tabular-nums" style={{ color: "var(--color-text-secondary)" }}>{l.quantity}</td>
            <td className="py-2.5 px-3 text-[13px] text-right tabular-nums" style={{ color: "var(--color-text-secondary)" }}>{formatMoney(l.unitCents)}</td>
            <td className="py-2.5 px-3 text-[12px] text-right tabular-nums" style={{ color: "var(--color-text-muted)" }}>{formatMoney(l.taxCents)}</td>
            <td className="py-2.5 px-3 text-[13px] text-right font-semibold tabular-nums" style={{ color: "var(--color-text-primary)" }}>{formatMoney(l.lineCents)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Order detail modal ───────────────────────────────────────────────────────

function OrderDetailModal({
  order,
  onClose,
  onRefund,
  onVoid,
  actionBusy,
}: {
  order: Order;
  onClose: () => void;
  onRefund: (id: string) => Promise<void>;
  onVoid: (id: string) => Promise<void>;
  actionBusy: boolean;
}) {
  const canAct = hasRole("manager");
  const canRefund = canAct && order.status === "completed";
  const canVoid   = canAct && order.status === "open";

  return (
    <Modal
      open
      onClose={onClose}
      title={`Order ${order.orderNumber}`}
      footer={
        <div className="flex items-center justify-between w-full gap-2">
          <div className="flex gap-2">
            {canRefund && (
              <Button variant="danger" size="sm" loading={actionBusy} onClick={() => void onRefund(order.id)}>
                Refund order
              </Button>
            )}
            {canVoid && (
              <Button variant="danger" size="sm" loading={actionBusy} onClick={() => void onVoid(order.id)}>
                Void order
              </Button>
            )}
          </div>
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Meta row */}
        <div
          className="flex flex-wrap items-center gap-4 rounded-lg px-4 py-3"
          style={{ backgroundColor: "var(--color-surface-subtle)", border: "1px solid var(--color-border)" }}
        >
          <div className="flex items-center gap-2 text-[13px]">
            <span style={{ color: "var(--color-text-muted)" }}>Status</span>
            <Badge variant={STATUS_BADGE[order.status]}>{STATUS_LABEL[order.status]}</Badge>
          </div>
          <div className="flex items-center gap-2 text-[13px]">
            <span style={{ color: "var(--color-text-muted)" }}>State</span>
            <span className="font-medium" style={{ color: "var(--color-text-primary)" }}>{order.stateCode}</span>
          </div>
          <div className="flex items-center gap-2 text-[13px]">
            <span style={{ color: "var(--color-text-muted)" }}>Created</span>
            <span style={{ color: "var(--color-text-secondary)" }}>{fmtDateTime(order.createdAt)}</span>
          </div>
        </div>

        {/* Lines */}
        <div className="overflow-hidden rounded-lg border" style={{ borderColor: "var(--color-border)" }}>
          <OrderLinesTable lines={order.lines} />
        </div>

        {/* Totals */}
        <div
          className="space-y-2 rounded-lg px-4 py-3"
          style={{ backgroundColor: "var(--color-surface-subtle)", border: "1px solid var(--color-border)" }}
        >
          <div className="flex justify-between text-[13px]">
            <span style={{ color: "var(--color-text-secondary)" }}>Subtotal</span>
            <span className="tabular-nums" style={{ color: "var(--color-text-primary)" }}>{formatMoney(order.subtotalCents)}</span>
          </div>
          {order.discountCents > 0 && (
            <div className="flex justify-between text-[13px]">
              <span className="text-success-600">Discount</span>
              <span className="tabular-nums text-success-600">−{formatMoney(order.discountCents)}</span>
            </div>
          )}
          <div className="flex justify-between text-[13px]">
            <span style={{ color: "var(--color-text-secondary)" }}>Tax</span>
            <span className="tabular-nums" style={{ color: "var(--color-text-primary)" }}>{formatMoney(order.taxCents)}</span>
          </div>
          <div
            className="flex justify-between border-t pt-2 text-[14px] font-bold"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
          >
            <span>Total</span>
            <span className="tabular-nums">{formatMoney(order.totalCents)}</span>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OrdersPage() {
  const router = useRouter();
  const [tab, setTab]       = useState<OrderStatus | "all">("all");
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal]   = useState(0);
  const [offset, setOffset] = useState(0);
  const LIMIT = 25;

  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [actionBusy, setActionBusy]       = useState(false);

  const load = useCallback(
    async (tabValue: OrderStatus | "all", off: number) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ limit: String(LIMIT), offset: String(off) });
        if (tabValue !== "all") params.set("status", tabValue);
        const res = await apiGet<OrdersResponse>(`/api/v1/orders?${params}`);
        setOrders(res.items ?? []);
        setTotal(res.total ?? 0);
      } catch (err) {
        setError(err instanceof ApiResponseError ? err.message : "Could not load orders.");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => { void load(tab, offset); }, [load, tab, offset]);

  const changeTab = (t: OrderStatus | "all") => { setTab(t); setOffset(0); };

  const handleRefund = useCallback(
    async (id: string) => {
      setActionBusy(true);
      try {
        await apiPost(`/api/v1/orders/${id}/refund`, {});
        setSelectedOrder(null);
        await load(tab, offset);
      } catch (err) {
        alert(err instanceof ApiResponseError ? err.message : "Refund failed.");
      } finally {
        setActionBusy(false);
      }
    },
    [load, tab, offset],
  );

  const handleVoid = useCallback(
    async (id: string) => {
      setActionBusy(true);
      try {
        await apiPost(`/api/v1/orders/${id}/void`, {});
        setSelectedOrder(null);
        await load(tab, offset);
      } catch (err) {
        alert(err instanceof ApiResponseError ? err.message : "Void failed.");
      } finally {
        setActionBusy(false);
      }
    },
    [load, tab, offset],
  );

  const hasPrev = offset > 0;
  const hasNext = offset + LIMIT < total;

  return (
    <EnterpriseShell
      active="orders"
      title="Orders"
      subtitle="Order history & management"
      contentClassName="overflow-y-auto"
    >
      <div className="mx-auto w-full max-w-7xl space-y-4 px-5 py-5 sm:px-6">

        {/* ── Page header ──────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4" style={{ borderColor: "var(--color-border)" }}>
          <div>
            <h1 className="text-[20px] font-bold tracking-tight" style={{ color: "var(--color-text-primary)" }}>Orders</h1>
            <p className="mt-0.5 text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
              {total > 0 ? `${total.toLocaleString()} order${total !== 1 ? "s" : ""}` : "All orders across the tenant"}
            </p>
          </div>
        </div>

        {/* ── Status tab bar ────────────────────────────────────────────── */}
        <div
          className="flex gap-0.5 rounded-xl border p-1 w-fit shadow-[var(--shadow-xs)]"
          role="tablist"
          aria-label="Filter orders by status"
          style={{ backgroundColor: "var(--color-surface)", borderColor: "var(--color-border)" }}
        >
          {STATUS_TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={tab === t.value}
              onClick={() => changeTab(t.value)}
              className={[
                "min-h-[34px] rounded-lg px-4 text-[13px] font-medium transition-all duration-150",
                tab === t.value
                  ? "bg-brand-600 text-white shadow-[var(--shadow-xs)]"
                  : "hover:bg-[var(--color-surface-subtle)]",
              ].join(" ")}
              style={{ color: tab === t.value ? undefined : "var(--color-text-secondary)" }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Error ────────────────────────────────────────────────────── */}
        {error && (
          <div
            role="alert"
            className="rounded-xl border px-4 py-3 text-[13px]"
            style={{
              backgroundColor: "var(--color-danger-bg)",
              borderColor: "var(--color-danger-border)",
              color: "var(--color-danger-text)",
            }}
          >
            {error}
          </div>
        )}

        {/* ── Table ────────────────────────────────────────────────────── */}
        {loading ? (
          <TableSkeleton headers={["Order #", "Status", "Customer", "Outlet", "Total", "Date", ""]} rows={8} />
        ) : orders.length === 0 ? (
          <EmptyState
            title={tab === "all" ? "No orders yet" : `No ${tab} orders`}
            description={tab === "all" ? "Ring up your first sale on the Register." : undefined}
          />
        ) : (
          <div
            className="overflow-hidden rounded-xl border shadow-[var(--shadow-sm)]"
            style={{ backgroundColor: "var(--color-surface)", borderColor: "var(--color-border)" }}
          >
            <table className="w-full text-left">
              <thead style={{ backgroundColor: "var(--color-table-header)", borderBottom: "1px solid var(--color-border)" }}>
                <tr>
                  {[
                    { label: "Order #",   cls: "" },
                    { label: "Status",    cls: "" },
                    { label: "Customer",  cls: "" },
                    { label: "Outlet",    cls: "" },
                    { label: "Total",     cls: "text-right" },
                    { label: "Date",      cls: "" },
                    { label: "",          cls: "" },
                  ].map(({ label, cls }) => (
                    <th
                      key={label}
                      className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] ${cls}`}
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody style={{ borderColor: "var(--color-table-border)" }}>
                {orders.map((order) => (
                  <tr
                    key={order.id}
                    className="group cursor-pointer transition-colors duration-100 border-b last:border-0"
                    style={{ borderColor: "var(--color-table-border)" }}
                    onClick={() => router.push(`/orders/${order.id}`)}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--color-table-row-hover)")}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "")}
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono text-[12px] font-bold text-brand-600">
                        {order.orderNumber}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_BADGE[order.status]}>
                        {STATUS_LABEL[order.status]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-[13px]" style={{ color: "var(--color-text-primary)" }}>
                      {(order as unknown as { customer_name?: string }).customer_name
                        ?? <span style={{ color: "var(--color-text-muted)" }}>Guest</span>}
                    </td>
                    <td className="px-4 py-3 text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
                      {(order as unknown as { outlet_name?: string }).outlet_name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-[13px] font-semibold tabular-nums" style={{ color: "var(--color-text-primary)" }}>
                      {formatMoney(order.totalCents)}
                    </td>
                    <td className="px-4 py-3 text-[12px] whitespace-nowrap" style={{ color: "var(--color-text-secondary)" }}>
                      {fmtDateTime(order.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className="text-[12px] font-medium transition-colors"
                        style={{ color: "var(--color-text-muted)" }}
                        onMouseEnter={(e) => ((e.target as HTMLElement).style.color = "var(--color-primary)")}
                        onMouseLeave={(e) => ((e.target as HTMLElement).style.color = "var(--color-text-muted)")}
                      >
                        View →
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Pagination ────────────────────────────────────────────────── */}
        {total > LIMIT && (
          <div className="flex items-center justify-between">
            <span className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
              Showing {offset + 1}–{Math.min(offset + LIMIT, total)} of {total.toLocaleString()}
            </span>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={!hasPrev}
                onClick={() => setOffset((o) => Math.max(0, o - LIMIT))}
              >
                ← Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={!hasNext}
                onClick={() => setOffset((o) => o + LIMIT)}
              >
                Next →
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Detail modal ──────────────────────────────────────────────── */}
      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onRefund={handleRefund}
          onVoid={handleVoid}
          actionBusy={actionBusy}
        />
      )}
    </EnterpriseShell>
  );
}
