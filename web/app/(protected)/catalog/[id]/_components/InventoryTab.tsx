"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { apiGet, apiPatch, apiPost, apiDelete, ApiResponseError } from "@/api-client/client";
import { formatMoney } from "@/lib/money";
import type { CatalogProduct } from "@/api-client/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

const FIELD = "w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-[#111] outline-none focus:border-[#5D5FEF] focus:ring-1 focus:ring-[#5D5FEF]";

function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-xs font-medium text-slate-500">{children}</label>;
}

function Section({ title, sub, action, children }: { title: string; sub?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[#111]">{title}</h3>
          {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function InventoryTab({
  product,
  onSaved,
}: {
  product: CatalogProduct;
  onSaved: (p: CatalogProduct) => void;
}) {
  const router = useRouter();

  // Supplier section
  const [supplierForm, setSupplierForm] = useState({
    supplier_name: "",
    supplier_code: product.vendor_upc ?? "",
    supplier_price: product.wholesale_price_cents != null
      ? String((product.wholesale_price_cents / 100).toFixed(2))
      : "",
  });
  const [savingSupplier, setSavingSupplier] = useState(false);
  const [supplierError, setSupplierError] = useState<string | null>(null);

  // Inventory levels section
  const [invForm, setInvForm] = useState({
    track: true,
    replenish_method: "min_max" as "min_max" | "reorder_point",
    min_qty: product.min_qty_to_sell != null ? String(product.min_qty_to_sell) : "",
    max_qty: product.max_qty_to_sell != null ? String(product.max_qty_to_sell) : "",
    reorder_point: "",
    reorder_qty: product.qty_increment != null ? String(product.qty_increment) : "",
  });
  const [savingInv, setSavingInv] = useState(false);
  const [invError, setInvError] = useState<string | null>(null);

  // Variants section
  const [variants, setVariants] = useState<CatalogProduct[]>([]);
  const [variantsLoaded, setVariantsLoaded] = useState(false);
  const [variantsLoading, setVariantsLoading] = useState(false);
  const [showAddVariant, setShowAddVariant] = useState(false);
  const [allProducts, setAllProducts] = useState<Array<{ id: string; sku: string; name: string }>>([]);
  const [addVariantId, setAddVariantId] = useState("");
  const [addVariantAxis, setAddVariantAxis] = useState("Size");
  const [addVariantValue, setAddVariantValue] = useState("");
  const [addVariantBusy, setAddVariantBusy] = useState(false);
  const [addVariantError, setAddVariantError] = useState<string | null>(null);

  const loadVariants = async () => {
    if (variantsLoaded) return;
    setVariantsLoading(true);
    try {
      const res = await apiGet<{ items: CatalogProduct[] }>(`/api/v1/catalog/${product.id}/variants`);
      setVariants(res.items ?? []);
      setVariantsLoaded(true);
    } catch { /* ignore */ } finally { setVariantsLoading(false); }
  };

  const openAddVariant = async () => {
    setShowAddVariant(true);
    setAddVariantError(null);
    if (allProducts.length === 0) {
      try {
        const res = await apiGet<{ items: Array<{ id: string; sku: string; name: string }> }>("/api/v1/catalog?pageSize=200");
        setAllProducts((res.items ?? []).filter((p) => p.id !== product.id));
      } catch { /* ignore */ }
    }
  };

  const assignVariant = async () => {
    if (!addVariantId || !addVariantValue.trim()) {
      setAddVariantError("Select a product and enter a value.");
      return;
    }
    const label = addVariantAxis === "Custom"
      ? addVariantValue.trim()
      : `${addVariantAxis}: ${addVariantValue.trim()}`;
    setAddVariantBusy(true); setAddVariantError(null);
    try {
      await apiPost(`/api/v1/catalog/${product.id}/variants/assign`, { productIds: [addVariantId], label });
      setAddVariantId(""); setAddVariantValue(""); setShowAddVariant(false);
      setVariantsLoaded(false);
      await loadVariants();
    } catch (e) {
      setAddVariantError(e instanceof ApiResponseError ? e.message : "Failed to assign variant.");
    } finally { setAddVariantBusy(false); }
  };

  const unlinkVariant = async (childId: string) => {
    try {
      await apiDelete(`/api/v1/catalog/${product.id}/variants/${childId}`);
      setVariants((v) => v.filter((x) => x.id !== childId));
    } catch { /* ignore */ }
  };

  const saveSupplier = async () => {
    setSavingSupplier(true); setSupplierError(null);
    try {
      const updated = await apiPatch<CatalogProduct>(`/api/v1/catalog/${product.id}`, {
        vendor_upc: supplierForm.supplier_code.trim() || undefined,
        wholesale_price_cents: supplierForm.supplier_price
          ? Math.round(parseFloat(supplierForm.supplier_price) * 100)
          : undefined,
      });
      onSaved(updated);
    } catch (e) {
      setSupplierError(e instanceof ApiResponseError ? e.message : "Save failed.");
    } finally { setSavingSupplier(false); }
  };

  const saveInventory = async () => {
    setSavingInv(true); setInvError(null);
    try {
      const patch: Partial<CatalogProduct> = {};
      if (invForm.replenish_method === "min_max") {
        patch.min_qty_to_sell = invForm.min_qty ? Number(invForm.min_qty) : undefined;
        patch.max_qty_to_sell = invForm.max_qty ? Number(invForm.max_qty) : undefined;
      } else {
        patch.qty_increment = invForm.reorder_qty ? Number(invForm.reorder_qty) : undefined;
      }
      const updated = await apiPatch<CatalogProduct>(`/api/v1/catalog/${product.id}`, patch);
      onSaved(updated);
    } catch (e) {
      setInvError(e instanceof ApiResponseError ? e.message : "Save failed.");
    } finally { setSavingInv(false); }
  };

  return (
    <div className="space-y-4">

      {/* ── Supplier Information ───────────────────────────────────────── */}
      <Section
        title="Supplier Information"
        action={
          <Button size="sm" variant="secondary" onClick={() => {
            setSupplierForm((f) => ({ ...f, _extra: true }));
          }}>+ Add another supplier</Button>
        }
      >
        {supplierError && (
          <p role="alert" className="mb-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{supplierError}</p>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <Label>Supplier</Label>
            <input
              className={FIELD}
              value={supplierForm.supplier_name}
              onChange={(e) => setSupplierForm((f) => ({ ...f, supplier_name: e.target.value }))}
              placeholder="Supplier name…"
            />
          </div>
          <div>
            <Label>Supplier code</Label>
            <input
              className={FIELD}
              value={supplierForm.supplier_code}
              onChange={(e) => setSupplierForm((f) => ({ ...f, supplier_code: e.target.value }))}
              placeholder="e.g. SKU-1234"
            />
          </div>
          <div>
            <Label>Supplier price ($)</Label>
            <input
              type="number" step="0.01" min="0"
              className={FIELD}
              value={supplierForm.supplier_price}
              onChange={(e) => setSupplierForm((f) => ({ ...f, supplier_price: e.target.value }))}
              placeholder="0.00"
            />
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <Button size="sm" variant="primary" loading={savingSupplier} onClick={() => void saveSupplier()}>
            Save supplier
          </Button>
        </div>
      </Section>

      {/* ── Inventory Levels ──────────────────────────────────────────── */}
      <Section title="Inventory Levels">
        {invError && (
          <p role="alert" className="mb-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{invError}</p>
        )}
        <label className="mb-4 flex cursor-pointer items-center gap-2.5">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-[#5D5FEF] focus:ring-[#5D5FEF]"
            checked={invForm.track}
            onChange={(e) => setInvForm((f) => ({ ...f, track: e.target.checked }))}
          />
          <span className="text-sm font-medium text-[#111]">Track inventory for this product</span>
        </label>

        {invForm.track && (
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-xs font-medium text-slate-500">Replenish method</p>
              <div className="space-y-3">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="radio"
                    className="mt-0.5 h-4 w-4 border-slate-300 text-[#5D5FEF]"
                    checked={invForm.replenish_method === "min_max"}
                    onChange={() => setInvForm((f) => ({ ...f, replenish_method: "min_max" }))}
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-[#111]">Min and max quantity</p>
                    <p className="text-xs text-slate-500">Min triggers replenishment; Max is the refill target</p>
                    {invForm.replenish_method === "min_max" && (
                      <div className="mt-2 grid grid-cols-2 gap-3">
                        <div>
                          <Label>Min quantity</Label>
                          <input
                            type="number" min="0"
                            className={FIELD}
                            value={invForm.min_qty}
                            onChange={(e) => setInvForm((f) => ({ ...f, min_qty: e.target.value }))}
                            placeholder="0"
                          />
                        </div>
                        <div>
                          <Label>Max quantity</Label>
                          <input
                            type="number" min="0"
                            className={FIELD}
                            value={invForm.max_qty}
                            onChange={(e) => setInvForm((f) => ({ ...f, max_qty: e.target.value }))}
                            placeholder="0"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </label>
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="radio"
                    className="mt-0.5 h-4 w-4 border-slate-300 text-[#5D5FEF]"
                    checked={invForm.replenish_method === "reorder_point"}
                    onChange={() => setInvForm((f) => ({ ...f, replenish_method: "reorder_point" }))}
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-[#111]">Reorder point and reorder quantity</p>
                    <p className="text-xs text-slate-500">Reorder point = drop-to level; Reorder quantity = set order amount</p>
                    {invForm.replenish_method === "reorder_point" && (
                      <div className="mt-2 grid grid-cols-2 gap-3">
                        <div>
                          <Label>Reorder point</Label>
                          <input
                            type="number" min="0"
                            className={FIELD}
                            value={invForm.reorder_point}
                            onChange={(e) => setInvForm((f) => ({ ...f, reorder_point: e.target.value }))}
                            placeholder="0"
                          />
                        </div>
                        <div>
                          <Label>Reorder quantity</Label>
                          <input
                            type="number" min="0"
                            className={FIELD}
                            value={invForm.reorder_qty}
                            onChange={(e) => setInvForm((f) => ({ ...f, reorder_qty: e.target.value }))}
                            placeholder="0"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </label>
              </div>
            </div>
            <div className="flex justify-end">
              <Button size="sm" variant="primary" loading={savingInv} onClick={() => void saveInventory()}>
                Save inventory settings
              </Button>
            </div>
          </div>
        )}
      </Section>

      {/* ── Variants ──────────────────────────────────────────────────── */}
      {product.parent_product_id ? (
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-[#5D5FEF]/10 px-2.5 py-0.5 text-xs font-semibold text-[#5D5FEF]">
              Child variant
            </span>
            {product.variant_label && <span className="text-sm text-slate-500">{product.variant_label}</span>}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            This product is a variant of{" "}
            <button
              type="button"
              onClick={() => router.push(`/catalog/${product.parent_product_id}`)}
              className="font-medium text-[#5D5FEF] hover:underline"
            >
              the master product
            </button>.
          </p>
        </div>
      ) : (
        <Section
          title="Variants"
          sub="Child products with different sizes, colors, or other attributes"
          action={
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                void (variantsLoaded ? Promise.resolve() : loadVariants());
                void openAddVariant();
              }}
            >
              + Add variant
            </Button>
          }
        >
          {/* load variants on first expand */}
          {!variantsLoaded && !showAddVariant && (
            <button
              type="button"
              className="text-xs text-[#5D5FEF] hover:underline"
              onClick={() => void loadVariants()}
            >
              Load variants
            </button>
          )}

          {showAddVariant && (
            <div className="mb-4 rounded-lg border border-[#5D5FEF]/20 bg-[#5D5FEF]/5 p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#5D5FEF]">Add variant</p>
              {addVariantError && (
                <p role="alert" className="rounded text-xs text-red-700 bg-red-50 px-3 py-1.5">{addVariantError}</p>
              )}
              <div>
                <Label>Option axis</Label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {["Size", "Color", "Flavor", "Weight", "Pack", "Custom"].map((ax) => (
                    <button
                      key={ax}
                      type="button"
                      onClick={() => setAddVariantAxis(ax)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                        addVariantAxis === ax
                          ? "bg-[#5D5FEF] text-white"
                          : "border border-slate-200 bg-white text-slate-600 hover:border-[#5D5FEF]/40"
                      }`}
                    >
                      {ax}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  {addVariantAxis !== "Custom" && (
                    <span className="flex h-9 items-center rounded-md border border-slate-100 bg-slate-50 px-3 text-sm text-slate-400 shrink-0">
                      {addVariantAxis}:
                    </span>
                  )}
                  <input
                    value={addVariantValue}
                    onChange={(e) => setAddVariantValue(e.target.value)}
                    placeholder={addVariantAxis === "Custom" ? "e.g. 500ml / Red / King Size" : "e.g. Large"}
                    className={FIELD}
                  />
                </div>
              </div>
              <div>
                <Label>Product to assign</Label>
                <select
                  value={addVariantId}
                  onChange={(e) => setAddVariantId(e.target.value)}
                  className={FIELD}
                >
                  <option value="">Select a product…</option>
                  {allProducts
                    .filter((p) => !variants.some((v) => v.id === p.id))
                    .map((p) => (
                      <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>
                    ))}
                </select>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setShowAddVariant(false)}>Cancel</Button>
                <Button size="sm" variant="primary" loading={addVariantBusy} onClick={() => void assignVariant()}>
                  Assign
                </Button>
              </div>
            </div>
          )}

          {variantsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100" />)}
            </div>
          ) : variantsLoaded && variants.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">
              No variants yet.{" "}
              <button type="button" onClick={() => void openAddVariant()} className="text-[#5D5FEF] hover:underline">
                Add a child product
              </button>
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-slate-100">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-4 py-2.5 text-left">Variant</th>
                    <th className="px-4 py-2.5 text-left">SKU</th>
                    <th className="px-4 py-2.5 text-right">Retail price</th>
                    <th className="px-4 py-2.5 text-center">Enabled</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {variants.map((v) => (
                    <tr key={v.id} className="hover:bg-[#FAFAFA]">
                      <td className="px-4 py-2.5">
                        <span className="inline-block rounded-full bg-[#5D5FEF]/10 px-2 py-0.5 text-xs font-semibold text-[#5D5FEF]">
                          {v.variant_label ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{v.sku}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-[#111]">{formatMoney(v.price_cents)}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`inline-block h-2 w-2 rounded-full ${v.status === "active" ? "bg-emerald-500" : "bg-slate-300"}`} />
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => router.push(`/catalog/${v.id}`)}
                          className="mr-3 text-xs text-[#5D5FEF] hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void unlinkVariant(v.id)}
                          className="text-xs text-red-500 hover:text-red-700"
                          aria-label={`Unlink ${v.name}`}
                        >
                          Unlink
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}
    </div>
  );
}
