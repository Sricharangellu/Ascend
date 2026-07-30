"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { apiGet, apiPost, apiPatch } from "@/api-client/client";
import { formatMoney } from "@/lib/money";
import { useToast } from "@/components/Toast";
import type { InventoryLocation, LocationStock, TransferForm } from "./operationsTypes";

const LOC_TYPE_BADGE: Record<string, "blue" | "gray" | "red" | "yellow"> = {
  floor: "blue",
  warehouse: "gray",
  damage: "red",
  receiving: "yellow",
};

export function StockLocationsTab() {
  const { addToast } = useToast();
  const [items, setItems] = useState<InventoryLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", location_type: "floor", outlet_id: "", is_sellable: false, is_receiving_location: false });
  const [busy, setBusy] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [viewStockLoc, setViewStockLoc] = useState<InventoryLocation | null>(null);
  const [stockItems, setStockItems] = useState<LocationStock[]>([]);
  const [stockLoading, setStockLoading] = useState(false);

  const [transferLoc, setTransferLoc] = useState<InventoryLocation | null>(null);
  const [transferForm, setTransferForm] = useState<TransferForm>({ fromLocationId: "", toLocationId: "", productQuery: "", quantity: 1 });
  const [transferring, setTransferring] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiGet<{ items: InventoryLocation[] }>("/api/v1/inventory/locations").catch(() => ({ items: [] as InventoryLocation[] }));
      setItems(r.items);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    if (!form.code.trim() || !form.name.trim()) return;
    setBusy(true);
    try {
      await apiPost("/api/v1/inventory/locations", {
        code: form.code.trim(),
        name: form.name.trim(),
        location_type: form.location_type,
        outlet_id: form.outlet_id.trim() || null,
        is_sellable: form.is_sellable,
        is_receiving_location: form.is_receiving_location,
      });
      setShowForm(false);
      setForm({ code: "", name: "", location_type: "floor", outlet_id: "", is_sellable: false, is_receiving_location: false });
      void load();
    } finally { setBusy(false); }
  };

  const openStockModal = async (loc: InventoryLocation) => {
    setViewStockLoc(loc);
    setStockItems([]);
    setStockLoading(true);
    try {
      const data = await apiGet<LocationStock[]>(`/api/v1/inventory/locations/${loc.id}/stock`).catch(() => [] as LocationStock[]);
      setStockItems(Array.isArray(data) ? data : []);
    } finally { setStockLoading(false); }
  };

  const toggleActive = async (loc: InventoryLocation) => {
    setToggling(loc.id);
    try {
      await apiPatch(`/api/v1/inventory/locations/${loc.id}`, { is_active: !loc.is_active });
      setItems((prev) => prev.map((l) => l.id === loc.id ? { ...l, is_active: !l.is_active } : l));
    } finally { setToggling(null); }
  };

  const openTransferModal = (loc: InventoryLocation) => {
    setTransferLoc(loc);
    setTransferForm({ fromLocationId: loc.id, toLocationId: "", productQuery: "", quantity: 1 });
    setTransferError(null);
  };

  const closeTransferModal = () => { setTransferLoc(null); setTransferError(null); };

  const handleTransfer = async () => {
    if (!transferForm.toLocationId || !transferForm.productQuery.trim() || transferForm.quantity < 1) {
      setTransferError("Please fill in all fields."); return;
    }
    setTransferring(true); setTransferError(null);
    try {
      await apiPost("/api/v1/inventory/transfers", {
        from_location_id: transferForm.fromLocationId,
        to_location_id: transferForm.toLocationId,
        product_id: transferForm.productQuery.trim(),
        quantity: transferForm.quantity,
      });
      addToast({ title: "Stock transferred successfully.", variant: "success" });
      closeTransferModal();
    } catch {
      setTransferError("Transfer failed. Please try again.");
    } finally { setTransferring(false); }
  };

  const otherLocations = items.filter((l) => l.id !== transferForm.fromLocationId && l.is_active);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Stock Locations ({items.length})</h2>
        <Button variant="primary" size="sm" onClick={() => setShowForm((v) => !v)}>+ New Location</Button>
      </div>

      {showForm && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
          <div className="flex flex-wrap gap-3">
            <input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="Code (e.g. MAIN-FLR)" className="w-36 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" />
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Name" className="flex-1 min-w-36 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" />
            <select value={form.location_type} onChange={(e) => setForm((f) => ({ ...f, location_type: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none">
              <option value="floor">Floor</option>
              <option value="warehouse">Warehouse</option>
              <option value="damage">Damage</option>
              <option value="receiving">Receiving</option>
            </select>
            <input value={form.outlet_id} onChange={(e) => setForm((f) => ({ ...f, outlet_id: e.target.value }))} placeholder="Outlet ID (optional)" className="w-40 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input type="checkbox" checked={form.is_sellable} onChange={(e) => setForm((f) => ({ ...f, is_sellable: e.target.checked }))} className="h-4 w-4 rounded border-gray-300 accent-blue-600" />
              Sellable
            </label>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input type="checkbox" checked={form.is_receiving_location} onChange={(e) => setForm((f) => ({ ...f, is_receiving_location: e.target.checked }))} className="h-4 w-4 rounded border-gray-300 accent-blue-600" />
              Receiving
            </label>
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button size="sm" variant="primary" loading={busy} disabled={!form.code.trim() || !form.name.trim()} onClick={() => void create()}>Create</Button>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Outlet</th>
              <th className="px-4 py-3">Sellable</th>
              <th className="px-4 py-3">Receiving</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && <tr><td colSpan={8} className="px-4 py-6 text-center text-gray-400">Loading…</td></tr>}
            {!loading && items.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-gray-400">No stock locations yet. Create one above.</td></tr>}
            {items.map((loc) => (
              <tr key={loc.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{loc.code}</span>
                </td>
                <td className="px-4 py-3 font-medium text-gray-900">{loc.name}</td>
                <td className="px-4 py-3">
                  <Badge variant={LOC_TYPE_BADGE[loc.location_type] ?? "gray"}>{loc.location_type}</Badge>
                </td>
                <td className="px-4 py-3 text-gray-500">{loc.outlet_id ?? "—"}</td>
                <td className="px-4 py-3">
                  {loc.is_sellable ? <span className="text-green-700 font-medium">Yes</span> : <span className="text-gray-400">No</span>}
                </td>
                <td className="px-4 py-3">
                  {loc.is_receiving_location ? <span className="text-green-700 font-medium">Yes</span> : <span className="text-gray-400">No</span>}
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    disabled={toggling === loc.id}
                    onClick={() => void toggleActive(loc)}
                    aria-pressed={loc.is_active}
                    className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${loc.is_active ? "bg-blue-600" : "bg-gray-300"} ${toggling === loc.id ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                  >
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${loc.is_active ? "translate-x-4" : "translate-x-0.5"}`} />
                    <span className="sr-only">{loc.is_active ? "Active" : "Inactive"}</span>
                  </button>
                </td>
                <td className="px-4 py-3 whitespace-nowrap space-x-2">
                  <Button size="sm" variant="secondary" onClick={() => void openStockModal(loc)}>View Stock</Button>
                  <button
                    onClick={() => openTransferModal(loc)}
                    className="text-xs text-slate-600 hover:text-slate-900 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                    aria-label={`Transfer stock from ${loc.name}`}
                  >
                    Transfer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={viewStockLoc !== null}
        onClose={() => setViewStockLoc(null)}
        title={viewStockLoc ? `Stock at ${viewStockLoc.name} (${viewStockLoc.code})` : "Stock"}
      >
        {stockLoading && <p className="py-6 text-center text-sm text-gray-400">Loading stock…</p>}
        {!stockLoading && stockItems.length === 0 && (
          <p className="py-6 text-center text-sm text-gray-400">No stock recorded at this location.</p>
        )}
        {!stockLoading && stockItems.length > 0 && (
          <div className="overflow-x-auto -mx-4 sm:-mx-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  <th className="px-4 py-2.5">Product ID</th>
                  <th className="px-4 py-2.5 text-right">On Hand</th>
                  <th className="px-4 py-2.5 text-right">Committed</th>
                  <th className="px-4 py-2.5 text-right">Available</th>
                  <th className="px-4 py-2.5 text-right">Avg Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {stockItems.map((s) => (
                  <tr key={s.product_id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{s.product_id}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{s.quantity_on_hand}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-orange-600">{s.quantity_committed}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${s.quantity_available <= 0 ? "text-red-600" : "text-green-700"}`}>{s.quantity_available}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">{formatMoney(s.average_cost_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      <Modal
        open={transferLoc !== null}
        onClose={closeTransferModal}
        title="Transfer Stock"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeTransferModal}>Cancel</Button>
            <Button variant="primary" loading={transferring} onClick={() => void handleTransfer()}>Transfer Stock</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">From Location</label>
            <select disabled value={transferForm.fromLocationId}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 cursor-not-allowed">
              {transferLoc && <option value={transferLoc.id}>{transferLoc.name} ({transferLoc.code})</option>}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">To Location</label>
            <select
              value={transferForm.toLocationId}
              onChange={(e) => setTransferForm((f) => ({ ...f, toLocationId: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <option value="">Select destination…</option>
              {otherLocations.map((l) => (
                <option key={l.id} value={l.id}>{l.name} ({l.code})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Product</label>
            <input type="text" value={transferForm.productQuery}
              onChange={(e) => setTransferForm((f) => ({ ...f, productQuery: e.target.value }))}
              placeholder="Enter product ID or name…"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Quantity</label>
            <input type="number" min={1} value={transferForm.quantity}
              onChange={(e) => setTransferForm((f) => ({ ...f, quantity: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
          </div>
          {transferError && <p role="alert" className="text-sm text-red-600">{transferError}</p>}
        </div>
      </Modal>
    </div>
  );
}
