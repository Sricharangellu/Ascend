"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { apiGet, apiPost } from "@/api-client/client";
import { useToast } from "@/components/Toast";
import type { Shipment } from "@/api-client/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, "yellow" | "blue" | "green" | "red" | "gray"> = {
  pending_shipment: "yellow",
  shipped: "blue",
  delivered: "green",
  cancelled: "red",
};

const STATUS_FILTERS = ["all", "pending_shipment", "shipped", "delivered", "cancelled"] as const;
type StatusFilter = typeof STATUS_FILTERS[number];

const STATUS_LABEL: Record<string, string> = {
  all: "All",
  pending_shipment: "Pending",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ShippingPage() {
  const [items, setItems] = useState<Shipment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // id of item being mutated
  const [shipFormId, setShipFormId] = useState<string | null>(null);
  const [carrier, setCarrier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const { addToast } = useToast();

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await apiGet<{ items: Shipment[] }>("/api/v1/shipping");
      setItems(r.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load shipments");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const confirmShip = async (id: string) => {
    if (!carrier.trim()) return;
    setBusy(id);
    try {
      await apiPost(`/api/v1/shipping/${id}/ship`, { carrier: carrier.trim(), trackingNumber: trackingNumber.trim() || null });
      setShipFormId(null);
      await load();
      addToast({ title: "Marked as shipped", variant: "success" });
    } catch (e) {
      addToast({ title: "Failed", description: e instanceof Error ? e.message : "Unknown error", variant: "error" });
    } finally { setBusy(null); }
  };

  const deliver = async (id: string) => {
    setBusy(id);
    try {
      await apiPost(`/api/v1/shipping/${id}/deliver`, {});
      await load();
      addToast({ title: "Marked as delivered", variant: "success" });
    } catch (e) {
      addToast({ title: "Failed", description: e instanceof Error ? e.message : "Unknown error", variant: "error" });
    } finally { setBusy(null); }
  };

  const cancel = async (id: string) => {
    setBusy(id);
    try {
      await apiPost(`/api/v1/shipping/${id}/cancel`, {});
      await load();
      addToast({ title: "Shipment cancelled", variant: "success" });
    } catch (e) {
      addToast({ title: "Failed", description: e instanceof Error ? e.message : "Unknown error", variant: "error" });
    } finally { setBusy(null); }
  };

  // Derived
  const filtered = items.filter(s => {
    if (statusFilter !== "all" && s.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        s.ship_number.toLowerCase().includes(q) ||
        (s.carrier ?? "").toLowerCase().includes(q) ||
        (s.tracking_number ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const stats = {
    pending:   items.filter(s => s.status === "pending_shipment").length,
    shipped:   items.filter(s => s.status === "shipped").length,
    delivered: items.filter(s => s.status === "delivered").length,
    cancelled: items.filter(s => s.status === "cancelled").length,
  };

  return (
    <EnterpriseShell active="shipping" title="Shipping" subtitle="Fulfilment and carrier tracking" contentClassName="overflow-y-auto">
      <div className="mx-auto w-full max-w-7xl space-y-5 px-4 py-5 sm:px-6">

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Pending",   value: stats.pending,   color: "text-amber-700" },
            { label: "Shipped",   value: stats.shipped,   color: "text-blue-700" },
            { label: "Delivered", value: stats.delivered, color: "text-green-700" },
            { label: "Cancelled", value: stats.cancelled, color: "text-red-600" },
          ].map(s => (
            <div key={s.label} className="rounded-xl border border-gray-200 bg-white px-4 py-3">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-500">{s.label}</p>
            </div>
          ))}
        </div>

        {error && <div className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700" role="alert">{error}</div>}

        <Card className="overflow-hidden p-0">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search ship #, carrier, tracking…"
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none w-56"
            />
            <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs">
              {STATUS_FILTERS.map(f => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setStatusFilter(f)}
                  className={`px-3 py-1.5 transition-colors ${statusFilter === f ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                >
                  {STATUS_LABEL[f]}
                </button>
              ))}
            </div>
            <span className="ml-auto text-xs text-slate-500">{filtered.length} of {items.length}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  <th className="px-5 py-3">Ship #</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3">Carrier</th>
                  <th className="px-4 py-3">Tracking</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="px-5 py-8 text-center text-slate-400">No shipments match the current filter.</td></tr>
                )}
                {filtered.map(s => (
                  <Fragment key={s.id}>
                    <tr className="hover:bg-slate-50 transition-colors">
                      <td className="whitespace-nowrap px-5 py-3 font-medium text-slate-950">{s.ship_number}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <Badge variant={STATUS_BADGE[s.status] ?? "gray"}>{s.status.replace(/_/g, " ")}</Badge>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 capitalize text-slate-700">{s.method}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">{s.carrier ?? "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-600">{s.tracking_number ?? "—"}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {s.status === "pending_shipment" && shipFormId !== s.id && (
                            <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => { setShipFormId(s.id); setCarrier(""); setTrackingNumber(""); }}>
                              Mark shipped
                            </Button>
                          )}
                          {s.status === "shipped" && (
                            <Button size="sm" variant="secondary" loading={busy === s.id} onClick={() => deliver(s.id)}>
                              Mark delivered
                            </Button>
                          )}
                          {(s.status === "pending_shipment" || s.status === "shipped") && (
                            <button
                              type="button"
                              disabled={!!busy}
                              onClick={() => void cancel(s.id)}
                              className="text-xs text-red-600 hover:underline disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {shipFormId === s.id && (
                      <tr key={`${s.id}-form`}>
                        <td colSpan={6} className="bg-slate-50 px-5 py-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
                            <div className="flex-1">
                              <label className="block text-xs font-medium text-slate-700 mb-1">Carrier <span className="text-red-500">*</span></label>
                              <input
                                autoFocus
                                value={carrier}
                                onChange={e => setCarrier(e.target.value)}
                                placeholder="UPS / FedEx / USPS / DHL"
                                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                              />
                            </div>
                            <div className="flex-1">
                              <label className="block text-xs font-medium text-slate-700 mb-1">Tracking number <span className="text-slate-400">(optional)</span></label>
                              <input
                                value={trackingNumber}
                                onChange={e => setTrackingNumber(e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter") void confirmShip(s.id); }}
                                placeholder="1Z999AA10123456784"
                                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                              />
                            </div>
                            <div className="flex gap-2 shrink-0">
                              <Button size="sm" variant="secondary" onClick={() => setShipFormId(null)}>Cancel</Button>
                              <Button size="sm" variant="primary" disabled={!carrier.trim() || busy === s.id} loading={busy === s.id} onClick={() => void confirmShip(s.id)}>
                                Confirm
                              </Button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </EnterpriseShell>
  );
}
