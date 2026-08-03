"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Skeleton } from "@/components/Skeleton";
import { apiGet, apiPost, ApiResponseError } from "@/api-client/client";
import { formatMoney } from "@/lib/money";
import { hasRole } from "@/lib/auth";
import type {
  SalesOrder,
  SalesOrdersResponse,
  SOFulfillmentStatus,
  PickList,
  Shipment,
  ShipmentsResponse,
  Invoice,
} from "@/api-client/types";
import { ShipmentsPanel } from "./_components/ShipmentsPanel";

type DeliveryTab = "orders" | "shipments";

// The five pipeline stages, in order. `fulfillment_status` on a sales order
// names the stage it has reached.
const STAGES: SOFulfillmentStatus[] = ["unfulfilled", "picking", "packed", "shipped", "delivered"];
const STAGE_LABEL: Record<string, string> = {
  unfulfilled: "Unfulfilled",
  picking: "Picking",
  packed: "Packed",
  shipped: "Shipped",
  delivered: "Delivered",
};
const STAGE_STYLE: Record<string, string> = {
  unfulfilled: "bg-erp-table-header text-erp-text-secondary",
  picking: "bg-warning-100 text-warning-700",
  packed: "bg-brand-100 text-brand-700",
  shipped: "bg-brand-50 text-brand-800",
  delivered: "bg-success-100 text-success-700",
};

function StageBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STAGE_STYLE[status] ?? STAGE_STYLE.unfulfilled}`}>
      {STAGE_LABEL[status] ?? status}
    </span>
  );
}

/** Horizontal stepper showing how far a sales order has progressed. */
function StageStepper({ status }: { status: string }) {
  const idx = Math.max(0, STAGES.indexOf(status as SOFulfillmentStatus));
  return (
    <div className="flex items-center gap-1.5">
      {STAGES.map((s, i) => (
        <div key={s} className="flex items-center gap-1.5">
          <div className="flex flex-col items-center gap-1">
            <div
              className={`h-2.5 w-2.5 rounded-full ${i <= idx ? "bg-brand-600" : "bg-erp-table-border"}`}
              aria-current={i === idx ? "step" : undefined}
            />
            <span
              className={`text-[10px] ${
                i <= idx ? "text-erp-text-primary" : "text-erp-text-secondary"
              }`}
            >
              {STAGE_LABEL[s]}
            </span>
          </div>
          {i < STAGES.length - 1 && (
            <div className={`h-px w-6 ${i < idx ? "bg-brand-600" : "bg-erp-table-border"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

function DeliveryOrdersWorkspace() {
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickList, setPickList] = useState<PickList | null>(null);
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const canManage = hasRole("manager");

  const selected = useMemo(() => orders.find((o) => o.id === selectedId) ?? null, [orders, selectedId]);

  const loadOrders = useCallback(async () => {
    setError(null);
    try {
      const res = await apiGet<SalesOrdersResponse>("/api/v1/sales/sales-orders?limit=100");
      setOrders(res.items ?? []);
      setSelectedId((cur) => cur ?? res.items?.[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof ApiResponseError ? err.message : "Could not load sales orders.");
    } finally {
      setOrdersLoaded(true);
    }
  }, []);

  // Monotonic id of the most recent loadDetail call; a slower earlier response is
  // dropped so switching orders quickly can't paint stale pick list / shipment.
  const detailReqId = useRef(0);

  // Load the pick list + shipment attached to the selected order so the panel
  // can show the right action for its current stage.
  const loadDetail = useCallback(async (order: SalesOrder) => {
    const reqId = ++detailReqId.current;
    setPickList(null);
    setShipment(null);
    setInvoice(null);
    setDetailLoading(true);
    try {
      // Query each resource by this order directly — no full-table fetch + client
      // filter, so it stays correct and cheap regardless of tenant volume.
      const [pls, ships, invoices] = await Promise.all([
        apiGet<{ items: PickList[] }>(`/api/v1/fulfillment/pick-lists?orderId=${order.id}`),
        apiGet<ShipmentsResponse>(`/api/v1/shipping/?salesOrderId=${order.id}`),
        apiGet<{ items: Invoice[] }>(`/api/v1/billing/invoices?salesOrderId=${order.id}`),
      ]);
      const pl = (pls.items ?? [])[0] ?? null;
      const fullPl = pl ? await apiGet<PickList>(`/api/v1/fulfillment/pick-lists/${pl.id}`) : null;
      if (detailReqId.current !== reqId) return; // a newer selection superseded this load
      setPickList(fullPl);
      setShipment((ships.items ?? [])[0] ?? null);
      setInvoice((invoices.items ?? [])[0] ?? null);
    } catch (err) {
      if (detailReqId.current === reqId) {
        setError(err instanceof ApiResponseError ? err.message : "Could not load pipeline detail.");
      }
    } finally {
      if (detailReqId.current === reqId) setDetailLoading(false);
    }
  }, []);

  useEffect(() => { void loadOrders(); }, [loadOrders]);
  useEffect(() => { if (selected) void loadDetail(selected); }, [selected, loadDetail]);

  // Any pipeline action reloads both the order list (fulfillment_status changes)
  // and the selected order's detail.
  const act = useCallback(async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await loadOrders();
      if (selected) await loadDetail(selected);
    } catch (err) {
      setError(err instanceof ApiResponseError ? err.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }, [loadOrders, loadDetail, selected]);

  const startPicking = (o: SalesOrder) =>
    act(() => apiPost("/api/v1/fulfillment/pick-lists/from-sales-order", { salesOrderId: o.id }));
  const pickLine = (lineId: string) =>
    act(() => apiPost(`/api/v1/fulfillment/pick-lists/${pickList!.id}/lines/${lineId}/pick`, {}));
  const pack = () => act(() => apiPost(`/api/v1/fulfillment/pick-lists/${pickList!.id}/pack`, {}));
  const ship = () => act(() => apiPost(`/api/v1/shipping/${shipment!.id}/ship`, {}));
  const deliver = () => act(() => apiPost(`/api/v1/shipping/${shipment!.id}/deliver`, {}));
  // Billing runs parallel to fulfilment: an approved order can be invoiced, which
  // raises the AR invoice (linked back to this order) that we surface below.
  const createInvoice = () => act(() => apiPost(`/api/v1/sales/sales-orders/${selected!.id}/invoice`, {}));

  const allPicked = pickList?.lines?.every((l) => l.status === "picked") ?? false;

  return (
    <>
      {error && (
        <Card
          role="alert"
          className="border-danger-100 bg-danger-50 p-3 text-sm text-danger-700"
        >
          {error}
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:items-start">
        <Card className="overflow-hidden p-0">
          <div className="border-b border-erp-table-border px-4 py-3">
            <h2 className="text-sm font-semibold text-erp-text-primary">Sales orders</h2>
          </div>
          {!ordersLoaded ? (
            <ul className="divide-y divide-erp-table-border">
              {Array.from({ length: 5 }).map((_, i) => (
                <li key={i} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                  <Skeleton className="h-5 w-16 rounded-full" />
                </li>
              ))}
            </ul>
          ) : orders.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-erp-text-secondary">
              No sales orders yet. Create one from Orders or an ecommerce checkout.
            </p>
          ) : (
            <ul className="max-h-[70vh] divide-y divide-erp-table-border overflow-y-auto">
              {orders.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(o.id)}
                    aria-current={o.id === selectedId ? "true" : undefined}
                    className={`flex min-h-touch w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-erp-page focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 ${
                      o.id === selectedId ? "bg-brand-50" : ""
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-erp-text-primary">{o.so_number}</p>
                      <p className="truncate text-xs text-erp-text-secondary">{formatMoney(o.total_cents)}</p>
                    </div>
                    <StageBadge status={o.fulfillment_status} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          {!selected ? (
            <p className="py-8 text-center text-sm text-erp-text-secondary">
              Select a sales order to manage its delivery.
            </p>
          ) : (
            <div className="flex flex-col gap-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-erp-text-primary">{selected.so_number}</h2>
                  <p className="text-xs text-erp-text-secondary">{formatMoney(selected.total_cents)}</p>
                </div>
                <StageBadge status={selected.fulfillment_status} />
              </div>

              <div className="-mx-1 overflow-x-auto px-1 pb-1">
                <StageStepper status={selected.fulfillment_status} />
              </div>

              {detailLoading && (
                <p className="text-xs text-erp-text-secondary" role="status">
                  Loading delivery detail…
                </p>
              )}

              {!canManage && (
                <p className="text-xs text-erp-text-secondary">
                  You need the manager role to advance the pipeline.
                </p>
              )}

              <div className="rounded-lg border border-erp-table-border p-4">
                {selected.fulfillment_status === "unfulfilled" && (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-erp-text-secondary">
                      Create a pick list to begin fulfilment.
                    </p>
                    <Button
                      onClick={() => startPicking(selected)}
                      loading={busy}
                      disabled={busy || !canManage}
                    >
                      Start picking
                    </Button>
                  </div>
                )}

                {selected.fulfillment_status === "picking" && pickList && (
                  <div className="flex flex-col gap-3">
                    <p className="text-sm font-medium text-erp-text-primary">Pick list</p>
                    <ul className="flex flex-col gap-2">
                      {(pickList.lines ?? []).map((l) => (
                        <li key={l.id} className="flex items-center justify-between gap-3 text-sm">
                          <span className="min-w-0 truncate">
                            <span className="font-medium text-erp-text-primary">
                              {l.name ?? l.product_id}
                            </span>
                            <span className="text-erp-text-secondary">
                              {" "}
                              · {l.picked_qty}/{l.quantity}
                            </span>
                          </span>
                          {l.status === "picked" ? (
                            <span className="inline-flex shrink-0 rounded-full bg-success-50 px-2 py-0.5 text-xs font-medium text-success-700">
                              Picked
                            </span>
                          ) : (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => pickLine(l.id)}
                              disabled={busy || !canManage}
                              className="shrink-0"
                            >
                              Pick
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                    <div className="flex justify-end">
                      <Button
                        onClick={pack}
                        loading={busy}
                        disabled={busy || !canManage || !allPicked}
                      >
                        Pack
                      </Button>
                    </div>
                  </div>
                )}

                {selected.fulfillment_status === "packed" && (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-erp-text-secondary">
                      Packed{shipment ? ` — shipment ${shipment.ship_number} ready` : ""}. Ship it
                      out.
                    </p>
                    <Button
                      onClick={ship}
                      loading={busy}
                      disabled={busy || !canManage || !shipment}
                    >
                      Mark shipped
                    </Button>
                  </div>
                )}

                {selected.fulfillment_status === "shipped" && (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 break-words text-sm text-erp-text-secondary">
                      In transit{shipment?.carrier ? ` via ${shipment.carrier}` : ""}
                      {shipment?.tracking_number ? ` (${shipment.tracking_number})` : ""}.
                    </div>
                    <Button
                      onClick={deliver}
                      loading={busy}
                      disabled={busy || !canManage || !shipment}
                    >
                      Mark delivered
                    </Button>
                  </div>
                )}

                {selected.fulfillment_status === "delivered" && (
                  <p className="text-sm font-medium text-success-700">
                    Delivered{shipment?.tracking_number ? ` — ${shipment.tracking_number}` : ""}.
                    Pipeline complete.
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-erp-table-border p-4">
                {invoice ? (
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-erp-text-secondary">
                    Invoice <span className="font-medium text-erp-text-primary">{invoice.invoice_number}</span>{" "}
                    — {formatMoney(invoice.total_cents)}
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                        invoice.status === "paid"
                          ? "bg-success-50 text-success-700"
                          : "bg-warning-50 text-warning-700"
                      }`}
                    >
                      {invoice.status}
                    </span>
                  </p>
                ) : selected.status === "invoiced" ? (
                  <p className="text-sm text-erp-text-secondary">Invoiced.</p>
                ) : selected.status === "approved" ? (
                  <>
                    <p className="text-sm text-erp-text-secondary">Not invoiced yet.</p>
                    <Button
                      variant="secondary"
                      onClick={createInvoice}
                      loading={busy}
                      disabled={busy || !canManage}
                    >
                      Create invoice
                    </Button>
                  </>
                ) : (
                  <p className="text-sm text-erp-text-secondary">
                    Approve the order to raise an invoice.
                  </p>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

function tabFromQuery(raw: string | null): DeliveryTab {
  return raw === "shipments" ? "shipments" : "orders";
}

function DeliveryHub() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [activeTab, setActiveTab] = useState<DeliveryTab>(() =>
    tabFromQuery(searchParams.get("tab")),
  );

  useEffect(() => {
    setActiveTab(tabFromQuery(searchParams.get("tab")));
  }, [searchParams]);

  const onChangeTab = useCallback(
    (t: DeliveryTab) => {
      setActiveTab(t);
      const params = new URLSearchParams(searchParams.toString());
      if (t === "orders") params.delete("tab");
      else params.set("tab", t);
      const q = params.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return (
    <>
      <div
        className="flex gap-1 border-b border-erp-table-border"
        role="tablist"
        aria-label="Delivery views"
      >
        {(
          [
            { id: "orders" as const, label: "Orders" },
            { id: "shipments" as const, label: "Shipments" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={activeTab === t.id}
            onClick={() => onChangeTab(t.id)}
            className={`min-h-touch border-b-2 px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 ${
              activeTab === t.id
                ? "border-brand-600 text-brand-600"
                : "border-transparent text-erp-text-secondary hover:text-erp-text-primary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "orders" ? <DeliveryOrdersWorkspace /> : <ShipmentsPanel />}
    </>
  );
}

export default function DeliveryPage() {
  return (
    <EnterpriseShell
      active="delivery"
      title="Delivery"
      subtitle="Pick, pack, ship, and track fulfillment"
      contentClassName="overflow-y-auto"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6">
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <DeliveryHub />
        </Suspense>
      </div>
    </EnterpriseShell>
  );
}
