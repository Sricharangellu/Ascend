"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { apiGet, apiPost, ApiResponseError } from "@/api-client/client";
import { formatMoney, parseToCents } from "@/lib/money";
import { hasRole } from "@/lib/auth";
import type {
  CreatePurchaseOrderLineRequest,
  InventoryLevelsResponse,
  PurchaseOrder,
  PurchaseOrdersResponse,
  Supplier,
  SuppliersResponse,
} from "@/api-client/types";
import { STATUS_STYLE, emptyLine, type DraftLine } from "./shared";
import { DataTable, type DataColumn } from "@/components/DataTable";

interface ProductBarcode { barcode: string; kind: string; pack_size: number }

const UNIT_LABEL: Record<string, string> = { each: "Each", box: "Box", case: "Case", pallet: "Pallet", alt: "Alternate" };

export function OrdersTab() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [orders, setOrders]       = useState<PurchaseOrder[]>([]);
  const [products, setProducts]   = useState<Array<{ id: string; sku: string; name: string }>>([]);
  const [error, setError]         = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string[] | null>(null);
  const [busy, setBusy]           = useState(false);
  const [poSupplierId, setPoSupplierId] = useState("");
  const [lines, setLines]         = useState<DraftLine[]>([emptyLine()]);
  const [unitsByProduct, setUnitsByProduct] = useState<Record<string, ProductBarcode[]>>({});
  const canManage                 = hasRole("manager");

  const load = useCallback(async () => {
    setError(null);
    try {
      const [suppliersRes, ordersRes, inventoryRes] = await Promise.all([
        apiGet<SuppliersResponse>("/api/v1/purchasing/suppliers"),
        apiGet<PurchaseOrdersResponse>("/api/v1/purchasing/orders"),
        apiGet<InventoryLevelsResponse>("/api/v1/inventory/levels?pageSize=200"),
      ]);
      setSuppliers(suppliersRes.items ?? []);
      setOrders(ordersRes.items ?? []);
      setProducts((inventoryRes.items ?? []).map((item) => ({ id: item.id, sku: item.sku, name: item.name })));
      setPoSupplierId((cur) => cur || suppliersRes.items?.[0]?.id || "");
    } catch (err) {
      setError(err instanceof ApiResponseError ? err.message : "Could not load purchasing data.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? id;

  const updateLine = (index: number, patch: Partial<DraftLine>) =>
    setLines((cur) => cur.map((line, i) => (i === index ? { ...line, ...patch } : line)));

  const onProductChange = async (index: number, productId: string) => {
    updateLine(index, { productId, unitKind: "each" });
    if (!productId || unitsByProduct[productId]) return;
    try {
      const d = await apiGet<{ items: ProductBarcode[] }>(`/api/v1/catalog/${productId}/barcodes`);
      setUnitsByProduct((cur) => ({ ...cur, [productId]: d.items ?? [] }));
    } catch { /* units are optional — line still works as "each" */ }
  };

  /** The configured pack size for a line's selected unit, or null for "each"
   *  (no conversion) or when that unit isn't configured for this product. */
  const packSizeFor = (line: DraftLine): number | null => {
    if (line.unitKind === "each") return null;
    const match = unitsByProduct[line.productId]?.find((u) => u.kind === line.unitKind);
    return match?.pack_size ?? null;
  };

  const addLine    = () => setLines((cur) => [...cur, emptyLine()]);
  const removeLine = (index: number) => setLines((cur) => cur.filter((_, i) => i !== index));

  const receiveOrder = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/api/v1/purchasing/orders/${id}/receive`, {});
      await load();
    } catch (err) {
      setError(err instanceof ApiResponseError ? err.message : "Could not receive purchase order.");
    } finally { setBusy(false); }
  };

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
      if (line.unitKind !== "each") entry.unitKind = line.unitKind;
      if (line.expiryDate) entry.expiryDate = new Date(line.expiryDate).getTime();
      if (line.lotCode.trim()) entry.lotCode = line.lotCode.trim();
      requestLines.push(entry);
    }
    if (requestLines.length === 0) {
      setError("Add at least one line with a product, quantity, and unit cost.");
      return;
    }
    setBusy(true);
    setError(null);
    setConfirmation(null);
    try {
      const po = await apiPost<PurchaseOrder>("/api/v1/purchasing/orders", { supplierId: poSupplierId, lines: requestLines });
      setLines([emptyLine()]);
      setConfirmation(
        po.unitConversions?.length
          ? po.unitConversions.map((c) =>
              `${c.enteredQty} ${UNIT_LABEL[c.unitKind] ?? c.unitKind} → ${c.baseQty} Each (pack size ${c.packSize})`,
            )
          : null,
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiResponseError ? err.message : "Could not create purchase order.");
    } finally { setBusy(false); }
  };

  const INPUT = "mt-1 min-h-[44px] w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-slate-950 focus:ring-2 focus:ring-slate-950";


  /**
   * Purchase-order columns. `Receive` stays permission-gated and only appears
   * on an ordered PO — the same two conditions the inline cell applied.
   */
  const orderColumns: DataColumn<PurchaseOrder>[] = [
    { key: "id", header: "PO", hideable: false, sticky: true, sortValue: (o) => o.id,
      render: (o) => <span className="font-mono text-xs text-content-secondary">{o.id}</span> },
    { key: "supplier", header: "Supplier", sortValue: (o) => supplierName(o.supplier_id),
      render: (o) => <span className="text-content-primary">{supplierName(o.supplier_id)}</span> },
    { key: "status", header: "Status", sortValue: (o) => o.status,
      render: (o) => (
        <span className={`inline-flex rounded px-2 py-1 text-xs font-semibold ring-1 ring-inset ${STATUS_STYLE[o.status] ?? "bg-surface-3 text-content-secondary ring-line"}`}>
          {o.status}
        </span>
      ) },
    { key: "total", header: "Total", numeric: true, sortValue: (o) => o.total_cost_cents,
      render: (o) => <span className="font-semibold text-content-primary">{formatMoney(o.total_cost_cents)}</span> },
    { key: "actions", header: "Actions", hideable: false, align: "right",
      render: (o) => (
        o.status === "ordered" && canManage ? (
          <Button size="sm" variant="primary" disabled={busy} onClick={() => void receiveOrder(o.id)}>
            Receive
          </Button>
        ) : null
      ) },
  ];

  return (
    <div className="flex flex-col gap-5 p-4">
      {error && <p role="alert" className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
      {confirmation && (
        <div className="rounded-md bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          <p className="font-medium">Purchase order created — unit conversion applied:</p>
          {confirmation.map((line, i) => <p key={i}>{line}</p>)}
        </div>
      )}

      <DataTable<PurchaseOrder>
        caption="Purchase orders with supplier, status and total"
        columns={orderColumns}
        rows={orders}
        rowKey={(o) => o.id}
        emptyTitle="No purchase orders yet"
        emptyDescription="Create one below to start ordering stock from a supplier."
        storageKey="purchasing-orders"
        className="px-0"
      />

      {canManage && (
        <div className="border-t border-slate-200 pt-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-950">Create purchase order</h3>
          <label className="mb-3 block max-w-sm">
            <span className="text-xs font-medium uppercase text-slate-500">Supplier</span>
            <select value={poSupplierId} onChange={(e) => setPoSupplierId(e.target.value)} className={INPUT}>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <div className="flex flex-col gap-3">
            {lines.map((line, index) => {
              const availableUnits = unitsByProduct[line.productId] ?? [];
              const packSize = packSizeFor(line);
              const qty = Number(line.quantity) || 0;
              const costCents = line.unitCost ? parseToCents(line.unitCost) : 0;
              return (
              <div key={index} className="rounded-md border border-slate-200 p-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-6">
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-medium uppercase text-slate-500">Product</span>
                    <select value={line.productId} onChange={(e) => void onProductChange(index, e.target.value)} className={INPUT}>
                      <option value="">Select product</option>
                      {products.map((p) => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium uppercase text-slate-500">Unit</span>
                    <select value={line.unitKind} onChange={(e) => updateLine(index, { unitKind: e.target.value })} className={INPUT}>
                      <option value="each">Each</option>
                      {availableUnits.filter((u) => u.kind !== "each").map((u) => (
                        <option key={u.kind} value={u.kind}>{UNIT_LABEL[u.kind] ?? u.kind}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium uppercase text-slate-500">Quantity {line.unitKind !== "each" && `(${UNIT_LABEL[line.unitKind] ?? line.unitKind})`}</span>
                    <input type="number" min="1" value={line.quantity} onChange={(e) => updateLine(index, { quantity: e.target.value })} className={INPUT} />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium uppercase text-slate-500">Unit cost {line.unitKind !== "each" && `(per ${UNIT_LABEL[line.unitKind] ?? line.unitKind})`}</span>
                    <input type="text" inputMode="decimal" value={line.unitCost} onChange={(e) => updateLine(index, { unitCost: e.target.value })} placeholder="0.00" className={INPUT} />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium uppercase text-slate-500">Expiry date</span>
                    <input type="date" value={line.expiryDate} onChange={(e) => updateLine(index, { expiryDate: e.target.value })} className={INPUT} />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium uppercase text-slate-500">Lot code</span>
                    <input type="text" value={line.lotCode} onChange={(e) => updateLine(index, { lotCode: e.target.value })} placeholder="Optional" className={INPUT} />
                  </label>
                </div>

                {line.unitKind !== "each" && (
                  packSize ? (
                    <p className="mt-2 rounded bg-blue-50 px-3 py-1.5 text-xs text-blue-800">
                      1 {UNIT_LABEL[line.unitKind] ?? line.unitKind} = {packSize} Each — entered {qty || "?"} {UNIT_LABEL[line.unitKind] ?? line.unitKind}
                      {qty > 0 && ` → ${qty * packSize} Each`}
                      {costCents > 0 && ` @ ${formatMoney(Math.round(costCents / packSize))}/each (normalized from ${formatMoney(costCents)}/${UNIT_LABEL[line.unitKind] ?? line.unitKind})`}
                    </p>
                  ) : (
                    <p className="mt-2 rounded bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
                      No &quot;{UNIT_LABEL[line.unitKind] ?? line.unitKind}&quot; unit is configured for this product yet — add one under Units &amp; Packaging on the product page first.
                    </p>
                  )
                )}

                {lines.length > 1 && (
                  <div className="mt-2">
                    <Button variant="ghost" size="sm" onClick={() => removeLine(index)}>Remove line</Button>
                  </div>
                )}
              </div>
              );
            })}
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
  );
}
