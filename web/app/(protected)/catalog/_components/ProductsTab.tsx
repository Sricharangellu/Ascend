"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { TableSkeleton } from "@/components/TableSkeleton";
import { apiGet, apiPost, apiPatch, apiDelete, ApiResponseError } from "@/api-client/client";
import { formatMoney } from "@/lib/money";
import type { Product, Category, ProductStatus, ProductsResponse } from "@/api-client/types";
import { ProductFormModal } from "./ProductFormModal";
import { PrintLabelsModal } from "./PrintLabelsModal";
import { ImportCSVModal } from "./ImportCSVModal";
import { SortTh } from "./SortTh";
import { BulkActionBar } from "./BulkActionBar";

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusBadge(s: ProductStatus): "green" | "yellow" | "gray" {
  if (s === "active") return "green";
  if (s === "draft")  return "yellow";
  return "gray";
}

function productStatusStyle(status: ProductStatus) {
  if (status === "active") {
    return { row: "border-l-success-500 bg-success-50/30 hover:bg-success-50/70", card: "border-l-success-500 bg-success-50/30", dot: "bg-success-500" };
  }
  if (status === "draft") {
    return { row: "border-l-warning-500 bg-warning-50/30 hover:bg-warning-50/70", card: "border-l-warning-500 bg-warning-50/30", dot: "bg-warning-500" };
  }
  return { row: "border-l-slate-300 bg-slate-50/70 text-slate-500 hover:bg-slate-100", card: "border-l-slate-300 bg-slate-50/80", dot: "bg-slate-400" };
}

type MetricTone = "neutral" | "success" | "warning" | "muted" | "restricted";

function metricToneClass(tone: MetricTone) {
  const tones: Record<MetricTone, string> = {
    neutral: "border-slate-200 bg-white",
    success: "border-success-200 bg-success-50",
    warning: "border-warning-200 bg-warning-50",
    muted: "border-slate-200 bg-slate-50",
    restricted: "border-orange-200 bg-orange-50",
  };
  return tones[tone];
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CatalogMetric({ label, value, helper, tone = "neutral", active = false }: {
  label: string; value: number; helper: string;
  tone?: MetricTone; active?: boolean;
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

function ProductListCard({ product, onEdit, onArchive }: {
  product: Product; onEdit: () => void; onArchive: () => void;
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
        <p className="shrink-0 text-sm font-semibold tabular-nums text-slate-950">{formatMoney(product.price_cents)}</p>
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
        <button type="button" onClick={onEdit} className="min-h-[36px] rounded-md border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-100">Edit</button>
        {product.status !== "archived" && (
          <button type="button" onClick={onArchive} className="min-h-[36px] rounded-md border border-slate-200 px-3 text-xs font-medium text-slate-500 hover:bg-slate-100">Archive</button>
        )}
      </div>
    </article>
  );
}

// ── ProductsTab ───────────────────────────────────────────────────────────────

export function ProductsTab({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const [products, setProducts]     = useState<Product[]>([]);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);

  const [filterStatus, setFilterStatus]     = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [search, setSearch]                 = useState("");
  const [debouncedQ, setDebouncedQ]         = useState("");

  const [filterTaxClass, setFilterTaxClass]           = useState("");
  const [filterBrand, setFilterBrand]                 = useState("");
  const [filterAgeRestricted, setFilterAgeRestricted] = useState(false);
  const [priceMin, setPriceMin]                       = useState("");
  const [priceMax, setPriceMax]                       = useState("");
  const [showMoreFilters, setShowMoreFilters]          = useState(false);

  const [sortCol, setSortCol] = useState("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const [selectedIds, setSelectedIds]     = useState<Set<string>>(new Set());
  const [showPrintLabels, setShowPrintLabels] = useState(false);

  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkError, setBulkError]     = useState<string | null>(null);

  const [showImport, setShowImport]           = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [duplicating, setDuplicating]         = useState<string | null>(null);

  const [showCreate, setShowCreate]       = useState(false);
  const [editTarget, setEditTarget]       = useState<Product | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Product | null>(null);
  const [archiving, setArchiving]         = useState(false);
  const [actionError, setActionError]     = useState<string | null>(null);

  const activeCount     = products.filter(p => p.status === "active").length;
  const draftCount      = products.filter(p => p.status === "draft").length;
  const archivedCount   = products.filter(p => p.status === "archived").length;
  const restrictedCount = products.filter(p => p.age_restricted === 1).length;

  const hasFilters = Boolean(filterStatus || filterCategory || debouncedQ || filterTaxClass || filterBrand || filterAgeRestricted || priceMin || priceMax);

  const filterSummary = [
    filterStatus         ? `Status: ${filterStatus}`          : null,
    filterCategory       ? `Category: ${filterCategory}`      : null,
    debouncedQ           ? `Search: "${debouncedQ}"`          : null,
    filterTaxClass       ? `Tax: ${filterTaxClass}`           : null,
    filterBrand          ? `Brand: "${filterBrand}"`          : null,
    filterAgeRestricted  ? "Age restricted only"              : null,
    priceMin && priceMax ? `Price: $${priceMin}–$${priceMax}` : priceMin ? `Price ≥ $${priceMin}` : priceMax ? `Price ≤ $${priceMax}` : null,
  ].filter(Boolean);

  const clearFilters = () => {
    setFilterStatus(""); setFilterCategory(""); setSearch(""); setDebouncedQ("");
    setFilterTaxClass(""); setFilterBrand(""); setFilterAgeRestricted(false);
    setPriceMin(""); setPriceMax("");
  };

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const visibleProducts = useMemo<Product[]>(() => {
    let result = products;
    if (filterTaxClass)      result = result.filter(p => p.tax_class === filterTaxClass);
    if (filterBrand)         result = result.filter(p => (p.brand ?? "").toLowerCase().includes(filterBrand.toLowerCase()));
    if (filterAgeRestricted) result = result.filter(p => p.age_restricted === 1);
    if (priceMin)            result = result.filter(p => p.price_cents >= parseFloat(priceMin) * 100);
    if (priceMax)            result = result.filter(p => p.price_cents <= parseFloat(priceMax) * 100);
    return [...result].sort((a, b) => {
      let av: string | number, bv: string | number;
      switch (sortCol) {
        case "price_cents": av = a.price_cents; bv = b.price_cents; break;
        case "sku":         av = a.sku.toLowerCase(); bv = b.sku.toLowerCase(); break;
        case "category":    av = a.category.toLowerCase(); bv = b.category.toLowerCase(); break;
        case "status":      av = a.status; bv = b.status; break;
        default:            av = a.name.toLowerCase(); bv = b.name.toLowerCase();
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ?  1 : -1;
      return 0;
    });
  }, [products, filterTaxClass, filterBrand, filterAgeRestricted, priceMin, priceMax, sortCol, sortDir]);

  const selectedProducts = visibleProducts.filter(p => selectedIds.has(p.id));
  const allSelected      = visibleProducts.length > 0 && visibleProducts.every(p => selectedIds.has(p.id));
  const someSelected     = selectedIds.size > 0;

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? new Set<string>() : new Set<string>(visibleProducts.map(p => p.id)));
  };
  function handleSort(col: string) {
    if (col === sortCol) { setSortDir(d => d === "asc" ? "desc" : "asc"); }
    else { setSortCol(col); setSortDir("asc"); }
  }

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
    } finally { setLoading(false); }
  }, [filterStatus, filterCategory, debouncedQ]);

  useEffect(() => { void load(); }, [load]);

  const handleCreate = async (body: Record<string, unknown>) => { await apiPost("/api/v1/catalog", body); await load(); };
  const handleEdit   = async (body: Record<string, unknown>) => { if (!editTarget) return; await apiPatch(`/api/v1/catalog/${editTarget.id}`, body); await load(); };

  const handleArchive = async () => {
    if (!archiveTarget) return;
    setArchiving(true); setActionError(null);
    try { await apiDelete(`/api/v1/catalog/${archiveTarget.id}`); setArchiveTarget(null); await load(); }
    catch (err) { setActionError(err instanceof ApiResponseError ? err.message : "Archive failed."); }
    finally { setArchiving(false); }
  };

  const handleBulkUpdate = async (field: string, value: string) => {
    setBulkLoading(true); setBulkError(null);
    try {
      const parsed = field === "age_restricted" ? value === "true" : value;
      await Promise.all([...selectedIds].map(id => apiPatch(`/api/v1/catalog/${id}`, { [field]: parsed })));
      setSelectedIds(new Set()); await load();
    } catch { setBulkError("Some updates failed — check individual products."); }
    finally { setBulkLoading(false); }
  };

  const handleExportCSV = () => {
    const headers = ["SKU", "Name", "Brand", "Category", "Price ($)", "Cost ($)", "MSRP ($)", "Tax Class", "Status", "Barcode", "Age Restricted"];
    const rows = visibleProducts.map(p => [
      p.sku, p.name, p.brand ?? "", p.category,
      (p.price_cents / 100).toFixed(2),
      p.raw_cost_price_cents != null ? (p.raw_cost_price_cents / 100).toFixed(2) : "",
      p.msrp_cents != null ? (p.msrp_cents / 100).toFixed(2) : "",
      p.tax_class, p.status, p.barcode ?? "",
      p.age_restricted === 1 ? "yes" : "no",
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `catalog-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleDuplicate = async (id: string) => {
    setDuplicating(id);
    try { await apiPost(`/api/v1/catalog/${id}/duplicate`, {}); await load(); }
    catch { /* silent — row button reverts visually */ }
    finally { setDuplicating(null); }
  };

  return (
    <>
      <Card className="overflow-hidden p-0">
        {/* Metrics */}
        <div className="grid gap-2 border-b border-slate-200 bg-slate-100 p-3 sm:grid-cols-4">
          <CatalogMetric label="Visible products" value={visibleProducts.length} helper={`${total} total`} tone={hasFilters ? "neutral" : "muted"} active={hasFilters} />
          <CatalogMetric label="Active"           value={activeCount}            helper={`${draftCount} draft`} tone="success" active={filterStatus === "active"} />
          <CatalogMetric label="Archived"         value={archivedCount}          helper="Hidden from sale"       tone="muted"   active={filterStatus === "archived"} />
          <CatalogMetric label="Age restricted"   value={restrictedCount}        helper="ID check needed"        tone="restricted" active={restrictedCount > 0} />
        </div>

        {/* Toolbar */}
        <div className="grid gap-3 border-b border-slate-200 px-4 py-3 lg:grid-cols-[minmax(220px,1fr)_auto_auto_auto_auto_auto_auto]">
          <div className="min-w-0">
            <label htmlFor="catalog-search" className="sr-only">Search products</label>
            <input id="catalog-search" type="search" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, SKU, barcode…"
              className="min-h-[40px] w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600" />
          </div>
          <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-slate-500 sm:min-w-[140px]">
            Status
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="min-h-[40px] rounded-md border border-slate-200 px-2 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-600">
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-slate-500 sm:min-w-[160px]">
            Category
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
              className="min-h-[40px] rounded-md border border-slate-200 px-2 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-600">
              <option value="">All categories</option>
              {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => setShowMoreFilters(v => !v)}
            className={clsx("min-h-[40px] self-end rounded-md border px-3 py-2 text-sm font-medium transition-colors",
              showMoreFilters ? "border-brand-300 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-700 hover:bg-slate-50")}>
            {showMoreFilters ? "▲ Filters" : "▼ Filters"}
            {(filterTaxClass || filterBrand || filterAgeRestricted || priceMin || priceMax) && (
              <span className="ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-brand-600 text-[10px] text-white">
                {[filterTaxClass, filterBrand, filterAgeRestricted, priceMin || priceMax].filter(Boolean).length}
              </span>
            )}
          </button>
          <div className="relative self-end">
            <button type="button" onClick={() => setShowActionsMenu(v => !v)}
              className="min-h-[40px] rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              aria-label="More actions">⋯</button>
            {showActionsMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowActionsMenu(false)} />
                <div className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
                  <button type="button" onClick={() => { handleExportCSV(); setShowActionsMenu(false); }}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50">↓ Export CSV</button>
                  <button type="button" onClick={() => { setShowImport(true); setShowActionsMenu(false); }}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50">↑ Import CSV</button>
                </div>
              </>
            )}
          </div>
          <button type="button" onClick={() => setShowPrintLabels(true)}
            className="min-h-[40px] self-end rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Labels{selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
          </button>
          <button type="button" onClick={() => { setShowCreate(true); setActionError(null); }}
            className="min-h-[40px] self-end rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
            + New product
          </button>
        </div>

        {/* Expanded filter panel */}
        {showMoreFilters && (
          <div className="grid gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
              Tax class
              <select value={filterTaxClass} onChange={e => setFilterTaxClass(e.target.value)}
                className="min-h-[36px] rounded-md border border-slate-200 px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-600">
                <option value="">All tax classes</option>
                <option value="standard">Standard</option>
                <option value="exempt">Tax exempt</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
              Brand
              <input type="text" value={filterBrand} onChange={e => setFilterBrand(e.target.value)} placeholder="e.g. Acme"
                className="min-h-[36px] rounded-md border border-slate-200 px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-600" />
            </label>
            <div className="flex flex-col gap-1 text-xs font-medium text-slate-500">
              Price range ($)
              <div className="flex items-center gap-1.5">
                <input type="number" min="0" step="0.01" value={priceMin} onChange={e => setPriceMin(e.target.value)} placeholder="Min"
                  className="min-h-[36px] w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-600" />
                <span className="shrink-0 text-slate-400">–</span>
                <input type="number" min="0" step="0.01" value={priceMax} onChange={e => setPriceMax(e.target.value)} placeholder="Max"
                  className="min-h-[36px] w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-600" />
              </div>
            </div>
            <div className="flex flex-col justify-end gap-1 text-xs font-medium text-slate-500">
              Age restriction
              <label className="flex min-h-[36px] cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm">
                <input type="checkbox" checked={filterAgeRestricted} onChange={e => setFilterAgeRestricted(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600" />
                <span className="text-slate-700">Age restricted only</span>
              </label>
            </div>
          </div>
        )}

        {someSelected && (
          <BulkActionBar count={selectedIds.size} categories={categories} onApply={handleBulkUpdate}
            onClear={() => setSelectedIds(new Set())} loading={bulkLoading} error={bulkError} />
        )}

        {actionError && (
          <div className="border-b border-red-100 bg-red-50 px-4 py-2">
            <p role="alert" className="text-sm text-red-700">{actionError}</p>
          </div>
        )}

        {hasFilters && (
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-brand-50 px-4 py-2">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-700">Filtered</span>
            {filterSummary.map(label => (
              <span key={label} className="rounded-full border border-brand-200 bg-white px-2.5 py-1 text-xs font-medium text-brand-700">{label}</span>
            ))}
            <button type="button" onClick={clearFilters} className="ml-auto text-xs font-medium text-brand-700 hover:underline">Clear all</button>
          </div>
        )}

        {loading ? (
          <TableSkeleton headers={["", "Product", "SKU", "Category", "Price", "Status", ""]} rows={8} />
        ) : error ? (
          <div className="px-4 py-6"><p role="alert" className="text-sm text-red-700">{error}</p></div>
        ) : visibleProducts.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm font-medium text-[var(--color-text-primary)]">No products found.</p>
            {hasFilters && <button type="button" onClick={clearFilters} className="mt-2 text-xs text-brand-600 hover:underline">Clear filters</button>}
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                    <th className="px-4 py-3">
                      <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} aria-label="Select all products" className="h-4 w-4 rounded border-slate-300" />
                    </th>
                    <SortTh col="name"        label="Product"  cur={sortCol} dir={sortDir} onSort={handleSort} />
                    <SortTh col="sku"         label="SKU"      cur={sortCol} dir={sortDir} onSort={handleSort} />
                    <SortTh col="category"    label="Category" cur={sortCol} dir={sortDir} onSort={handleSort} />
                    <SortTh col="price_cents" label="Price"    cur={sortCol} dir={sortDir} onSort={handleSort} right />
                    <SortTh col="status"      label="Status"   cur={sortCol} dir={sortDir} onSort={handleSort} />
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleProducts.map(p => {
                    const style = productStatusStyle(p.status);
                    const isSelected = selectedIds.has(p.id);
                    return (
                      <tr key={p.id} className={clsx("border-l-4 transition-colors", style.row, isSelected && "ring-1 ring-inset ring-brand-200")}>
                        <td className="px-4 py-3">
                          <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(p.id)}
                            aria-label={`Select ${p.name}`} className="h-4 w-4 rounded border-slate-300" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            {p.image_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={p.image_url} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover" aria-hidden="true" />
                            ) : (
                              <span className={clsx("flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white",
                                p.status === "active" ? "bg-brand-600" : p.status === "draft" ? "bg-warning-500" : "bg-slate-400")}
                                aria-hidden="true">
                                {p.name.charAt(0).toUpperCase()}
                              </span>
                            )}
                            <div className="min-w-0">
                              <p className={clsx("font-medium leading-snug", p.status === "archived" ? "text-slate-600" : "text-slate-950")}>{p.name}</p>
                              <p className="text-xs text-slate-400">
                                {p.brand ?? ""}
                                {p.raw_cost_price_cents != null && (
                                  <span className={p.brand ? "ml-1.5" : ""}>cost {formatMoney(p.raw_cost_price_cents)}</span>
                                )}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">{p.sku}</td>
                        <td className="px-4 py-3 text-slate-600">{p.category}</td>
                        <td className="px-4 py-3 text-right font-medium text-slate-900">{formatMoney(p.price_cents)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <Badge variant={statusBadge(p.status)}>{p.status.charAt(0).toUpperCase() + p.status.slice(1)}</Badge>
                            {p.age_restricted === 1 && (
                              <span className="rounded-md bg-orange-50 px-1.5 py-0.5 text-xs font-medium text-orange-700 ring-1 ring-orange-200">18+</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            <button type="button" onClick={() => router.push(`/catalog/${p.id}`)}
                              className="min-h-[32px] rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100">View</button>
                            <button type="button" onClick={() => { setEditTarget(p); setActionError(null); }}
                              className="min-h-[32px] rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100">Edit</button>
                            <button type="button" onClick={() => void handleDuplicate(p.id)} disabled={duplicating === p.id}
                              title="Duplicate product (creates a Draft copy)"
                              className="min-h-[32px] rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-40">
                              {duplicating === p.id ? "…" : "Copy"}
                            </button>
                            {p.status !== "archived" && (
                              <button type="button" onClick={() => { setArchiveTarget(p); setActionError(null); }}
                                className="min-h-[32px] rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100">Archive</button>
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
              {visibleProducts.map(p => (
                <ProductListCard key={p.id} product={p}
                  onEdit={() => { setEditTarget(p); setActionError(null); }}
                  onArchive={() => { setArchiveTarget(p); setActionError(null); }} />
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
              <span>
                Showing {visibleProducts.length} of {total} products
                {someSelected && <span className="ml-2 font-medium text-brand-600">· {selectedIds.size} selected</span>}
              </span>
              {hasFilters && (
                <button type="button" onClick={clearFilters} className="font-medium text-brand-600 hover:underline">Clear filters</button>
              )}
            </div>
          </>
        )}
      </Card>

      {showImport    && <ImportCSVModal onDone={async () => { await load(); }} onClose={() => setShowImport(false)} />}
      {showPrintLabels && <PrintLabelsModal selected={selectedProducts} onClose={() => setShowPrintLabels(false)} />}
      {showCreate    && <ProductFormModal categories={categories} onSave={handleCreate} onClose={() => setShowCreate(false)} />}
      {editTarget    && <ProductFormModal initial={editTarget} categories={categories} onSave={handleEdit} onClose={() => setEditTarget(null)} />}

      {archiveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setArchiveTarget(null)}>
          <div className="w-full max-w-sm rounded-md bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-slate-950">Archive &ldquo;{archiveTarget.name}&rdquo;?</h2>
            <p className="mt-2 text-sm text-slate-600">The product will be set to archived and hidden from active views. You can restore it by editing the status.</p>
            {actionError && <p className="mt-3 text-sm text-red-700">{actionError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setArchiveTarget(null)} className="min-h-[40px] rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
              <button type="button" onClick={handleArchive} disabled={archiving}
                className="min-h-[40px] rounded-md bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">
                {archiving ? "Archiving..." : "Archive"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
