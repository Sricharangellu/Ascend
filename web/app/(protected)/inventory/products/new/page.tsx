"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { parseToCents } from "@/lib/money";
import { apiPost, ApiResponseError } from "@/api-client/client";
import type { CatalogProduct } from "@/api-client/types";

const INPUT_CLASS =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-950 focus:ring-2 focus:ring-slate-950 outline-none";
const LABEL_CLASS = "block text-sm font-medium text-slate-700 mb-1";

export default function NewProductPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    sku: "",
    name: "",
    priceInput: "",
    brand: "",
    category: "",
    status: "draft" as "active" | "draft" | "archived",
  });
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

  function validate(): boolean {
    const errors: Record<string, string> = {};
    if (!form.sku.trim()) errors.sku = "SKU is required.";
    if (!form.name.trim()) errors.name = "Name is required.";
    const priceCents = parseToCents(form.priceInput);
    if (!form.priceInput.trim()) {
      errors.priceInput = "Price is required.";
    } else if (isNaN(priceCents) || priceCents < 0) {
      errors.priceInput = "Enter a valid price (e.g. 9.99).";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!validate()) return;

    const priceCents = parseToCents(form.priceInput);

    setSubmitting(true);
    setError(null);
    try {
      const created = await apiPost<CatalogProduct>("/api/v1/catalog", {
        sku: form.sku.trim(),
        name: form.name.trim(),
        price_cents: priceCents,
        brand: form.brand.trim() || undefined,
        category: form.category.trim() || undefined,
        status: form.status,
      });
      router.push(`/inventory/products/${created.id}`);
    } catch (err) {
      setError(
        err instanceof ApiResponseError ? err.message : "Failed to create product."
      );
      setSubmitting(false);
    }
  }

  return (
    <EnterpriseShell
      active="inventory"
      title="New product"
      subtitle="Create a new product in your catalog"
      contentClassName="overflow-y-auto"
    >
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6">
        {/* Back link */}
        <div>
          <Link
            href="/inventory"
            className="inline-flex items-center gap-1 text-sm text-slate-950 hover:underline"
          >
            <svg
              aria-hidden="true"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Back to Inventory
          </Link>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} noValidate>
          <Card title="Product details">
            <div className="grid gap-4 sm:grid-cols-2">
              {/* SKU */}
              <div>
                <label className={LABEL_CLASS} htmlFor="new-sku">
                  SKU <span className="text-danger-600">*</span>
                </label>
                <input
                  id="new-sku"
                  type="text"
                  value={form.sku}
                  onChange={(e) => update("sku", e.target.value)}
                  placeholder="e.g. WIDGET-001"
                  className={`${INPUT_CLASS}${fieldErrors.sku ? " border-danger-500" : ""}`}
                  aria-describedby={fieldErrors.sku ? "sku-err" : undefined}
                />
                {fieldErrors.sku && (
                  <p id="sku-err" className="mt-1 text-xs text-danger-600">
                    {fieldErrors.sku}
                  </p>
                )}
              </div>

              {/* Name */}
              <div>
                <label className={LABEL_CLASS} htmlFor="new-name">
                  Name <span className="text-danger-600">*</span>
                </label>
                <input
                  id="new-name"
                  type="text"
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  placeholder="Product name"
                  className={`${INPUT_CLASS}${fieldErrors.name ? " border-danger-500" : ""}`}
                  aria-describedby={fieldErrors.name ? "name-err" : undefined}
                />
                {fieldErrors.name && (
                  <p id="name-err" className="mt-1 text-xs text-danger-600">
                    {fieldErrors.name}
                  </p>
                )}
              </div>

              {/* Price */}
              <div>
                <label className={LABEL_CLASS} htmlFor="new-price">
                  Price (USD) <span className="text-danger-600">*</span>
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">
                    $
                  </span>
                  <input
                    id="new-price"
                    type="number"
                    value={form.priceInput}
                    onChange={(e) => update("priceInput", e.target.value)}
                    placeholder="0.00"
                    min={0}
                    step="0.01"
                    className={`w-full rounded-md border py-2 pl-7 pr-3 text-sm focus:border-slate-950 focus:ring-2 focus:ring-slate-950 outline-none${fieldErrors.priceInput ? " border-danger-500" : " border-slate-300"}`}
                    aria-describedby={
                      fieldErrors.priceInput ? "price-err" : undefined
                    }
                  />
                </div>
                {fieldErrors.priceInput && (
                  <p id="price-err" className="mt-1 text-xs text-danger-600">
                    {fieldErrors.priceInput}
                  </p>
                )}
              </div>

              {/* Status */}
              <div>
                <label className={LABEL_CLASS} htmlFor="new-status">
                  Status
                </label>
                <select
                  id="new-status"
                  value={form.status}
                  onChange={(e) =>
                    update("status", e.target.value)
                  }
                  className={INPUT_CLASS}
                >
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                </select>
              </div>

              {/* Brand */}
              <div>
                <label className={LABEL_CLASS} htmlFor="new-brand">
                  Brand
                </label>
                <input
                  id="new-brand"
                  type="text"
                  value={form.brand}
                  onChange={(e) => update("brand", e.target.value)}
                  placeholder="Optional"
                  className={INPUT_CLASS}
                />
              </div>

              {/* Category */}
              <div>
                <label className={LABEL_CLASS} htmlFor="new-category">
                  Category
                </label>
                <input
                  id="new-category"
                  type="text"
                  value={form.category}
                  onChange={(e) => update("category", e.target.value)}
                  placeholder="Optional"
                  className={INPUT_CLASS}
                />
              </div>
            </div>

            {error && (
              <div
                className="mt-4 rounded-md border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700"
                role="alert"
              >
                {error}
              </div>
            )}

            <div className="mt-5 flex justify-end gap-3">
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={() => router.push("/inventory")}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="md"
                loading={submitting}
              >
                Create product
              </Button>
            </div>
          </Card>
        </form>
      </div>
    </EnterpriseShell>
  );
}
