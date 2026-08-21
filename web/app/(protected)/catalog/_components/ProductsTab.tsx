"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { clsx } from "clsx";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { TableSkeleton } from "@/components/TableSkeleton";
import { Pagination } from "@/components/Pagination";
import { apiGet, apiPost, apiDelete, ApiResponseError } from "@/api-client/client";
import { formatMoney } from "@/lib/money";
import type {
  CatalogProduct, Category, ProductStatus, ProductsResponse,
  ProductFacets, ProductSort, ProductTypeFilter, ProductSearchField,
} from "@/api-client/types";
import { DataTable, type DataColumn } from "@/components/DataTable";
import { ListControls, FilterField, filterControlClass, type ListSearchField } from "@/components/ListControls";
import { useListQuery } from "@/hooks/useListQuery";
import { ProductFormModal } from "./ProductFormModal";
import { PrintLabelsModal } from "./PrintLabelsModal";
import { ImportCSVModal } from "./ImportCSVModal";
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
    <div
      // Named so the count is announced with what it counts. Without it a
      // screen reader hears "Active 812 sellable" as three loose strings, and
      // the label alone is ambiguous against the Status filter's options.
      role="group"
      aria-label={`${label}: ${value} products`}
      className={clsx("h-full min-w-0 rounded-md border px-4 py-3 transition-colors", metricToneClass(tone), active && "ring-2 ring-brand-200")}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-xl font-semibold tabular-nums text-slate-950">{value}</span>
        <span className="truncate text-xs text-slate-500">{helper}</span>
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
        <p className="shrink-0 text-sm font-semibold tabular-nums text-slate-950">{formatMoney(product.price_cents)}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={statusBadge(product.status)}>{product.status.charAt(0).toUpperCase() + product.status.slice(1)}</Badge>
        <span className="rounded-md bg-white px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200">{productType}</span>
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

/**
 * Every filter this list supports, with the value that means "not filtering".
 *
 * `reset()` restores from this object wholesale rather than clearing named
 * fields, so adding a filter here is enough — nothing else has to remember it.
 */
const DEFAULT_FILTERS = {
  status: "",
  category: "",
  brand: "",
  supplier: "",
  taxClass: "",
  ageRestricted: false,
  productType: "all",
  priceMin: "",
  priceMax: "",
};

// ── ProductsTab ───────────────────────────────────────────────────────────────

/**
 * The back-office product list.
 *
 * Every filter, the sort and the header counts are resolved by the server. They
 * used to run here in the browser over `products` — the one page React happened
 * to be holding — so "Brand: Coca-Cola" meant "…among the 50 rows currently
 * loaded", the column sort reordered a page rather than the catalog, and the
 * metric tiles counted a page while displaying `total` from the whole catalog
 * right beside it. Correct only while a catalog fits on one page.
 *
 * Anything that needs to be true of the catalog is therefore a query parameter,
 * not a `.filter()` — see `/api/v1/catalog` and `/api/v1/catalog/facets`.
 */
export function ProductsTab({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [products, setProducts]     = useState<CatalogProduct[]>([]);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [facets, setFacets]         = useState<ProductFacets | null>(null);

  /**
   * The whole query — search text, which column it is scoped to, every filter,
   * the sort and the page — as one state model.
   *
   * This was 14 separate `useState`s plus a `withPageReset` wrapper that each
   * setter had to remember to be wrapped in, and a `clearFilters` that listed
   * the filters by hand. The hook makes the two rules structural instead of
   * per-call-site: anything that changes the result set returns to page 1 in the
   * same render, and `reset()` restores from `DEFAULT_FILTERS` wholesale, so a
   * filter added later cannot be forgotten by it.
   *
   * `urlKey` makes the state deep-linkable — a filtered catalog view is now a
   * URL someone can send to a colleague.
   */
  const query = useListQuery({
    defaultFilters: DEFAULT_FILTERS,
    urlKey: "products",
    pageSizeStorageKey: "catalog-products-page-size",
    pageSize: 50,
  });
  const { filters, setFilter, page, setPage, pageSize, setPageSize, searchField } = query;
  const debouncedQ = query.debouncedSearch;

  // Local aliases keep the JSX and the request builder readable; each is just a
  // view onto the single query object above.
  const filterStatus       = filters.status;
  const filterCategory     = filters.category;
  const filterTaxClass     = filters.taxClass;
  const filterBrand        = filters.brand;
  const filterSupplier     = filters.supplier;
  const filterAgeRestricted = filters.ageRestricted;
  const filterProductType  = filters.productType as "all" | ProductTypeFilter;
  const priceMin           = filters.priceMin;
  const priceMax           = filters.priceMax;

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

  // Header counts come from the facets endpoint: catalog-wide, and scoped to the
  // filters currently applied. Counting `products` here would only ever describe
  // the loaded page.
  const facetCount = useCallback((buckets: { value: string; count: number }[] | undefined, value: string) =>
    buckets?.find((b) => b.value === value)?.count ?? 0, []);

  const activeCount     = facetCount(facets?.status, "active");
  const draftCount      = facetCount(facets?.status, "draft");
  const archivedCount   = facetCount(facets?.status, "archived");
  const restrictedCount = facets?.ageRestricted ?? 0;
  const standaloneCount = facetCount(facets?.productType, "standalone");
  const masterCount     = facetCount(facets?.productType, "master");
  const variantCount    = facetCount(facets?.productType, "variant");

  // A product's position in the variant tree is now returned per row rather than
  // inferred from which siblings share the page — a master whose children landed
  // on page 2 used to render as "Standalone".
  const getProductType = useCallback((product: CatalogProduct): "Standalone" | "Master" | "Variant" => {
    if (product.parent_product_id) return "Variant";
    if (product.variant_count && product.variant_count > 0) return "Master";
    return "Standalone";
  }, []);

  // Drives whether Reset does anything. Includes the search scope and an
  // explicit sort: both change what the user sees, so leaving them out would
  // make Reset look spent while the list was still narrowed or reordered.
  // Anything non-default — search text, scope, any filter, or an explicit sort.
  // The hook computes it, so it cannot drift from what `reset()` actually clears.
  const hasFilters = query.isDirty;

  /**
   * The active filters, as removable chips. Each carries its own `clear` so one
   * filter can be dropped without resetting the rest.
   */
  const activeChips: { key: string; label: string; clear: () => void }[] = [
    debouncedQ          ? { key: "q",     label: `Search: "${debouncedQ}"`,   clear: () => query.setSearch("") } : null,
    filterStatus        ? { key: "status", label: `Status: ${filterStatus}`,  clear: () => setFilter("status", "") } : null,
    filterCategory      ? { key: "cat",   label: filterCategory,              clear: () => setFilter("category", "") } : null,
    filterBrand         ? { key: "brand", label: `Brand: ${filterBrand}`,     clear: () => setFilter("brand", "") } : null,
    filterSupplier      ? { key: "supp",  label: `Supplier: ${filterSupplier}`, clear: () => setFilter("supplier", "") } : null,
    filterTaxClass      ? { key: "tax",   label: `Tax: ${filterTaxClass}`,    clear: () => setFilter("taxClass", "") } : null,
    filterAgeRestricted ? { key: "age",   label: "Age restricted",            clear: () => setFilter("ageRestricted", false) } : null,
    filterProductType !== "all" ? { key: "type", label: `Type: ${filterProductType}`, clear: () => setFilter("productType", "all") } : null,
    priceMin || priceMax ? {
      key: "price",
      label: priceMin && priceMax ? `Price: $${priceMin}–$${priceMax}` : priceMin ? `Price ≥ $${priceMin}` : `Price ≤ $${priceMax}`,
      clear: () => { setFilter("priceMin", ""); setFilter("priceMax", ""); },
    } : null,
  ].filter(Boolean) as { key: string; label: string; clear: () => void }[];

  /**
   * `setFilter` already returns to page 1 in the same render, so the old
   * `withPageReset` wrapper is gone — the guarantee moved from "every call site
   * remembered to wrap" to "the hook does it".
   */
  const clearFilters = query.reset;

  /**
   * Columns the user can scope a search to.
   *
   * Every value here is one the catalog endpoint implements; adding an option
   * the server does not know would make the search 400 the moment it is picked.
   */
  const SEARCH_FIELDS: ListSearchField[] = [
    { value: "all",      label: "All columns" },
    { value: "name",     label: "Product name" },
    { value: "sku",      label: "SKU" },
    { value: "barcode",  label: "UPC / barcode" },
    { value: "brand",    label: "Brand" },
    { value: "category", label: "Category" },
    { value: "tags",     label: "Tags" },
  ];

  // Search text is shown separately (in the box, and as its own chip), so the
  // badge counts filters only — otherwise typing appears to add a filter.
  const activeFilterCount =
    (filterStatus ? 1 : 0) + (filterCategory ? 1 : 0) + (filterBrand ? 1 : 0) +
    (filterSupplier ? 1 : 0) + (filterTaxClass ? 1 : 0) + (filterAgeRestricted ? 1 : 0) +
    (filterProductType !== "all" ? 1 : 0) + (priceMin || priceMax ? 1 : 0);

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

  // `products` is already the filtered, sorted page the server returned — there
  // is deliberately no client-side pass over it. Anything added here would once
  // again only apply to the loaded page.
  const selectedProducts = products.filter(p => selectedIds.has(p.id));
  const allSelected      = products.length > 0 && products.every(p => selectedIds.has(p.id));
  const someSelected     = selectedIds.size > 0;

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? new Set<string>() : new Set<string>(products.map(p => p.id)));
  };
  // With a search term, rank by relevance so exact SKU/UPC hits come first; an
  // explicit column choice always wins over that default.
  // null = the user hasn't picked a column, so the sort follows context:
  // relevance while searching, name otherwise. Still derived rather than
  // written back into state — storing it would re-run the loader and fetch the
  // list twice on the first keystroke of every search.
  const effectiveSort: ProductSort = (query.sort as ProductSort | null) ?? (debouncedQ ? "relevance" : "name");
  const sortDir = query.dir;

  // Re-sorting reorders the whole catalog, so page 3 of the old order is
  // meaningless in the new one — the hook returns to page 1 for us.
  //
  // Passing `effectiveSort` rather than the raw stored sort matters: with no
  // explicit choice the header shows "name" (or "relevance"), and clicking that
  // same header has to toggle direction rather than re-select a column the hook
  // does not think is active.
  function handleSort(col: ProductSort) {
    query.toggleSort(col === effectiveSort ? effectiveSort : col);
  }

  /**
   * Every active filter as query parameters. Shared by the list request, the
   * facet request and the CSV export so all three describe the same set — the
   * export in particular used to serialise whatever rows were on screen.
   */
  const filterParams = useCallback(() => {
    const params = new URLSearchParams();
    if (debouncedQ)     params.set("q",           debouncedQ);
    // Only meaningful alongside a term, and omitting it when unscoped keeps the
    // request identical to what it was before column search existed.
    if (debouncedQ && searchField !== "all") params.set("searchField", searchField);
    if (filterStatus)   params.set("status",      filterStatus);
    if (filterCategory) params.set("category",    filterCategory);
    if (filterBrand)    params.set("brand",       filterBrand);
    if (filterSupplier) params.set("supplier",    filterSupplier);
    if (filterTaxClass) params.set("taxClass",    filterTaxClass);
    if (filterAgeRestricted) params.set("ageRestricted", "true");
    if (filterProductType !== "all") params.set("productType", filterProductType);
    if (priceMin)       params.set("minPrice",    priceMin);
    if (priceMax)       params.set("maxPrice",    priceMax);
    return params;
  }, [debouncedQ, searchField, filterStatus, filterCategory, filterBrand, filterSupplier,
      filterTaxClass, filterAgeRestricted, filterProductType, priceMin, priceMax]);


  /**
   * Column definitions for the product table.
   *
   * Each cell renderer is the markup that used to sit inline in the <td>; the
   * behaviours around them (sort, selection, paging, states) now belong to
   * DataTable. `sortKey` is the value the catalog endpoint accepts, so a header
   * click reorders the whole catalog rather than the loaded page.
   */
  const productColumns: DataColumn<CatalogProduct>[] = [
    {
      key: "name",
      header: "Name",
      sortKey: "name",
      hideable: false,
      sticky: true,
      minWidth: "260px",
      render: (p) => (
        <div className="flex items-center gap-2.5">
          {p.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.image_url} alt="" className="h-9 w-9 shrink-0 rounded-control object-cover" aria-hidden="true" />
          ) : (
            <span className={clsx("flex h-9 w-9 shrink-0 items-center justify-center rounded-control text-xs font-bold text-white",
              p.status === "active" ? "bg-accent-600" : p.status === "draft" ? "bg-warning-500" : "bg-slate-300")}
              aria-hidden="true">
              {p.name.charAt(0).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <p className={clsx("font-medium leading-snug", p.status === "archived" ? "text-content-muted line-through" : "text-content-primary")}>{p.name}</p>
            <p className="font-mono text-2xs text-content-muted">{p.sku}</p>
          </div>
        </div>
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (p) => {
        const productType = getProductType(p);
        return (
          <span className={clsx(
            "rounded-full px-2 py-0.5 text-2xs font-semibold",
            productType === "Variant" ? "bg-info-bg text-info-700"
              : productType === "Master" ? "bg-accent-50 text-accent-700"
              : "bg-surface-3 text-content-secondary",
          )}>
            {productType}
          </span>
        );
      },
    },
    {
      key: "brand",
      header: "Brand",
      sortKey: "brand",
      render: (p) => p.brand ?? <span className="text-content-muted">—</span>,
    },
    {
      key: "supplier",
      header: "Supplier",
      render: (p) => p.preferred_vendor_name ?? <span className="text-content-muted">—</span>,
    },
    {
      key: "available",
      header: "Available",
      render: (p) => {
        const isAvailable = p.status === "active";
        return (
          <div className="flex items-center gap-1.5">
            {/* Shape + text, never colour alone — the dot repeats what the
                label already says for anyone who cannot separate the hues. */}
            <span className={clsx("h-2 w-2 shrink-0 rounded-full",
              isAvailable ? "bg-success-500" : p.status === "draft" ? "bg-warning-500" : "bg-slate-300",
            )} aria-hidden="true" />
            <span className={clsx("text-xs font-medium capitalize",
              isAvailable ? "text-success-700" : p.status === "draft" ? "text-warning-700" : "text-content-muted",
            )}>
              {p.status}
            </span>
            {p.age_restricted === 1 && (
              <span className="rounded bg-warning-bg px-1 py-0.5 text-2xs font-semibold text-warning-700">18+</span>
            )}
          </div>
        );
      },
    },
    {
      key: "price",
      header: "Retail price",
      sortKey: "price_cents",
      numeric: true,
      render: (p) => <span className="font-semibold text-content-primary">{formatMoney(p.price_cents)}</span>,
    },
    {
      key: "channels",
      header: "Channels",
      render: (p) => (
        <div className="flex flex-wrap gap-1">
          <span className="rounded-full bg-surface-3 px-2 py-0.5 text-2xs font-medium text-content-secondary">In-store</span>
          {p.ecommerce === 1 && (
            <span className="rounded-full bg-info-bg px-2 py-0.5 text-2xs font-medium text-info-700">Online</span>
          )}
        </div>
      ),
    },
    {
      key: "created",
      header: "Created",
      sortKey: "created_at",
      render: (p) => (
        <span className="text-xs text-content-muted tnum">
          {p.created_at
            ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "2-digit" }).format(new Date(p.created_at))
            : "—"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      hideable: false,
      align: "right",
      width: "56px",
      render: (p) => (
        <button type="button"
          onClick={(e) => { e.stopPropagation(); router.push(`/catalog/${p.id}`); }}
          aria-label={`Edit ${p.name}`}
          className="focus-ring inline-flex min-h-touch min-w-touch items-center justify-center rounded-control text-content-muted transition-colors hover:text-accent-600">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
      ),
    },
  ];

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = filterParams();
      params.set("limit", String(pageSize));
      params.set("offset", String(page * pageSize));
      params.set("sort", effectiveSort);
      params.set("dir", sortDir);

      const facetParams = filterParams();
      const [data, facetData] = await Promise.all([
        apiGet<ProductsResponse>(`/api/v1/catalog?${params}`),
        apiGet<ProductFacets>(`/api/v1/catalog/facets?${facetParams}`).catch(() => null),
      ]);
      setProducts(data.items ?? []);
      setTotal(data.total ?? 0);
      // Facets are decoration, not the result set: if they fail the list still
      // renders, just without counts.
      if (facetData) setFacets(facetData);
    } catch (err) {
      setError(err instanceof ApiResponseError ? err.message : "Failed to load products.");
    } finally { setLoading(false); }
  }, [filterParams, page, pageSize, effectiveSort, sortDir]);

  useEffect(() => { void load(); }, [load]);

  // Selection is by id and the ids change with the page; keeping a stale
  // selection would let a bulk action hit rows the user can no longer see.
  useEffect(() => { setSelectedIds(new Set()); }, [filterParams, page, pageSize, effectiveSort, sortDir]);

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

  /**
   * One request for the whole selection. This used to fan out a PATCH per
   * product — 147 selected products meant 147 round trips, no atomicity, and a
   * partial failure the UI could only describe as "some updates failed".
   */
  const handleBulkUpdate = async (field: string, value: string) => {
    setBulkLoading(true); setBulkError(null);
    try {
      const parsed = field === "age_restricted" ? value === "true" : value;
      await apiPost("/api/v1/catalog/bulk-update", {
        ids: [...selectedIds],
        update: { [field]: parsed },
      });
      setSelectedIds(new Set()); await load();
    } catch (err) {
      setBulkError(err instanceof ApiResponseError ? err.message : "Bulk update failed — no products were changed.");
    }
    finally { setBulkLoading(false); }
  };

  /**
   * Export what the filters describe, not what happens to be rendered.
   *
   * The previous implementation serialised `visibleProducts` — one page — under
   * a button labelled "Export CSV", so exporting a 5,000-product catalog
   * silently produced 50 rows. Selecting rows still exports just those.
   */
  const handleExportCSV = async () => {
    setActionError(null);
    try {
      const rows: CatalogProduct[] = selectedIds.size > 0
        ? selectedProducts
        : await (async () => {
            const params = filterParams();
            params.set("limit", "200");
            const collected: CatalogProduct[] = [];
            for (let offset = 0; ; offset += 200) {
              params.set("offset", String(offset));
              const page = await apiGet<ProductsResponse>(`/api/v1/catalog?${params}`);
              collected.push(...(page.items ?? []));
              if (collected.length >= (page.total ?? 0) || (page.items ?? []).length === 0) break;
              if (offset > 100_000) break; // hard stop; a browser download is not a bulk pipeline
            }
            return collected;
          })();

      const headers = ["SKU", "Name", "Brand", "Category", "Price ($)", "Cost ($)", "MSRP ($)", "Tax Class", "Status", "Barcode", "Age Restricted"];
      const body = rows.map(p => [
        p.sku, p.name, p.brand ?? "", p.category,
        (p.price_cents / 100).toFixed(2),
        p.raw_cost_price_cents != null ? (p.raw_cost_price_cents / 100).toFixed(2) : "",
        p.msrp_cents != null ? (p.msrp_cents / 100).toFixed(2) : "",
        p.tax_class, p.status, p.barcode ?? "",
        p.age_restricted === 1 ? "yes" : "no",
      ]);
      const csv = [headers, ...body].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `catalog-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setActionError(err instanceof ApiResponseError ? err.message : "Export failed.");
    }
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
        <div className="flex flex-col gap-3 border-b border-[#E8E8E8] px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <span className="block truncate text-sm font-semibold text-[#111]">Products</span>
            <span className="text-xs text-slate-500">Manage retail catalog items, master products, and variants.</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setShowImport(true)}
              className="flex min-h-9 items-center gap-1.5 rounded border border-[#D9D9D9] bg-white px-3 py-1.5 text-sm text-[#555] transition-colors hover:bg-gray-50">
              ↑ Import
            </button>
            <button type="button" onClick={openCreate}
              className="min-h-9 rounded bg-brand-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#4849d0]">
              + Add product
            </button>
          </div>
        </div>

        <div className="grid gap-3 border-b border-[#E8E8E8] bg-slate-50 px-5 py-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <button type="button" aria-pressed={!filterStatus && filterProductType === "all" && !filterAgeRestricted} className="rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2" onClick={() => { setFilter("status", ""); setFilter("productType", "all"); setFilter("ageRestricted", false); }}>
            <CatalogMetric label="Total" value={total} helper={hasFilters ? "matching filters" : "in catalog"} active={!filterStatus && filterProductType === "all" && !filterAgeRestricted} />
          </button>
          <button type="button" aria-pressed={filterStatus === "active"} className="rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2" onClick={() => setFilter("status", "active")}>
            <CatalogMetric label="Active" value={activeCount} helper="sellable" tone="success" active={filterStatus === "active"} />
          </button>
          <button type="button" aria-pressed={filterStatus === "draft"} className="rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2" onClick={() => setFilter("status", "draft")}>
            <CatalogMetric label="Draft" value={draftCount} helper="needs review" tone="warning" active={filterStatus === "draft"} />
          </button>
          <button type="button" aria-pressed={filterStatus === "archived"} className="rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2" onClick={() => setFilter("status", "archived")}>
            <CatalogMetric label="Archived" value={archivedCount} helper="hidden" tone="muted" active={filterStatus === "archived"} />
          </button>
          <button type="button" aria-pressed={filterProductType === "master"} className="rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2" onClick={() => setFilter("productType", "master")}>
            <CatalogMetric label="Masters" value={masterCount} helper="variant groups" active={filterProductType === "master"} />
          </button>
          <button type="button" aria-pressed={filterProductType === "variant"} className="rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2" onClick={() => setFilter("productType", "variant")}>
            <CatalogMetric label="Variants" value={variantCount} helper="sellable SKUs" active={filterProductType === "variant"} />
          </button>
          <button type="button" aria-pressed={filterAgeRestricted} className="rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2" onClick={() => setFilter("ageRestricted", !filterAgeRestricted)}>
            <CatalogMetric label="Restricted" value={restrictedCount} helper="ID required" tone="restricted" active={filterAgeRestricted} />
          </button>
        </div>

        {/* ── Search, column scope, filters, reset — the shared ListControls ──
            This bar used to be hand-rolled here: nine controls laid out inline,
            a "More filters" disclosure, and a bespoke "Clear filters". It is the
            shared component now so the catalog, customers and every other list
            behave identically, and so the column selector below maps to a real
            server parameter rather than being decoration. */}
        <div className="border-b border-line bg-surface-1 px-5 py-3">
          <ListControls
            search={query.search}
            onSearchChange={query.setSearch}
            searchPlaceholder="Search products, SKU, UPC, brand…"
            searchLabel="Search products"
            searchFields={SEARCH_FIELDS}
            searchField={searchField}
            onSearchFieldChange={query.setSearchField}
            activeFilterCount={activeFilterCount}
            onReset={clearFilters}
            canReset={query.isDirty}
            resultCount={products.length}
            totalCount={total}
            loading={loading}
            filters={
              <>
                {/* Options come from the catalog's own data, with counts, so the
                    list only ever offers a refinement that returns rows. */}
                <FilterField label="Category" htmlFor="catalog-category">
                  <select id="catalog-category" value={filterCategory} onChange={e => setFilter("category", e.target.value)}
                    className={filterControlClass}>
                    <option value="">All categories</option>
                    {(facets?.category.length ? facets.category.map(b => ({ id: b.value, name: b.value, count: b.count }))
                                              : categories.map(c => ({ id: c.id, name: c.name, count: null as number | null })))
                      .map(c => (
                        <option key={c.id} value={c.name}>
                          {c.name}{c.count != null ? ` (${c.count})` : ""}
                        </option>
                      ))}
                  </select>
                </FilterField>

                <FilterField label="Status" htmlFor="catalog-status">
                  <select id="catalog-status" value={filterStatus} onChange={e => setFilter("status", e.target.value)}
                    className={filterControlClass}>
                    <option value="">All</option>
                    <option value="active">Active{facets ? ` (${activeCount})` : ""}</option>
                    <option value="draft">Draft{facets ? ` (${draftCount})` : ""}</option>
                    <option value="archived">Archived{facets ? ` (${archivedCount})` : ""}</option>
                  </select>
                </FilterField>

                <FilterField label="Product type" htmlFor="catalog-type">
                  <select id="catalog-type" value={filterProductType} onChange={e => setFilter("productType", e.target.value)}
                    className={filterControlClass}>
                    <option value="all">All types</option>
                    <option value="standalone">Standalone{facets ? ` (${standaloneCount})` : ""}</option>
                    <option value="master">Master{facets ? ` (${masterCount})` : ""}</option>
                    <option value="variant">Variant{facets ? ` (${variantCount})` : ""}</option>
                  </select>
                </FilterField>

                {/* A datalist keeps free-text matching while surfacing the
                    brands this catalog actually carries. */}
                <FilterField label="Brand" htmlFor="catalog-brand">
                  <input id="catalog-brand" type="text" list="catalog-brand-options" value={filterBrand}
                    onChange={e => setFilter("brand", e.target.value)} placeholder="Any brand"
                    className={filterControlClass} />
                  <datalist id="catalog-brand-options">
                    {facets?.brand.map(b => <option key={b.value} value={b.value}>{`${b.value} (${b.count})`}</option>)}
                  </datalist>
                </FilterField>

                <FilterField label="Supplier" htmlFor="catalog-supplier">
                  <input id="catalog-supplier" type="text" list="catalog-supplier-options" value={filterSupplier}
                    onChange={e => setFilter("supplier", e.target.value)} placeholder="Any supplier"
                    className={filterControlClass} />
                  <datalist id="catalog-supplier-options">
                    {facets?.supplier.map(b => <option key={b.value} value={b.value}>{`${b.value} (${b.count})`}</option>)}
                  </datalist>
                </FilterField>

                <FilterField label="Tax class" htmlFor="catalog-tax">
                  <select id="catalog-tax" value={filterTaxClass} onChange={e => setFilter("taxClass", e.target.value)}
                    className={filterControlClass}>
                    <option value="">All</option>
                    <option value="standard">Standard</option>
                    <option value="exempt">Exempt</option>
                  </select>
                </FilterField>

                <FilterField label="Age restricted" htmlFor="catalog-age">
                  <select id="catalog-age" value={filterAgeRestricted ? "1" : "0"} onChange={e => setFilter("ageRestricted", e.target.value === "1")}
                    className={filterControlClass}>
                    <option value="0">All</option>
                    <option value="1">18+ only{facets ? ` (${restrictedCount})` : ""}</option>
                  </select>
                </FilterField>

                <fieldset className="flex flex-col gap-1">
                  <legend className="text-xs font-medium text-content-secondary">
                    Price range{facets?.priceRange ? ` (${formatMoney(facets.priceRange.min)}–${formatMoney(facets.priceRange.max)})` : ""}
                  </legend>
                  <div className="flex items-center gap-2">
                    <input type="number" min="0" step="0.01" value={priceMin} onChange={e => setFilter("priceMin", e.target.value)}
                      aria-label="Minimum price in dollars" placeholder="Min" className={filterControlClass} />
                    <span aria-hidden="true" className="text-xs text-content-muted">–</span>
                    <input type="number" min="0" step="0.01" value={priceMax} onChange={e => setFilter("priceMax", e.target.value)}
                      aria-label="Maximum price in dollars" placeholder="Max" className={filterControlClass} />
                  </div>
                </fieldset>
              </>
            }
            trailing={
              <>
                {someSelected && (
                  <Button size="sm" variant="secondary" onClick={() => setShowPrintLabels(true)}>
                    Labels ({selectedIds.size})
                  </Button>
                )}
                <Button size="sm" variant="secondary" onClick={handleExportCSV}>Export CSV</Button>
              </>
            }
          />

          {/* Active filters — each chip removes only itself. Filters apply as
              they change (debounced for text), so there is no "Search" button
              to press and no state where the list disagrees with the controls. */}
          {activeChips.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Active filters">
              {activeChips.map(chip => (
                <span key={chip.key} className="inline-flex items-center gap-1 rounded-full bg-accent-50 py-0.5 pl-2.5 pr-1 text-xs font-medium text-accent-700 ring-1 ring-accent-200">
                  {chip.label}
                  <button type="button" onClick={() => { chip.clear(); setPage(0); }} aria-label={`Remove filter ${chip.label}`}
                    className="focus-ring flex h-5 w-5 items-center justify-center rounded-full text-accent-600 hover:bg-accent-100">
                    <span aria-hidden="true">×</span>
                  </button>
                </span>
              ))}
              <button type="button" onClick={clearFilters}
                className="focus-ring rounded-control text-xs text-content-secondary underline hover:text-content-primary">
                Clear all
              </button>
            </div>
          )}

          {someSelected && (
            <p className="mt-2 text-xs font-medium text-accent-700 tnum" aria-live="polite">
              {selectedIds.size} selected
            </p>
          )}
        </div>


        {someSelected && (
          <BulkActionBar count={selectedIds.size} categories={categories} onApply={handleBulkUpdate}
            onClear={() => setSelectedIds(new Set())} loading={bulkLoading} error={bulkError} />
        )}

        {actionError && (
          <div className="border-b border-red-100 bg-red-50 px-4 py-2">
            <p role="alert" className="text-sm text-red-700">{actionError}</p>
          </div>
        )}


        {/* ── Desktop: the shared DataTable ──────────────────────────────────
            Was a hand-rolled <table> with its own header casing, hover, padding
            and a bespoke SortTh. Every behaviour it had is preserved as a
            capability of the shared primitive instead: server sort (the sort
            reorders the catalog, not the loaded page), controlled selection
            (the bulk bar and the labels modal live outside the table and read
            it), server pagination with rows-per-page, and built-in
            loading/empty/error. */}
        <div className="hidden md:block">
          <DataTable<CatalogProduct>
            caption="Products in this catalog, with brand, supplier, availability, price and channels"
            columns={productColumns}
            rows={products}
            rowKey={(p) => p.id}
            loading={loading}
            error={error}
            onRetry={() => void load()}
            emptyTitle={hasFilters ? "No products match these filters" : "No products yet"}
            emptyDescription={hasFilters
              ? "Clear filters or adjust the search to see more catalog items."
              : "Create your first product to start building the catalog."}
            emptyAction={hasFilters
              ? <Button size="sm" variant="secondary" onClick={clearFilters}>Clear filters</Button>
              : <Button size="sm" variant="primary" onClick={openCreate}>Add product</Button>}
            selectable
            selectedKeys={selectedIds}
            onSelectionChange={setSelectedIds}
            serverSort={{
              activeKey: effectiveSort,
              direction: sortDir,
              onSortChange: (key) => handleSort(key as ProductSort),
            }}
            serverPagination={{
              total,
              offset: page * pageSize,
              limit: pageSize,
              onOffsetChange: (offset) => setPage(Math.floor(offset / pageSize)),
            }}
            // One pager serves both layouts — see below. Two would be duplicate
            // output for a screen reader even with CSS hiding one.
            hideFooter
            onRowClick={(p) => router.push(`/catalog/${p.id}`)}
            storageKey="catalog-products"
          />
        </div>

        {/* ── Mobile: card list. A ten-column table does not shrink into a
            phone; it becomes a card per product with the same actions. */}
        <div className="md:hidden">
          {loading ? (
            <TableSkeleton headers={["Product", "Price"]} rows={6} />
          ) : error ? (
            <div className="px-4 py-10">
              <EmptyState
                title="Products could not load"
                description={error}
                action={<Button size="sm" variant="secondary" onClick={() => void load()}>Retry</Button>}
              />
            </div>
          ) : products.length === 0 ? (
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
              <div className="divide-y divide-line-subtle">
                {products.map(p => (
                  <ProductListCard key={p.id} product={p}
                    productType={getProductType(p)}
                    onEdit={() => router.push(`/catalog/${p.id}`)}
                    onArchive={() => { setArchiveTarget(p); setActionError(null); }} />
                ))}
              </div>
            </>
          )}
        </div>

        {/* One pager for the table and the card list alike. */}
        {!loading && !error && total > 0 && (
          <Pagination page={page} pageSize={pageSize} total={total}
            onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(0); }} />
        )}
      </Card>

      {showImport    && <ImportCSVModal onDone={async () => { await load(); }} onClose={() => setShowImport(false)} />}
      {showPrintLabels && <PrintLabelsModal selected={selectedProducts} onClose={() => setShowPrintLabels(false)} />}
      {showCreate    && <ProductFormModal categories={categories} onSave={handleCreate} onClose={closeCreate} />}

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
