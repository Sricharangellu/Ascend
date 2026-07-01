"use client";

import { useState } from "react";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { apiPatch, ApiResponseError } from "@/api-client/client";
import type { CatalogProduct } from "@/api-client/types";

const INPUT_CLASS =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-950 focus:ring-2 focus:ring-slate-950 outline-none";
const LABEL_CLASS = "block text-sm font-medium text-slate-700 mb-1";

export function GeneralTab({
  product,
  onSaved,
}: {
  product: CatalogProduct;
  onSaved: (p: CatalogProduct) => void;
}) {
  const [form, setForm] = useState({
    name: product.name,
    status: product.status,
    brand: product.brand ?? "",
    description: product.description ?? "",
    image_url: product.image_url ?? "",
    barcode: product.barcode ?? "",
    vendor_upc: product.vendor_upc ?? "",
    min_qty_to_sell: product.min_qty_to_sell?.toString() ?? "",
    max_qty_to_sell: product.max_qty_to_sell?.toString() ?? "",
    qty_increment: product.qty_increment?.toString() ?? "",
    length_mm: product.length_mm?.toString() ?? "",
    width_mm: product.width_mm?.toString() ?? "",
    height_mm: product.height_mm?.toString() ?? "",
    weight_grams: product.weight_grams?.toString() ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const body: Record<string, unknown> = {
        name: form.name,
        status: form.status,
        brand: form.brand || undefined,
        description: form.description || undefined,
        image_url: form.image_url || undefined,
        barcode: form.barcode || undefined,
        vendor_upc: form.vendor_upc || undefined,
        min_qty_to_sell: form.min_qty_to_sell ? Number(form.min_qty_to_sell) : undefined,
        max_qty_to_sell: form.max_qty_to_sell ? Number(form.max_qty_to_sell) : undefined,
        qty_increment: form.qty_increment ? Number(form.qty_increment) : undefined,
        length_mm: form.length_mm ? Number(form.length_mm) : undefined,
        width_mm: form.width_mm ? Number(form.width_mm) : undefined,
        height_mm: form.height_mm ? Number(form.height_mm) : undefined,
        weight_grams: form.weight_grams ? Number(form.weight_grams) : undefined,
      };
      const updated = await apiPatch<CatalogProduct>(`/api/v1/catalog/${product.id}`, body);
      onSaved(updated);
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof ApiResponseError ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={LABEL_CLASS}>Name</label>
            <input type="text" value={form.name} onChange={(e) => update("name", e.target.value)} className={INPUT_CLASS} />
          </div>
          <div>
            <label className={LABEL_CLASS}>SKU</label>
            <code className="block w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              {product.sku}
            </code>
          </div>
          <div>
            <label className={LABEL_CLASS}>Status</label>
            <select value={form.status} onChange={(e) => update("status", e.target.value)} className={INPUT_CLASS}>
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <div>
            <label className={LABEL_CLASS}>Brand</label>
            <input type="text" value={form.brand} onChange={(e) => update("brand", e.target.value)} className={INPUT_CLASS} />
          </div>
          <div className="sm:col-span-2">
            <label className={LABEL_CLASS}>Description</label>
            <textarea value={form.description} onChange={(e) => update("description", e.target.value)} rows={3} className={INPUT_CLASS} />
          </div>
          <div className="sm:col-span-2">
            <label className={LABEL_CLASS}>Image URL</label>
            <input type="url" value={form.image_url} onChange={(e) => update("image_url", e.target.value)}
              placeholder="https://..." className={INPUT_CLASS} />
            {form.image_url && (
              <img src={form.image_url} alt="Product"
                className="mt-2 h-24 w-24 rounded-md border border-slate-200 object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            )}
          </div>
          <div>
            <label className={LABEL_CLASS}>Barcode</label>
            <input type="text" value={form.barcode} onChange={(e) => update("barcode", e.target.value)} className={INPUT_CLASS} />
          </div>
          <div>
            <label className={LABEL_CLASS}>Vendor UPC</label>
            <input type="text" value={form.vendor_upc} onChange={(e) => update("vendor_upc", e.target.value)} className={INPUT_CLASS} />
          </div>
        </div>
      </Card>

      <Card title="Qty rules">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className={LABEL_CLASS}>Min qty to sell</label>
            <input type="number" value={form.min_qty_to_sell} onChange={(e) => update("min_qty_to_sell", e.target.value)} min={0} className={INPUT_CLASS} />
          </div>
          <div>
            <label className={LABEL_CLASS}>Max qty to sell</label>
            <input type="number" value={form.max_qty_to_sell} onChange={(e) => update("max_qty_to_sell", e.target.value)} min={0} className={INPUT_CLASS} />
          </div>
          <div>
            <label className={LABEL_CLASS}>Qty increment</label>
            <input type="number" value={form.qty_increment} onChange={(e) => update("qty_increment", e.target.value)} min={1} className={INPUT_CLASS} />
          </div>
        </div>
      </Card>

      <Card title="Dimensions &amp; weight">
        <div className="grid gap-4 sm:grid-cols-4">
          <div>
            <label className={LABEL_CLASS}>Length (mm)</label>
            <input type="number" value={form.length_mm} onChange={(e) => update("length_mm", e.target.value)} min={0} className={INPUT_CLASS} />
          </div>
          <div>
            <label className={LABEL_CLASS}>Width (mm)</label>
            <input type="number" value={form.width_mm} onChange={(e) => update("width_mm", e.target.value)} min={0} className={INPUT_CLASS} />
          </div>
          <div>
            <label className={LABEL_CLASS}>Height (mm)</label>
            <input type="number" value={form.height_mm} onChange={(e) => update("height_mm", e.target.value)} min={0} className={INPUT_CLASS} />
          </div>
          <div>
            <label className={LABEL_CLASS}>Weight (grams)</label>
            <input type="number" value={form.weight_grams} onChange={(e) => update("weight_grams", e.target.value)} min={0} className={INPUT_CLASS} />
          </div>
        </div>
      </Card>

      {saveError && (
        <div className="rounded-md border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700" role="alert">
          {saveError}
        </div>
      )}
      {saved && (
        <div className="rounded-md border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700" role="status">
          Changes saved successfully.
        </div>
      )}
      <div className="flex justify-end">
        <Button variant="primary" size="md" onClick={() => void handleSave()} loading={saving}>
          Save changes
        </Button>
      </div>
    </div>
  );
}
