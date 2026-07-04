"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { apiPost, ApiResponseError } from "@/api-client/client";
import type { CatalogProduct } from "@/api-client/types";
import {
  buildProductCreateBody,
  createInitialProductForm,
  validateProductForm,
  type ProductFormState,
  type ProductKind,
} from "./productForm";

const INPUT_CLASS =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-950 focus:ring-2 focus:ring-slate-950 outline-none";
const LABEL_CLASS = "block text-sm font-medium text-slate-700 mb-1";

export default function NewProductPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialParentId = searchParams.get("parent") ?? "";
  const initialVariantLabel = searchParams.get("label") ?? "";

  const [form, setForm] = useState<ProductFormState>(() => createInitialProductForm(initialParentId, initialVariantLabel));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
    setError(null);
  }

  function updateBool(field: string, value: boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError(null);
  }

  function validate(): boolean {
    const errors = validateProductForm(form);
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!validate()) return;

    const body = buildProductCreateBody(form);

    setSubmitting(true);
    setError(null);
    try {
      const created = await apiPost<CatalogProduct>("/api/v1/catalog", body);
      router.push(`/inventory/products/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiResponseError ? err.message : "Failed to create product.");
      setSubmitting(false);
    }
  }

  const kindOptions: Array<{ value: ProductKind; label: string }> = [
    { value: "standalone", label: "Standalone" },
    { value: "master", label: "Master" },
    { value: "variant", label: "Child variant" },
  ];

  return (
    <EnterpriseShell
      active="inventory"
      title="New product"
      subtitle="Create catalog product"
      contentClassName="overflow-y-auto"
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-6">
        <div>
          <Link href="/inventory" className="inline-flex items-center gap-1 text-sm text-slate-950 hover:underline">
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Back to Inventory
          </Link>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} noValidate className="flex flex-col gap-5">
          <Card title="Product identity">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={LABEL_CLASS} htmlFor="new-sku">SKU <span className="text-danger-600">*</span></label>
                <input
                  id="new-sku"
                  type="text"
                  value={form.sku}
                  onChange={(e) => update("sku", e.target.value)}
                  placeholder="WIDGET-001"
                  className={`${INPUT_CLASS}${fieldErrors.sku ? " border-danger-500" : ""}`}
                  aria-describedby={fieldErrors.sku ? "sku-err" : undefined}
                />
                {fieldErrors.sku && <p id="sku-err" className="mt-1 text-xs text-danger-600">{fieldErrors.sku}</p>}
              </div>
              <div>
                <label className={LABEL_CLASS} htmlFor="new-name">Name <span className="text-danger-600">*</span></label>
                <input
                  id="new-name"
                  type="text"
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  placeholder="Product name"
                  className={`${INPUT_CLASS}${fieldErrors.name ? " border-danger-500" : ""}`}
                  aria-describedby={fieldErrors.name ? "name-err" : undefined}
                />
                {fieldErrors.name && <p id="name-err" className="mt-1 text-xs text-danger-600">{fieldErrors.name}</p>}
              </div>
              <div>
                <label className={LABEL_CLASS} htmlFor="new-status">Status</label>
                <select id="new-status" value={form.status} onChange={(e) => update("status", e.target.value)} className={INPUT_CLASS}>
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
              <div>
                <label className={LABEL_CLASS} htmlFor="new-brand">Brand</label>
                <input id="new-brand" type="text" value={form.brand} onChange={(e) => update("brand", e.target.value)} className={INPUT_CLASS} />
              </div>
              <div className="sm:col-span-2">
                <label className={LABEL_CLASS} htmlFor="new-description">Description</label>
                <textarea id="new-description" value={form.description} onChange={(e) => update("description", e.target.value)} rows={3} className={INPUT_CLASS} />
              </div>
            </div>
          </Card>

          <Card title="Pricing and catalog">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className={LABEL_CLASS} htmlFor="new-price">Sell price (USD) {form.productKind !== "master" && <span className="text-danger-600">*</span>}</label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">$</span>
                  <input
                    id="new-price"
                    type="number"
                    value={form.priceInput}
                    onChange={(e) => update("priceInput", e.target.value)}
                    placeholder={form.productKind === "master" ? "0.00" : "9.99"}
                    min={0}
                    step="0.01"
                    className={`w-full rounded-md border py-2 pl-7 pr-3 text-sm focus:border-slate-950 focus:ring-2 focus:ring-slate-950 outline-none${fieldErrors.priceInput ? " border-danger-500" : " border-slate-300"}`}
                  />
                </div>
                {fieldErrors.priceInput && <p className="mt-1 text-xs text-danger-600">{fieldErrors.priceInput}</p>}
              </div>
              <MoneyInput id="new-msrp" label="MSRP" value={form.msrpInput} error={fieldErrors.msrpInput} onChange={(value) => update("msrpInput", value)} />
              <MoneyInput id="new-cost" label="Cost price" value={form.costInput} error={fieldErrors.costInput} onChange={(value) => update("costInput", value)} />
              <MoneyInput id="new-wholesale" label="Wholesale price" value={form.wholesaleInput} error={fieldErrors.wholesaleInput} onChange={(value) => update("wholesaleInput", value)} />
              <div>
                <label className={LABEL_CLASS} htmlFor="new-category">Category</label>
                <input id="new-category" type="text" value={form.category} onChange={(e) => update("category", e.target.value)} className={INPUT_CLASS} />
              </div>
              <div>
                <label className={LABEL_CLASS} htmlFor="new-tax">Tax class</label>
                <select id="new-tax" value={form.taxClass} onChange={(e) => update("taxClass", e.target.value)} className={INPUT_CLASS}>
                  <option value="standard">Standard</option>
                  <option value="exempt">Tax exempt</option>
                </select>
              </div>
              <div>
                <label className={LABEL_CLASS} htmlFor="new-barcode">Barcode</label>
                <input id="new-barcode" type="text" value={form.barcode} onChange={(e) => update("barcode", e.target.value)} className={INPUT_CLASS} />
              </div>
              <div>
                <label className={LABEL_CLASS} htmlFor="new-vendor-upc">Vendor UPC</label>
                <input id="new-vendor-upc" type="text" value={form.vendorUpc} onChange={(e) => update("vendorUpc", e.target.value)} className={INPUT_CLASS} />
              </div>
              <div className="lg:col-span-4">
                <label className={LABEL_CLASS} htmlFor="new-image">Image URL</label>
                <input id="new-image" type="url" value={form.imageUrl} onChange={(e) => update("imageUrl", e.target.value)} placeholder="https://..." className={INPUT_CLASS} />
              </div>
            </div>
          </Card>

          <Card title="Master and variants">
            <div className="flex flex-wrap gap-2">
              {kindOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => update("productKind", option.value)}
                  className={[
                    "min-h-10 rounded-md border px-4 py-2 text-sm font-medium transition-colors",
                    form.productKind === option.value
                      ? "border-slate-950 bg-slate-950 text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:border-slate-500",
                  ].join(" ")}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {form.productKind === "variant" && (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={LABEL_CLASS} htmlFor="new-parent">Parent product ID <span className="text-danger-600">*</span></label>
                  <input
                    id="new-parent"
                    type="text"
                    value={form.parentProductId}
                    onChange={(e) => update("parentProductId", e.target.value)}
                    className={`${INPUT_CLASS}${fieldErrors.parentProductId ? " border-danger-500" : ""}`}
                  />
                  {fieldErrors.parentProductId && <p className="mt-1 text-xs text-danger-600">{fieldErrors.parentProductId}</p>}
                </div>
                <div>
                  <label className={LABEL_CLASS} htmlFor="new-variant-label">Variant label <span className="text-danger-600">*</span></label>
                  <input
                    id="new-variant-label"
                    type="text"
                    value={form.variantLabel}
                    onChange={(e) => update("variantLabel", e.target.value)}
                    placeholder="Large / Black"
                    className={`${INPUT_CLASS}${fieldErrors.variantLabel ? " border-danger-500" : ""}`}
                  />
                  {fieldErrors.variantLabel && <p className="mt-1 text-xs text-danger-600">{fieldErrors.variantLabel}</p>}
                </div>
              </div>
            )}
          </Card>

          <Card title="Inventory rules">
            <div className="grid gap-4 sm:grid-cols-3">
              <NumberInput id="new-min-qty" label="Min qty to sell" value={form.minQtyToSell} error={fieldErrors.minQtyToSell} onChange={(value) => update("minQtyToSell", value)} />
              <NumberInput id="new-max-qty" label="Max qty to sell" value={form.maxQtyToSell} error={fieldErrors.maxQtyToSell} onChange={(value) => update("maxQtyToSell", value)} />
              <NumberInput id="new-qty-step" label="Qty increment" value={form.qtyIncrement} error={fieldErrors.qtyIncrement} onChange={(value) => update("qtyIncrement", value)} />
            </div>
          </Card>

          <Card title="Physical and operations">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <NumberInput id="new-length" label="Length (mm)" value={form.lengthMm} error={fieldErrors.lengthMm} onChange={(value) => update("lengthMm", value)} />
              <NumberInput id="new-width" label="Width (mm)" value={form.widthMm} error={fieldErrors.widthMm} onChange={(value) => update("widthMm", value)} />
              <NumberInput id="new-height" label="Height (mm)" value={form.heightMm} error={fieldErrors.heightMm} onChange={(value) => update("heightMm", value)} />
              <NumberInput id="new-weight" label="Weight (grams)" value={form.weightGrams} error={fieldErrors.weightGrams} onChange={(value) => update("weightGrams", value)} />
            </div>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
              <Flag label="Track inventory" checked={form.trackInventory} onChange={(value) => updateBool("trackInventory", value)} />
              <Flag label="Returnable" checked={form.returnable} onChange={(value) => updateBool("returnable", value)} />
              <Flag label="Age restricted" checked={form.ageRestricted} onChange={(value) => updateBool("ageRestricted", value)} />
              <Flag label="Service product" checked={form.serviceProduct} onChange={(value) => updateBool("serviceProduct", value)} />
              <Flag label="Ecommerce" checked={form.ecommerce} onChange={(value) => updateBool("ecommerce", value)} />
            </div>
          </Card>

          {error && (
            <div className="rounded-md border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700" role="alert">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" size="md" onClick={() => router.push("/inventory")}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md" loading={submitting}>
              Create product
            </Button>
          </div>
        </form>
      </div>
    </EnterpriseShell>
  );
}

function MoneyInput({
  id,
  label,
  value,
  error,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className={LABEL_CLASS} htmlFor={id}>{label}</label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">$</span>
        <input
          id={id}
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          min={0}
          step="0.01"
          className={`w-full rounded-md border py-2 pl-7 pr-3 text-sm focus:border-slate-950 focus:ring-2 focus:ring-slate-950 outline-none${error ? " border-danger-500" : " border-slate-300"}`}
        />
      </div>
      {error && <p className="mt-1 text-xs text-danger-600">{error}</p>}
    </div>
  );
}

function NumberInput({
  id,
  label,
  value,
  error,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className={LABEL_CLASS} htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        min={1}
        step={1}
        className={`${INPUT_CLASS}${error ? " border-danger-500" : ""}`}
      />
      {error && <p className="mt-1 text-xs text-danger-600">{error}</p>}
    </div>
  );
}

function Flag({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex min-h-8 items-center gap-2 text-sm text-slate-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-slate-950"
      />
      {label}
    </label>
  );
}
