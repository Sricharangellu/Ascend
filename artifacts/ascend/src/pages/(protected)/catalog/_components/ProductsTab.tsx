
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "@/lib/router";
import { clsx } from "clsx";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { TableSkeleton } from "@/components/TableSkeleton";
import { Pagination, usePersistedPageSize } from "@/components/Pagination";
import { apiGet, apiPost, apiPatch, apiDelete, ApiResponseError } from "@/api-client/client";
import { formatMoney } from "@/lib/money";
import type { CatalogProduct, Category, ProductStatus, ProductsResponse } from "@/api-client/types";
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
    neutral:    "border-[var(--color-border)] bg-[var(--color-surface)]",
    success:    "border-success-200 bg-success-50",
    warning:    "border-warning-200 bg-warning-50",
    muted:      "border-[var(--color-border)] bg-[var(--color-surface-subtle)]",
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
    <div className={clsx("h-full min-w-0 rounded-lg border px-4 py-3 transition-colors", metricToneClass(tone), active && "ring-2 ring-brand-300")}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--color-text-secondary)" }}>{label}</p>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-[18px] font-bold tabular-nums" style={{ color: "var(--color-text-primary)" }}>{value}</span>
        <span className="truncate text-[11px]" style={{ color: "var(--color-text-muted)" }}>{helper}</span>
      </div>
    </div>
  );
}

function ProductListCard({ product, productType, onEdit, onArchive }: {
  product: CatalogProduct; productType: string; onEdit: () => void; onArchive: () => void;
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
        <p className="shrink-0 text-[13px] font-bold tabular-nums" style={{ color: "var(--color-text-primary)" }}>{formatMoney(product.price_cents)}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={statusBadge(product.status)}>{product.status.charAt(0).toUpperCase() + product.status.slice(1)}</Badge>
        <span className="rounded-md border px-2 py-0.5 text-[11px] font-medium"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-secondary)" }}>{productType}</span>
        <span className="rounded-md px-2 py-0.5 text-[11px] font-medium"
          style={{ backgroundColor: "var(--color-surface-subtle)", color: "var(--color-text-secondary)" }}>{product.category}</span>
        {product.brand && <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>{product.brand}</span>}
        {product.age_restricted === 1 && (
          <span className="rounded-md bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-700 border border-orange-200">18+</span>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onEdit}
          className="h-8 rounded-lg border px-3 text-[11px] font-medium transition-colors hover:bg-[var(--color-surface-subtle)]"
          style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}>Edit</button>
        {product.status !== "archived" && (
          <button type="button" onClick={onArchive}
            className="h-8 rounded-lg border px-3 text-[11px] font-medium transition-colors hover:bg-[var(--color-surface-subtle)]"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}>Archive</button>
        )}
      </div>
    </article>
  );
}

// ── ProductsTab ───────────────────────────────────────────────────────────────

export function ProductsTab({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [products, setProducts]     = useState<CatalogProduct[]>([]);
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
  const [filterProductType, setFilterProductType]     = useState<"all" | "standalone" | "master" | "variant">("all");
  const [priceMin, setPriceMin]                       = useState("");
  const [priceMax, setPriceMax]                       = useState("");
  const [showMoreFilters, setShowMoreFilters]          = useState(false);

  const [sortCol, setSortCol] = useState("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = usePersistedPageSize("catalog-products-page-size", 50);

  const [selectedIds, setSelectedIds]     = useState<Set<string>>(new Set());
  const [showPrintLabels, setShowPrintLabels] = useState(false);

  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkError, setBulkError]     = useState<string | null>(null);

  const [showImport, setShowImport]           = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [duplicating, setDuplicating]         = useState<string | null>(null);

  // ?new=1 (e.g. the dashboard "Add Product" quick action) opens the create modal on load.
  const [showCreate, setShowCreate]       = useState(
    () => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("new") === "1",
  );
  const [archiveTarget, setArchiveTarget] = useState<CatalogProduct | null>(null);
  const [archiving, setArchiving]         = useState(false);
  const [actionError, setActionError]     = useState<string | null>(null);

  const activeCount     = products.filter(p => p.status === "active").length;
  const draftCount      = products.filter(p => p.status === "draft").length;
  const archivedCount   = products.filter(p => p.status === "archived").length;
  const restrictedCount = products.filter(p => p.age_restricted === 1).length;

  const masterIds = useMemo(() => new Set(products.map((p) => p.parent_product_id).filter(Boolean) as string[]), [products]);
  const getProductType = useCallback((product: CatalogProduct): "Standalone" | "Master" | "Variant" => {
    if (product.parent_product_id) return "Variant";
    if (masterIds.has(product.id)) return "Master";
    return "Standalone";
  }, [masterIds]);

  const standaloneCount = products.filter((p) => !p.parent_product_id && !masterIds.has(p.id)).length;
  const masterCount = products.filter((p) => !p.parent_product_id && masterIds.has(p.id)).length;
  const variantCount = products.filter((p) => Boolean(p.parent_product_id)).length;

  const hasFilters = Boolean(filterStatus || filterCategory || debouncedQ || filterTaxClass || filterBrand || filterAgeRestricted || filterProductType !== "all" || priceMin || priceMax);

  const filterSummary = [
    filterStatus         ? `Status: ${filterStatus}`          : null,
    filterCategory       ? `Category: ${filterCategory}`      : null,
    debouncedQ           ? `Search: "${debouncedQ}"`          : null,
    filterTaxClass       ? `Tax: ${filterTaxClass}`           : null,
    filterBrand          ? `Brand: "${filterBrand}"`          : null,
    filterAgeRestricted  ? "Age restricted only"              : null,
    filterProductType !== "all" ? `Type: ${filterProductType}` : null,
    priceMin && priceMax ? `Price: $${priceMin}–$${priceMax}` : priceMin ? `Price ≥ $${priceMin}` : priceMax ? `Price ≤ $${priceMax}` : null,
  ].filter(Boolean);

  const clearFilters = () => {
    setFilterStatus(""); setFilterCategory(""); setSearch(""); setDebouncedQ("");
    setFilterTaxClass(""); setFilterBrand(""); setFilterAgeRestricted(false);
    setFilterProductType("all");
    setPriceMin(""); setPriceMax("");
  };

  const openCreate = () => {
    setActionError(null);
    setShowCreate(true);
    if (searchParams.get("new") !== "product") {
      router.push("/catalog?new=product");
    }
  };

  const closeCreate = () => {
    setShowCreate(false);
    if (searchParams.get("new") === "product") {
      router.replace("/catalog", { scroll: false });
    }
  };

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const visibleProducts = useMemo<CatalogProduct[]>(() => {
    let result = products;
    if (filterTaxClass)      result = result.filter(p => p.tax_class === filterTaxClass);
    if (filterBrand)         result = result.filter(p => (p.brand ?? "").toLowerCase().includes(filterBrand.toLowerCase()));
    if (filterAgeRestricted) result = result.filter(p => p.age_restricted === 1);
    if (filterProductType !== "all") {
      result = result.filter((p) => getProductType(p).toLowerCase() === filterProductType);
    }
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
  }, [products, filterTaxClass, filterBrand, filterAgeRestricted, filterProductType, getProductType, priceMin, priceMax, sortCol, sortDir]);

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
      const params = new URLSearchParams({ limit: String(pageSize), offset: String(page * pageSize) });
      if (filterStatus)   params.set("status",   filterStatus);
      if (filterCategory) params.set("category", filterCategory);
      if (debouncedQ)     params.set("q",        debouncedQ);
      const data = await apiGet<ProductsResponse>(`/api/v1/catalog?${params}`);
      setProducts(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      setError(err instanceof ApiResponseError ? err.message : "Failed to load products.");
    } finally { setLoading(false); }
  }, [filterStatus, filterCategory, debouncedQ, page, pageSize]);

  useEffect(() => { void load(); }, [load]);

  // A filter/page-size change can leave `page` pointing past the end of the
  // new result set — reset to the first page rather than fetching an empty one.
  useEffect(() => { setPage(0); }, [filterStatus, filterCategory, debouncedQ, pageSize]);

  useEffect(() => {
    if (searchParams.get("new") === "product") {
      setShowCreate(true);
    }
  }, [searchParams]);

  const handleCreate = async (body: Record<string, unknown>) => {
    const created = await apiPost<CatalogProduct>("/api/v1/catalog", body);
    router.push(`/catalog/${created.id}`);
  };

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
        {/* ── Spec: header row — Import + Add product ─────────────────────────── */}
        <div className="flex flex-col gap-3 border-b px-5 py-3 sm:flex-row sm:items-center sm:justify-between"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-subtle)" }}>
          <div className="min-w-0">
            <span className="block truncate text-[14px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Products</span>
            <span className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>Manage retail catalog items, master products, and variants.</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setShowImport(true)}
              className="flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[12px] font-medium transition-colors hover:bg-[var(--color-surface-subtle)]"
              style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}>
              ↑ Import
            </button>
            <button type="button" onClick={openCreate}
              className="h-8 rounded-lg bg-brand-600 px-3 text-[13px] font-medium text-white transition-colors hover:bg-brand-700">
              + Add product
            </button>
          </div>
        </div>

        <div className="grid gap-3 border-b px-5 py-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-subtle)" }}>
          <button type="button" aria-pressed={!filterStatus && filterProductType === "all" && !filterAgeRestricted} className="rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2" onClick={() => { setFilterStatus(""); setFilterProductType("all"); setFilterAgeRestricted(false); }}>
            <CatalogMetric label="Total" value={total} helper={`${products.length} loaded`} active={!filterStatus && filterProductType === "all" && !filterAgeRestricted} />
          </button>
          <button type="button" aria-pressed={filterStatus === "active"} className="rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2" onClick={() => setFilterStatus("active")}>
            <CatalogMetric label="Active" value={activeCount} helper="sellable" tone="success" active={filterStatus === "active"} />
          </button>
          <button type="button" aria-pressed={filterStatus === "draft"} className="rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2" onClick={() => setFilterStatus("draft")}>
            <CatalogMetric label="Draft" value={draftCount} helper="needs review" tone="warning" active={filterStatus === "draft"} />
          </button>
          <button type="button" aria-pressed={filterStatus === "archived"} className="rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2" onClick={() => setFilterStatus("archived")}>
            <CatalogMetric label="Archived" value={archivedCount} helper="hidden" tone="muted" active={filterStatus === "archived"} />
          </button>
          <button type="button" aria-pressed={filterProductType === "master"} className="rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2" onClick={() => setFilterProductType("master")}>
            <CatalogMetric label="Masters" value={masterCount} helper="variant groups" active={filterProductType === "master"} />
          </button>
          <button type="button" aria-pressed={filterProductType === "variant"} className="rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2" onClick={() => setFilterProductType("variant")}>
            <CatalogMetric label="Variants" value={variantCount} helper="sellable SKUs" active={filterProductType === "variant"} />
          </button>
          <button type="button" aria-pressed={filterAgeRestricted} className="rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2" onClick={() => setFilterAgeRestricted((v) => !v)}>
            <CatalogMetric label="Restricted" value={restrictedCount} helper="ID required" tone="restricted" active={filterAgeRestricted} />
          </button>
        </div>

        {/* ── Spec: standard filter bar ────────────────────────────────────── */}
        <div className="border-b px-5 py-3" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
          <div className="flex flex-wrap items-end gap-3">
            {/* Name / SKU */}
            <div className="flex flex-col gap-1">
              <label htmlFor="catalog-search" className="text-[11px] font-semibold uppercase tracking-[0.04em]"
                style={{ color: "var(--color-text-secondary)" }}>Name or SKU</label>
              <input id="catalog-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                className="h-8 w-full rounded-lg border px-2 text-[13px] outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 sm:w-44"
                style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }} />
            </div>
            {/* Category */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold uppercase tracking-[0.04em]"
                style={{ color: "var(--color-text-secondary)" }}>Category</label>
              <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}
                className="h-8 min-w-36 rounded-lg border px-2 text-[13px] outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }}>
                <option value="">All categories</option>
                {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            {/* Product type */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold uppercase tracking-[0.04em]"
                style={{ color: "var(--color-text-secondary)" }}>Product type</label>
              <select value={filterProductType} onChange={(e) => setFilterProductType(e.target.value as typeof filterProductType)}
                className="h-8 min-w-36 rounded-lg border px-2 text-[13px] outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }}>
                <option value="all">All types</option>
                <option value="standalone">Standalone</option>
                <option value="master">Master</option>
                <option value="variant">Variant</option>
              </select>
            </div>
            {/* Brand */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold uppercase tracking-[0.04em]"
                style={{ color: "var(--color-text-secondary)" }}>Brand</label>
              <input type="text" value={filterBrand} onChange={(e) => setFilterBrand(e.target.value)} placeholder="Brand…"
                className="h-8 w-full rounded-lg border px-2 text-[13px] outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 sm:w-32"
                style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }} />
            </div>
            {/* Channel */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold uppercase tracking-[0.04em]"
                style={{ color: "var(--color-text-secondary)" }}>Channel</label>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
                className="h-8 min-w-32 rounded-lg border px-2 text-[13px] outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }}>
                <option value="">All</option>
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            {/* More filters */}
            {showMoreFilters && (
              <>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold uppercase tracking-[0.04em]"
                    style={{ color: "var(--color-text-secondary)" }}>Tax class</label>
                  <select value={filterTaxClass} onChange={(e) => setFilterTaxClass(e.target.value)}
                    className="h-8 min-w-32 rounded-lg border px-2 text-[13px] outline-none"
                    style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }}>
                    <option value="">All</option>
                    <option value="standard">Standard</option>
                    <option value="exempt">Exempt</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold uppercase tracking-[0.04em]"
                    style={{ color: "var(--color-text-secondary)" }}>Age restricted</label>
                  <select value={filterAgeRestricted ? "1" : "0"} onChange={(e) => setFilterAgeRestricted(e.target.value === "1")}
                    className="h-8 min-w-32 rounded-lg border px-2 text-[13px] outline-none"
                    style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }}>
                    <option value="0">All</option>
                    <option value="1">18+ only</option>
                  </select>
                </div>
              </>
            )}
            {/* Actions */}
            <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
              <button type="button" onClick={clearFilters} disabled={!hasFilters}
                className="text-[12px] font-medium text-brand-600 hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline">
                Clear filters
              </button>
              <button type="button" onClick={() => setShowMoreFilters((v) => !v)}
                className="text-[12px] font-medium text-brand-600 hover:underline">
                {showMoreFilters ? "Fewer filters" : "More filters"}
              </button>
              <button type="button" onClick={() => void load()}
                className="h-8 rounded-lg bg-brand-600 px-4 text-[13px] font-medium text-white transition-colors hover:bg-brand-700">
                Search
              </button>
            </div>
          </div>
          {/* Results count */}
          <div className="mt-2 flex items-center justify-between text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
            <span>Showing <strong style={{ color: "var(--color-text-primary)" }}>{visibleProducts.length}</strong> of {total} products
              {someSelected && <span className="ml-2 text-brand-600">· {selectedIds.size} selected</span>}
            </span>
            <div className="flex items-center gap-3">
              {someSelected && (
                <button type="button" onClick={() => setShowPrintLabels(true)} className="text-brand-600 hover:underline">
                  Labels ({selectedIds.size})
                </button>
              )}
              <button type="button" onClick={handleExportCSV} className="text-brand-600 hover:underline">Export CSV</button>
            </div>
          </div>
        </div>


        {someSelected && (
          <BulkActionBar count={selectedIds.size} categories={categories} onApply={handleBulkUpdate}
            onClear={() => setSelectedIds(new Set())} loading={bulkLoading} error={bulkError} />
        )}

        {actionError && (
          <div className="border-b px-4 py-2 text-[13px]"
            style={{ borderColor: "var(--color-danger-border)", backgroundColor: "var(--color-danger-bg)", color: "var(--color-danger-text)" }}>
            <p role="alert">{actionError}</p>
          </div>
        )}


        {loading ? (
          <TableSkeleton headers={["", "Product", "Type", "Brand", "Supplier", "Available", "Retail price", "Channels", "Created", ""]} rows={8} />
        ) : error ? (
          <div className="px-4 py-10">
            <EmptyState
              title="Products could not load"
              description={error}
              action={<Button size="sm" variant="secondary" onClick={() => void load()}>Retry</Button>}
            />
          </div>
        ) : visibleProducts.length === 0 ? (
          <div className="px-4 py-10">
            <EmptyState
              title={hasFilters ? "No products match these filters" : "No products yet"}
              description={hasFilters ? "Clear filters or adjust the search to see more catalog items." : "Create your first product to start building the catalog."}
              action={hasFilters
                ? <Button size="sm" variant="secondary" onClick={clearFilters}>Clear filters</Button>
                : <Button size="sm" variant="primary" onClick={openCreate}>Add product</Button>}
            />
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              {/* ── Spec: checkbox | thumbnail+Name | Brand | Supplier | Available | Retail price | Channels | Created | ✎ */}
              <table className="w-full text-[13px]">
                <thead style={{ backgroundColor: "var(--color-table-header)", borderBottom: "1px solid var(--color-border)" }}>
                  <tr>
                    <th className="px-4 py-2.5">
                      <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} aria-label="Select all products" className="h-4 w-4 rounded" />
                    </th>
                    <SortTh col="name"        label="Name"          cur={sortCol} dir={sortDir} onSort={handleSort} />
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.05em]"
                      style={{ color: "var(--color-text-secondary)" }}>Type</th>
                    <SortTh col="brand"       label="Brand"         cur={sortCol} dir={sortDir} onSort={handleSort} />
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.05em]"
                      style={{ color: "var(--color-text-secondary)" }}>Supplier</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.05em]"
                      style={{ color: "var(--color-text-secondary)" }}>Available</th>
                    <SortTh col="price_cents" label="Retail price"  cur={sortCol} dir={sortDir} onSort={handleSort} right />
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.05em]"
                      style={{ color: "var(--color-text-secondary)" }}>Channels</th>
                    <SortTh col="created_at"  label="Created"       cur={sortCol} dir={sortDir} onSort={handleSort} />
                    <th className="w-10 px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {visibleProducts.map((p) => {
                    const isSelected = selectedIds.has(p.id);
                    const isAvailable = p.status === "active";
                    const productType = getProductType(p);
                    const createdDate = p.created_at
                      ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "2-digit" }).format(new Date(p.created_at))
                      : "—";
                    return (
                      <tr key={p.id}
                        className={clsx("border-b last:border-0 transition-colors duration-75", isSelected && "bg-[var(--color-primary-subtle)]")}
                        style={{ borderColor: "var(--color-table-border)", cursor: "pointer" }}
                        onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = "var(--color-table-row-hover)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = isSelected ? "var(--color-primary-subtle)" : ""; }}
                        onClick={() => router.push(`/catalog/${p.id}`)}
                      >
                        {/* Checkbox */}
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(p.id)}
                            aria-label={`Select ${p.name}`} className="h-4 w-4 rounded" />
                        </td>

                        {/* thumbnail + Name + SKU */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            {p.image_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={p.image_url} alt="" className="h-8 w-8 shrink-0 rounded-md object-cover" aria-hidden="true" />
                            ) : (
                              <span className={clsx("flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[11px] font-bold text-white",
                                p.status === "active" ? "bg-brand-600" : p.status === "draft" ? "bg-warning-400" : "bg-[var(--color-text-muted)]")}
                                aria-hidden="true">
                                {p.name.charAt(0).toUpperCase()}
                              </span>
                            )}
                            <div className="min-w-0">
                              <p className={clsx("font-semibold leading-snug",
                                p.status === "archived" ? "line-through opacity-50" : "")}
                                style={{ color: "var(--color-text-primary)" }}>{p.name}</p>
                              <p className="font-mono text-[11px]" style={{ color: "var(--color-text-muted)" }}>{p.sku}</p>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <span className={clsx(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                            productType === "Variant" ? "bg-info-50 text-info-700 border border-info-200"
                              : productType === "Master" ? "bg-brand-50 text-brand-700 border border-brand-200"
                              : "border text-[var(--color-text-muted)]"
                          )}
                          style={productType === "Standalone" ? { borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-subtle)" } : {}}>
                            {productType}
                          </span>
                        </td>

                        {/* Brand */}
                        <td className="px-4 py-3 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
                          {p.brand ?? <span style={{ color: "var(--color-text-muted)" }}>—</span>}
                        </td>

                        {/* Supplier */}
                        <td className="px-4 py-3 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
                          {p.preferred_vendor_name ?? <span style={{ color: "var(--color-text-muted)" }}>—</span>}
                        </td>

                        {/* Available indicator */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className={clsx("h-1.5 w-1.5 shrink-0 rounded-full",
                              isAvailable ? "bg-success-500" : p.status === "draft" ? "bg-warning-400" : "bg-[var(--color-text-muted)]"
                            )} aria-hidden="true" />
                            <span className={clsx("text-[12px] font-medium capitalize",
                              isAvailable ? "text-success-700" : p.status === "draft" ? "text-warning-700" : ""
                            )}
                            style={p.status === "archived" ? { color: "var(--color-text-muted)" } : {}}>
                              {p.status}
                            </span>
                            {p.age_restricted === 1 && (
                              <span className="rounded bg-orange-50 px-1 py-0.5 text-[10px] font-semibold text-orange-700 border border-orange-200">18+</span>
                            )}
                          </div>
                        </td>

                        {/* Retail price */}
                        <td className="px-4 py-3 text-right font-bold tabular-nums" style={{ color: "var(--color-text-primary)" }}>
                          {formatMoney(p.price_cents)}
                        </td>

                        {/* Channels */}
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium"
                              style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-subtle)", color: "var(--color-text-secondary)" }}>In-store</span>
                            {p.ecommerce === 1 && (
                              <span className="rounded-full bg-info-50 px-2 py-0.5 text-[10px] font-medium text-info-700 border border-info-200">Online</span>
                            )}
                          </div>
                        </td>

                        {/* Created */}
                        <td className="px-4 py-3 text-[11px] tabular-nums" style={{ color: "var(--color-text-muted)" }}>{createdDate}</td>

                        {/* Edit icon */}
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <button type="button" onClick={() => router.push(`/catalog/${p.id}`)}
                            aria-label={`Edit ${p.name}`}
                            className="transition-colors hover:text-brand-600"
                            style={{ color: "var(--color-text-muted)" }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="md:hidden" style={{ borderTop: "1px solid var(--color-border)" }}>
              {visibleProducts.map(p => (
                <ProductListCard key={p.id} product={p}
                  productType={getProductType(p)}
                  onEdit={() => router.push(`/catalog/${p.id}`)}
                  onArchive={() => { setArchiveTarget(p); setActionError(null); }} />
              ))}
            </div>
          </>
        )}
        {!loading && !error && total > 0 && (
          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} />
        )}
      </Card>

      {showImport    && <ImportCSVModal onDone={async () => { await load(); }} onClose={() => setShowImport(false)} />}
      {showPrintLabels && <PrintLabelsModal selected={selectedProducts} onClose={() => setShowPrintLabels(false)} />}
      {showCreate    && <ProductFormModal categories={categories} onSave={handleCreate} onClose={closeCreate} />}

      {archiveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setArchiveTarget(null)}>
          <div className="w-full max-w-sm rounded-2xl p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}
            style={{ backgroundColor: "var(--color-surface)" }}>
            <h2 className="text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Archive &ldquo;{archiveTarget.name}&rdquo;?
            </h2>
            <p className="mt-2 text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
              The product will be set to archived and hidden from active views. You can restore it by editing the status.
            </p>
            {actionError && <p className="mt-3 text-[12px]" style={{ color: "var(--color-danger-text)" }}>{actionError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setArchiveTarget(null)}
                className="h-8 rounded-lg border px-4 text-[13px] font-medium transition-colors hover:bg-[var(--color-surface-subtle)]"
                style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}>Cancel</button>
              <button type="button" onClick={handleArchive} disabled={archiving}
                className="h-8 rounded-lg px-4 text-[13px] font-medium text-white transition-colors disabled:opacity-60"
                style={{ backgroundColor: "var(--color-text-secondary)" }}>
                {archiving ? "Archiving…" : "Archive"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
