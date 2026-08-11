"use client";

/**
 * Shipment registry — extracted from /shipping for Delivery hub (Wave 2).
 */

import { Fragment, useCallback, useEffect, useState } from "react";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { apiGet, apiPost } from "@/api-client/client";
import { useToast } from "@/components/Toast";
import type { Shipment } from "@/api-client/types";
import { ListControls, FilterField, filterControlClass, type ListSearchField } from "@/components/ListControls";

const STATUS_BADGE: Record<string, "yellow" | "blue" | "green" | "red" | "gray"> = {
  pending_shipment: "yellow",
  shipped: "blue",
  delivered: "green",
  cancelled: "red",
};

const STATUS_FILTERS = ["all", "pending_shipment", "shipped", "delivered", "cancelled"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const STATUS_LABEL: Record<string, string> = {
  all: "All",
  pending_shipment: "Pending",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

/** Columns a shipment search can be scoped to. Filters the loaded shipment list. */
const SHIPMENT_SEARCH_FIELDS: ListSearchField[] = [
  { value: "all", label: "All columns" },
  { value: "ship", label: "Ship #" },
  { value: "carrier", label: "Carrier" },
  { value: "tracking", label: "Tracking #" },
];

export function ShipmentsPanel() {
  const [items, setItems] = useState<Shipment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [shipFormId, setShipFormId] = useState<string | null>(null);
  const [carrier, setCarrier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [searchField, setSearchField] = useState("all");
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

  useEffect(() => {
    void load();
  }, [load]);

  const confirmShip = async (id: string) => {
    if (!carrier.trim()) return;
    setBusy(id);
    try {
      await apiPost(`/api/v1/shipping/${id}/ship`, {
        carrier: carrier.trim(),
        trackingNumber: trackingNumber.trim() || null,
      });
      setShipFormId(null);
      await load();
      addToast({ title: "Marked as shipped", variant: "success" });
    } catch (e) {
      addToast({
        title: "Failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "error",
      });
    } finally {
      setBusy(null);
    }
  };

  const deliver = async (id: string) => {
    setBusy(id);
    try {
      await apiPost(`/api/v1/shipping/${id}/deliver`, {});
      await load();
      addToast({ title: "Marked as delivered", variant: "success" });
    } catch (e) {
      addToast({
        title: "Failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "error",
      });
    } finally {
      setBusy(null);
    }
  };

  const cancel = async (id: string) => {
    setBusy(id);
    try {
      await apiPost(`/api/v1/shipping/${id}/cancel`, {});
      await load();
      addToast({ title: "Shipment cancelled", variant: "success" });
    } catch (e) {
      addToast({
        title: "Failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "error",
      });
    } finally {
      setBusy(null);
    }
  };

  const filtered = items.filter((s) => {
    if (statusFilter !== "all" && s.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      // Scoped search narrows which column is compared, across the whole
      // loaded shipment list.
      const fields: Record<string, string> = {
        ship: s.ship_number,
        carrier: s.carrier ?? "",
        tracking: s.tracking_number ?? "",
      };
      const haystack = searchField === "all" ? Object.values(fields) : [fields[searchField] ?? ""];
      return haystack.some((v) => v.toLowerCase().includes(q));
    }
    return true;
  });

  const stats = {
    pending: items.filter((s) => s.status === "pending_shipment").length,
    shipped: items.filter((s) => s.status === "shipped").length,
    delivered: items.filter((s) => s.status === "delivered").length,
    cancelled: items.filter((s) => s.status === "cancelled").length,
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Pending", value: stats.pending, color: "text-warning-700" },
          { label: "Shipped", value: stats.shipped, color: "text-brand-700" },
          { label: "Delivered", value: stats.delivered, color: "text-success-700" },
          { label: "Cancelled", value: stats.cancelled, color: "text-danger-600" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-erp-table-border bg-white px-4 py-3">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-erp-text-secondary">{s.label}</p>
          </div>
        ))}
      </div>

      {error && (
        <div className="rounded-md border border-danger-100 bg-danger-50 px-4 py-2 text-sm text-danger-700" role="alert">
          {error}
        </div>
      )}

      <Card className="overflow-hidden p-0">
        <div className="border-b border-line px-4 py-3">
          <ListControls
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search ship #, carrier, tracking…"
            searchLabel="Search shipments"
            searchFields={SHIPMENT_SEARCH_FIELDS}
            searchField={searchField}
            onSearchFieldChange={setSearchField}
            activeFilterCount={statusFilter !== "all" ? 1 : 0}
            onReset={() => { setSearch(""); setSearchField("all"); setStatusFilter("all"); }}
            canReset={search.trim() !== "" || searchField !== "all" || statusFilter !== "all"}
            resultCount={filtered.length}
            totalCount={items.length}
            filters={
              <FilterField label="Shipment status" htmlFor="ship-status">
                <select id="ship-status" value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                  className={filterControlClass}>
                  {STATUS_FILTERS.map((f) => <option key={f} value={f}>{STATUS_LABEL[f]}</option>)}
                </select>
              </FilterField>
            }
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-erp-table-border bg-erp-table-header text-left text-xs font-semibold uppercase tracking-[0.08em] text-erp-text-secondary">
                <th className="px-5 py-3">Ship #</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3">Carrier</th>
                <th className="px-4 py-3">Tracking</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-erp-table-border">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-erp-text-secondary">
                    No shipments match the current filter.
                  </td>
                </tr>
              )}
              {filtered.map((s) => (
                <Fragment key={s.id}>
                  <tr className="transition-colors hover:bg-erp-page">
                    <td className="whitespace-nowrap px-5 py-3 font-medium">{s.ship_number}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <Badge variant={STATUS_BADGE[s.status] ?? "gray"}>
                        {s.status.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 capitalize">{s.method}</td>
                    <td className="whitespace-nowrap px-4 py-3">{s.carrier ?? "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">
                      {s.tracking_number ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {s.status === "pending_shipment" && shipFormId !== s.id && (
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={!!busy}
                            onClick={() => {
                              setShipFormId(s.id);
                              setCarrier("");
                              setTrackingNumber("");
                            }}
                          >
                            Mark shipped
                          </Button>
                        )}
                        {s.status === "shipped" && (
                          <Button
                            size="sm"
                            variant="secondary"
                            loading={busy === s.id}
                            onClick={() => void deliver(s.id)}
                          >
                            Mark delivered
                          </Button>
                        )}
                        {(s.status === "pending_shipment" || s.status === "shipped") && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={!!busy}
                            onClick={() => void cancel(s.id)}
                          >
                            Cancel
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {shipFormId === s.id && (
                    <tr>
                      <td colSpan={6} className="bg-erp-page px-5 py-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
                          <div className="flex-1">
                            <Input
                              label="Carrier"
                              required
                              autoFocus
                              value={carrier}
                              onChange={(e) => setCarrier(e.target.value)}
                              placeholder="UPS / FedEx / USPS / DHL"
                            />
                          </div>
                          <div className="flex-1">
                            <Input
                              label="Tracking number (optional)"
                              value={trackingNumber}
                              onChange={(e) => setTrackingNumber(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") void confirmShip(s.id);
                              }}
                              placeholder="1Z999AA10123456784"
                            />
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <Button size="sm" variant="secondary" onClick={() => setShipFormId(null)}>
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              variant="primary"
                              disabled={!carrier.trim() || busy === s.id}
                              loading={busy === s.id}
                              onClick={() => void confirmShip(s.id)}
                            >
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
  );
}
