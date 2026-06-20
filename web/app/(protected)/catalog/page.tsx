"use client";

/**
 * /catalog — Product catalog management.
 * Two tabs: Products (filterable list, create/edit modal, archive)
 *           Categories (CRUD list).
 * Fetches GET /api/v1/catalog and /api/v1/catalog/categories.
 */

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { apiGet, apiPost, apiPatch, apiDelete, ApiResponseError } from "@/api-client/client";
import type { Product, ProductsResponse, Category, CategoriesResponse, ProductStatus, TaxClass } from "@/api-client/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function centsToDisplay(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function statusBadge(s: ProductStatus): "green" | "yellow" | "gray" {
  if (s === "active")   return "green";
  if (s === "draft")    return "yellow";
  return "gray";
}

function productStatusStyle(status: ProductStatus) {
  if (status === "active") {
    return {
      row: "border-l-success-500 bg-success-50/30 hover:bg-success-50/70",
      card: "border-l-success-500 bg-success-50/30",
      dot: "bg-success-500",
    };
  }
  if (status === "draft") {
    return {
      row: "border-l-warning-500 bg-warning-50/30 hover:bg-warning-50/70",
      card: "border-l-warning-500 bg-warning-50/30",
      dot: "bg-warning-500",
    };
  }
  return {
    row: "border-l-slate-300 bg-slate-50/70 text-slate-500 hover:bg-slate-100",
    card: "border-l-slate-300 bg-slate-50/80",
    dot: "bg-slate-400",
  };
}

function metricToneClass(tone: "neutral" | "success" | "warning" | "muted" | "restricted") {
  const tones = {
    neutral: "border-slate-200 bg-white",
    success: "border-success-200 bg-success-50",
    warning: "border-warning-200 bg-warning-50",
    muted: "border-slate-200 bg-slate-50",
    restricted: "border-orange-200 bg-orange-50",
  };
  return tones[tone];
}

// ── Product Form Modal ────────────────────────────────────────────────────────

interface ProductFormState {
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

function emptyForm(): ProductFormState {
  return {
    name: "", sku: "", price_cents: "", category: "",
    barcode: "", tax_class: "standard", status: "draft",
    brand: "", description: "", msrp_cents: "", raw_cost_price_cents: "",
    age_restricted: false, track_inventory: true,
  };
}

function productToForm(p: Product): ProductFormState {
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

function formToBody(f: ProductFormState): Record<string, unknown> {
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

function ProductFormModal({
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
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-950">
            {initial ? "Edit product" : "New product"}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close product form" className="flex h-9 w-9 items-center justify-center rounded-md text-xl leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-600">&times;</button>
        </div>

        {/* Body */}
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

        {/* Footer */}
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

// ── Products Tab ──────────────────────────────────────────────────────────────

// ── Print Labels ──────────────────────────────────────────────────────────────

function formatMoneyHTML(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function printLabels(products: Product[]) {
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(`<!doctype html><html><head><title>Labels</title><style>
    body { margin: 0; font-family: monospace; }
    .sheet { display: grid; grid-template-columns: repeat(4, 2in); gap: 0.125in; padding: 0.25in; }
    .label { width: 2in; height: 1in; border: 1px solid #ccc; padding: 4px; box-sizing: border-box; display: flex; flex-direction: column; overflow: hidden; }
    .name { font-size: 9px; font-weight: bold; line-height: 1.2; }
    .sku { font-size: 7px; color: #888; }
    .barcode-box { flex: 1; background: #f3f3f3; margin: 2px 0; display: flex; align-items: center; justify-content: center; font-size: 6px; color: #555; }
    .price { font-size: 13px; font-weight: bold; text-align: right; }
    @media print { @page { margin: 0.25in; } }
  </style></head><body><div class="sheet">${products.map(p => `
    <div class="label">
      <div class="name">${p.name}</div>
      <div class="sku">${p.sku}</div>
      <div class="barcode-box">${p.barcode ?? p.sku}</div>
      <div class="price">${formatMoneyHTML(p.price_cents)}</div>
    </div>`).join("")}</div><script>window.onload=()=>{window.print();window.close();}<\/script></body></html>`);
  win.document.close();
}

function PrintLabelsModal({
  selected,
  onClose,
}: {
  selected: Product[];
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-full max-w-md flex-col rounded-md bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-950">Print Labels</h2>
          <button type="button" onClick={onClose} aria-label="Close print labels" className="flex h-9 w-9 items-center justify-center rounded-md text-xl leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-600">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {selected.length === 0 ? (
            <p className="text-sm text-slate-500">Select products first using the checkboxes.</p>
          ) : (
            <>
              <p className="mb-3 text-sm text-slate-600">{selected.length} product{selected.length !== 1 ? "s" : ""} selected for printing:</p>
              <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
                {selected.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-950">{p.name}</p>
                      <p className="font-mono text-xs text-slate-500">{p.sku}</p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-slate-950">{formatMoneyHTML(p.price_cents)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button type="button" onClick={onClose} className="min-h-[40px] rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
          <button
            type="button"
            disabled={selected.length === 0}
            onClick={() => { printLabels(selected); onClose(); }}
            className="min-h-[40px] rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            Print
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Products Tab ──────────────────────────────────────────────────────────────

function ProductsTab({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const [products, setProducts]     = useState<Product[]>([]);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);

  const [filterStatus, setFilterStatus]     = useState<string>("");
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [search, setSearch]                 = useState<string>("");
  const [debouncedQ, setDebouncedQ]         = useState<string>("");

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showPrintLabels, setShowPrintLabels] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<Product | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Product | null>(null);
  const [archiving, setArchiving]   = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const activeCount = products.filter((p) => p.status === "active").length;
  const draftCount = products.filter((p) => p.status === "draft").length;
  const archivedCount = products.filter((p) => p.status === "archived").length;
  const restrictedCount = products.filter((p) => p.age_restricted === 1).length;
  const hasFilters = Boolean(filterStatus || filterCategory || debouncedQ);
  const filterSummary = [
    filterStatus ? `Status: ${filterStatus}` : null,
    filterCategory ? `Category: ${filterCategory}` : null,
    debouncedQ ? `Search: ${debouncedQ}` : null,
  ].filter(Boolean);
  const clearFilters = () => {
    setFilterStatus("");
    setFilterCategory("");
    setSearch("");
    setDebouncedQ("");
  };

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const selectedProducts = products.filter((p: Product) => selectedIds.has(p.id));
  const allSelected = products.length > 0 && products.every((p: Product) => selectedIds.has(p.id));

  const toggleSelect = (id: string) => {
    setSelectedIds((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set<string>());
    } else {
      setSelectedIds(new Set<string>(products.map((p: Product) => p.id)));
    }
  };

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ limit: "50", offset: "0" });
      if (filterStatus)   params.set("status",   filterStatus);
      if (filterCategory) params.set("category", filterCategory);
      if (debouncedQ)     params.set("q",        debouncedQ);
      const data = await apiGet<ProductsResponse>(`/api/v1/catalog?${params}`);
      setProducts(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      setError(err instanceof ApiResponseError ? err.message : "Failed to load products.");
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterCategory, debouncedQ]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (body: Record<string, unknown>) => {
    await apiPost("/api/v1/catalog", body);
    await load();
  };

  const handleEdit = async (body: Record<string, unknown>) => {
    if (!editTarget) return;
    await apiPatch(`/api/v1/catalog/${editTarget.id}`, body);
    await load();
  };

  const handleArchive = async () => {
    if (!archiveTarget) return;
    setArchiving(true); setActionError(null);
    try {
      await apiDelete(`/api/v1/catalog/${archiveTarget.id}`);
      setArchiveTarget(null);
      await load();
    } catch (err) {
      setActionError(err instanceof ApiResponseError ? err.message : "Archive failed.");
    } finally {
      setArchiving(false);
    }
  };

  return (
    <>
      <Card className="overflow-hidden p-0">
        <div className="grid gap-2 border-b border-slate-200 bg-slate-100 p-3 sm:grid-cols-4">
          <CatalogMetric label="Visible products" value={products.length} helper={`${total} total`} tone={hasFilters ? "neutral" : "muted"} active={hasFilters} />
          <CatalogMetric label="Active" value={activeCount} helper={`${draftCount} draft`} tone="success" active={filterStatus === "active"} />
          <CatalogMetric label="Archived" value={archivedCount} helper="Hidden from sale" tone="muted" active={filterStatus === "archived"} />
          <CatalogMetric label="Age restricted" value={restrictedCount} helper="ID check needed" tone="restricted" active={restrictedCount > 0} />
        </div>

        {/* Toolbar */}
        <div className="grid gap-3 border-b border-slate-200 px-4 py-3 lg:grid-cols-[minmax(220px,1fr)_auto_auto_auto_auto]">
          <div className="min-w-0">
            <label htmlFor="catalog-search" className="sr-only">Search products</label>
            <input
              id="catalog-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, SKU, barcode…"
              className="min-h-[40px] w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
          </div>
          <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-slate-500 sm:min-w-[150px]">
            Status
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="min-h-[40px] rounded-md border border-slate-200 px-2 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-600"
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-slate-500 sm:min-w-[180px]">
            Category
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="min-h-[40px] rounded-md border border-slate-200 px-2 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-600"
            >
              <option value="">All categories</option>
              {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setShowPrintLabels(true)}
            className="min-h-[40px] rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Print Labels{selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
          </button>
          <button
            type="button"
            onClick={() => { setShowCreate(true); setActionError(null); }}
            className="min-h-[40px] rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            + New product
          </button>
        </div>

        {actionError && (
          <div className="border-b border-red-100 bg-red-50 px-4 py-2">
            <p className="text-sm text-red-700">{actionError}</p>
          </div>
        )}

        {hasFilters && (
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-brand-50 px-4 py-2">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-700">Filtered</span>
            {filterSummary.map((label) => (
              <span key={label} className="rounded-full border border-brand-200 bg-white px-2.5 py-1 text-xs font-medium text-brand-700">
                {label}
              </span>
            ))}
            <button type="button" onClick={clearFilters} className="ml-auto text-xs font-medium text-brand-700 hover:underline">
              Clear
            </button>
          </div>
        )}

        {loading ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm text-slate-500" aria-busy="true">Loading…</p>
          </div>
        ) : error ? (
          <div className="px-4 py-6">
            <p role="alert" className="text-sm text-red-700">{error}</p>
          </div>
        ) : products.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm text-slate-500">No products found.</p>
            {hasFilters && (
              <button type="button" onClick={clearFilters} className="mt-2 text-xs text-brand-600 hover:underline">
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                    <th className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleSelectAll}
                        aria-label="Select all products"
                        className="h-4 w-4 rounded border-slate-300"
                      />
                    </th>
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3 text-right">Price</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {products.map((p) => {
                    const style = productStatusStyle(p.status);
                    const isSelected = selectedIds.has(p.id);
                    return (
                    <tr key={p.id} className={clsx("border-l-4 transition-colors", style.row, isSelected && "ring-1 ring-inset ring-brand-200")}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(p.id)}
                          aria-label={`Select ${p.name}`}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-start gap-2">
                          <span className={clsx("mt-1.5 h-2 w-2 shrink-0 rounded-full", style.dot)} aria-hidden="true" />
                          <div className="min-w-0">
                          <p className={clsx("font-medium", p.status === "archived" ? "text-slate-600" : "text-slate-950")}>{p.name}</p>
                          {p.brand && <p className="text-xs text-slate-400">{p.brand}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{p.sku}</td>
                      <td className="px-4 py-3 text-slate-600">{p.category}</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-900">
                        {centsToDisplay(p.price_cents)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <Badge variant={statusBadge(p.status)}>
                            {p.status.charAt(0).toUpperCase() + p.status.slice(1)}
                          </Badge>
                          {p.age_restricted === 1 && (
                            <span className="rounded-md bg-orange-50 px-1.5 py-0.5 text-xs font-medium text-orange-700 ring-1 ring-orange-200">18+</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => router.push(`/catalog/${p.id}`)}
                            className="min-h-[32px] rounded-md border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                          >
                            View
                          </button>
                          <button
                            type="button"
                            onClick={() => { setEditTarget(p); setActionError(null); }}
                            className="min-h-[32px] rounded-md border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                          >
                            Edit
                          </button>
                          {p.status !== "archived" && (
                            <button
                              type="button"
                              onClick={() => { setArchiveTarget(p); setActionError(null); }}
                              className="min-h-[32px] rounded-md border border-slate-200 px-3 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
                            >
                              Archive
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                  })}
                </tbody>
              </table>
            </div>
            <div className="divide-y divide-slate-100 md:hidden">
              {products.map((p) => (
                <ProductListCard
                  key={p.id}
                  product={p}
                  onEdit={() => { setEditTarget(p); setActionError(null); }}
                  onArchive={() => { setArchiveTarget(p); setActionError(null); }}
                />
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
              <span>Showing {products.length} of {total} products</span>
              {hasFilters && (
                <button type="button" onClick={clearFilters} className="font-medium text-brand-600 hover:underline">
                  Clear filters
                </button>
              )}
            </div>
          </>
        )}
      </Card>

      {/* Modals */}
      {showPrintLabels && (
        <PrintLabelsModal
          selected={selectedProducts}
          onClose={() => setShowPrintLabels(false)}
        />
      )}
      {showCreate && (
        <ProductFormModal
          categories={categories}
          onSave={handleCreate}
          onClose={() => setShowCreate(false)}
        />
      )}
      {editTarget && (
        <ProductFormModal
          initial={editTarget}
          categories={categories}
          onSave={handleEdit}
          onClose={() => setEditTarget(null)}
        />
      )}
      {archiveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setArchiveTarget(null)}>
          <div className="w-full max-w-sm rounded-md bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-slate-950">Archive &ldquo;{archiveTarget.name}&rdquo;?</h2>
            <p className="mt-2 text-sm text-slate-600">
              The product will be set to archived and hidden from active views. You can restore it by editing the status.
            </p>
            {actionError && <p className="mt-3 text-sm text-red-700">{actionError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setArchiveTarget(null)} className="min-h-[40px] rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
              <button type="button" onClick={handleArchive} disabled={archiving} className="min-h-[40px] rounded-md bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">
                {archiving ? "Archiving..." : "Archive"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function CatalogMetric({
  label,
  value,
  helper,
  tone = "neutral",
  active = false,
}: {
  label: string;
  value: number;
  helper: string;
  tone?: "neutral" | "success" | "warning" | "muted" | "restricted";
  active?: boolean;
}) {
  return (
    <div className={clsx("rounded-md border px-4 py-3 transition-colors", metricToneClass(tone), active && "ring-2 ring-brand-200")}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-xl font-semibold tabular-nums text-slate-950">{value}</span>
        <span className="text-xs text-slate-500">{helper}</span>
      </div>
    </div>
  );
}

function ProductListCard({
  product,
  onEdit,
  onArchive,
}: {
  product: Product;
  onEdit: () => void;
  onArchive: () => void;
}) {
  const style = productStatusStyle(product.status);
  return (
    <article className={clsx("space-y-3 border-l-4 px-4 py-4", style.card)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <span className={clsx("mt-1.5 h-2 w-2 shrink-0 rounded-full", style.dot)} aria-hidden="true" />
          <div className="min-w-0">
          <h3 className={clsx("truncate text-sm font-semibold", product.status === "archived" ? "text-slate-600" : "text-slate-950")}>{product.name}</h3>
          <p className="mt-1 font-mono text-xs text-slate-500">{product.sku}</p>
          </div>
        </div>
        <p className="shrink-0 text-sm font-semibold tabular-nums text-slate-950">
          {centsToDisplay(product.price_cents)}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={statusBadge(product.status)}>{product.status.charAt(0).toUpperCase() + product.status.slice(1)}</Badge>
        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{product.category}</span>
        {product.brand && <span className="text-xs text-slate-500">{product.brand}</span>}
        {product.age_restricted === 1 && (
          <span className="rounded-md bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700 ring-1 ring-orange-200">18+</span>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onEdit} className="min-h-[36px] rounded-md border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-100">
          Edit
        </button>
        {product.status !== "archived" && (
          <button type="button" onClick={onArchive} className="min-h-[36px] rounded-md border border-slate-200 px-3 text-xs font-medium text-slate-500 hover:bg-slate-100">
            Archive
          </button>
        )}
      </div>
    </article>
  );
}

// ── Categories Tab ────────────────────────────────────────────────────────────

function CategoriesTab() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);

  const [newName, setNewName]       = useState("");
  const [creating, setCreating]     = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [editTarget, setEditTarget]     = useState<Category | null>(null);
  const [editName, setEditName]         = useState("");
  const [editSaving, setEditSaving]     = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [deleting, setDeleting]         = useState(false);
  const [actionError, setActionError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await apiGet<CategoriesResponse>("/api/v1/catalog/categories");
      setCategories(data.items ?? []);
    } catch (err) {
      setError(err instanceof ApiResponseError ? err.message : "Failed to load categories.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true); setCreateError(null);
    try {
      await apiPost("/api/v1/catalog/categories", { name: newName.trim() });
      setNewName(""); await load();
    } catch (err) {
      setCreateError(err instanceof ApiResponseError ? err.message : "Create failed.");
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (c: Category) => { setEditTarget(c); setEditName(c.name); setActionError(null); };

  const handleEditSave = async () => {
    if (!editTarget || !editName.trim()) return;
    setEditSaving(true); setActionError(null);
    try {
      await apiPatch(`/api/v1/catalog/categories/${editTarget.id}`, { name: editName.trim() });
      setEditTarget(null); await load();
    } catch (err) {
      setActionError(err instanceof ApiResponseError ? err.message : "Save failed.");
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true); setActionError(null);
    try {
      await apiDelete(`/api/v1/catalog/categories/${deleteTarget.id}`);
      setDeleteTarget(null); await load();
    } catch (err) {
      setActionError(err instanceof ApiResponseError ? err.message : "Delete failed.");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <p className="py-6 text-sm text-slate-500" aria-busy="true">Loading…</p>;
  if (error)   return <p role="alert" className="py-6 text-sm text-red-700">{error}</p>;

  return (
    <>
      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-base font-semibold text-slate-950">Product categories</h2>
          <p className="text-sm text-slate-500">{categories.length} {categories.length === 1 ? "category" : "categories"}</p>
        </div>

        {actionError && (
          <div className="border-b border-red-100 bg-red-50 px-4 py-2">
            <p className="text-sm text-red-700">{actionError}</p>
          </div>
        )}

        {categories.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-slate-500">No categories yet.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {categories.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-slate-50">
                {editTarget?.id === c.id ? (
                  <div className="flex flex-1 items-center gap-2">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="min-h-[40px] flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                      autoFocus
                    />
                    <button type="button" onClick={handleEditSave} disabled={editSaving} className="min-h-[40px] rounded-md bg-brand-600 px-3 py-2 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-60">
                      {editSaving ? "..." : "Save"}
                    </button>
                    <button type="button" onClick={() => setEditTarget(null)} className="min-h-[40px] rounded-md border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="text-sm font-medium text-slate-950">{c.name}</span>
                    <div className="flex shrink-0 gap-2">
                      <button type="button" onClick={() => startEdit(c)} className="min-h-[32px] rounded-md border border-slate-200 px-3 py-1 text-xs text-slate-700 hover:bg-slate-100">Edit</button>
                      <button type="button" onClick={() => { setDeleteTarget(c); setActionError(null); }} className="min-h-[32px] rounded-md border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50">Delete</button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* Add category inline form */}
        <form onSubmit={handleCreate} className="flex items-center gap-2 border-t border-slate-200 px-4 py-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New category name..."
            className="min-h-[40px] flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
          />
          <button type="submit" disabled={creating || !newName.trim()} className="min-h-[40px] rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">
            {creating ? "Adding..." : "Add"}
          </button>
        </form>
        {createError && <p className="px-4 pb-2 text-xs text-red-700">{createError}</p>}
      </Card>

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDeleteTarget(null)}>
          <div className="w-full max-w-sm rounded-md bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-slate-950">Delete &ldquo;{deleteTarget.name}&rdquo;?</h2>
            <p className="mt-2 text-sm text-slate-600">
              Deleting a category won&apos;t remove products, but they will no longer be grouped under this category.
            </p>
            {actionError && <p className="mt-3 text-sm text-red-700">{actionError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteTarget(null)} className="min-h-[40px] rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
              <button type="button" onClick={handleDelete} disabled={deleting} className="min-h-[40px] rounded-md bg-danger-600 px-4 py-2 text-sm font-medium text-white hover:bg-danger-700 disabled:opacity-60">
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Tab = "products" | "categories";

export default function CatalogPage() {
  const [tab, setTab] = useState<Tab>("products");
  const [categories, setCategories] = useState<Category[]>([]);

  // Pre-load categories so ProductsTab can use them for the filter dropdown
  useEffect(() => {
    apiGet<CategoriesResponse>("/api/v1/catalog/categories")
      .then((d) => setCategories(d.items ?? []))
      .catch(() => {/* non-fatal */});
  }, []);

  const tabCls = (t: Tab) =>
    `px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
      tab === t
        ? "border-blue-600 text-blue-600"
        : "border-transparent text-slate-500 hover:text-slate-700"
    }`;

  return (
    <EnterpriseShell
      active="catalog"
      title="Catalog"
      subtitle="Products and category management"
      contentClassName="overflow-y-auto"
    >
      <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-5 sm:px-6">
        {/* Tabs */}
        <div className="flex gap-1 border-b border-slate-200">
          <button type="button" onClick={() => setTab("products")} className={tabCls("products")}>
            Products
          </button>
          <button type="button" onClick={() => setTab("categories")} className={tabCls("categories")}>
            Categories
          </button>
        </div>

        {tab === "products"   && <ProductsTab   categories={categories} />}
        {tab === "categories" && <CategoriesTab />}
      </div>
    </EnterpriseShell>
  );
}
