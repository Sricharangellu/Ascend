"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { apiGet, apiPut, ApiResponseError } from "@/api-client/client";
import type { CatalogCategoriesResponse, CatalogCategory } from "@/api-client/types";

export function CategoriesTab({ productId }: { productId: string }) {
  const [allCategories, setAllCategories] = useState<CatalogCategory[]>([]);
  const [assigned, setAssigned] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    Promise.all([
      apiGet<CatalogCategoriesResponse>("/api/v1/catalog/categories", { signal: controller.signal }),
      apiGet<CatalogCategoriesResponse>(`/api/v1/catalog/${productId}/categories`, { signal: controller.signal }),
    ])
      .then(([all, assignedCats]) => {
        setAllCategories(all.items);
        setAssigned(new Set(assignedCats.items.map((c) => c.id)));
        setError(null);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof ApiResponseError ? err.message : "Could not load categories.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [productId]);

  function toggleCategory(id: string) {
    setAssigned((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      await apiPut(`/api/v1/catalog/${productId}/categories`, { categoryIds: Array.from(assigned) });
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof ApiResponseError ? err.message : "Save failed.");
    } finally { setSaving(false); }
  }

  if (loading) return <div className="p-6 text-sm text-slate-500">Loading...</div>;
  if (error) return <div className="p-6 text-sm text-danger-700" role="alert">{error}</div>;

  const roots = allCategories.filter((c) => !c.parent_id);
  const children = (parentId: string) => allCategories.filter((c) => c.parent_id === parentId);

  return (
    <div className="flex flex-col gap-5">
      <Card title="Assign categories">
        {allCategories.length === 0 ? (
          <p className="text-sm text-slate-500">No categories defined yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {roots.map((root) => (
              <div key={root.id}>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={assigned.has(root.id)} onChange={() => toggleCategory(root.id)}
                    className="h-4 w-4 rounded border-slate-300 text-slate-950 focus:ring-slate-950" />
                  <span className="font-medium text-slate-800">{root.name}</span>
                </label>
                {children(root.id).map((child) => (
                  <label key={child.id} className="ml-6 mt-1 flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={assigned.has(child.id)} onChange={() => toggleCategory(child.id)}
                      className="h-4 w-4 rounded border-slate-300 text-slate-950 focus:ring-slate-950" />
                    <span className="text-slate-700">{child.name}</span>
                  </label>
                ))}
              </div>
            ))}
          </div>
        )}
      </Card>

      {saveError && (
        <div className="rounded-md border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700" role="alert">
          {saveError}
        </div>
      )}
      {saved && (
        <div className="rounded-md border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700" role="status">
          Categories saved.
        </div>
      )}
      <div className="flex justify-end">
        <Button variant="primary" size="md" onClick={() => void handleSave()} loading={saving}>
          Save categories
        </Button>
      </div>
    </div>
  );
}
