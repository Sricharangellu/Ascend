"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { apiGet, apiPatch, apiPost, apiDelete, ApiResponseError } from "@/api-client/client";
import { formatMoney } from "@/lib/money";
import type { CatalogProduct } from "@/api-client/types";

// ─── Local types ──────────────────────────────────────────────────────────────

interface LocationStock {
  location_id: string;
  location_code: string;
  location_name: string;
  quantity_on_hand: number;
  quantity_committed: number;
  quantity_available: number;
  average_cost_cents: number;
}

interface ProductStock {
  product_id: string;
  locations: LocationStock[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_BADGE = { active: "green", draft: "yellow", archived: "gray" } as const;

const TOBACCO_TYPES = [
  { value: "", label: "None (not tobacco/vape)" },
  { value: "cigarette", label: "Cigarette" },
  { value: "cigar", label: "Cigar / Cigarillo" },
  { value: "smokeless", label: "Smokeless / Chewing" },
  { value: "ecigarette", label: "E-Cigarette / Vape" },
] as const;

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
] as const;

type TobaccoType = "" | "cigarette" | "cigar" | "smokeless" | "ecigarette";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [product, setProduct] = useState<CatalogProduct | null>(null);
  const [stock, setStock] = useState<ProductStock | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savingCompliance, setSavingCompliance] = useState(false);
  const [complianceSaveError, setComplianceSaveError] = useState<string | null>(null);

  // Duplicate
  const [duplicating, setDuplicating] = useState(false);

  // Variant management
  const [variants, setVariants] = useState<CatalogProduct[]>([]);
  const [variantsLoading, setVariantsLoading] = useState(false);
  const [showAddVariant, setShowAddVariant] = useState(false);
  const [allProducts, setAllProducts] = useState<Array<{ id: string; sku: string; name: string }>>([]);
  const [addVariantId, setAddVariantId] = useState("");
  const [addVariantAxis, setAddVariantAxis] = useState("Size");
  const [addVariantValue, setAddVariantValue] = useState("");
  const [addVariantBusy, setAddVariantBusy] = useState(false);
  const [addVariantError, setAddVariantError] = useState<string | null>(null);

  const [complianceForm, setComplianceForm] = useState<{
    tobacco_type: TobaccoType;
    flavored: boolean;
    menthol: boolean;
    msa_reportable: boolean;
    restricted_states: string[];
  }>({
    tobacco_type: "",
    flavored: false,
    menthol: false,
    msa_reportable: false,
    restricted_states: [],
  });

  // Edit form state (mirrors editable CatalogProduct fields)
  const [form, setForm] = useState({
    name: "",
    sku: "",
    price_cents: "",
    msrp_cents: "",
    raw_cost_price_cents: "",
    description: "",
    brand: "",
    barcode: "",
    category: "",
    tax_class: "standard" as "standard" | "exempt",
    status: "active" as "active" | "draft" | "archived",
    image_url: "",
    weight_grams: "",
    length_mm: "",
    width_mm: "",
    height_mm: "",
  });

  const loadVariants = useCallback(async () => {
    setVariantsLoading(true);
    try {
      const res = await apiGet<{ items: CatalogProduct[] }>(`/api/v1/catalog/${id}/variants`);
      setVariants(res.items ?? []);
    } catch { /* ignore */ } finally { setVariantsLoading(false); }
  }, [id]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [prod, stk] = await Promise.all([
        apiGet<CatalogProduct>(`/api/v1/catalog/${id}`),
        apiGet<ProductStock>(`/api/v1/catalog/${id}/stock`).catch(() => null),
      ]);
      setProduct(prod);
      setStock(stk);
      if (!prod.parent_product_id) void loadVariants();
      setForm({
        name: prod.name,
        sku: prod.sku,
        price_cents: String(prod.price_cents / 100),
        msrp_cents: prod.msrp_cents != null ? String(prod.msrp_cents / 100) : "",
        raw_cost_price_cents: prod.raw_cost_price_cents != null ? String(prod.raw_cost_price_cents / 100) : "",
        description: prod.description ?? "",
        brand: prod.brand ?? "",
        barcode: prod.barcode ?? "",
        category: prod.category,
        tax_class: prod.tax_class,
        status: prod.status,
        image_url: prod.image_url ?? "",
        weight_grams: prod.weight_grams != null ? String(prod.weight_grams) : "",
        length_mm: prod.length_mm != null ? String(prod.length_mm) : "",
        width_mm: prod.width_mm != null ? String(prod.width_mm) : "",
        height_mm: prod.height_mm != null ? String(prod.height_mm) : "",
      });
      setComplianceForm({
        tobacco_type: (prod.tobacco_type ?? "") as TobaccoType,
        flavored: !!prod.flavored,
        menthol: !!prod.menthol,
        msa_reportable: !!prod.msa_reportable,
        restricted_states: prod.restricted_states ?? [],
      });
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : "Failed to load product.");
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!product) return;
    setSaving(true); setSaveError(null);
    try {
      const priceCents = Math.round(parseFloat(form.price_cents) * 100);
      if (isNaN(priceCents)) throw new Error("Invalid price");
      const msrpCents = form.msrp_cents ? Math.round(parseFloat(form.msrp_cents) * 100) : undefined;
      const costCents = form.raw_cost_price_cents ? Math.round(parseFloat(form.raw_cost_price_cents) * 100) : undefined;
      const patch: Partial<CatalogProduct> = {
        name: form.name.trim(),
        sku: form.sku.trim(),
        price_cents: priceCents,
        msrp_cents: msrpCents ?? null,
        raw_cost_price_cents: costCents ?? null,
        description: form.description.trim() || undefined,
        brand: form.brand.trim() || undefined,
        barcode: form.barcode.trim() || undefined,
        category: form.category.trim(),
        tax_class: form.tax_class,
        status: form.status,
        image_url: form.image_url.trim() || undefined,
        weight_grams: form.weight_grams ? Number(form.weight_grams) : undefined,
        length_mm: form.length_mm ? Number(form.length_mm) : undefined,
        width_mm: form.width_mm ? Number(form.width_mm) : undefined,
        height_mm: form.height_mm ? Number(form.height_mm) : undefined,
      };
      const updated = await apiPatch<CatalogProduct>(`/api/v1/catalog/${id}`, patch);
      setProduct(updated);
      setEditing(false);
    } catch (e) {
      setSaveError(e instanceof ApiResponseError ? e.message : "Save failed.");
    } finally { setSaving(false); }
  };

  const saveCompliance = async () => {
    if (!product) return;
    setSavingCompliance(true); setComplianceSaveError(null);
    try {
      const updated = await apiPatch<CatalogProduct>(`/api/v1/catalog/${id}/compliance`, {
        tobacco_type: complianceForm.tobacco_type || null,
        flavored: complianceForm.flavored ? 1 : 0,
        menthol: complianceForm.menthol ? 1 : 0,
        msa_reportable: complianceForm.msa_reportable ? 1 : 0,
        restricted_states: complianceForm.restricted_states,
      });
      setProduct(updated);
    } catch (e) {
      setComplianceSaveError(e instanceof ApiResponseError ? e.message : "Failed to save compliance flags.");
    } finally { setSavingCompliance(false); }
  };

  const handleDuplicate = async () => {
    setDuplicating(true);
    try {
      const copy = await apiPost<CatalogProduct>(`/api/v1/catalog/${id}/duplicate`, {});
      router.push(`/catalog/${copy.id}`);
    } catch { /* ignore — button re-enables */ }
    finally { setDuplicating(false); }
  };

  const openAddVariant = async () => {
    setShowAddVariant(true);
    setAddVariantError(null);
    if (allProducts.length === 0) {
      try {
        const res = await apiGet<{ items: Array<{ id: string; sku: string; name: string }> }>("/api/v1/catalog?pageSize=200");
        setAllProducts((res.items ?? []).filter((p) => p.id !== id));
      } catch { /* ignore */ }
    }
  };

  const assignVariant = async () => {
    if (!addVariantId || !addVariantValue.trim()) {
      setAddVariantError("Select a product and enter a value.");
      return;
    }
    const label = addVariantAxis === "Custom" ? addVariantValue.trim() : `${addVariantAxis}: ${addVariantValue.trim()}`;
    setAddVariantBusy(true); setAddVariantError(null);
    try {
      await apiPost(`/api/v1/catalog/${id}/variants/assign`, { productIds: [addVariantId], label });
      setAddVariantId(""); setAddVariantValue(""); setShowAddVariant(false);
      await loadVariants();
    } catch (e) {
      setAddVariantError(e instanceof ApiResponseError ? e.message : "Failed to assign variant.");
    } finally { setAddVariantBusy(false); }
  };

  const unlinkVariant = async (childId: string) => {
    try {
      await apiDelete(`/api/v1/catalog/${id}/variants/${childId}`);
      await loadVariants();
    } catch { /* ignore */ }
  };

  const totalOnHand = stock?.locations.reduce((s, l) => s + l.quantity_on_hand, 0) ?? 0;
  const totalAvailable = stock?.locations.reduce((s, l) => s + l.quantity_available, 0) ?? 0;

  if (loading) {
    return (
      <EnterpriseShell active="catalog" title="Product" subtitle="Loading…" contentClassName="overflow-y-auto">
        <div className="mx-auto max-w-4xl px-4 py-5 sm:px-6 space-y-4">
          {[1, 2, 3].map(i => <div key={i} className="h-24 rounded-xl bg-gray-100 animate-pulse" />)}
        </div>
      </EnterpriseShell>
    );
  }

  if (error || !product) {
    return (
      <EnterpriseShell active="catalog" title="Product" subtitle="Not found" contentClassName="overflow-y-auto">
        <div className="mx-auto max-w-4xl px-4 py-5 sm:px-6">
          <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-4 py-3">{error ?? "Product not found."}</p>
          <Button variant="secondary" size="sm" onClick={() => router.back()} className="mt-4">← Back</Button>
        </div>
      </EnterpriseShell>
    );
  }

  return (
    <EnterpriseShell active="catalog" title={product.name} subtitle={product.sku} contentClassName="overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl space-y-5 px-4 py-5 sm:px-6">

        {/* Header bar */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Back to catalog"
            >
              ←
            </button>
            <Badge variant={STATUS_BADGE[product.status]}>{product.status}</Badge>
            <Badge variant="gray">{product.tax_class === "exempt" ? "Tax exempt" : "Standard tax"}</Badge>
          </div>
          <div className="flex gap-2">
            {editing ? (
              <>
                <Button size="sm" variant="secondary" onClick={() => { setEditing(false); setSaveError(null); }}>Cancel</Button>
                <Button size="sm" variant="primary" loading={saving} onClick={() => void save()}>Save changes</Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="secondary" loading={duplicating} onClick={() => void handleDuplicate()}>
                  Duplicate
                </Button>
                <Button size="sm" variant="primary" onClick={() => setEditing(true)}>Edit product</Button>
              </>
            )}
          </div>
        </div>

        {saveError && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-4 py-3">{saveError}</p>}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Main info */}
          <div className="lg:col-span-2 space-y-5">
            <Card>
              <h2 className="text-sm font-semibold text-gray-900 mb-4">Product details</h2>
              {editing ? (
                <div className="space-y-4">
                  <Field label="Name">
                    <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="SKU">
                      <input value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none font-mono" />
                    </Field>
                    <Field label="Barcode">
                      <input value={form.barcode} onChange={e => setForm(f => ({ ...f, barcode: e.target.value }))}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none font-mono" />
                    </Field>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="Sell price ($)">
                      <input type="number" step="0.01" min="0" value={form.price_cents}
                        onChange={e => setForm(f => ({ ...f, price_cents: e.target.value }))}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                    </Field>
                    <Field label="MSRP ($)">
                      <input type="number" step="0.01" min="0" value={form.msrp_cents}
                        onChange={e => setForm(f => ({ ...f, msrp_cents: e.target.value }))}
                        placeholder="0.00"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                    </Field>
                    <Field label="Cost price ($)">
                      <input type="number" step="0.01" min="0" value={form.raw_cost_price_cents}
                        onChange={e => setForm(f => ({ ...f, raw_cost_price_cents: e.target.value }))}
                        placeholder="0.00"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                    </Field>
                  </div>
                  <Field label="Category">
                    <input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Tax class">
                      <select value={form.tax_class} onChange={e => setForm(f => ({ ...f, tax_class: e.target.value as "standard" | "exempt" }))}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
                        <option value="standard">Standard</option>
                        <option value="exempt">Exempt</option>
                      </select>
                    </Field>
                    <Field label="Status">
                      <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as "active" | "draft" | "archived" }))}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
                        <option value="active">Active</option>
                        <option value="draft">Draft</option>
                        <option value="archived">Archived</option>
                      </select>
                    </Field>
                  </div>
                  <Field label="Brand">
                    <input value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                  </Field>
                  <Field label="Image URL">
                    <input type="url" value={form.image_url} onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))}
                      placeholder="https://…"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                  </Field>
                  <Field label="Description">
                    <textarea rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none resize-none" />
                  </Field>
                </div>
              ) : (
                <div className="space-y-5">
                  {product.image_url && (
                    <div className="flex items-start gap-4">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={product.image_url} alt={product.name}
                        className="h-24 w-24 rounded-xl object-cover border border-gray-200 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-gray-900 text-base leading-snug">{product.name}</p>
                        {product.brand && <p className="text-sm text-gray-500 mt-0.5">{product.brand}</p>}
                      </div>
                    </div>
                  )}
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
                    <DetailRow label="Name" value={product.name} />
                    <DetailRow label="SKU" value={<span className="font-mono">{product.sku}</span>} />
                    <DetailRow label="Barcode" value={product.barcode ? <span className="font-mono">{product.barcode}</span> : "—"} />
                    <DetailRow label="Category" value={product.category} />
                    <DetailRow label="Price" value={<span className="font-semibold">{formatMoney(product.price_cents)}</span>} />
                    <DetailRow label="Tax class" value={product.tax_class} />
                    <DetailRow label="Brand" value={product.brand ?? "—"} />
                    <DetailRow label="Status" value={<Badge variant={STATUS_BADGE[product.status]}>{product.status}</Badge>} />
                    {product.description && (
                      <div className="col-span-2">
                        <dt className="text-xs font-medium text-gray-500 mb-1">Description</dt>
                        <dd className="text-gray-900">{product.description}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              )}
            </Card>

            {/* Dimensions */}
            <Card>
              <h2 className="text-sm font-semibold text-gray-900 mb-4">Dimensions & weight</h2>
              {editing ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {([["Length (mm)", "length_mm"], ["Width (mm)", "width_mm"], ["Height (mm)", "height_mm"], ["Weight (g)", "weight_grams"]] as const).map(([label, key]) => (
                    <Field key={key} label={label}>
                      <input type="number" min="0" value={form[key]}
                        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                    </Field>
                  ))}
                </div>
              ) : (
                <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                  <DetailRow label="Length" value={product.length_mm != null ? `${product.length_mm} mm` : "—"} />
                  <DetailRow label="Width" value={product.width_mm != null ? `${product.width_mm} mm` : "—"} />
                  <DetailRow label="Height" value={product.height_mm != null ? `${product.height_mm} mm` : "—"} />
                  <DetailRow label="Weight" value={product.weight_grams != null ? `${product.weight_grams} g` : "—"} />
                </dl>
              )}
            </Card>

            {/* Compliance */}
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-900">Compliance</h2>
                <Button size="sm" variant="primary" loading={savingCompliance} onClick={() => void saveCompliance()}>
                  Save compliance
                </Button>
              </div>
              {complianceSaveError && (
                <p role="alert" className="text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2 mb-3">{complianceSaveError}</p>
              )}
              <div className="space-y-4">
                <Field label="Tobacco / vape type">
                  <select
                    value={complianceForm.tobacco_type}
                    onChange={e => setComplianceForm(f => ({ ...f, tobacco_type: e.target.value as TobaccoType }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    {TOBACCO_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </Field>
                <div className="space-y-2">
                  {(["flavored", "menthol", "msa_reportable"] as const).map((key) => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={complianceForm[key]}
                        onChange={e => setComplianceForm(f => ({ ...f, [key]: e.target.checked }))}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700 capitalize">{key.replace(/_/g, " ")}</span>
                    </label>
                  ))}
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2">
                    Restricted states ({complianceForm.restricted_states.length} selected)
                  </p>
                  <div className="grid grid-cols-5 gap-1 max-h-48 overflow-y-auto rounded-lg border border-gray-200 p-2">
                    {US_STATES.map((st) => (
                      <label key={st} className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={complianceForm.restricted_states.includes(st)}
                          onChange={e => setComplianceForm(f => ({
                            ...f,
                            restricted_states: e.target.checked
                              ? [...f.restricted_states, st]
                              : f.restricted_states.filter(s => s !== st),
                          }))}
                          className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-xs text-gray-600">{st}</span>
                      </label>
                    ))}
                  </div>
                </div>
                {product.restricted_states && product.restricted_states.length > 0 && (
                  <p className="text-xs text-red-600">
                    <span aria-hidden="true">&#9888; </span>
                    Currently blocked in: {product.restricted_states.join(", ")}
                  </p>
                )}
              </div>
            </Card>
            {/* Variants */}
            {product.parent_product_id ? (
              <Card>
                <div className="flex items-center gap-2 mb-3">
                  <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">Child variant</span>
                  {product.variant_label && (
                    <span className="text-sm text-gray-500">{product.variant_label}</span>
                  )}
                </div>
                <p className="text-xs text-gray-500">
                  This product is a variant of master product{" "}
                  <button
                    type="button"
                    onClick={() => router.push(`/catalog/${product.parent_product_id}`)}
                    className="font-medium text-blue-600 hover:underline"
                  >
                    {product.parent_product_id}
                  </button>
                </p>
              </Card>
            ) : (
              <Card>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-semibold text-gray-900">Variants</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Child products (different sizes, colors, etc.)</p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => void openAddVariant()}>
                    + Add variant
                  </Button>
                </div>

                {showAddVariant && (
                  <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
                    <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Add variant</p>
                    {addVariantError && (
                      <p role="alert" className="text-xs text-red-700 bg-red-50 rounded px-3 py-1.5">{addVariantError}</p>
                    )}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Option axis</label>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {["Size", "Color", "Flavor", "Weight", "Pack", "Custom"].map((ax) => (
                          <button
                            key={ax}
                            type="button"
                            onClick={() => setAddVariantAxis(ax)}
                            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                              addVariantAxis === ax
                                ? "bg-blue-600 text-white"
                                : "bg-white border border-gray-300 text-gray-600 hover:border-blue-400"
                            }`}
                          >
                            {ax}
                          </button>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <div className="w-24 shrink-0">
                          {addVariantAxis !== "Custom" && (
                            <input
                              readOnly
                              value={`${addVariantAxis}:`}
                              className="w-full rounded-lg border border-gray-200 bg-gray-100 px-3 py-2 text-sm text-gray-500"
                            />
                          )}
                        </div>
                        <input
                          value={addVariantValue}
                          onChange={(e) => setAddVariantValue(e.target.value)}
                          placeholder={addVariantAxis === "Custom" ? "e.g. 500ml / Red / King Size" : `e.g. ${addVariantAxis === "Size" ? "Large" : addVariantAxis === "Color" ? "Red" : "value"}`}
                          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Product to assign</label>
                      <select
                        value={addVariantId}
                        onChange={(e) => setAddVariantId(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
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
                      <Button size="sm" variant="primary" loading={addVariantBusy} onClick={() => void assignVariant()}>Assign</Button>
                    </div>
                  </div>
                )}

                {variantsLoading ? (
                  <div className="space-y-2">
                    {[1, 2].map((i) => <div key={i} className="h-10 rounded-lg bg-gray-100 animate-pulse" />)}
                  </div>
                ) : variants.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">No variants yet. Add child products above.</p>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {variants.map((v) => (
                      <div key={v.id} className="flex items-center justify-between py-2.5 gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="inline-block rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 shrink-0">
                            {v.variant_label ?? "—"}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{v.name}</p>
                            <p className="text-xs text-gray-400 font-mono">{v.sku}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-sm font-semibold text-gray-700">{formatMoney(v.price_cents)}</span>
                          <button
                            type="button"
                            onClick={() => router.push(`/catalog/${v.id}`)}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            View
                          </button>
                          <button
                            type="button"
                            onClick={() => void unlinkVariant(v.id)}
                            className="text-xs text-red-500 hover:text-red-700"
                            aria-label={`Unlink ${v.name}`}
                          >
                            Unlink
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}
          </div>

          {/* Right sidebar */}
          <div className="space-y-5">

            {/* Stock summary */}
            <Card>
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Stock</h2>
              <div className="flex gap-6 mb-4">
                <div>
                  <p className="text-2xl font-bold text-gray-900">{totalOnHand}</p>
                  <p className="text-xs text-gray-400">On hand</p>
                </div>
                <div>
                  <p className={`text-2xl font-bold ${totalAvailable <= 0 ? "text-red-600" : "text-green-700"}`}>{totalAvailable}</p>
                  <p className="text-xs text-gray-400">Available</p>
                </div>
              </div>
              {stock && stock.locations.length > 0 && (
                <div className="space-y-2">
                  {stock.locations.map(loc => (
                    <div key={loc.location_id} className="rounded-lg bg-gray-50 px-3 py-2">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-medium text-gray-700">{loc.location_name}</span>
                        <span className={`text-xs font-semibold ${loc.quantity_available <= 0 ? "text-red-600" : "text-gray-900"}`}>{loc.quantity_available} avail.</span>
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5 flex gap-3">
                        <span>{loc.quantity_on_hand} on hand</span>
                        <span>{loc.quantity_committed} committed</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Pricing */}
            <Card>
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Pricing</h2>
              <dl className="space-y-2.5 text-sm">
                <DetailRow label="Retail price" value={<span className="font-semibold text-gray-900">{formatMoney(product.price_cents)}</span>} />
                {product.msrp_cents != null && (
                  <DetailRow label="MSRP" value={
                    <span className="text-gray-500 line-through">{formatMoney(product.msrp_cents)}</span>
                  } />
                )}
                {product.raw_cost_price_cents != null && (
                  <DetailRow label="Cost" value={formatMoney(product.raw_cost_price_cents)} />
                )}
                {product.raw_cost_price_cents != null && product.raw_cost_price_cents > 0 && (
                  <DetailRow label="Margin" value={
                    <span className={`font-semibold ${
                      ((product.price_cents - product.raw_cost_price_cents) / product.price_cents) >= 0.3
                        ? "text-green-700"
                        : "text-orange-600"
                    }`}>
                      {Math.round(((product.price_cents - product.raw_cost_price_cents) / product.price_cents) * 100)}%
                    </span>
                  } />
                )}
              </dl>
            </Card>

            {/* Metadata */}
            <Card>
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Info</h2>
              <dl className="space-y-2 text-xs text-gray-500">
                <div>
                  <dt className="font-medium">Product ID</dt>
                  <dd className="font-mono truncate">{product.id}</dd>
                </div>
                <div>
                  <dt className="font-medium">Created</dt>
                  <dd>{new Date(product.createdAt).toLocaleDateString()}</dd>
                </div>
                <div>
                  <dt className="font-medium">Updated</dt>
                  <dd>{new Date(product.updatedAt).toLocaleDateString()}</dd>
                </div>
              </dl>
            </Card>
          </div>
        </div>
      </div>
    </EnterpriseShell>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-gray-500">{label}</dt>
      <dd className="text-gray-900 mt-0.5">{value}</dd>
    </div>
  );
}
