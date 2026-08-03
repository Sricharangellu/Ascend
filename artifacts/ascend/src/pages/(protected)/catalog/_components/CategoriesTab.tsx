
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "@/lib/router";
import { Card } from "@/components/Card";
import { TableSkeleton } from "@/components/TableSkeleton";
import { apiGet, apiPost, apiPatch, apiDelete, ApiResponseError } from "@/api-client/client";
import type { Category, CategoriesResponse } from "@/api-client/types";

export function CategoriesTab() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);

  const [newName, setNewName]         = useState("");
  const [newParent, setNewParent]     = useState("");
  const [creating, setCreating]       = useState(false);
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
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true); setCreateError(null);
    try {
      await apiPost("/api/v1/catalog/categories", { name: newName.trim(), parent_id: newParent || null });
      setNewName(""); setNewParent("");
      await load();
    } catch (err) {
      setCreateError(err instanceof ApiResponseError ? err.message : "Create failed.");
    } finally { setCreating(false); }
  };

  const startEdit = (c: Category) => { setEditTarget(c); setEditName(c.name); setActionError(null); };

  const handleEditSave = async () => {
    if (!editTarget || !editName.trim()) return;
    setEditSaving(true); setActionError(null);
    try {
      await apiPatch(`/api/v1/catalog/categories/${editTarget.id}`, { name: editName.trim() });
      setEditTarget(null);
      await load();
    } catch (err) {
      setActionError(err instanceof ApiResponseError ? err.message : "Save failed.");
    } finally { setEditSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true); setActionError(null);
    try {
      await apiDelete(`/api/v1/catalog/categories/${deleteTarget.id}`);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setActionError(err instanceof ApiResponseError ? err.message : "Delete failed.");
    } finally { setDeleting(false); }
  };

  if (loading) return <TableSkeleton headers={["Name", "Products", "Sub-categories", ""]} rows={6} />;
  if (error)   return <p role="alert" className="py-6 text-sm text-red-700">{error}</p>;

  const roots    = categories.filter((c) => !c.parent_id);
  const children = categories.filter((c) => !!c.parent_id);

  return (
    <>
      <div
        className="overflow-hidden rounded-xl border shadow-[var(--shadow-sm)]"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-subtle)" }}>
          <div>
            <h2 className="text-[14px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Product categories</h2>
            <p className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
              {categories.length} {categories.length === 1 ? "category" : "categories"}
            </p>
          </div>
        </div>

        {actionError && (
          <div className="border-b px-4 py-2 text-[13px]"
            style={{ borderColor: "var(--color-danger-border)", backgroundColor: "var(--color-danger-bg)", color: "var(--color-danger-text)" }}>
            {actionError}
          </div>
        )}

        {categories.length === 0 ? (
          <div className="px-4 py-10 text-center text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
            No categories yet. Add one below.
          </div>
        ) : (
          <ul style={{ borderColor: "var(--color-border)" }}>
            {roots.map((root) => {
              const subs = children.filter((c) => c.parent_id === root.id);
              return (
                <li key={root.id} className="border-b last:border-0" style={{ borderColor: "var(--color-border)" }}>
                  {/* Root category row */}
                  <div className="flex items-center gap-3 px-4 py-3 transition-colors duration-75"
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--color-table-row-hover)")}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "")}>
                    {editTarget?.id === root.id ? (
                      <div className="flex flex-1 items-center gap-2">
                        <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus
                          className="h-8 flex-1 rounded-lg border px-3 text-[13px] outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }} />
                        <button type="button" onClick={handleEditSave} disabled={editSaving}
                          className="h-8 rounded-lg bg-brand-600 px-3 text-[12px] font-medium text-white hover:bg-brand-700 disabled:opacity-60">
                          {editSaving ? "…" : "Save"}
                        </button>
                        <button type="button" onClick={() => setEditTarget(null)}
                          className="h-8 rounded-lg border px-3 text-[12px] font-medium transition-colors hover:bg-[var(--color-surface-subtle)]"
                          style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}>Cancel</button>
                      </div>
                    ) : (
                      <>
                        <button type="button" onClick={() => router.push(`/catalog/categories/${root.id}`)}
                          className="flex flex-1 items-center gap-3 text-left">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600/10 text-[13px] font-bold text-brand-600">
                            {root.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-semibold transition-colors hover:text-brand-600"
                              style={{ color: "var(--color-text-primary)" }}>{root.name}</p>
                            {subs.length > 0 && (
                              <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                                {subs.length} sub-{subs.length === 1 ? "category" : "categories"}
                              </p>
                            )}
                          </div>
                          <span className="shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                            style={{ backgroundColor: "var(--color-surface-subtle)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}>
                            {root.product_count ?? 0} products
                          </span>
                        </button>
                        <div className="flex shrink-0 gap-2">
                          <button type="button" onClick={() => startEdit(root)}
                            className="h-7 rounded-md border px-2.5 text-[11px] font-medium transition-colors hover:bg-[var(--color-surface-subtle)]"
                            style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}>Edit</button>
                          <button type="button" onClick={() => { setDeleteTarget(root); setActionError(null); }}
                            className="h-7 rounded-md border border-danger-200 px-2.5 text-[11px] font-medium text-danger-600 transition-colors hover:bg-danger-50">Delete</button>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Sub-category rows */}
                  {subs.map((sub) => (
                    <div key={sub.id} className="flex items-center gap-3 border-t py-2 pl-14 pr-4 transition-colors duration-75"
                      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-subtle)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--color-table-row-hover)")}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--color-surface-subtle)")}>
                      {editTarget?.id === sub.id ? (
                        <div className="flex flex-1 items-center gap-2">
                          <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus
                            className="h-7 flex-1 rounded-lg border px-3 text-[12px] outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                            style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }} />
                          <button type="button" onClick={handleEditSave} disabled={editSaving}
                            className="h-7 rounded-md bg-brand-600 px-2.5 text-[11px] font-medium text-white hover:bg-brand-700 disabled:opacity-60">
                            {editSaving ? "…" : "Save"}
                          </button>
                          <button type="button" onClick={() => setEditTarget(null)}
                            className="h-7 rounded-md border px-2.5 text-[11px] font-medium"
                            style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}>Cancel</button>
                        </div>
                      ) : (
                        <>
                          <button type="button" onClick={() => router.push(`/catalog/categories/${sub.id}`)}
                            className="flex flex-1 items-center gap-2 text-left">
                            <svg className="h-3 w-3 shrink-0" viewBox="0 0 16 16" fill="none"
                              style={{ color: "var(--color-text-muted)" }}>
                              <path d="M2 4h4v8H2V4z" fill="currentColor" opacity=".3"/>
                              <path d="M7 8h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                            </svg>
                            <span className="flex-1 text-[12px] transition-colors hover:text-brand-600"
                              style={{ color: "var(--color-text-secondary)" }}>{sub.name}</span>
                            <span className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold"
                              style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-muted)" }}>
                              {sub.product_count ?? 0} products
                            </span>
                          </button>
                          <div className="flex shrink-0 gap-1.5">
                            <button type="button" onClick={() => startEdit(sub)}
                              className="h-6 rounded border px-2 text-[10px] font-medium"
                              style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}>Edit</button>
                            <button type="button" onClick={() => { setDeleteTarget(sub); setActionError(null); }}
                              className="h-6 rounded border border-danger-200 px-2 text-[10px] font-medium text-danger-600 hover:bg-danger-50">Delete</button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </li>
              );
            })}
          </ul>
        )}

        {/* Add category form */}
        <form onSubmit={handleCreate} className="flex items-center gap-2 border-t px-4 py-3"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-subtle)" }}>
          <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New category name…"
            className="h-8 flex-1 rounded-lg border px-3 text-[13px] outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }} />
          <select value={newParent} onChange={(e) => setNewParent(e.target.value)}
            className="h-8 rounded-lg border px-3 text-[13px] outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-secondary)" }}>
            <option value="">No parent</option>
            {roots.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <button type="submit" disabled={creating || !newName.trim()}
            className="h-8 rounded-lg bg-brand-600 px-4 text-[13px] font-medium text-white hover:bg-brand-700 disabled:opacity-60">
            {creating ? "Adding…" : "Add category"}
          </button>
        </form>
        {createError && (
          <p className="border-t px-4 pb-3 pt-2 text-[12px]"
            style={{ borderColor: "var(--color-border)", color: "var(--color-danger-text)" }}>{createError}</p>
        )}
      </div>

      {/* Delete confirm modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={() => setDeleteTarget(null)}>
          <div className="w-full max-w-sm rounded-2xl p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}
            style={{ backgroundColor: "var(--color-surface)" }}>
            <h2 className="text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Delete &ldquo;{deleteTarget.name}&rdquo;?
            </h2>
            <p className="mt-2 text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
              Products will not be deleted but will no longer be linked to this category.
            </p>
            {actionError && (
              <p className="mt-3 text-[12px]" style={{ color: "var(--color-danger-text)" }}>{actionError}</p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteTarget(null)}
                className="h-8 rounded-lg border px-4 text-[13px] font-medium transition-colors hover:bg-[var(--color-surface-subtle)]"
                style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}>Cancel</button>
              <button type="button" onClick={handleDelete} disabled={deleting}
                className="h-8 rounded-lg bg-danger-600 px-4 text-[13px] font-medium text-white hover:bg-danger-700 disabled:opacity-60">
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
