"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { formatMoney, formatCentsPlain, parseToCents } from "@/lib/money";
import { apiGet, apiPatch, apiPut, apiPost, ApiResponseError } from "@/api-client/client";
import type {
  CatalogProduct,
  CatalogProductsResponse,
  CatalogCategoriesResponse,
  CatalogCategory,
} from "@/api-client/types";

type DetailTab = "general" | "categories" | "pricing" | "variants";

const INPUT_CLASS =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-950 focus:ring-2 focus:ring-slate-950 outline-none";
const LABEL_CLASS = "block text-sm font-medium text-slate-700 mb-1";

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const productId = params?.id as string;

  const [product, setProduct] = useState<CatalogProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>("general");

  const loadProduct = useCallback(() => {
    const controller = new AbortController();
    setLoading(true);
    apiGet<CatalogProduct>(`/api/v1/catalog/${productId}`, {
      signal: controller.signal,
    })
      .then((data) => {
        setProduct(data);
        setError(null);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(
          err instanceof ApiResponseError
            ? err.message
            : "Could not load product."
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return controller;
  }, [productId]);

  useEffect(() => {
    const controller = loadProduct();
    return () => controller.abort();
  }, [loadProduct]);

  if (loading) {
    return (
      <EnterpriseShell
        active="inventory"
        title="Product"
        subtitle="Loading..."
        contentClassName="overflow-y-auto"
      >
        <div className="p-6 text-sm text-slate-500">Loading...</div>
      </EnterpriseShell>
    );
  }

  if (error || !product) {
    return (
      <EnterpriseShell
        active="inventory"
        title="Product"
        subtitle="Error"
        contentClassName="overflow-y-auto"
      >
        <div className="p-6 text-sm text-danger-700" role="alert">
          {error ?? "Product not found."}
        </div>
      </EnterpriseShell>
    );
  }

  return (
    <EnterpriseShell
      active="inventory"
      title={product.name}
      subtitle={`SKU: ${product.sku} · ${product.status}`}
      contentClassName="overflow-y-auto"
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-6">
        {/* Back button */}
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

        {/* Tab navigation */}
        <div className="flex gap-1 border-b border-slate-200">
          {(["general", "categories", "pricing", "variants"] as DetailTab[]).map(
            (tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={[
                  "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize",
                  activeTab === tab
                    ? "border-slate-950 text-slate-950"
                    : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300",
                ].join(" ")}
              >
                {tab}
              </button>
            )
          )}
        </div>

        {activeTab === "general" && (
          <GeneralTab
            product={product}
            onSaved={(updated) => setProduct(updated)}
          />
        )}
        {activeTab === "categories" && (
          <CategoriesTab productId={productId} />
        )}
        {activeTab === "pricing" && (
          <PricingTab
            product={product}
            onSaved={(updated) => setProduct(updated)}
          />
        )}
        {activeTab === "variants" && (
          <VariantsTab product={product} />
        )}
      </div>
    </EnterpriseShell>
  );
}

// ─── General Tab ─────────────────────────────────────────────────────────────

function GeneralTab({
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
      const updated = await apiPatch<CatalogProduct>(
        `/api/v1/catalog/${product.id}`,
        body
      );
      onSaved(updated);
      setSaved(true);
    } catch (err) {
      setSaveError(
        err instanceof ApiResponseError ? err.message : "Save failed."
      );
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
            <input
              type="text"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>SKU</label>
            <code className="block w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              {product.sku}
            </code>
          </div>
          <div>
            <label className={LABEL_CLASS}>Status</label>
            <select
              value={form.status}
              onChange={(e) => update("status", e.target.value)}
              className={INPUT_CLASS}
            >
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <div>
            <label className={LABEL_CLASS}>Brand</label>
            <input
              type="text"
              value={form.brand}
              onChange={(e) => update("brand", e.target.value)}
              className={INPUT_CLASS}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={LABEL_CLASS}>Description</label>
            <textarea
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              rows={3}
              className={INPUT_CLASS}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={LABEL_CLASS}>Image URL</label>
            <input
              type="url"
              value={form.image_url}
              onChange={(e) => update("image_url", e.target.value)}
              placeholder="https://..."
              className={INPUT_CLASS}
            />
            {form.image_url && (
              <img
                src={form.image_url}
                alt="Product"
                className="mt-2 h-24 w-24 rounded-md border border-slate-200 object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            )}
          </div>
          <div>
            <label className={LABEL_CLASS}>Barcode</label>
            <input
              type="text"
              value={form.barcode}
              onChange={(e) => update("barcode", e.target.value)}
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>Vendor UPC</label>
            <input
              type="text"
              value={form.vendor_upc}
              onChange={(e) => update("vendor_upc", e.target.value)}
              className={INPUT_CLASS}
            />
          </div>
        </div>
      </Card>

      <Card title="Qty rules">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className={LABEL_CLASS}>Min qty to sell</label>
            <input
              type="number"
              value={form.min_qty_to_sell}
              onChange={(e) => update("min_qty_to_sell", e.target.value)}
              min={0}
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>Max qty to sell</label>
            <input
              type="number"
              value={form.max_qty_to_sell}
              onChange={(e) => update("max_qty_to_sell", e.target.value)}
              min={0}
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>Qty increment</label>
            <input
              type="number"
              value={form.qty_increment}
              onChange={(e) => update("qty_increment", e.target.value)}
              min={1}
              className={INPUT_CLASS}
            />
          </div>
        </div>
      </Card>

      <Card title="Dimensions &amp; weight">
        <div className="grid gap-4 sm:grid-cols-4">
          <div>
            <label className={LABEL_CLASS}>Length (mm)</label>
            <input
              type="number"
              value={form.length_mm}
              onChange={(e) => update("length_mm", e.target.value)}
              min={0}
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>Width (mm)</label>
            <input
              type="number"
              value={form.width_mm}
              onChange={(e) => update("width_mm", e.target.value)}
              min={0}
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>Height (mm)</label>
            <input
              type="number"
              value={form.height_mm}
              onChange={(e) => update("height_mm", e.target.value)}
              min={0}
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>Weight (grams)</label>
            <input
              type="number"
              value={form.weight_grams}
              onChange={(e) => update("weight_grams", e.target.value)}
              min={0}
              className={INPUT_CLASS}
            />
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
        <Button
          variant="primary"
          size="md"
          onClick={() => void handleSave()}
          loading={saving}
        >
          Save changes
        </Button>
      </div>
    </div>
  );
}

// ─── Categories Tab ───────────────────────────────────────────────────────────

function CategoriesTab({ productId }: { productId: string }) {
  const [allCategories, setAllCategories] = useState<CatalogCategory[]>([]);
  const [assigned, setAssigned] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    Promise.all([
      apiGet<CatalogCategoriesResponse>("/api/v1/catalog/categories", {
        signal: controller.signal,
      }),
      apiGet<CatalogCategoriesResponse>(
        `/api/v1/catalog/${productId}/categories`,
        { signal: controller.signal }
      ),
    ])
      .then(([all, assigned]) => {
        setAllCategories(all.items);
        setAssigned(new Set(assigned.items.map((c) => c.id)));
        setError(null);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(
          err instanceof ApiResponseError
            ? err.message
            : "Could not load categories."
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [productId]);

  function toggleCategory(id: string) {
    setAssigned((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      await apiPut(`/api/v1/catalog/${productId}/categories`, {
        categoryIds: Array.from(assigned),
      });
      setSaved(true);
    } catch (err) {
      setSaveError(
        err instanceof ApiResponseError ? err.message : "Save failed."
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="p-6 text-sm text-slate-500">Loading...</div>;
  }

  if (error) {
    return (
      <div className="p-6 text-sm text-danger-700" role="alert">
        {error}
      </div>
    );
  }

  // Build tree: root categories first, then children
  const roots = allCategories.filter((c) => !c.parent_id);
  const children = (parentId: string) =>
    allCategories.filter((c) => c.parent_id === parentId);

  return (
    <div className="flex flex-col gap-5">
      <Card title="Assign categories">
        {allCategories.length === 0 ? (
          <p className="text-sm text-slate-500">No categories defined yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {roots.map((root) => (
              <div key={root.id}>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={assigned.has(root.id)}
                    onChange={() => toggleCategory(root.id)}
                    className="h-4 w-4 rounded border-slate-300 text-slate-950 focus:ring-slate-950"
                  />
                  <span className="font-medium text-slate-800">{root.name}</span>
                </label>
                {children(root.id).map((child) => (
                  <label
                    key={child.id}
                    className="ml-6 mt-1 flex items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={assigned.has(child.id)}
                      onChange={() => toggleCategory(child.id)}
                      className="h-4 w-4 rounded border-slate-300 text-slate-950 focus:ring-slate-950"
                    />
                    <span className="text-slate-700">{child.name}</span>
                  </label>
                ))}
              </div>
            ))}
          </div>
        )}
      </Card>

      {saveError && (
        <div className="rounded-md border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700" role="alert">
          {saveError}
        </div>
      )}
      {saved && (
        <div className="rounded-md border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700" role="status">
          Categories saved.
        </div>
      )}
      <div className="flex justify-end">
        <Button
          variant="primary"
          size="md"
          onClick={() => void handleSave()}
          loading={saving}
        >
          Save categories
        </Button>
      </div>
    </div>
  );
}

// ─── Pricing Tab ─────────────────────────────────────────────────────────────

function PricingTab({
  product,
  onSaved,
}: {
  product: CatalogProduct;
  onSaved: (p: CatalogProduct) => void;
}) {
  const [priceInput, setPriceInput] = useState(
    formatCentsPlain(product.price_cents)
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const priceCents = parseToCents(priceInput);
  const valid = !isNaN(priceCents) && priceCents >= 0;

  async function handleSave() {
    if (!valid) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await apiPatch<CatalogProduct>(
        `/api/v1/catalog/${product.id}`,
        { price_cents: priceCents }
      );
      onSaved(updated);
      setSaved(true);
    } catch (err) {
      setSaveError(
        err instanceof ApiResponseError ? err.message : "Save failed."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Card title="Pricing">
        <div className="max-w-xs">
          <label className={LABEL_CLASS}>Sell price (USD)</label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">
              $
            </span>
            <input
              type="number"
              value={priceInput}
              onChange={(e) => {
                setPriceInput(e.target.value);
                setSaved(false);
              }}
              min={0}
              step="0.01"
              className="w-full rounded-md border border-slate-300 py-2 pl-7 pr-3 text-sm focus:border-slate-950 focus:ring-2 focus:ring-slate-950 outline-none"
            />
          </div>
          {valid && (
            <p className="mt-1 text-xs text-slate-500">
              Formatted: {formatMoney(priceCents)}
            </p>
          )}
        </div>
      </Card>

      <Card title="Cost &amp; margin">
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm">
          <p className="text-slate-600">
            Avg cost is tracked via purchasing/receiving. View cost and margin on
            the{" "}
            <Link
              href="/inventory"
              className="text-slate-950 underline underline-offset-2"
            >
              Stock ledger
            </Link>
            .
          </p>
        </div>
      </Card>

      {saveError && (
        <div className="rounded-md border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700" role="alert">
          {saveError}
        </div>
      )}
      {saved && (
        <div className="rounded-md border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700" role="status">
          Price saved.
        </div>
      )}
      <div className="flex justify-end">
        <Button
          variant="primary"
          size="md"
          onClick={() => void handleSave()}
          loading={saving}
          disabled={!valid}
        >
          Save price
        </Button>
      </div>
    </div>
  );
}

// ─── Variants Tab ─────────────────────────────────────────────────────────────

function VariantsTab({ product }: { product: CatalogProduct }) {
  const [variants, setVariants] = useState<CatalogProduct[]>([]);
  const [variantsLoading, setVariantsLoading] = useState(false);
  const [variantsError, setVariantsError] = useState<string | null>(null);
  const [assignInput, setAssignInput] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignDone, setAssignDone] = useState(false);

  // Only load variants if this is not a child (no parent_product_id)
  const isMaster = !product.parent_product_id;

  useEffect(() => {
    if (!isMaster) return;
    const controller = new AbortController();
    setVariantsLoading(true);
    apiGet<CatalogProductsResponse>(
      `/api/v1/catalog/${product.id}/variants`,
      { signal: controller.signal }
    )
      .then((data) => {
        setVariants(data.items);
        setVariantsError(null);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setVariantsError(
          err instanceof ApiResponseError
            ? err.message
            : "Could not load variants."
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setVariantsLoading(false);
      });
    return () => controller.abort();
  }, [product.id, isMaster]);

  async function handleAssign() {
    const productIds = assignInput
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (productIds.length === 0) return;
    setAssigning(true);
    setAssignError(null);
    try {
      await apiPost(`/api/v1/catalog/${product.id}/variants/assign`, {
        productIds,
      });
      // Reload variants
      const data = await apiGet<CatalogProductsResponse>(
        `/api/v1/catalog/${product.id}/variants`
      );
      setVariants(data.items);
      setAssignInput("");
      setAssignDone(true);
    } catch (err) {
      setAssignError(
        err instanceof ApiResponseError ? err.message : "Assign failed."
      );
    } finally {
      setAssigning(false);
    }
  }

  if (!isMaster) {
    return (
      <div className="flex flex-col gap-5">
        <Card title="Variant info">
          <p className="text-sm text-slate-700">
            This product is a variant. Parent product ID:{" "}
            <Link
              href={`/inventory/products/${product.parent_product_id}`}
              className="font-mono text-slate-950 underline underline-offset-2"
            >
              {product.parent_product_id}
            </Link>
          </p>
          {product.variant_label && (
            <p className="mt-2 text-sm text-slate-600">
              Variant label:{" "}
              <span className="font-medium">{product.variant_label}</span>
            </p>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Card title="Child variants">
        {variantsLoading ? (
          <div className="text-sm text-slate-500">Loading...</div>
        ) : variantsError ? (
          <div className="text-sm text-danger-700" role="alert">
            {variantsError}
          </div>
        ) : variants.length === 0 ? (
          <p className="text-sm text-slate-500">
            No child variants assigned yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Variant label</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {variants.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-3">
                      <Link
                        href={`/inventory/products/${v.id}`}
                        className="font-mono text-xs font-semibold text-slate-950 underline-offset-2 hover:underline"
                      >
                        {v.sku}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-950">
                      {v.name}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {v.variant_label ?? "-"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded px-2 py-1 text-xs font-semibold capitalize ${
                          v.status === "active"
                            ? "bg-success-100 text-success-700"
                            : v.status === "archived"
                            ? "bg-danger-100 text-danger-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {v.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Assign children by product ID">
        <p className="mb-3 text-sm text-slate-600">
          Enter product IDs (one per line or comma-separated) to assign them as
          children of this master product.
        </p>
        <textarea
          value={assignInput}
          onChange={(e) => {
            setAssignInput(e.target.value);
            setAssignDone(false);
          }}
          rows={4}
          placeholder={"product-id-1\nproduct-id-2"}
          className={INPUT_CLASS}
        />
        {assignError && (
          <div className="mt-2 text-sm text-danger-700" role="alert">
            {assignError}
          </div>
        )}
        {assignDone && (
          <div className="mt-2 text-sm text-success-700" role="status">
            Variants assigned successfully.
          </div>
        )}
        <div className="mt-3 flex justify-end">
          <Button
            variant="primary"
            size="sm"
            onClick={() => void handleAssign()}
            loading={assigning}
            disabled={!assignInput.trim()}
          >
            Assign variants
          </Button>
        </div>
      </Card>
    </div>
  );
}
