
import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPatch, apiPost, ApiResponseError } from "@/api-client/client";
import { formatCentsPlain, parseToCents } from "@/lib/money";
import type { CatalogProduct, CatalogCategory } from "@/api-client/types";

// A guided, 3-step setup that edits every generated variant at once:
//   1. SKU & UPC (barcode)   2. Pricing   3. Categories
// Each step is a table over all variants; Finish persists every row.

interface RowState {
  sku: string;
  barcode: string;
  price: string;   // dollars
  msrp: string;    // dollars (compare-at)
  cost: string;    // dollars
}

const STEPS = ["SKU & UPC", "Pricing", "Categories"] as const;
const FLD = "w-full rounded-lg border px-2 py-1 text-[13px] outline-none transition-all focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500";

function displayName(v: CatalogProduct): string {
  return v.variant_label || v.name;
}

export function VariantSetupWizard({
  master,
  variants,
  onClose,
  onSaved,
}: {
  master: CatalogProduct;
  variants: CatalogProduct[];
  onClose: () => void;
  onSaved: (updated: CatalogProduct[]) => void;
}) {
  const [step, setStep] = useState(0);
  const [rows, setRows] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(variants.map((c) => [c.id, {
      sku: c.sku,
      barcode: c.barcode ?? "",
      price: formatCentsPlain(c.price_cents),
      msrp: c.msrp_cents != null ? formatCentsPlain(c.msrp_cents) : "",
      cost: c.raw_cost_price_cents != null ? formatCentsPlain(c.raw_cost_price_cents) : "",
    }])),
  );
  const [useParentPrice, setUseParentPrice] = useState(false);
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [selectedCats, setSelectedCats] = useState<Set<string>>(new Set());
  const [catsTouched, setCatsTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void apiGet<{ items: CatalogCategory[] }>("/api/v1/catalog/categories")
      .then((r) => setCategories(r.items))
      .catch(() => { /* categories optional */ });
  }, []);

  const parentPriceLabel = useMemo(() => formatCentsPlain(master.price_cents), [master.price_cents]);

  const setField = (id: string, field: keyof RowState, value: string) =>
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));

  const toggleCat = (id: string) => {
    setCatsTouched(true);
    setSelectedCats((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const centsOrNull = (v: string): number | null => {
    const t = v.trim();
    if (!t) return null;
    const c = parseToCents(t);
    return Number.isFinite(c) ? c : null;
  };

  const handleFinish = async () => {
    setSaving(true); setError(null);
    try {
      const updated: CatalogProduct[] = [];
      for (const child of variants) {
        const r = rows[child.id];
        const patch: Record<string, unknown> = {};
        if (r.sku.trim() && r.sku.trim() !== child.sku) patch.sku = r.sku.trim();
        const nextBarcode = r.barcode.trim() || null;
        if (nextBarcode !== (child.barcode ?? null)) patch.barcode = nextBarcode;

        const nextPrice = useParentPrice ? master.price_cents : centsOrNull(r.price);
        if (nextPrice != null && nextPrice !== child.price_cents) patch.price_cents = nextPrice;
        const nextMsrp = centsOrNull(r.msrp);
        if (nextMsrp !== (child.msrp_cents ?? null)) patch.msrp_cents = nextMsrp;
        const nextCost = centsOrNull(r.cost);
        if (nextCost !== (child.raw_cost_price_cents ?? null)) patch.raw_cost_price_cents = nextCost;

        const result = Object.keys(patch).length > 0
          ? (await apiPatch<CatalogProduct>(`/api/v1/catalog/${child.id}`, patch))
          : child;
        updated.push(result);

        // Categories are a replace-set; only apply when the user touched step 3.
        if (catsTouched) {
          await apiPost(`/api/v1/catalog/${child.id}/categories`, { categoryIds: [...selectedCats] });
        }
      }
      onSaved(updated);
      onClose();
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : "Failed to save. Check for duplicate SKUs.");
    } finally { setSaving(false); }
  };

  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl shadow-2xl" style={{ backgroundColor: "var(--color-surface)" }} onClick={(e) => e.stopPropagation()}>
        {/* Header + stepper */}
        <div className="border-b px-6 py-4" style={{ borderColor: "var(--color-border)" }}>
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Set up variants</h2>
            <button type="button" onClick={onClose} className="transition-colors hover:text-[var(--color-text-primary)]"
              style={{ color: "var(--color-text-muted)" }} aria-label="Close">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="mt-3 flex items-center gap-2">
            {STEPS.map((label, i) => (
              <div key={label} className="flex items-center gap-2">
                <button type="button" onClick={() => setStep(i)}
                  className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    i === step ? "bg-brand-600 text-white" : i < step ? "bg-brand-600/10 text-brand-600" : ""
                  }`}
                  style={i > step ? { backgroundColor: "var(--color-surface-subtle)", color: "var(--color-text-muted)" } : {}}>
                  <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] ${i === step ? "bg-white/20" : "bg-black/5"}`}>{i + 1}</span>
                  {label}
                </button>
                {i < STEPS.length - 1 && <span className="h-px w-4" style={{ backgroundColor: "var(--color-border)" }} />}
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {error && <p role="alert" className="mb-3 rounded-xl border px-3 py-2 text-[13px]"
            style={{ backgroundColor: "var(--color-danger-bg)", borderColor: "var(--color-danger-border)", color: "var(--color-danger-text)" }}>{error}</p>}

          {step === 0 && (
            <table className="w-full text-[13px]">
              <thead style={{ borderBottom: "1px solid var(--color-border)" }}>
                <tr className="text-left text-[10px] font-semibold uppercase tracking-[0.06em]"
                  style={{ color: "var(--color-text-secondary)" }}>
                  <th className="py-2">Variant</th><th className="py-2">SKU</th><th className="py-2">UPC / Barcode</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-table-border)]">
                {variants.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2 pr-3 font-medium" style={{ color: "var(--color-text-primary)" }}>{displayName(c)}</td>
                    <td className="py-2 pr-3"><input className={`${FLD} font-mono`} style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }} value={rows[c.id]!.sku} onChange={(e) => setField(c.id, "sku", e.target.value)} aria-label={`SKU for ${displayName(c)}`} /></td>
                    <td className="py-2"><input className={`${FLD} font-mono`} style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }} value={rows[c.id]!.barcode} onChange={(e) => setField(c.id, "barcode", e.target.value)} placeholder="—" aria-label={`UPC for ${displayName(c)}`} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {step === 1 && (
            <>
              <label className="mb-3 flex items-center gap-2 text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
                <input type="checkbox" className="h-4 w-4 rounded accent-brand-600" checked={useParentPrice} onChange={(e) => setUseParentPrice(e.target.checked)} />
                Use parent selling price for all variants (<span className="font-semibold">${parentPriceLabel}</span>)
              </label>
              <table className="w-full text-[13px]">
                <thead style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <tr className="text-left text-[10px] font-semibold uppercase tracking-[0.06em]"
                    style={{ color: "var(--color-text-secondary)" }}>
                    <th className="py-2">Variant</th><th className="py-2">Selling</th><th className="py-2">Compare at</th><th className="py-2">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-table-border)]">
                  {variants.map((c) => (
                    <tr key={c.id}>
                      <td className="py-2 pr-3 font-medium" style={{ color: "var(--color-text-primary)" }}>{displayName(c)}</td>
                      <td className="py-2 pr-3">
                        <input className={FLD} inputMode="decimal"
                          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }}
                          value={useParentPrice ? parentPriceLabel : rows[c.id]!.price}
                          disabled={useParentPrice}
                          onChange={(e) => setField(c.id, "price", e.target.value)}
                          aria-label={`Selling price for ${displayName(c)}`} />
                      </td>
                      <td className="py-2 pr-3"><input className={FLD} inputMode="decimal" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }} value={rows[c.id]!.msrp} onChange={(e) => setField(c.id, "msrp", e.target.value)} placeholder="—" aria-label={`Compare-at price for ${displayName(c)}`} /></td>
                      <td className="py-2"><input className={FLD} inputMode="decimal" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }} value={rows[c.id]!.cost} onChange={(e) => setField(c.id, "cost", e.target.value)} placeholder="—" aria-label={`Cost for ${displayName(c)}`} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {step === 2 && (
            <div>
              <p className="mb-3 text-[13px]" style={{ color: "var(--color-text-secondary)" }}>Assign every variant to one or more categories.</p>
              {categories.length === 0 ? (
                <p className="py-6 text-center text-[13px]" style={{ color: "var(--color-text-muted)" }}>No categories defined yet.</p>
              ) : (
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {categories.map((cat) => (
                    <label key={cat.id} className="flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-[13px] transition-colors hover:bg-[var(--color-surface-subtle)]"
                      style={{ borderColor: "var(--color-border)" }}>
                      <input type="checkbox" className="h-4 w-4 rounded accent-brand-600" checked={selectedCats.has(cat.id)} onChange={() => toggleCat(cat.id)} />
                      <span className="truncate" style={{ color: "var(--color-text-primary)" }}>{cat.name}</span>
                    </label>
                  ))}
                </div>
              )}
              {catsTouched && (
                <p className="mt-3 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                  Applies {selectedCats.size} categor{selectedCats.size === 1 ? "y" : "ies"} to all {variants.length} variants, replacing any existing category tags.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t px-6 py-3" style={{ borderColor: "var(--color-border)" }}>
          <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>{variants.length} variant{variants.length !== 1 ? "s" : ""}</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => (step === 0 ? onClose() : setStep((s) => s - 1))}
              className="rounded-xl border px-4 py-2 text-[13px] font-medium transition-colors hover:bg-[var(--color-surface-subtle)]"
              style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}>
              {step === 0 ? "Cancel" : "Back"}
            </button>
            {isLast ? (
              <button type="button" onClick={() => void handleFinish()} disabled={saving}
                className="rounded-xl bg-brand-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-[#4849d0] disabled:opacity-40 transition-colors">
                {saving ? "Saving…" : "Finish & save"}
              </button>
            ) : (
              <button type="button" onClick={() => setStep((s) => s + 1)}
                className="rounded-xl bg-brand-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-[#4849d0] transition-colors">
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
