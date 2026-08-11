"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useQuery } from "@/lib/useQuery";
import { apiGet, apiPost, ApiResponseError } from "@/api-client/client";
import { formatMoney } from "@/lib/money";
import type {
  CatalogProduct,
  ProductsResponse,
  CatalogCategoriesResponse,
} from "@/api-client/types";
import { ListControls, FilterField, filterControlClass, type ListSearchField } from "@/components/ListControls";
import { StatusBadge, DropdownItem, buildCategoryName } from "./ui";
import type { CatalogStatusFilter, LocalProductStatus } from "./shared";
import { DataTable, type DataColumn } from "@/components/DataTable";

/**
 * Columns an inventory catalog search can be scoped to.
 *
 * This tab loads one page of the catalog (`limit=200`) and filters it here, so
 * the scope narrows which field is compared across those rows. It is NOT a
 * server parameter — past 200 products the list itself is already truncated,
 * which is a pre-existing limit of this tab, not something the scope introduces.
 */
const SEARCH_FIELDS: ListSearchField[] = [
  { value: "all", label: "All columns" },
  { value: "name", label: "Product name" },
  { value: "sku", label: "SKU" },
];

export function CatalogTab() {
  const router = useRouter();
  const [catalogQuery, setCatalogQuery] = useState("");
  const [searchField, setSearchField] = useState("all");
  const [catalogCategory, setCatalogCategory] = useState("All");
  const [catalogStatus, setCatalogStatus] = useState<CatalogStatusFilter>("All");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [actionsOpen, setActionsOpen] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);

  const { data: productsData, loading: catalogProductsLoading, error: catalogProductsError } =
    useQuery("inventory:catalog-products", () => apiGet<ProductsResponse>("/api/v1/catalog?limit=200&excludeMasters=true"), {
      staleMs: 60_000,
    });
  const { data: categoriesData, loading: catalogCategoriesLoading } =
    useQuery("inventory:catalog-categories", () => apiGet<CatalogCategoriesResponse>("/api/v1/catalog/categories"), {
      staleMs: 60_000,
    });

  const [productsOverride, setProductsOverride] = useState<CatalogProduct[] | null>(null);
  const [catalogMutationError, setCatalogMutationError] = useState<string | null>(null);
  const products = useMemo(
    () => productsOverride ?? productsData?.items ?? [],
    [productsData, productsOverride],
  );
  useEffect(() => { if (productsData) setProductsOverride(null); }, [productsData]);
  const categories = useMemo(() => categoriesData?.items ?? [], [categoriesData]);
  const catalogLoading = catalogProductsLoading || catalogCategoriesLoading;
  const catalogError = catalogProductsError ?? catalogMutationError;

  useEffect(() => {
    if (!actionsOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
        setActionsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
  
  return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [actionsOpen]);

  const catalogCategoryOptions = useMemo(() => {
    return ["All", ...categories.map((c) => buildCategoryName(c, categories)).sort()];
  }, [categories]);

  const filteredProducts = useMemo(() => {
    const q = catalogQuery.trim().toLowerCase();
    return products.filter((p) => {
      const fields: Record<string, string> = { name: p.name, sku: p.sku };
      const haystack = searchField === "all" ? Object.values(fields) : [fields[searchField] ?? ""];
      const matchesQuery = q.length === 0 || haystack.some((v) => v.toLowerCase().includes(q));
      let matchesCategory = true;
      if (catalogCategory !== "All") {
        const cat = categories.find((c) => buildCategoryName(c, categories) === catalogCategory);
        matchesCategory = cat ? p.category === cat.name : true;
      }
      const matchesStatus = catalogStatus === "All" || p.status === catalogStatus;
      return matchesQuery && matchesCategory && matchesStatus;
    });
  }, [products, categories, catalogQuery, searchField, catalogCategory, catalogStatus]);

  // Selection toggles and the all/indeterminate derivation used to live here;
  // DataTable owns them now, driven by `selectedKeys`/`onSelectionChange`.

  async function handleBulkStatus(status: LocalProductStatus) {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkLoading(true);
    setActionsOpen(false);
    try {
      await apiPost("/api/v1/catalog/bulk-update", { ids, update: { status } });
      setProductsOverride((prev) =>
        (prev ?? products).map((p) => (selectedIds.has(p.id) ? { ...p, status } : p)),
      );
      setSelectedIds(new Set());
    } catch (err) {
      setCatalogMutationError(err instanceof ApiResponseError ? err.message : "Bulk update failed.");
    } finally {
      setBulkLoading(false);
    }
  }

  function handleExportCSV() {
    setActionsOpen(false);
    const token =
      typeof window !== "undefined" ? (localStorage.getItem("accessToken") ?? "") : "";
    const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
    const url = `${base}/api/v1/catalog/export`;
    const a = document.createElement("a");
    a.href = `${url}?token=${encodeURIComponent(token)}`;
    a.download = "catalog-export.csv";
    a.click();
  }

  /**
   * Catalog columns. Client-side sorting is right here — this tab loads one
   * page of 200 and filters it locally, so a header click reorders every row
   * it holds.
   */
  const catalogColumns: DataColumn<CatalogProduct>[] = [
    {
      key: "sku", header: "SKU", hideable: false, sticky: true,
      sortValue: (p) => p.sku,
      render: (p) => (
        <Link
          href={`/catalog/${p.id}`}
          onClick={(e) => e.stopPropagation()}
          className="focus-ring rounded-control font-mono text-xs font-semibold text-content-primary underline-offset-2 hover:underline"
        >
          {p.sku}
        </Link>
      ),
    },
    {
      key: "name", header: "Name", sortValue: (p) => p.name, minWidth: "200px",
      render: (p) => (
        <>
          <span className="font-medium text-content-primary">{p.name}</span>
          {p.parent_product_id && (
            <span className="ml-2 inline-flex rounded bg-surface-3 px-1.5 py-0.5 text-xs text-content-secondary">variant</span>
          )}
        </>
      ),
    },
    { key: "brand", header: "Brand", sortValue: (p) => p.brand ?? null,
      render: (p) => <span className="text-content-secondary">{p.brand ?? "-"}</span> },
    { key: "category", header: "Category", sortValue: (p) => p.category || null,
      render: (p) => <span className="text-content-secondary">{p.category || "-"}</span> },
    { key: "price", header: "Price", numeric: true, sortValue: (p) => p.price_cents,
      render: (p) => <span className="font-semibold text-content-primary">{formatMoney(p.price_cents)}</span> },
    { key: "status", header: "Status", sortValue: (p) => p.status,
      render: (p) => <StatusBadge status={p.status} /> },
  ];

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Product catalog</h2>
          {selectedIds.size > 0 && (
            <p className="text-sm text-slate-900">
              {selectedIds.size} product{selectedIds.size !== 1 ? "s" : ""} selected
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <div className="relative" ref={actionsRef}>
            <Button
              variant="secondary" size="sm"
              disabled={selectedIds.size === 0 || bulkLoading}
              loading={bulkLoading}
              onClick={() => setActionsOpen((v) => !v)}
            >
              Actions
              <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </Button>
            {actionsOpen && (
              <div className="absolute right-0 z-20 mt-1 w-44 rounded-md border border-slate-200 bg-white shadow-lg">
                <div className="py-1">
                  <DropdownItem onClick={() => void handleBulkStatus("active")}>Set Active</DropdownItem>
                  <DropdownItem onClick={() => void handleBulkStatus("draft")}>Set Draft</DropdownItem>
                  <DropdownItem onClick={() => void handleBulkStatus("archived")}>Set Archived</DropdownItem>
                  <div className="my-1 border-t border-slate-100" />
                  <DropdownItem onClick={handleExportCSV}>Export CSV</DropdownItem>
                </div>
              </div>
            )}
          </div>
          <Button variant="primary" size="sm" onClick={() => router.push("/catalog?new=product")}>
            New product
          </Button>
        </div>
      </div>

      <div className="border-b border-line bg-surface-2 px-4 py-3">
        <ListControls
          search={catalogQuery}
          onSearchChange={setCatalogQuery}
          searchPlaceholder="Search catalog by product name or SKU…"
          searchLabel="Search catalog"
          searchFields={SEARCH_FIELDS}
          searchField={searchField}
          onSearchFieldChange={setSearchField}
          activeFilterCount={(catalogCategory !== "All" ? 1 : 0) + (catalogStatus !== "All" ? 1 : 0)}
          onReset={() => {
            setCatalogQuery("");
            setSearchField("all");
            setCatalogCategory("All");
            setCatalogStatus("All");
          }}
          canReset={catalogQuery.trim() !== "" || searchField !== "all" || catalogCategory !== "All" || catalogStatus !== "All"}
          resultCount={filteredProducts.length}
          totalCount={products.length}
          loading={catalogLoading}
          filters={
            <>
              <FilterField label="Category" htmlFor="inv-catalog-category">
                <select
                  id="inv-catalog-category"
                  value={catalogCategory}
                  onChange={(e) => setCatalogCategory(e.target.value)}
                  className={filterControlClass}
                >
                  {catalogCategoryOptions.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
              </FilterField>
              <FilterField label="Status" htmlFor="inv-catalog-status">
                <select
                  id="inv-catalog-status"
                  value={catalogStatus}
                  onChange={(e) => setCatalogStatus(e.target.value as CatalogStatusFilter)}
                  className={filterControlClass}
                >
                  <option value="All">All statuses</option>
                  <option value="active">Active</option>
                  <option value="draft">Draft</option>
                  <option value="archived">Archived</option>
                </select>
              </FilterField>
            </>
          }
        />
      </div>

      <DataTable<CatalogProduct>
        caption="Catalog products with brand, category, price and status"
        columns={catalogColumns}
        rows={filteredProducts}
        rowKey={(p) => p.id}
        loading={catalogLoading}
        error={catalogError}
        emptyTitle="No products match the current filters"
        emptyDescription="Try clearing the search, category or status filter."
        selectable
        selectedKeys={selectedIds}
        onSelectionChange={setSelectedIds}
        storageKey="inventory-catalog"
        className="px-0"
      />
    </Card>
  );
}
