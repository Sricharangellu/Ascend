"use client";

import { useCallback, useEffect, useState } from "react";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { formatMoney, parseToCents } from "@/lib/money";
import { apiGet, apiPost, ApiResponseError } from "@/api-client/client";
import { hasRole } from "@/lib/auth";
import type {
  CreatePurchaseOrderLineRequest,
  InventoryLevelsResponse,
  PurchaseOrder,
  PurchaseOrdersResponse,
  Supplier,
  SuppliersResponse,
} from "@/api-client/types";

interface DraftLine {
  productId: string;
  quantity: string;
  unitCost: string;
  expiryDate: string;
  lotCode: string;
}

const STATUS_STYLE: Record<string, string> = {
  ordered: "bg-amber-50 text-amber-700 ring-amber-200",
  received: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};

function emptyLine(): DraftLine {
  return { productId: "", quantity: "1", unitCost: "", expiryDate: "", lotCode: "" };
}

export default function PurchasingPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [products, setProducts] = useState<Array<{ id: string; sku: string; name: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [supplierName, setSupplierName] = useState("");
  const [supplierEmail, setSupplierEmail] = useState("");

  const [poSupplierId, setPoSupplierId] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);

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

  useEffect(() => {
    void load();
  }, [load]);

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

  return (
    <EnterpriseShell active="purchasing" title="Purchasing" subtitle="Suppliers, purchase orders, and receiving" contentClassName="overflow-y-auto">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6">
        {error && (
          <div className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <Card className="overflow-hidden p-0">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-base font-semibold text-slate-950">Purchase orders</h2>
              <p className="text-sm text-slate-500">Track ordered and received stock from suppliers.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
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
                      <tr key={order.id}>
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
          </Card>

          <Card>
            <h2 className="text-base font-semibold text-slate-950">Suppliers</h2>
            <ul className="mt-3 flex flex-col gap-2">
              {suppliers.length === 0 && <li className="text-sm text-slate-500">No suppliers yet.</li>}
              {suppliers.map((supplier) => (
                <li key={supplier.id} className="rounded-md border border-slate-200 px-3 py-2">
                  <p className="text-sm font-medium text-slate-950">{supplier.name}</p>
                  <p className="text-xs text-slate-500">{supplier.email ?? "No email on file"}</p>
                </li>
              ))}
            </ul>

            {canManage && (
              <div className="mt-4 flex flex-col gap-2 border-t border-slate-200 pt-4">
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
          </Card>
        </div>

        {canManage && (
          <Card>
            <h2 className="text-base font-semibold text-slate-950">Create purchase order</h2>
            <p className="text-sm text-slate-500">Add line items with quantity, unit cost, and optional lot/expiry details.</p>

            <label className="mt-3 block max-w-sm">
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

            <div className="mt-4 flex flex-col gap-3">
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
          </Card>
        )}
      </div>
    </EnterpriseShell>
  );
}
