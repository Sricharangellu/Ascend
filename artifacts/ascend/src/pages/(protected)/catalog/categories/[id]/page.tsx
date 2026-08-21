
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "@/lib/router";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { apiGet, apiPost, apiPatch, apiDelete, ApiResponseError } from "@/api-client/client";
import { formatMoney } from "@/lib/money";
import { Badge } from "@/components/Badge";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SubCategory {
  id: string;
  name: string;
  product_count: number;
  slug: string;
}

interface CategoryDetail {
  id: string;
  name: string;
  parent_id: string | null;
  product_count: number;
  slug: string;
  sub_categories: SubCategory[];
}

interface Product {
  id: string;
  sku: string;
  name: string;
  price_cents: number;
  priceCents?: number;
  category: string;
  status: "active" | "draft" | "archived";
  stock_qty?: number;
  image_url?: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusBadge(s: string): "green" | "yellow" | "gray" {
  if (s === "active") return "green";
  if (s === "draft")  return "yellow";
  return "gray";
}

// ── Add Products Modal ────────────────────────────────────────────────────────

function AddProductsModal({
  categoryId,
  onClose,
  onAdded,
}: {
  categoryId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [q, setQ]                   = useState("");
  const [results, setResults]       = useState<Product[]>([]);
  const [searching, setSearching]   = useState(false);
  const [selected, setSelected]     = useState<Set<string>>(new Set());
  const [adding, setAdding]         = useState(false);
  const [addError, setAddError]     = useState<string | null>(null);

  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    const t = window.setTimeout(async () => {
      try {
        const data = await apiGet<{ items: Product[] }>(`/api/v1/catalog?q=${encodeURIComponent(q)}&limit=20`);
        setResults(data.items ?? []);
      } catch { /* noop */ }
      finally { setSearching(false); }
    }, 250);
    return () => window.clearTimeout(t);
  }, [q]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAdd = async () => {
    if (!selected.size) return;
    setAdding(true); setAddError(null);
    try {
      await apiPost(`/api/v1/catalog/categories/${categoryId}/products`, {
        productIds: [...selected],
      });
      onAdded();
      onClose();
    } catch (err) {
      setAddError(err instanceof ApiResponseError ? err.message : "Failed to add products.");
    } finally { setAdding(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex w-full max-w-lg flex-col rounded-2xl shadow-2xl"
        style={{ backgroundColor: "var(--color-surface)", maxHeight: "80vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--color-border)" }}>
          <h2 className="text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Add Products to Category</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 transition-colors hover:bg-[var(--color-surface-subtle)]"
            style={{ color: "var(--color-text-muted)" }}>
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/></svg>
          </button>
        </div>

        {/* Search */}
        <div className="border-b px-4 py-3" style={{ borderColor: "var(--color-border)" }}>
          <input
            autoFocus
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or SKU..."
            className="w-full rounded-xl border px-4 py-2.5 text-[13px] outline-none transition-all focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }}
          />
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {searching ? (
            <div className="space-y-2 p-4">
              {[1, 2, 3].map((i) => <div key={i} className="h-10 animate-skeleton rounded-lg" />)}
            </div>
          ) : results.length === 0 ? (
            <p className="py-10 text-center text-[13px]" style={{ color: "var(--color-text-muted)" }}>
              {q.trim() ? "No products found." : "Type to search products."}
            </p>
          ) : (
            <ul className="divide-y divide-[var(--color-table-border)] py-1">
              {results.map((p) => (
                <li key={p.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--color-table-row-hover)]">
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => toggle(p.id)}
                      className="h-4 w-4 rounded border text-brand-600 focus:ring-2 focus:ring-brand-500/20"
                      style={{ borderColor: "var(--color-border)" }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>{p.name}</p>
                      <p className="font-mono text-[11px]" style={{ color: "var(--color-text-muted)" }}>{p.sku}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>{formatMoney(p.price_cents ?? p.priceCents ?? 0)}</p>
                      <Badge variant={statusBadge(p.status)} size="sm">{p.status}</Badge>
                    </div>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t px-5 py-4" style={{ borderColor: "var(--color-border)" }}>
          {addError && <p className="text-[13px] text-red-600">{addError}</p>}
          {!addError && (
            <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
              {selected.size > 0 ? `${selected.size} product${selected.size > 1 ? "s" : ""} selected` : "Select products to add"}
            </p>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onClose}
              className="rounded-xl border px-4 py-2 text-[13px] font-medium transition-colors hover:bg-[var(--color-surface-subtle)]"
              style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}>
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleAdd()}
              disabled={selected.size === 0 || adding}
              className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-[#4849d0] disabled:opacity-40"
            >
              {adding ? "Adding…" : `Add ${selected.size > 0 ? selected.size : ""} Products`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Category Detail Page ──────────────────────────────────────────────────────

export default function CategoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [category, setCategory]     = useState<CategoryDetail | null>(null);
  const [catLoading, setCatLoading] = useState(true);
  const [catError, setCatError]     = useState<string | null>(null);

  const [products, setProducts]     = useState<Product[]>([]);
  const [prodLoading, setProdLoading] = useState(true);
  const [prodQ, setProdQ]           = useState("");

  const [showAddModal, setShowAddModal] = useState(false);
  const [removing, setRemoving]     = useState<string | null>(null);

  const [editing, setEditing]       = useState(false);
  const [editName, setEditName]     = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const loadCategory = useCallback(async () => {
    setCatLoading(true); setCatError(null);
    try {
      const c = await apiGet<CategoryDetail>(`/api/v1/catalog/categories/${id}`);
      setCategory(c);
      setEditName(c.name);
    } catch (err) {
      setCatError(err instanceof ApiResponseError ? err.message : "Category not found.");
    } finally { setCatLoading(false); }
  }, [id]);

  const loadProducts = useCallback(async () => {
    setProdLoading(true);
    try {
      const q = prodQ.trim() ? `?q=${encodeURIComponent(prodQ)}` : "";
      const data = await apiGet<{ items: Product[] }>(`/api/v1/catalog/categories/${id}/products${q}`);
      setProducts(data.items ?? []);
    } catch { /* noop */ }
    finally { setProdLoading(false); }
  }, [id, prodQ]);

  useEffect(() => { void loadCategory(); }, [loadCategory]);
  useEffect(() => { void loadProducts(); }, [loadProducts]);

  const handleRemoveProduct = async (productId: string) => {
    setRemoving(productId);
    try {
      await apiDelete(`/api/v1/catalog/categories/${id}/products/${productId}`);
      setProducts((prev) => prev.filter((p) => p.id !== productId));
      setCategory((prev) => prev ? { ...prev, product_count: Math.max(0, prev.product_count - 1) } : prev);
    } catch { /* noop */ }
    finally { setRemoving(null); }
  };

  const handleEditSave = async () => {
    if (!editName.trim() || !category) return;
    setEditSaving(true);
    try {
      await apiPatch(`/api/v1/catalog/categories/${id}`, { name: editName.trim() });
      setCategory((prev) => prev ? { ...prev, name: editName.trim() } : prev);
      setEditing(false);
    } catch { /* noop */ }
    finally { setEditSaving(false); }
  };

  if (catLoading) {
    return (
      <EnterpriseShell active="catalog" title="Category" subtitle="Categories" contentClassName="overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-5 sm:px-6">
          <div className="h-8 w-64 animate-skeleton rounded-lg" />
          <div className="h-32 animate-skeleton rounded-2xl" />
        </div>
      </EnterpriseShell>
    );
  }

  if (catError || !category) {
    return (
      <EnterpriseShell active="catalog" title="Category" subtitle="Categories" contentClassName="overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
          <p className="text-sm text-red-700">{catError ?? "Category not found."}</p>
          <button type="button" onClick={() => router.push("/catalog")}
            className="mt-4 text-sm font-medium text-brand-600 hover:underline">← Back to Catalog</button>
        </div>
      </EnterpriseShell>
    );
  }

  return (
    <EnterpriseShell
      active="catalog"
      title={category.name}
      subtitle="Categories"
      contentClassName="overflow-y-auto"
    >
      <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-5 sm:px-6">

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-[13px]" style={{ color: "var(--color-text-muted)" }}>
          <button type="button" onClick={() => router.push("/catalog")} className="hover:text-brand-600 transition-colors">Catalog</button>
          <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none"><path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          <button type="button" onClick={() => router.push("/catalog")} className="hover:text-brand-600 transition-colors">Categories</button>
          <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none"><path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          <span className="font-medium" style={{ color: "var(--color-text-primary)" }}>{category.name}</span>
        </nav>

        {/* Category header */}
        <div className="flex items-start justify-between gap-4 rounded-2xl border p-5 shadow-[var(--shadow-sm)]"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600/10 text-2xl font-bold text-brand-600">
              {category.name.charAt(0).toUpperCase()}
            </div>
            <div>
              {editing ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void handleEditSave(); if (e.key === "Escape") setEditing(false); }}
                    className="rounded-xl border px-3 py-1.5 text-lg font-bold outline-none transition-all focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                    style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }}
                  />
                  <button type="button" onClick={() => void handleEditSave()} disabled={editSaving}
                    className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#4849d0] disabled:opacity-40">
                    {editSaving ? "Saving…" : "Save"}
                  </button>
                  <button type="button" onClick={() => { setEditing(false); setEditName(category.name); }}
                    className="rounded-lg border px-3 py-1.5 text-[13px] transition-colors hover:bg-[var(--color-surface-subtle)]"
                    style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}>Cancel</button>
                </div>
              ) : (
                <h1 className="text-xl font-bold" style={{ color: "var(--color-text-primary)" }}>{category.name}</h1>
              )}
              {category.parent_id && (
                <p className="mt-0.5 text-[12px]" style={{ color: "var(--color-text-muted)" }}>Sub-category</p>
              )}
            </div>
          </div>

          {/* Actions */}
          {!editing && (
            <div className="flex shrink-0 gap-2">
              <button type="button" onClick={() => setEditing(true)}
                className="rounded-xl border px-3 py-2 text-[13px] font-medium transition-colors hover:bg-[var(--color-surface-subtle)]"
              style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}>
                Rename
              </button>
            </div>
          )}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border p-4 shadow-[var(--shadow-sm)]"
            style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.07em]" style={{ color: "var(--color-text-muted)" }}>Products</p>
            <p className="mt-1 text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>{category.product_count}</p>
          </div>
          <div className="rounded-2xl border p-4 shadow-[var(--shadow-sm)]"
            style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.07em]" style={{ color: "var(--color-text-muted)" }}>Sub-categories</p>
            <p className="mt-1 text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>{category.sub_categories.length}</p>
          </div>
        </div>

        {/* Sub-categories (if any) */}
        {category.sub_categories.length > 0 && (
          <div className="overflow-hidden rounded-2xl border shadow-[var(--shadow-sm)]"
            style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
            <div className="border-b px-5 py-3.5" style={{ borderColor: "var(--color-border)" }}>
              <h2 className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Sub-categories</h2>
            </div>
            <ul className="divide-y divide-[var(--color-table-border)]">
              {category.sub_categories.map((sub) => (
                <li key={sub.id}>
                  <button type="button" onClick={() => router.push(`/catalog/categories/${sub.id}`)}
                    className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-[var(--color-table-row-hover)]">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg text-[13px] font-bold"
                      style={{ backgroundColor: "var(--color-surface-subtle)", color: "var(--color-text-secondary)" }}>
                      {sub.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="flex-1 text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>{sub.name}</span>
                    <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>{sub.product_count} products</span>
                    <svg className="h-4 w-4" style={{ color: "var(--color-text-muted)" }} viewBox="0 0 16 16" fill="none">
                      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Products section */}
        <div className="overflow-hidden rounded-2xl border shadow-[var(--shadow-sm)]"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
          {/* Section header */}
          <div className="flex items-center justify-between border-b px-5 py-3.5" style={{ borderColor: "var(--color-border)" }}>
            <div className="flex items-center gap-3">
              <h2 className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Products in this category</h2>
              <span className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                style={{ backgroundColor: "var(--color-surface-subtle)", color: "var(--color-text-secondary)" }}>
                {products.length}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-[#4849d0] transition-colors"
            >
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              Add Products
            </button>
          </div>

          {/* Search bar */}
          <div className="border-b px-4 py-3" style={{ borderColor: "var(--color-border)" }}>
            <div className="relative">
              <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--color-text-muted)" }} viewBox="0 0 16 16" fill="none">
                <circle cx="6.5" cy="6.5" r="4" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <input
                type="text"
                value={prodQ}
                onChange={(e) => setProdQ(e.target.value)}
                placeholder="Search products in this category..."
                className="w-full rounded-xl border py-2 pl-9 pr-4 text-[13px] outline-none transition-all focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }}
              />
            </div>
          </div>

          {/* Table */}
          {prodLoading ? (
            <div className="space-y-2 p-4">
              {[1, 2, 3, 4].map((i) => <div key={i} className="h-12 animate-skeleton rounded-lg" />)}
            </div>
          ) : products.length === 0 ? (
            <div className="py-14 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full"
                style={{ backgroundColor: "var(--color-surface-subtle)" }}>
                <svg className="h-6 w-6" style={{ color: "var(--color-text-muted)" }} viewBox="0 0 24 24" fill="none">
                  <path d="M20 7H4a1 1 0 00-1 1v11a1 1 0 001 1h16a1 1 0 001-1V8a1 1 0 00-1-1z" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M16 3H8a1 1 0 00-1 1v3h10V4a1 1 0 00-1-1z" stroke="currentColor" strokeWidth="1.5"/>
                </svg>
              </div>
              <p className="text-[13px] font-medium" style={{ color: "var(--color-text-secondary)" }}>
                {prodQ.trim() ? "No products match your search." : "No products in this category yet."}
              </p>
              {!prodQ.trim() && (
                <button type="button" onClick={() => setShowAddModal(true)}
                  className="mt-3 text-sm font-medium text-brand-600 hover:underline">
                  Add products →
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] font-semibold uppercase tracking-[0.07em]"
                    style={{ backgroundColor: "var(--color-table-header)", borderBottom: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}>
                    <th className="px-5 py-3">Product</th>
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3 text-right">Price</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-table-border)]">
                  {products.map((p) => (
                    <tr key={p.id}
                      className="group cursor-pointer transition-colors hover:bg-[var(--color-table-row-hover)]"
                      onClick={() => router.push(`/catalog/${p.id}`)}>
                      <td className="px-5 py-3.5">
                        <p className="font-medium transition-colors group-hover:text-brand-600"
                          style={{ color: "var(--color-text-primary)" }}>{p.name}</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="font-mono text-[11px]" style={{ color: "var(--color-text-muted)" }}>{p.sku}</span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <span className="font-semibold" style={{ color: "var(--color-text-primary)" }}>{formatMoney(p.price_cents ?? p.priceCents ?? 0)}</span>
                      </td>
                      <td className="px-4 py-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                        <Badge variant={statusBadge(p.status)} size="sm">{p.status}</Badge>
                      </td>
                      <td className="px-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <button type="button" onClick={() => void handleRemoveProduct(p.id)}
                          disabled={removing === p.id}
                          className="rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                          style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}>
                          {removing === p.id ? "…" : "Remove"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showAddModal && (
        <AddProductsModal
          categoryId={id}
          onClose={() => setShowAddModal(false)}
          onAdded={() => { void loadCategory(); void loadProducts(); }}
        />
      )}
    </EnterpriseShell>
  );
}
