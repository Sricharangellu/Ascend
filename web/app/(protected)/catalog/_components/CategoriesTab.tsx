"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/Card";
import { TableSkeleton } from "@/components/TableSkeleton";
import { apiGet, apiPost, apiPatch, apiDelete, ApiResponseError } from "@/api-client/client";
import type { Category, CategoriesResponse } from "@/api-client/types";

export function CategoriesTab() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);

  const [newName, setNewName]         = useState("");
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
    try { await apiPost("/api/v1/catalog/categories", { name: newName.trim() }); setNewName(""); await load(); }
    catch (err) { setCreateError(err instanceof ApiResponseError ? err.message : "Create failed."); }
    finally { setCreating(false); }
  };

  const startEdit = (c: Category) => { setEditTarget(c); setEditName(c.name); setActionError(null); };

  const handleEditSave = async () => {
    if (!editTarget || !editName.trim()) return;
    setEditSaving(true); setActionError(null);
    try { await apiPatch(`/api/v1/catalog/categories/${editTarget.id}`, { name: editName.trim() }); setEditTarget(null); await load(); }
    catch (err) { setActionError(err instanceof ApiResponseError ? err.message : "Save failed."); }
    finally { setEditSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true); setActionError(null);
    try { await apiDelete(`/api/v1/catalog/categories/${deleteTarget.id}`); setDeleteTarget(null); await load(); }
    catch (err) { setActionError(err instanceof ApiResponseError ? err.message : "Delete failed."); }
    finally { setDeleting(false); }
  };

  if (loading) return <TableSkeleton headers={["Name", "Slug", "Products", ""]} rows={6} />;
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
                    <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus
                      className="min-h-[40px] flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600" />
                    <button type="button" onClick={handleEditSave} disabled={editSaving}
                      className="min-h-[40px] rounded-md bg-brand-600 px-3 py-2 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-60">
                      {editSaving ? "..." : "Save"}
                    </button>
                    <button type="button" onClick={() => setEditTarget(null)}
                      className="min-h-[40px] rounded-md border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100">Cancel</button>
                  </div>
                ) : (
                  <>
                    <span className="text-sm font-medium text-slate-950">{c.name}</span>
                    <div className="flex shrink-0 gap-2">
                      <button type="button" onClick={() => startEdit(c)}
                        className="min-h-[32px] rounded-md border border-slate-200 px-3 py-1 text-xs text-slate-700 hover:bg-slate-100">Edit</button>
                      <button type="button" onClick={() => { setDeleteTarget(c); setActionError(null); }}
                        className="min-h-[32px] rounded-md border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50">Delete</button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={handleCreate} className="flex items-center gap-2 border-t border-slate-200 px-4 py-3">
          <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New category name..."
            className="min-h-[40px] flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600" />
          <button type="submit" disabled={creating || !newName.trim()}
            className="min-h-[40px] rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">
            {creating ? "Adding..." : "Add"}
          </button>
        </form>
        {createError && <p className="px-4 pb-2 text-xs text-red-700">{createError}</p>}
      </Card>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDeleteTarget(null)}>
          <div className="w-full max-w-sm rounded-md bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-slate-950">Delete &ldquo;{deleteTarget.name}&rdquo;?</h2>
            <p className="mt-2 text-sm text-slate-600">Deleting a category won&apos;t remove products, but they will no longer be grouped under this category.</p>
            {actionError && <p className="mt-3 text-sm text-red-700">{actionError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteTarget(null)}
                className="min-h-[40px] rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
              <button type="button" onClick={handleDelete} disabled={deleting}
                className="min-h-[40px] rounded-md bg-danger-600 px-4 py-2 text-sm font-medium text-white hover:bg-danger-700 disabled:opacity-60">
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
