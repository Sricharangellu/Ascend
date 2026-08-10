"use client";

/**
 * /orders — Order history.
 *
 * Lists tenant orders with server-side status filtering and paging. Selecting a
 * row opens `/orders/[id]`, which owns the detail view AND the refund/void
 * actions (with confirm dialogs, toasts and error handling).
 *
 * This page deliberately owns NO write actions. It previously carried a second,
 * unreachable refund/void implementation — an `OrderDetailModal` plus handlers
 * that could never open, because `setSelectedOrder` was only ever called with
 * `null` while row clicks navigated to the detail page. That dead copy used
 * `alert()` where the live one uses toasts, which is exactly the duplicate
 * business logic AGENTS.md warns about: two implementations of a money-moving
 * operation, free to drift, with only one of them reachable. Removed 2026-08-10.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { PageShell } from "@/components/PageShell";
import { DataTable, type DataColumn } from "@/components/DataTable";
import { Badge } from "@/components/Badge";
import { formatMoney } from "@/lib/money";
import { fmtDateTime } from "@/lib/date";
import { apiGet, ApiResponseError } from "@/api-client/client";
import type { Order, OrderStatus } from "@/api-client/types";

interface OrdersResponse {
  items: Order[];
  total: number;
  limit: number;
  offset: number;
}

const LIMIT = 25;

const STATUS_FILTERS: Array<{ label: string; value: OrderStatus | "all" }> = [
  { label: "All", value: "all" },
  { label: "Open", value: "open" },
  { label: "Completed", value: "completed" },
  { label: "Refunded", value: "refunded" },
  { label: "Voided", value: "voided" },
];

const STATUS_BADGE: Record<OrderStatus, "green" | "blue" | "red" | "gray" | "yellow"> = {
  open: "blue",
  completed: "green",
  refunded: "yellow",
  voided: "gray",
};

/**
 * Status filter. These select a server-side query rather than switching panels,
 * so they are toggle buttons with `aria-pressed` — not a tablist, which would
 * promise a tabpanel relationship that does not exist here.
 */
function StatusFilter({
  value,
  onChange,
  disabled,
}: {
  value: OrderStatus | "all";
  onChange: (v: OrderStatus | "all") => void;
  disabled: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="Filter orders by status"
      className="flex w-fit flex-wrap gap-1 rounded-container border border-line bg-surface-1 p-1"
    >
      {STATUS_FILTERS.map((f) => {
        const active = value === f.value;
        return (
          <button
            key={f.value}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onChange(f.value)}
            className={[
              "focus-ring min-h-touch rounded-control px-4 text-sm font-medium transition-colors",
              active
                ? "bg-accent-600 text-content-inverse"
                : "text-content-secondary hover:bg-surface-2 hover:text-content-primary",
              disabled && "opacity-60",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {f.label}
          </button>
        );
      })}
    </div>
  );
}

export default function OrdersPage() {
  const router = useRouter();
  const [status, setStatus] = useState<OrderStatus | "all">("all");
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (statusValue: OrderStatus | "all", off: number) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: String(LIMIT), offset: String(off) });
      if (statusValue !== "all") params.set("status", statusValue);
      const res = await apiGet<OrdersResponse>(`/api/v1/orders?${params}`);
      setOrders(res.items ?? []);
      setTotal(res.total ?? 0);
    } catch (err) {
      setError(err instanceof ApiResponseError ? err.message : "Could not load orders.");
      setOrders([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(status, offset);
  }, [load, status, offset]);

  const changeStatus = (next: OrderStatus | "all") => {
    setStatus(next);
    setOffset(0); // a new filter invalidates the current page offset
  };

  const columns = useMemo<DataColumn<Order>[]>(
    () => [
      {
        key: "orderNumber",
        header: "Order #",
        // Order numbers are compared down the column — tabular + mono.
        render: (o) => (
          <span className="font-mono text-xs font-semibold text-accent-600">{o.orderNumber}</span>
        ),
        cellClassName: "tnum",
        sticky: true,
        hideable: false,
        minWidth: "130px",
      },
      {
        key: "status",
        header: "Status",
        // Colour is never the only signal — Badge renders the label too.
        render: (o) => <Badge variant={STATUS_BADGE[o.status]}>{o.status}</Badge>,
        minWidth: "110px",
      },
      {
        key: "customer",
        header: "Customer",
        render: (o) => {
          const name = (o as unknown as { customer_name?: string }).customer_name;
          return name ? (
            <span className="text-content-primary">{name}</span>
          ) : (
            <span className="text-content-muted">Guest</span>
          );
        },
      },
      {
        key: "outlet",
        header: "Outlet",
        render: (o) => (
          <span className="text-content-secondary">
            {(o as unknown as { outlet_name?: string }).outlet_name ?? "—"}
          </span>
        ),
      },
      {
        key: "total",
        header: "Total",
        numeric: true,
        render: (o) => (
          <span className="font-semibold text-content-primary">{formatMoney(o.totalCents)}</span>
        ),
        minWidth: "110px",
      },
      {
        key: "createdAt",
        header: "Date",
        render: (o) => (
          <span className="whitespace-nowrap text-xs text-content-secondary">
            {fmtDateTime(o.createdAt)}
          </span>
        ),
        minWidth: "150px",
      },
    ],
    []
  );

  const filterLabel = STATUS_FILTERS.find((f) => f.value === status)?.label.toLowerCase();

  return (
    <EnterpriseShell
      active="orders"
      title="Orders"
      subtitle="Order history"
      contentClassName="overflow-y-auto"
    >
      <PageShell
        // h2 because EnterpriseShell already emits an sr-only h1 for this page.
        titleAs="h2"
        title="Orders"
        description="Every sale recorded across the business. Select an order to view its lines, refund it, or void it."
        breadcrumbs={[{ label: "Sell" }, { label: "Orders" }]}
        summary={<StatusFilter value={status} onChange={changeStatus} disabled={loading} />}
      >
        <DataTable
          caption="Orders"
          columns={columns}
          rows={orders}
          rowKey={(o) => o.id}
          loading={loading}
          error={error}
          onRetry={() => void load(status, offset)}
          onRowClick={(o) => router.push(`/orders/${o.id}`)}
          emptyTitle={status === "all" ? "No orders yet" : `No ${filterLabel} orders`}
          emptyDescription={
            status === "all"
              ? "Orders appear here as soon as you ring up a sale on the Register."
              : "Try a different status filter — other orders may exist."
          }
          // Search and column sorting are intentionally omitted: paging is
          // server-side, so both would silently act on the loaded 25 rows only
          // and read as if they had searched every order. Status filtering is
          // done on the server, where it is correct.
          serverPagination={{
            total,
            offset,
            limit: LIMIT,
            onOffsetChange: setOffset,
          }}
          storageKey="orders"
        />
      </PageShell>
    </EnterpriseShell>
  );
}
