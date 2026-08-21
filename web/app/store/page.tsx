"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet } from "@/api-client/client";
import { formatMoney } from "@/lib/money";
import type { CatalogProduct } from "@/api-client/types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProductGroup {
  master: CatalogProduct;
  variants: CatalogProduct[];
  isStandalone: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * One group per top-level product.
 *
 * `isStandalone` reads the row's own `variant_count` rather than counting
 * children present in the same response: the grid requests top-level products
 * only, so a master's children are never in the payload and counting them would
 * make every master look standalone (and label its button "View product"
 * instead of "Select variant"). Any child that does arrive — a caller that
 * didn't pass `topLevel` — is still grouped under its parent.
 */
function groupProducts(products: CatalogProduct[]): ProductGroup[] {
  const masters   = products.filter((p) => !p.parent_product_id);
  const childMap  = new Map<string, CatalogProduct[]>();
  products.filter((p) => !!p.parent_product_id).forEach((p) => {
    const arr = childMap.get(p.parent_product_id!) ?? [];
    arr.push(p);
    childMap.set(p.parent_product_id!, arr);
  });
  return masters.map((m) => ({
    master: m,
    variants: childMap.get(m.id) ?? [],
    isStandalone: (m.variant_count ?? (childMap.get(m.id) ?? []).length) === 0,
  }));
}

// ── Product card ──────────────────────────────────────────────────────────────

function ProductCard({ group }: { group: ProductGroup }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [variants, setVariants] = useState<CatalogProduct[]>(group.variants);
  const [loadingVariants, setLoadingVariants] = useState(false);
  const { master, isStandalone } = group;
  const variantCount = master.variant_count ?? group.variants.length;

  /**
   * Fetch this master's variants the first time the shopper opens the list.
   *
   * The grid asks the API for top-level products only, so variants no longer
   * ride along in the page payload — which is what previously made a variant
   * whose master fell on another page vanish from browse entirely. Loading them
   * on demand keeps the pills without pulling every variant in the catalog into
   * the grid request.
   */
  const toggleVariants = async () => {
    const next = !expanded;
    setExpanded(next);
    if (!next || variants.length > 0 || loadingVariants) return;
    setLoadingVariants(true);
    try {
      const res = await apiGet<{ items: CatalogProduct[] }>(`/api/v1/catalog/${master.id}/variants`);
      setVariants(res.items ?? []);
    } catch {
      setExpanded(false); // nothing to show; leave the card as it was
    } finally {
      setLoadingVariants(false);
    }
  };

  const minPrice = variants.length > 0
    ? Math.min(master.price_cents, ...variants.map((v) => v.price_cents))
    : master.price_cents;
  const maxPrice = variants.length > 0
    ? Math.max(master.price_cents, ...variants.map((v) => v.price_cents))
    : master.price_cents;
  const priceRange = minPrice === maxPrice
    ? formatMoney(minPrice)
    : `${formatMoney(minPrice)} – ${formatMoney(maxPrice)}`;

  return (
    <article className="group relative flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-all overflow-hidden">
      {/* Image / placeholder */}
      <div
        className="relative aspect-[4/3] cursor-pointer bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center overflow-hidden"
        onClick={() => router.push(`/store/${master.id}`)}
      >
        {master.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={master.image_url} alt={master.name} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
        ) : (
          <svg className="h-14 w-14 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 10V7" />
          </svg>
        )}
        {/* Variant count badge — from the row's own variant_count, so it is
            right whether or not the variants have been fetched yet. */}
        {variantCount > 0 && (
          <div className="absolute top-2 right-2 rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-bold text-white shadow">
            {variantCount} variant{variantCount === 1 ? "" : "s"}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div>
          <p className="text-xs text-slate-400 uppercase tracking-wide">{master.category}</p>
          <h2
            className="mt-0.5 text-sm font-semibold text-[#111] leading-snug cursor-pointer hover:text-brand-600 transition-colors line-clamp-2"
            onClick={() => router.push(`/store/${master.id}`)}
          >
            {master.name}
          </h2>
          <p className="mt-0.5 font-mono text-[11px] text-slate-400">{master.sku}</p>
        </div>

        <p className="text-base font-bold text-[#111]">{priceRange}</p>

        {/* Variant pills preview */}
        {variantCount > 0 && (
          <div>
            <button
              type="button"
              onClick={() => void toggleVariants()}
              aria-expanded={expanded}
              className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
            >
              {expanded ? "Hide" : "Show"} variants
              <svg aria-hidden="true" className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {expanded && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {loadingVariants && <span className="text-xs text-slate-400">Loading variants…</span>}
                {variants.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => router.push(`/store/${v.id}`)}
                    className="rounded-full border border-brand-600/30 bg-brand-600/5 px-2.5 py-0.5 text-xs font-medium text-brand-600 hover:bg-brand-600 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                    title={v.name}
                  >
                    {v.variant_label ?? v.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* CTA */}
        <div className="mt-auto pt-2">
          <button
            type="button"
            onClick={() => router.push(`/store/${master.id}`)}
            className="w-full rounded-xl bg-brand-600 py-2 text-sm font-semibold text-white hover:bg-[#4849d0] transition-colors"
          >
            {isStandalone ? "View product" : "Select variant"}
          </button>
        </div>
      </div>
    </article>
  );
}

// ── Store page ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 48;

/**
 * Storefront product discovery.
 *
 * Search and category are resolved by the API. They used to run in the browser
 * over a single `limit=200` fetch, which meant a shopper searching for the
 * 201st product got "No products found" — the catalog was there, the page just
 * had never asked for it. Category pills had the same ceiling: they listed only
 * the categories present in whatever 200 rows came back.
 */
export default function StorePage() {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [q, setQ]               = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [category, setCategory] = useState("all");
  const [categories, setCategories] = useState<string[]>(["all"]);
  const [page, setPage]         = useState(0);
  // Bumped by the error state's retry. A plain `setPage(p => p)` would be a
  // no-op — React bails out on an identical value, so the fetch never re-ran.
  const [reloadToken, setReloadToken] = useState(0);

  // Debounced so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => { setPage(0); }, [debouncedQ, category]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    // Deliberately NOT filtered to `ecommerce=1`: products default to that flag
    // unset, so scoping the storefront to it would empty the shop. Whether the
    // storefront should show only online-flagged products is a merchandising
    // decision, not something to change while fixing discovery.
    const params = new URLSearchParams({
      status: "active",
      // One card per product family: masters and standalone products, never a
      // loose child variant. Grouping children under a parent that paging put
      // on another page would drop the child from browse entirely.
      topLevel: "true",
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
    });
    if (debouncedQ) params.set("q", debouncedQ);
    if (category !== "all") params.set("category", category);

    apiGet<{ items: CatalogProduct[]; total: number }>(`/api/v1/catalog?${params}`)
      .then((r) => {
        if (cancelled) return;
        setProducts(r.items ?? []);
        setTotal(r.total ?? 0);
      })
      .catch(() => { if (!cancelled) setError("We couldn't load products just now. Please try again."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [debouncedQ, category, page, reloadToken]);

  // Category pills come from the catalog's own facets, so they cover every
  // category in the store rather than only those on the first page.
  useEffect(() => {
    let cancelled = false;
    apiGet<{ category: { value: string }[] }>("/api/v1/catalog/facets?status=active")
      .then((f) => { if (!cancelled) setCategories(["all", ...f.category.map((c) => c.value)]); })
      .catch(() => { /* pills degrade to "All"; the grid still works */ });
    return () => { cancelled = true; };
  }, []);

  const groups = useMemo(() => groupProducts(products), [products]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">

      {/* Search + filter */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#111]">Our Products</h1>
          <p className="mt-1 text-sm text-slate-500" aria-live="polite">
            {loading ? "Loading…" : `${total} product${total !== 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <svg className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35" strokeLinecap="round"/>
            </svg>
            <input
              type="search"
              aria-label="Search products"
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-4 text-sm shadow-sm focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
              placeholder="Search products…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Category pills */}
      <div className="mb-6 flex flex-wrap gap-2">
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategory(cat)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors capitalize ${
              category === cat
                ? "bg-brand-600 text-white"
                : "bg-white border border-slate-200 text-slate-600 hover:border-brand-600 hover:text-brand-600"
            }`}
          >
            {cat === "all" ? "All" : cat}
          </button>
        ))}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[1,2,3,4,5,6,7,8].map((i) => (
            <div key={i} className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
              <div className="aspect-[4/3] animate-pulse bg-slate-100" />
              <div className="space-y-2 p-4">
                <div className="h-4 w-3/4 animate-pulse rounded bg-slate-100" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100" />
                <div className="h-8 animate-pulse rounded-xl bg-slate-100 mt-4" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="py-20 text-center">
          <p className="text-slate-600">{error}</p>
          <button
            type="button"
            onClick={() => setReloadToken((t) => t + 1)}
            className="mt-4 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
          >
            Try again
          </button>
        </div>
      ) : groups.length === 0 ? (
        <div className="py-20 text-center">
          <p className="text-slate-400">
            {debouncedQ ? `No products match “${debouncedQ}”.` : "No products found."}
          </p>
          {(debouncedQ || category !== "all") && (
            <button
              type="button"
              onClick={() => { setQ(""); setCategory("all"); }}
              className="mt-4 text-sm font-medium text-brand-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
            >
              Clear search and filters
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {groups.map((g) => <ProductCard key={g.master.id} group={g} />)}
          </div>

          {/* Without this, everything past the first page was simply unreachable. */}
          {pageCount > 1 && (
            <nav className="mt-10 flex items-center justify-center gap-3" aria-label="Product pages">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
              >
                Previous
              </button>
              <span className="text-sm text-slate-500" aria-live="polite">Page {page + 1} of {pageCount}</span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={page >= pageCount - 1}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
              >
                Next
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
