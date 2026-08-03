"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { apiGet, apiPost, ApiResponseError } from "@/api-client/client";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProductBarcode {
  barcode: string;
  kind: string;
  pack_size: number;
}

type UnitForm = {
  barcode: string;
  kind: string;
  packSize: string;
};

const EMPTY_FORM: UnitForm = { barcode: "", kind: "case", packSize: "" };

const INPUT = "w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-[#111] outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600";

const KIND_LABEL: Record<string, string> = {
  each: "Each",
  box: "Box",
  case: "Case",
  pallet: "Pallet",
  alt: "Alternate",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-500">{label}</label>
      {children}
    </div>
  );
}

/**
 * Units & Packaging — the base unit is always "each" (1 barcode with pack_size
 * 1, or the product's own legacy barcode). Purchasing/selling in a larger
 * unit ("case", "box") is configured here as a barcode + pack size, which is
 * what purchasing (PO creation, receiving) and POS scanning resolve against —
 * see ADR-005-adjacent UOM conversion work: a case is defined by its barcode
 * row, not a separate unit table, so there's exactly one place this lives.
 */
export function UnitsTab({ productId }: { productId: string }) {
  const [units, setUnits]       = useState<ProductBarcode[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [busy, setBusy]         = useState(false);
  const [showAdd, setShowAdd]   = useState(false);
  const [form, setForm]         = useState<UnitForm>(EMPTY_FORM);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const d = await apiGet<{ items: ProductBarcode[] }>(`/api/v1/catalog/${productId}/barcodes`);
      setUnits(d.items ?? []);
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : "Failed to load units.");
    } finally { setLoading(false); }
  }, [productId]);

  useEffect(() => { void load(); }, [load]);

  const openAdd = () => { setForm(EMPTY_FORM); setShowAdd(true); };

  const save = async () => {
    if (!form.barcode.trim() || !form.packSize) return;
    setBusy(true); setError(null);
    try {
      await apiPost(`/api/v1/catalog/${productId}/barcodes`, {
        barcode: form.barcode.trim(),
        kind: form.kind,
        packSize: parseInt(form.packSize, 10),
      });
      setShowAdd(false);
      await load();
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : "Could not save this unit.");
    } finally { setBusy(false); }
  };

  if (loading) return (
    <div className="space-y-3">
      {[1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-slate-100" />)}
    </div>
  );

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">
        Purchasing and selling units for this product. Each unit is a barcode with a pack size —
        scanning it (at receiving or the register) resolves to this many base (each) units.
      </p>

      {error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {showAdd && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-5">
          <p className="mb-4 text-sm font-semibold text-slate-700">Add a unit</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Unit *">
              <select className={INPUT} value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}>
                <option value="case">Case</option>
                <option value="box">Box</option>
                <option value="pallet">Pallet</option>
                <option value="alt">Alternate</option>
              </select>
            </Field>
            <Field label="Barcode *">
              <input className={INPUT} value={form.barcode} onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))} placeholder="Scan or type the case/box UPC" />
            </Field>
            <Field label="Pack size (each per unit) *">
              <input type="number" min={1} className={INPUT} value={form.packSize} onChange={(e) => setForm((f) => ({ ...f, packSize: e.target.value }))} placeholder="e.g. 12" />
            </Field>
          </div>
          {form.kind && form.packSize && (
            <p className="mt-3 text-xs text-slate-500">
              1 {KIND_LABEL[form.kind] ?? form.kind} = <strong className="text-slate-700">{form.packSize || "?"} Each</strong>
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button size="sm" variant="primary" onClick={save} disabled={busy || !form.barcode.trim() || !form.packSize}>
              {busy ? "Saving…" : "Add unit"}
            </Button>
          </div>
        </div>
      )}

      {units.length === 0 && !showAdd ? (
        <div className="rounded-lg border border-dashed border-slate-200 py-12 text-center">
          <p className="text-sm text-slate-400">No purchasing/selling units configured — this product is only tracked and sold as Each.</p>
          <Button size="sm" variant="secondary" className="mt-3" onClick={openAdd}>Add a unit (e.g. Case)</Button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">{units.length} unit{units.length !== 1 ? "s" : ""} beyond Each</p>
            {!showAdd && <Button size="sm" variant="secondary" onClick={openAdd}>+ Add unit</Button>}
          </div>
          <div className="space-y-2">
            {units.map((u) => (
              <div key={u.barcode} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-5 py-3 shadow-sm">
                <div className="flex items-center gap-3">
                  <Badge variant={u.kind === "each" ? "gray" : "blue"}>{KIND_LABEL[u.kind] ?? u.kind}</Badge>
                  <span className="font-mono text-xs text-slate-400">{u.barcode}</span>
                </div>
                <span className="text-sm text-slate-600">
                  1 {KIND_LABEL[u.kind] ?? u.kind} = <strong className="text-slate-900">{u.pack_size} Each</strong>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
