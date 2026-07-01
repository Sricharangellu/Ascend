"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost, apiPatch, ApiResponseError } from "@/api-client/client";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Category {
  id: string;
  name: string;
  parent_id: string | null;
  slug?: string;
  product_count?: number;
}

// ── CategoriesTab ─────────────────────────────────────────────────────────────

export function CategoriesTab({
  productId,
  currentCategory,
  onCategoryChange,
}: {
  productId: string;
  currentCategory: string;
  onCategoryChange: (cat: string) => void;
}) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newParent, setNewParent] = useState("");
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    apiGet<{ items: Category[] }>("/api/v1/catalog/categories")
      .then((r) => {
        setCategories(r.items);
        // Pre-select the current category by name match
        const match = r.items.find((c) => c.name.toLowerCase() === currentCategory.toLowerCase());
        if (match) setSelected(new Set([match.id]));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [productId, currentCategory]);

  const toggleCat = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const selectedCats = categories.filter((c) => selected.has(c.id));
      await apiPatch(`/api/v1/catalog/${productId}`, {
        category: selectedCats.map((c) => c.name).join(", ") || currentCategory,
      });
      if (selectedCats.length > 0) {
        onCategoryChange(selectedCats[0]!.name);
      }
      setSaved(true);
      window.setTimeout(() => setSaved(false), 3000);
    } catch {
      /* noop */
    } finally { setSaving(false); }
  };

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) return;
    setCreating(true);
    try {
      const created = await apiPost<Category>("/api/v1/catalog/categories", {
        name: newCatName.trim(),
        parent_id: newParent || null,
      });
      setCategories((prev) => [...prev, created]);
      setSelected((prev) => new Set([...prev, created.id]));
      setNewCatName(""); setNewParent(""); setShowForm(false);
    } catch (e) {
      alert(e instanceof ApiResponseError ? e.message : "Failed to create category.");
    } finally { setCreating(false); }
  };

  // Group by parent
  const roots = categories.filter((c) => !c.parent_id);
  const children = categories.filter((c) => !!c.parent_id);

  return (
    <div className="space-y-4">

      {/* Current assignment display */}
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div>
          <p className="text-xs text-slate-400">Current category</p>
          <p className="mt-0.5 font-semibold text-[#111]">{currentCategory || "Uncategorized"}</p>
        </div>
        {selected.size > 0 && (
          <div className="flex flex-wrap gap-1.5 ml-4">
            {categories.filter((c) => selected.has(c.id)).map((c) => (
              <span key={c.id} className="rounded-full bg-[#5D5FEF]/10 px-2.5 py-0.5 text-xs font-medium text-[#5D5FEF]">
                {c.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Category tree */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-semibold text-[#111]">Assign Categories</p>
          <button type="button" onClick={() => setShowForm((v) => !v)}
            className="text-xs font-medium text-[#5D5FEF] hover:underline">
            + New category
          </button>
        </div>

        {/* New category form */}
        {showForm && (
          <div className="flex items-end gap-2 border-b border-slate-100 bg-[#5D5FEF]/5 px-4 py-3">
            <div className="flex-1">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Name</label>
              <input
                type="text"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="Category name"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#5D5FEF] focus:outline-none"
                onKeyDown={(e) => { if (e.key === "Enter") void handleCreateCategory(); if (e.key === "Escape") setShowForm(false); }}
              />
            </div>
            <div className="w-40">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Parent (optional)</label>
              <select value={newParent} onChange={(e) => setNewParent(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#5D5FEF] focus:outline-none">
                <option value="">— None —</option>
                {roots.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <button type="button" onClick={() => void handleCreateCategory()} disabled={creating}
              className="rounded-lg bg-[#5D5FEF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#4849d0] disabled:opacity-40 whitespace-nowrap">
              {creating ? "…" : "Create"}
            </button>
          </div>
        )}

        {loading ? (
          <div className="space-y-2 p-4">{[1, 2, 3, 4].map((i) => <div key={i} className="h-8 animate-pulse rounded bg-slate-100" />)}</div>
        ) : (
          <div className="divide-y divide-slate-50 py-1">
            {roots.map((root) => {
              const subs = children.filter((c) => c.parent_id === root.id);
              return (
                <div key={root.id}>
                  {/* Root category row */}
                  <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-[#5D5FEF] focus:ring-[#5D5FEF]"
                      checked={selected.has(root.id)}
                      onChange={() => toggleCat(root.id)}
                    />
                    <span className="flex-1 text-sm font-medium text-[#111]">{root.name}</span>
                    {root.product_count != null && (
                      <span className="text-[11px] text-slate-400">{root.product_count} products</span>
                    )}
                  </label>
                  {/* Sub-categories */}
                  {subs.map((sub) => (
                    <label key={sub.id} className="flex cursor-pointer items-center gap-3 py-2 pl-10 pr-4 hover:bg-slate-50">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-[#5D5FEF] focus:ring-[#5D5FEF]"
                        checked={selected.has(sub.id)}
                        onChange={() => toggleCat(sub.id)}
                      />
                      <span className="flex-1 text-sm text-slate-600">{sub.name}</span>
                      {sub.product_count != null && (
                        <span className="text-[11px] text-slate-400">{sub.product_count} products</span>
                      )}
                    </label>
                  ))}
                </div>
              );
            })}
            {categories.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-slate-400">No categories yet. Create one above.</p>
            )}
          </div>
        )}
      </div>

      {/* Save */}
      <div className="flex items-center justify-end gap-3">
        {saved && <span className="text-sm font-medium text-emerald-600">Saved</span>}
        <button type="button" onClick={() => void handleSave()} disabled={saving}
          className="rounded-lg bg-[#5D5FEF] px-5 py-2 text-sm font-semibold text-white hover:bg-[#4849d0] disabled:opacity-40">
          {saving ? "Saving…" : "Save categories"}
        </button>
      </div>
    </div>
  );
}
