
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "@/lib/router";
import { apiGet, apiPost, ApiResponseError } from "@/api-client/client";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Category {
  id: string;
  name: string;
  parent_id: string | null;
  slug?: string;
  product_count?: number;
}

// ── CategoriesTab ─────────────────────────────────────────────────────────────

export function CategoriesTab({ productId }: { productId: string }) {
  const router = useRouter();

  const [allCats, setAllCats]     = useState<Category[]>([]);
  const [selected, setSelected]   = useState<Set<string>>(new Set());
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [newCatName, setNewCatName] = useState("");
  const [newParent, setNewParent]   = useState("");
  const [creating, setCreating]     = useState(false);
  const [showForm, setShowForm]     = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [allRes, assignedRes] = await Promise.all([
        apiGet<{ items: Category[] }>("/api/v1/catalog/categories"),
        apiGet<{ items: Category[] }>(`/api/v1/catalog/${productId}/categories`),
      ]);
      setAllCats(allRes.items ?? []);
      setSelected(new Set((assignedRes.items ?? []).map((c) => c.id)));
    } catch { /* noop */ }
    finally { setLoading(false); }
  }, [productId]);

  useEffect(() => { void load(); }, [load]);

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
    setSaving(true); setSaveError(null);
    try {
      await apiPost(`/api/v1/catalog/${productId}/categories`, {
        categoryIds: [...selected],
      });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setSaveError(err instanceof ApiResponseError ? err.message : "Save failed.");
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
      setAllCats((prev) => [...prev, created]);
      setSelected((prev) => new Set([...prev, created.id]));
      setNewCatName(""); setNewParent(""); setShowForm(false);
      setSaved(false);
    } catch (e) {
      setSaveError(e instanceof ApiResponseError ? e.message : "Failed to create category.");
    } finally { setCreating(false); }
  };

  const roots    = allCats.filter((c) => !c.parent_id);
  const children = allCats.filter((c) => !!c.parent_id);
  const assigned = allCats.filter((c) => selected.has(c.id));

  return (
    <div className="space-y-4">

      {/* Current assignment chips */}
      <div className="rounded-xl border px-4 py-3 shadow-[var(--shadow-sm)]"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
        <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>Assigned categories</p>
        {assigned.length === 0 ? (
          <p className="mt-1 text-[13px] italic" style={{ color: "var(--color-text-muted)" }}>None — select categories below</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {assigned.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => router.push(`/catalog/categories/${c.id}`)}
                className="flex items-center gap-1.5 rounded-full border border-brand-600/20 bg-brand-600/8 px-2.5 py-0.5 text-xs font-medium text-brand-600 hover:bg-brand-600/15 transition-colors"
              >
                {c.name}
                <svg className="h-3 w-3 opacity-60" viewBox="0 0 12 12" fill="none">
                  <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Category tree */}
      <div className="overflow-hidden rounded-xl border shadow-[var(--shadow-sm)]"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--color-border)" }}>
          <p className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Select categories</p>
          <button type="button" onClick={() => setShowForm((v) => !v)}
            className="text-[12px] font-medium text-brand-600 hover:underline">
            + New category
          </button>
        </div>

        {showForm && (
          <div className="flex items-end gap-2 border-b px-4 py-3"
            style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-subtle)" }}>
            <div className="flex-1">
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.08em]"
                style={{ color: "var(--color-text-secondary)" }}>Name</label>
              <input type="text" value={newCatName} onChange={(e) => setNewCatName(e.target.value)}
                placeholder="Category name"
                className="w-full rounded-lg border px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }}
                onKeyDown={(e) => { if (e.key === "Enter") void handleCreateCategory(); if (e.key === "Escape") setShowForm(false); }} />
            </div>
            <div className="w-40">
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.08em]"
                style={{ color: "var(--color-text-secondary)" }}>Parent (optional)</label>
              <select value={newParent} onChange={(e) => setNewParent(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-brand-500/20"
                style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }}>
                <option value="">— None —</option>
                {roots.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <button type="button" onClick={() => void handleCreateCategory()} disabled={creating}
              className="whitespace-nowrap rounded-lg bg-brand-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#4849d0] disabled:opacity-40 transition-colors">
              {creating ? "…" : "Create"}
            </button>
          </div>
        )}

        {loading ? (
          <div className="space-y-2 p-4">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-8 animate-skeleton rounded-lg" />)}
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-table-border)] py-1">
            {roots.map((root) => {
              const subs = children.filter((c) => c.parent_id === root.id);
              return (
                <div key={root.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--color-table-row-hover)]">
                    <input type="checkbox" className="h-4 w-4 rounded accent-brand-600"
                      checked={selected.has(root.id)} onChange={() => toggleCat(root.id)} />
                    <span className="flex-1 text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>{root.name}</span>
                    {root.product_count != null && (
                      <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>{root.product_count} products</span>
                    )}
                  </label>
                  {subs.map((sub) => (
                    <label key={sub.id} className="flex cursor-pointer items-center gap-3 py-2 pl-10 pr-4 transition-colors hover:bg-[var(--color-table-row-hover)]">
                      <input type="checkbox" className="h-4 w-4 rounded accent-brand-600"
                        checked={selected.has(sub.id)} onChange={() => toggleCat(sub.id)} />
                      <span className="flex-1 text-[13px]" style={{ color: "var(--color-text-secondary)" }}>{sub.name}</span>
                      {sub.product_count != null && (
                        <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>{sub.product_count} products</span>
                      )}
                    </label>
                  ))}
                </div>
              );
            })}
            {allCats.length === 0 && (
              <p className="px-4 py-8 text-center text-[13px]" style={{ color: "var(--color-text-muted)" }}>No categories yet. Create one above.</p>
            )}
          </div>
        )}
      </div>

      {saveError && <p className="text-[13px]" style={{ color: "var(--color-danger-text)" }}>{saveError}</p>}
      <div className="flex items-center justify-end gap-3">
        {saved && <span className="text-[13px] font-medium text-emerald-600">Saved</span>}
        <button type="button" onClick={() => void handleSave()} disabled={saving}
          className="rounded-xl bg-brand-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-[#4849d0] disabled:opacity-40 transition-colors">
          {saving ? "Saving…" : "Save categories"}
        </button>
      </div>
    </div>
  );
}
