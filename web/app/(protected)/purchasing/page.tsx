"use client";

import { useCallback, useEffect, useState } from "react";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { Modal } from "@/components/Modal";
import { formatMoney, parseToCents } from "@/lib/money";
import { apiGet, apiPost, ApiResponseError } from "@/api-client/client";
import { hasRole } from "@/lib/auth";
import { useFlag } from "@/flags/useFlag";
import type {
  CreatePurchaseOrderLineRequest,
  InventoryLevelsResponse,
  PurchaseOrder,
  PurchaseOrdersResponse,
  Supplier,
  SuppliersResponse,
} from "@/api-client/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type PurchasingTab = "orders" | "suppliers" | "vendor-quotes";

interface DraftLine {
  productId: string;
  quantity: string;
  unitCost: string;
  expiryDate: string;
  lotCode: string;
}

interface VendorQuote {
  id: string;
  quote_number: string;
  supplier: string;
  items_count: number;
  total_cents: number;
  received_at: number;
  status: "pending" | "accepted" | "rejected" | "expired";
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, string> = {
  ordered: "bg-amber-50 text-amber-700 ring-amber-200",
  received: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};

const VQ_STATUS_BADGE: Record<string, "yellow" | "green" | "gray" | "red"> = {
  pending: "yellow",
  accepted: "green",
  rejected: "gray",
  expired: "red",
};

function emptyLine(): DraftLine {
  return { productId: "", quantity: "1", unitCost: "", expiryDate: "", lotCode: "" };
}

// ─── Tab bar ──────────────────────────────────────────────────────────────────

function TabBar({
  active,
  onChange,
  showVendorQuotes,
}: {
  active: PurchasingTab;
  onChange: (t: PurchasingTab) => void;
  showVendorQuotes: boolean;
}) {
  const tabs: { key: PurchasingTab; label: string }[] = [
    { key: "orders", label: "Purchase Orders" },
    { key: "suppliers", label: "Suppliers" },
    ...(showVendorQuotes ? [{ key: "vendor-quotes" as PurchasingTab, label: "Vendor Quotes" }] : []),
  ];
  return (
    <div className="border-b border-slate-200">
      <nav className="-mb-px flex gap-0 px-4" aria-label="Purchasing tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={`min-h-[44px] border-b-2 px-4 text-sm font-medium transition-colors ${
              active === t.key
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
            }`}
            aria-current={active === t.key ? "page" : undefined}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PurchasingPage() {
  const [activeTab, setActiveTab] = useState<PurchasingTab>("orders");
  const vendorQuotationsEnabled = useFlag("vendor_quotations");

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [products, setProducts] = useState<Array<{ id: string; sku: string; name: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [supplierName, setSupplierName] = useState("");
  const [supplierEmail, setSupplierEmail] = useState("");

  const [poSupplierId, setPoSupplierId] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);

  // Vendor quotes state
  const [vendorQuotes, setVendorQuotes] = useState<VendorQuote[]>([]);
  const [vqLoading, setVqLoading] = useState(false);
  const [vqBusy, setVqBusy] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [rqSupplier, setRqSupplier] = useState("");
  const [rqProducts, setRqProducts] = useState("");

  const canManage = hasRole("manager");

  const load = useCallback(async () => {
    try {
      setError(null);
      const [suppliersRes, ordersRes, inventoryRes] = await Promise.all([
        apiGet<SuppliersResponse>("/api/v1/purchasing/suppliers"),
        apiGet<PurchaseOrdersResponse>("/api/v1/purchasing/orders"),
        apiGet<InventoryLevelsResponse>("/api/v1/inventory/levels?pageSize=200"),
      ]);
      setSuppliers(suppliersRes.items ?? []);
      setOrders(ordersRes.items ?? []);
      setProducts((inventoryRes.items ?? []).map((item) => ({ id: item.id, sku: item.sku, name: item.name })));
      setPoSupplierId((current) => current || suppliersRes.items?.[0]?.id || "");
    } catch (err) {
      setError(err instanceof ApiResponseError ? err.message : "Could not load purchasing data.");
    }
  }, []);

  const loadVendorQuotes = useCallback(async () => {
    setVqLoading(true);
    try {
      const res = await apiGet<{ items: VendorQuote[] }>("/api/v1/purchasing/vendor-quotes");
      setVendorQuotes(res.items ?? []);
    } catch {
      // silently ignore
    } finally {
      setVqLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (activeTab === "vendor-quotes" && vendorQuotationsEnabled) {
      void loadVendorQuotes();
    }
  }, [activeTab, vendorQuotationsEnabled, loadVendorQuotes]);

  const supplierName_ = (id: string) => suppliers.find((s) => s.id === id)?.name ?? id;

  const addSupplier = async () => {
    if (!supplierName.trim()) return;
    setBusy(true);
    try {
      await apiPost("/api/v1/purchasing/suppliers", { name: supplierName.trim(), email: supplierEmail.trim() || undefined });
      setSupplierName("");
      setSupplierEmail("");
      await load();
    } catch (err) {
      setError(err instanceof ApiResponseError ? err.message : "Could not create supplier.");
    } finally {
      setBusy(false);
    }
  };

  const updateLine = (index: number, patch: Partial<DraftLine>) => {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  const addLine = () => setLines((current) => [...current, emptyLine()]);
  const removeLine = (index: number) => setLines((current) => current.filter((_, i) => i !== index));

  const createOrder = async () => {
    if (!poSupplierId) return;
    const requestLines: CreatePurchaseOrderLineRequest[] = [];
    for (const line of lines) {
      if (!line.productId || !line.quantity || !line.unitCost) continue;
      const entry: CreatePurchaseOrderLineRequest = {
        productId: line.productId,
        quantity: Number(line.quantity),
        unitCostCents: parseToCents(line.unitCost),
      };
      if (line.expiryDate) entry.expiryDate = new Date(line.expiryDate).getTime();
      if (line.lotCode.trim()) entry.lotCode = line.lotCode.trim();
      requestLines.push(entry);
    }
    if (requestLines.length === 0) {
      setError("Add at least one line with a product, quantity, and unit cost.");
      return;
    }

    setBusy(true);
    try {
      setError(null);
      await apiPost("/api/v1/purchasing/orders", { supplierId: poSupplierId, lines: requestLines });
      setLines([emptyLine()]);
      await load();
    } catch (err) {
      setError(err instanceof ApiResponseError ? err.message : "Could not create purchase order.");
    } finally {
      setBusy(false);
    }
  };

  const receiveOrder = async (id: string) => {
    setBusy(true);
    try {
      setError(null);
      await apiPost(`/api/v1/purchasing/orders/${id}/receive`, {});
      await load();
    } catch (err) {
      setError(err instanceof ApiResponseError ? err.message : "Could not receive purchase order.");
    } finally {
      setBusy(false);
    }
  };

  const acceptQuote = async (id: string) => {
    setVqBusy(true);
    try {
      await apiPost(`/api/v1/purchasing/vendor-quotes/${id}/accept`, {});
      await loadVendorQuotes();
    } catch {
      // silently ignore
    } finally {
      setVqBusy(false);
    }
  };

  const rejectQuote = async (id: string) => {
    setVqBusy(true);
    try {
      await apiPost(`/api/v1/purchasing/vendor-quotes/${id}/reject`, {});
      await loadVendorQuotes();
    } catch {
      // silently ignore
    } finally {
      setVqBusy(false);
    }
  };

  return (
    <EnterpriseShell active="purchasing" title="Purchasing" subtitle="Suppliers, purchase orders, and receiving" contentClassName="overflow-y-auto">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6">
        {error && (
          <div className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}

        {/* Tab shell */}
        <Card className="overflow-hidden p-0">
          <TabBar active={activeTab} onChange={setActiveTab} showVendorQuotes />

          {/* ── Purchase Orders tab ── */}
          {activeTab === "orders" && (
            <div className="flex flex-col gap-5 p-4">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                    <tr>
                      <th className="px-4 py-3">PO</th>
                      <th className="px-4 py-3">Supplier</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {orders.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-slate-400">No purchase orders yet.</td>
                      </tr>
                    ) : (
                      orders.map((order) => (
                        <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                          <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-700">{order.id}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-950">{supplierName_(order.supplier_id)}</td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <span className={`inline-flex rounded px-2 py-1 text-xs font-semibold ring-1 ring-inset ${STATUS_STYLE[order.status] ?? "bg-slate-100 text-slate-700 ring-slate-200"}`}>
                              {order.status}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-950">{formatMoney(order.total_cost_cents)}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-right">
                            {order.status === "ordered" && canManage && (
                              <Button size="sm" variant="primary" disabled={busy} onClick={() => void receiveOrder(order.id)}>
                                Receive
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {canManage && (
                <div className="border-t border-slate-200 pt-4">
                  <h3 className="mb-3 text-sm font-semibold text-slate-950">Create purchase order</h3>
                  <label className="mb-3 block max-w-sm">
                    <span className="text-xs font-medium uppercase text-slate-500">Supplier</span>
                    <select
                      value={poSupplierId}
                      onChange={(event) => setPoSupplierId(event.target.value)}
                      className="mt-1 min-h-[44px] w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-slate-950 focus:ring-2 focus:ring-slate-950"
                    >
                      {suppliers.map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                      ))}
                    </select>
                  </label>

                  <div className="flex flex-col gap-3">
                    {lines.map((line, index) => (
                      <div key={index} className="grid grid-cols-1 gap-2 rounded-md border border-slate-200 p-3 sm:grid-cols-5">
                        <label className="block sm:col-span-2">
                          <span className="text-xs font-medium uppercase text-slate-500">Product</span>
                          <select
                            value={line.productId}
                            onChange={(event) => updateLine(index, { productId: event.target.value })}
                            className="mt-1 min-h-[44px] w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-slate-950 focus:ring-2 focus:ring-slate-950"
                          >
                            <option value="">Select product</option>
                            {products.map((product) => (
                              <option key={product.id} value={product.id}>{product.sku} — {product.name}</option>
                            ))}
                          </select>
                        </label>
                        <label className="block">
                          <span className="text-xs font-medium uppercase text-slate-500">Quantity</span>
                          <input
                            type="number"
                            min="1"
                            value={line.quantity}
                            onChange={(event) => updateLine(index, { quantity: event.target.value })}
                            className="mt-1 min-h-[44px] w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-slate-950 focus:ring-2 focus:ring-slate-950"
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs font-medium uppercase text-slate-500">Unit cost</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={line.unitCost}
                            onChange={(event) => updateLine(index, { unitCost: event.target.value })}
                            placeholder="0.00"
                            className="mt-1 min-h-[44px] w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-slate-950 focus:ring-2 focus:ring-slate-950"
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs font-medium uppercase text-slate-500">Expiry date</span>
                          <input
                            type="date"
                            value={line.expiryDate}
                            onChange={(event) => updateLine(index, { expiryDate: event.target.value })}
                            className="mt-1 min-h-[44px] w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-slate-950 focus:ring-2 focus:ring-slate-950"
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs font-medium uppercase text-slate-500">Lot code</span>
                          <input
                            type="text"
                            value={line.lotCode}
                            onChange={(event) => updateLine(index, { lotCode: event.target.value })}
                            placeholder="Optional"
                            className="mt-1 min-h-[44px] w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-slate-950 focus:ring-2 focus:ring-slate-950"
                          />
                        </label>
                        {lines.length > 1 && (
                          <div className="sm:col-span-5">
                            <Button variant="ghost" size="sm" onClick={() => removeLine(index)}>Remove line</Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 flex gap-2">
                    <Button variant="secondary" size="sm" onClick={addLine}>Add line</Button>
                    <Button variant="primary" size="sm" disabled={busy || !poSupplierId} onClick={() => void createOrder()}>
                      Create purchase order
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Suppliers tab ── */}
          {activeTab === "suppliers" && (
            <div className="p-4">
              <ul className="flex flex-col gap-2">
                {suppliers.length === 0 && <li className="text-sm text-slate-500">No suppliers yet.</li>}
                {suppliers.map((supplier) => (
                  <li key={supplier.id} className="rounded-md border border-slate-200 px-3 py-2">
                    <p className="text-sm font-medium text-slate-950">{supplier.name}</p>
                    <p className="text-xs text-slate-500">{supplier.email ?? "No email on file"}</p>
                  </li>
                ))}
              </ul>

              {canManage && (
                <div className="mt-4 flex flex-col gap-2 border-t border-slate-200 pt-4 max-w-sm">
                  <label className="block">
                    <span className="text-xs font-medium uppercase text-slate-500">Supplier name</span>
                    <input
                      type="text"
                      value={supplierName}
                      onChange={(event) => setSupplierName(event.target.value)}
                      placeholder="e.g. Acme Coffee Co"
                      className="mt-1 min-h-[44px] w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-slate-950 focus:ring-2 focus:ring-slate-950"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium uppercase text-slate-500">Email (optional)</span>
                    <input
                      type="email"
                      value={supplierEmail}
                      onChange={(event) => setSupplierEmail(event.target.value)}
                      placeholder="orders@supplier.example"
                      className="mt-1 min-h-[44px] w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-slate-950 focus:ring-2 focus:ring-slate-950"
                    />
                  </label>
                  <Button variant="secondary" size="sm" disabled={busy || !supplierName.trim()} onClick={() => void addSupplier()}>
                    Add supplier
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* ── Vendor Quotes tab ── */}
          {activeTab === "vendor-quotes" && (
            <VendorQuotesTab
              enabled={vendorQuotationsEnabled}
              quotes={vendorQuotes}
              loading={vqLoading}
              busy={vqBusy}
              canManage={canManage}
              suppliers={suppliers}
              onAccept={(id) => void acceptQuote(id)}
              onReject={(id) => void rejectQuote(id)}
              showRequestModal={showRequestModal}
              onOpenRequestModal={() => setShowRequestModal(true)}
              onCloseRequestModal={() => setShowRequestModal(false)}
              rqSupplier={rqSupplier}
              setRqSupplier={setRqSupplier}
              rqProducts={rqProducts}
              setRqProducts={setRqProducts}
            />
          )}
        </Card>
      </div>
    </EnterpriseShell>
  );
}

// ─── Vendor Quotes Tab ────────────────────────────────────────────────────────

function VendorQuotesTab({
  enabled,
  quotes,
  loading,
  busy,
  canManage,
  suppliers,
  onAccept,
  onReject,
  showRequestModal,
  onOpenRequestModal,
  onCloseRequestModal,
  rqSupplier,
  setRqSupplier,
  rqProducts,
  setRqProducts,
}: {
  enabled: boolean;
  quotes: VendorQuote[];
  loading: boolean;
  busy: boolean;
  canManage: boolean;
  suppliers: Supplier[];
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  showRequestModal: boolean;
  onOpenRequestModal: () => void;
  onCloseRequestModal: () => void;
  rqSupplier: string;
  setRqSupplier: (v: string) => void;
  rqProducts: string;
  setRqProducts: (v: string) => void;
}) {
  if (!enabled) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-center">
        <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-10 w-10 text-slate-300">
          <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
          <rect x="9" y="3" width="6" height="4" rx="1" />
        </svg>
        <p className="text-base font-semibold text-slate-700">Vendor Quotes — Coming Soon</p>
        <p className="max-w-sm text-sm text-slate-500">Enable the <span className="font-mono font-semibold">vendor_quotations</span> feature flag to manage supplier quotes.</p>
      </div>
    );
  }

  return (
    <>
      <Modal
        open={showRequestModal}
        onClose={onCloseRequestModal}
        title="Request Quote from Supplier"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={onCloseRequestModal}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={onCloseRequestModal}>Send Request</Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Supplier</label>
            <select
              value={rqSupplier}
              onChange={(e) => setRqSupplier(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select supplier…</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Products / Notes</label>
            <textarea
              value={rqProducts}
              onChange={(e) => setRqProducts(e.target.value)}
              rows={4}
              placeholder="List the products or SKUs you need a quote for…"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
        </div>
      </Modal>

      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <p className="text-sm text-slate-500">Quotes received from suppliers for products you want to purchase.</p>
        {canManage && (
          <Button variant="primary" size="sm" onClick={onOpenRequestModal}>
            Request Quote
          </Button>
        )}
      </div>

      <div className="overflow-x-auto">
        {loading ? (
          <div className="px-4 py-8 text-center text-sm text-slate-400">Loading quotes…</div>
        ) : (
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Quote #</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3 text-right">Items</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Received</th>
                <th className="px-4 py-3">Status</th>
                {canManage && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {quotes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">No vendor quotes yet. Request one from a supplier.</td>
                </tr>
              ) : (
                quotes.map((q) => (
                  <tr key={q.id} className="hover:bg-slate-50 transition-colors">
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-700">{q.quote_number}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-950">{q.supplier}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{q.items_count}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-950">{formatMoney(q.total_cents)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                      {new Date(q.received_at).toLocaleDateString()}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <Badge variant={VQ_STATUS_BADGE[q.status] ?? "gray"}>
                        {q.status.charAt(0).toUpperCase() + q.status.slice(1)}
                      </Badge>
                    </td>
                    {canManage && (
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        {q.status === "pending" && (
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="primary" disabled={busy} onClick={() => onAccept(q.id)}>
                              Accept
                            </Button>
                            <Button size="sm" variant="danger" disabled={busy} onClick={() => onReject(q.id)}>
                              Reject
                            </Button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
