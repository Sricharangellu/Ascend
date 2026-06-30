"use client";

import { useState } from "react";
import { ApiResponseError } from "@/api-client/client";
import type { Product, Category, ProductStatus, TaxClass } from "@/api-client/types";

export interface ProductFormState {
  name: string;
  sku: string;
  price_cents: string;
  category: string;
  barcode: string;
  tax_class: TaxClass;
  status: ProductStatus;
  brand: string;
  description: string;
  msrp_cents: string;
  raw_cost_price_cents: string;
  age_restricted: boolean;
  track_inventory: boolean;
}

export function emptyForm(): ProductFormState {
  return {
    name: "", sku: "", price_cents: "", category: "",
    barcode: "", tax_class: "standard", status: "draft",
    brand: "", description: "", msrp_cents: "", raw_cost_price_cents: "",
    age_restricted: false, track_inventory: true,
  };
}

export function productToForm(p: Product): ProductFormState {
  return {
    name: p.name, sku: p.sku,
    price_cents: (p.price_cents / 100).toFixed(2),
    category: p.category, barcode: p.barcode ?? "",
    tax_class: p.tax_class, status: p.status,
    brand: p.brand ?? "", description: p.description ?? "",
    msrp_cents: p.msrp_cents != null ? (p.msrp_cents / 100).toFixed(2) : "",
    raw_cost_price_cents: p.raw_cost_price_cents != null ? (p.raw_cost_price_cents / 100).toFixed(2) : "",
    age_restricted: p.age_restricted === 1,
    track_inventory: p.track_inventory === 1,
  };
}

export function formToBody(f: ProductFormState): Record<string, unknown> {
  return {
    name: f.name.trim(),
    sku:  f.sku.trim(),
    price_cents: Math.round(parseFloat(f.price_cents) * 100),
    category: f.category.trim() || "Uncategorized",
    barcode: f.barcode.trim() || null,
    tax_class: f.tax_class,
    status: f.status,
    brand: f.brand.trim() || null,
    description: f.description.trim() || null,
    msrp_cents: f.msrp_cents ? Math.round(parseFloat(f.msrp_cents) * 100) : null,
    raw_cost_price_cents: f.raw_cost_price_cents ? Math.round(parseFloat(f.raw_cost_price_cents) * 100) : null,
    age_restricted: f.age_restricted,
    track_inventory: f.track_inventory,
  };
}

export function ProductFormModal({
  initial,
  categories,
  onSave,
  onClose,
}: {
  initial?: Product;
  categories: Category[];
  onSave: (body: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<ProductFormState>(initial ? productToForm(initial) : emptyForm());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = (k: keyof ProductFormState, v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setErr("Product name is required."); return; }
    if (!form.sku.trim())  { setErr("SKU is required."); return; }
    const price = parseFloat(form.price_cents);
    if (!Number.isFinite(price) || price < 0) { setErr("Price must be a valid number."); return; }
    setSaving(true); setErr(null);
    try {
      await onSave(formToBody(form));
      onClose();
    } catch (ex) {
      setErr(ex instanceof ApiResponseError ? ex.message : "Save failed.");
      setSaving(false);
    }
  };

  const inputCls = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-600";
  const labelCls = "mb-1 block text-sm font-medium text-slate-700";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-md bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-950">
            {initial ? "Edit product" : "New product"}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close product form" className="flex h-9 w-9 items-center justify-center rounded-md text-xl leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-600">&times;</button>
        </div>

        <form id="product-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4">
          {err && (
            <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelCls}>Name <span className="text-red-500">*</span></label>
              <input type="text" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Product name" className={inputCls} required />
            </div>

            <div>
              <label className={labelCls}>SKU <span className="text-red-500">*</span></label>
              <input type="text" value={form.sku} onChange={(e) => set("sku", e.target.value)} placeholder="BEV-001" className={inputCls} required />
            </div>

            <div>
              <label className={labelCls}>Barcode</label>
              <input type="text" value={form.barcode} onChange={(e) => set("barcode", e.target.value)} placeholder="012345678901" className={inputCls} />
            </div>

            <div>
              <label className={labelCls}>Sell price ($) <span className="text-red-500">*</span></label>
              <input type="number" step="0.01" min="0" value={form.price_cents} onChange={(e) => set("price_cents", e.target.value)} placeholder="0.00" className={inputCls} required />
            </div>

            <div>
              <label className={labelCls}>MSRP ($)</label>
              <input type="number" step="0.01" min="0" value={form.msrp_cents} onChange={(e) => set("msrp_cents", e.target.value)} placeholder="0.00" className={inputCls} />
            </div>

            <div>
              <label className={labelCls}>Cost price ($)</label>
              <input type="number" step="0.01" min="0" value={form.raw_cost_price_cents} onChange={(e) => set("raw_cost_price_cents", e.target.value)} placeholder="0.00" className={inputCls} />
            </div>

            <div>
              <label className={labelCls}>Category</label>
              {categories.length > 0 ? (
                <select value={form.category} onChange={(e) => set("category", e.target.value)} className={inputCls}>
                  <option value="">— Select category —</option>
                  {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              ) : (
                <input type="text" value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="e.g. Beverages" className={inputCls} />
              )}
            </div>

            <div>
              <label className={labelCls}>Tax class</label>
              <select value={form.tax_class} onChange={(e) => set("tax_class", e.target.value as TaxClass)} className={inputCls}>
                <option value="standard">Standard</option>
                <option value="exempt">Tax exempt</option>
              </select>
            </div>

            <div>
              <label className={labelCls}>Status</label>
              <select value={form.status} onChange={(e) => set("status", e.target.value as ProductStatus)} className={inputCls}>
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="archived">Archived</option>
              </select>
            </div>

            <div>
              <label className={labelCls}>Brand</label>
              <input type="text" value={form.brand} onChange={(e) => set("brand", e.target.value)} placeholder="Brand name" className={inputCls} />
            </div>

            <div className="sm:col-span-2">
              <label className={labelCls}>Description</label>
              <textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} placeholder="Short product description" className={`${inputCls} resize-none`} />
            </div>

            <div className="sm:col-span-2 flex flex-wrap gap-5">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={form.age_restricted} onChange={(e) => set("age_restricted", e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-600" />
                Age restricted
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={form.track_inventory} onChange={(e) => set("track_inventory", e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-600" />
                Track inventory
              </label>
            </div>
          </div>
        </form>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button type="button" onClick={onClose} className="min-h-[40px] rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
          <button type="submit" form="product-form" disabled={saving} className="min-h-[40px] rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">
            {saving ? "Saving..." : initial ? "Save changes" : "Create product"}
          </button>
        </div>
      </div>
    </div>
  );
}

