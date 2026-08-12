
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { apiGet, apiPost, apiPatch, apiDelete, ApiResponseError } from "@/api-client/client";

// ── Types ─────────────────────────────────────────────────────────────────────
// Field names match the backend's ProductImage shape (src/modules/catalog/
// service.ts) — image_url/alt_text, not url/alt.

interface ProductImage {
  id: string;
  product_id: string;
  image_url: string;
  alt_text: string | null;
  sort_order: number;
  is_primary: boolean;
  created_at: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ImagesTab({ productId }: { productId: string }) {
  const [images, setImages]   = useState<ProductImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [busy, setBusy]       = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [altInput, setAltInput] = useState("");
  const [urlError, setUrlError] = useState("");

  const urlRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const d = await apiGet<{ items: ProductImage[] }>(`/api/v1/catalog/${productId}/images`);
      setImages(d.items ?? []);
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : "Failed to load images.");
    } finally { setLoading(false); }
  }, [productId]);

  useEffect(() => { void load(); }, [load]);

  const openAdd = () => {
    setUrlInput(""); setAltInput(""); setUrlError(""); setShowAdd(true);
    setTimeout(() => urlRef.current?.focus(), 50);
  };

  const addImage = async () => {
    if (!urlInput.trim()) { setUrlError("URL is required"); return; }
    try { new URL(urlInput.trim()); } catch { setUrlError("Enter a valid URL (e.g. https://…)"); return; }
    setBusy(true);
    try {
      await apiPost(`/api/v1/catalog/${productId}/images`, { imageUrl: urlInput.trim(), altText: altInput.trim() || null });
      setShowAdd(false); setUrlInput(""); setAltInput("");
      await load();
    } catch (e) {
      setUrlError(e instanceof ApiResponseError ? e.message : "Failed to add image.");
    } finally { setBusy(false); }
  };

  const setPrimary = async (img: ProductImage) => {
    if (img.is_primary) return;
    setBusy(true);
    try {
      await apiPatch(`/api/v1/catalog/${productId}/images/${img.id}`, { is_primary: true });
      await load();
    } finally { setBusy(false); }
  };

  const removeImage = async (img: ProductImage) => {
    if (!confirm("Remove this image from the product?")) return;
    setBusy(true);
    try {
      await apiDelete(`/api/v1/catalog/${productId}/images/${img.id}`);
      await load();
    } finally { setBusy(false); }
  };

  if (loading) return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {[1, 2, 3].map((i) => <div key={i} className="aspect-square animate-skeleton rounded-xl" />)}
    </div>
  );

  if (error) return (
    <p role="alert" className="rounded-xl border px-4 py-3 text-[13px]"
      style={{ backgroundColor: "var(--color-danger-bg)", borderColor: "var(--color-danger-border)", color: "var(--color-danger-text)" }}>
      {error}
    </p>
  );

  return (
    <div className="space-y-5">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Product Images</p>
          <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>{images.length} image{images.length !== 1 ? "s" : ""} · Add via URL</p>
        </div>
        <Button size="sm" variant="secondary" onClick={openAdd}>+ Add image</Button>
      </div>

      {/* ── Add image form ─────────────────────────────────────────────────── */}
      {showAdd && (
        <div className="space-y-3 rounded-xl border p-4" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-subtle)" }}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--color-text-secondary)" }}>Add Image via URL</p>
          <div className="space-y-2">
            <div>
              <label className="mb-1 block text-[12px] font-medium" style={{ color: "var(--color-text-secondary)" }}>Image URL *</label>
              <input ref={urlRef}
                className="w-full rounded-lg border px-3 py-2 text-[13px] outline-none transition-all focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }}
                value={urlInput} onChange={(e) => { setUrlInput(e.target.value); setUrlError(""); }}
                placeholder="https://example.com/image.jpg" />
              {urlError && <p className="mt-1 text-[11px] text-red-600">{urlError}</p>}
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium" style={{ color: "var(--color-text-secondary)" }}>Alt text</label>
              <input
                className="w-full rounded-lg border px-3 py-2 text-[13px] outline-none transition-all focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }}
                value={altInput} onChange={(e) => setAltInput(e.target.value)} placeholder="Describe the image" />
            </div>
          </div>
          {urlInput && !urlError && (
            <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={urlInput} alt="Preview" className="max-h-40 w-full object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button size="sm" variant="primary" onClick={addImage} disabled={busy || !urlInput.trim()}>
              {busy ? "Adding…" : "Add image"}
            </Button>
          </div>
        </div>
      )}

      {/* ── Image grid ─────────────────────────────────────────────────────── */}
      {images.length === 0 && !showAdd ? (
        <div className="rounded-xl border border-dashed py-16 text-center" style={{ borderColor: "var(--color-border)" }}>
          <svg className="mx-auto mb-3 h-10 w-10" style={{ color: "var(--color-border)" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
          </svg>
          <p className="text-[13px]" style={{ color: "var(--color-text-muted)" }}>No images yet</p>
          <Button size="sm" variant="secondary" className="mt-3" onClick={openAdd}>Add first image</Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((img) => (
            <div key={img.id} className={`group relative overflow-hidden rounded-xl border-2 shadow-[var(--shadow-sm)] transition-all ${img.is_primary ? "border-brand-600" : "hover:border-brand-400"}`}
              style={!img.is_primary ? { borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" } : { backgroundColor: "var(--color-surface)" }}>
              <div className="aspect-square overflow-hidden" style={{ backgroundColor: "var(--color-surface-subtle)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.image_url} alt={img.alt_text ?? "Product image"}
                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  onError={(e) => {
                    const el = e.target as HTMLImageElement;
                    el.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect width='100' height='100' fill='%23f1f5f9'/%3E%3Ctext x='50' y='55' text-anchor='middle' fill='%2394a3b8' font-size='12'%3ENo preview%3C/text%3E%3C/svg%3E";
                  }} />
              </div>
              {img.is_primary && (
                <div className="absolute left-2 top-2">
                  <Badge variant="blue">Primary</Badge>
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 flex translate-y-full flex-col gap-1 p-2 shadow-md transition-transform group-hover:translate-y-0"
                style={{ backgroundColor: "var(--color-surface)" }}>
                {img.alt_text && <p className="truncate text-[10px]" style={{ color: "var(--color-text-muted)" }}>"{img.alt_text}"</p>}
                <div className="flex gap-1">
                  {!img.is_primary && (
                    <button type="button" onClick={() => void setPrimary(img)} disabled={busy}
                      className="flex-1 rounded-lg border border-brand-600/30 py-1 text-[11px] font-medium text-brand-600 hover:bg-brand-600/5 disabled:opacity-40 transition-colors">
                      Set primary
                    </button>
                  )}
                  <button type="button" onClick={() => void removeImage(img)} disabled={busy}
                    className="flex-1 rounded-lg border border-red-200 py-1 text-[11px] font-medium text-red-500 hover:bg-red-50 disabled:opacity-40 transition-colors">
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}

          <button type="button" onClick={openAdd}
            className="flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed transition-colors hover:border-brand-600 hover:text-brand-600"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            <span className="text-[11px] font-medium">Add image</span>
          </button>
        </div>
      )}
    </div>
  );
}
