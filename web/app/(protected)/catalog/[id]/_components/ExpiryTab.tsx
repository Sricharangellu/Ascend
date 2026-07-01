"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost, apiPatch, apiDelete, ApiResponseError } from "@/api-client/client";
import { fmtDate } from "@/lib/date";
import { formatMoney } from "@/lib/money";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Batch {
  id: string;
  product_id: string;
  batch_number: string;
  supplier_name: string | null;
  received_at: number;
  expiry_date: number;
  qty_on_hand: number;
  cost_cents: number | null;
  status: "fresh" | "expiring" | "expired";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysUntil(ts: number): number {
  return Math.ceil((ts - Date.now()) / 86_400_000);
}

function statusColor(s: Batch["status"]) {
  if (s === "expired")  return "bg-red-100 text-red-700";
  if (s === "expiring") return "bg-amber-100 text-amber-700";
  return "bg-emerald-100 text-emerald-700";
}

function statusLabel(b: Batch) {
  const d = daysUntil(b.expiry_date);
  if (d < 0) return `Expired ${Math.abs(d)}d ago`;
  if (d === 0) return "Expires today";
  return `${d}d left`;
}

// ── Add/Edit Batch Modal ──────────────────────────────────────────────────────

function BatchModal({
  productId,
  existing,
  onClose,
  onSaved,
}: {
  productId: string;
  existing?: Batch;
  onClose: () => void;
  onSaved: (b: Batch) => void;
}) {
  const today = new Date().toISOString().split("T")[0]!;
  const [form, setForm] = useState({
    batch_number: existing?.batch_number ?? "",
    supplier_name: existing?.supplier_name ?? "",
    received_at: existing ? new Date(existing.received_at).toISOString().split("T")[0]! : today,
    expiry_date: existing ? new Date(existing.expiry_date).toISOString().split("T")[0]! : "",
    qty_on_hand: existing ? String(existing.qty_on_hand) : "",
    cost_cents: existing?.cost_cents ? String(existing.cost_cents / 100) : "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.batch_number.trim() || !form.expiry_date || !form.qty_on_hand) {
      setError("Batch number, expiry date, and quantity are required.");
      return;
    }
    setSaving(true); setError(null);
    const payload = {
      batch_number: form.batch_number.trim(),
      supplier_name: form.supplier_name.trim() || null,
      received_at: new Date(form.received_at).getTime(),
      expiry_date: new Date(form.expiry_date).getTime(),
      qty_on_hand: parseInt(form.qty_on_hand) || 0,
      cost_cents: form.cost_cents ? Math.round(parseFloat(form.cost_cents) * 100) : null,
    };
    try {
      let saved: Batch;
      if (existing) {
        saved = await apiPatch<Batch>(`/api/v1/catalog/${productId}/batches/${existing.id}`, payload);
      } else {
        saved = await apiPost<Batch>(`/api/v1/catalog/${productId}/batches`, payload);
      }
      onSaved(saved);
      onClose();
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : "Save failed.");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-[#111]">{existing ? "Edit Batch" : "Add Batch / Lot"}</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="space-y-3 px-5 py-4">
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Batch / Lot Number *">
              <input className={FLD} value={form.batch_number} onChange={(e) => set("batch_number", e.target.value)} placeholder="L-2024-001" />
            </Field>
            <Field label="Supplier">
              <input className={FLD} value={form.supplier_name} onChange={(e) => set("supplier_name", e.target.value)} placeholder="Optional" />
            </Field>
            <Field label="Received Date">
              <input type="date" className={FLD} value={form.received_at} onChange={(e) => set("received_at", e.target.value)} />
            </Field>
            <Field label="Expiry Date *">
              <input type="date" className={FLD} value={form.expiry_date} onChange={(e) => set("expiry_date", e.target.value)} />
            </Field>
            <Field label="Quantity *">
              <input type="number" min="0" className={FLD} value={form.qty_on_hand} onChange={(e) => set("qty_on_hand", e.target.value)} placeholder="0" />
            </Field>
            <Field label="Unit Cost ($)">
              <input type="number" step="0.01" min="0" className={FLD} value={form.cost_cents} onChange={(e) => set("cost_cents", e.target.value)} placeholder="0.00" />
            </Field>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
          <button type="button" onClick={() => void handleSave()} disabled={saving}
            className="rounded-lg bg-[#5D5FEF] px-5 py-2 text-sm font-semibold text-white hover:bg-[#4849d0] disabled:opacity-40">
            {saving ? "Saving…" : existing ? "Update Batch" : "Add Batch"}
          </button>
        </div>
      </div>
    </div>
  );
}

const FLD = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#5D5FEF] focus:outline-none";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</label>
      {children}
    </div>
  );
}

// ── ExpiryTab ─────────────────────────────────────────────────────────────────

export function ExpiryTab({ productId }: { productId: string }) {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Batch | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    apiGet<{ items: Batch[] }>(`/api/v1/catalog/${productId}/batches`)
      .then((r) => setBatches(r.items))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [productId]);

  const handleDelete = async (id: string) => {
    await apiDelete(`/api/v1/catalog/${productId}/batches/${id}`);
    setBatches((prev) => prev.filter((b) => b.id !== id));
    setDeleteId(null);
  };

  const expired  = batches.filter((b) => b.status === "expired");
  const expiring = batches.filter((b) => b.status === "expiring");
  const totalQty = batches.reduce((s, b) => s + b.qty_on_hand, 0);

  return (
    <div className="space-y-4">

      {/* Alert banners */}
      {expired.length > 0 && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <svg className="mt-0.5 h-5 w-5 shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          <div>
            <p className="text-sm font-semibold text-red-700">{expired.length} batch{expired.length !== 1 ? "es" : ""} expired</p>
            <p className="text-xs text-red-600">Remove or quarantine expired stock to prevent sale.</p>
          </div>
        </div>
      )}
      {expiring.length > 0 && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <svg className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <div>
            <p className="text-sm font-semibold text-amber-700">{expiring.length} batch{expiring.length !== 1 ? "es" : ""} expiring within 30 days</p>
            <p className="text-xs text-amber-600">Prioritise FEFO (first-expiry, first-out) when selling this product.</p>
          </div>
        </div>
      )}

      {/* Stats + Add button */}
      <div className="flex items-center justify-between">
        <div className="flex gap-4">
          {[
            { label: "Total batches",   value: String(batches.length) },
            { label: "Total on hand",   value: `${totalQty} units` },
            { label: "Expired",         value: String(expired.length),  color: expired.length > 0 ? "text-red-600" : undefined },
            { label: "Expiring soon",   value: String(expiring.length), color: expiring.length > 0 ? "text-amber-600" : undefined },
          ].map(({ label, value, color }) => (
            <div key={label}>
              <p className="text-[11px] text-slate-400">{label}</p>
              <p className={`text-lg font-bold ${color ?? "text-[#111]"}`}>{value}</p>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setShowAdd(true)}
          className="rounded-lg bg-[#5D5FEF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#4849d0]">
          + Add Batch
        </button>
      </div>

      {/* Batch table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="space-y-2 p-4">
            {[1, 2, 3].map((i) => <div key={i} className="h-10 animate-pulse rounded bg-slate-100" />)}
          </div>
        ) : batches.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-slate-400">No batches recorded for this product.</p>
            <button type="button" onClick={() => setShowAdd(true)} className="mt-2 text-sm font-medium text-[#5D5FEF] hover:underline">
              Add the first batch
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                <th className="px-4 py-3">Batch #</th>
                <th className="px-4 py-3 hidden sm:table-cell">Supplier</th>
                <th className="px-4 py-3 hidden md:table-cell">Received</th>
                <th className="px-4 py-3">Expiry</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 hidden md:table-cell text-right">Unit Cost</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {batches.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-[#111]">{b.batch_number}</td>
                  <td className="hidden px-4 py-3 text-slate-500 sm:table-cell">{b.supplier_name ?? "—"}</td>
                  <td className="hidden px-4 py-3 text-slate-500 md:table-cell">{fmtDate(b.received_at)}</td>
                  <td className="px-4 py-3 font-medium text-[#111]">{fmtDate(b.expiry_date)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusColor(b.status)}`}>
                      {statusLabel(b)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-[#111]">{b.qty_on_hand}</td>
                  <td className="hidden px-4 py-3 text-right text-slate-500 md:table-cell">
                    {b.cost_cents ? formatMoney(b.cost_cents) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setEditing(b)}
                        className="text-xs font-medium text-[#5D5FEF] hover:underline">Edit</button>
                      <button type="button" onClick={() => setDeleteId(b.id)}
                        className="text-xs font-medium text-red-500 hover:underline">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modals */}
      {(showAdd || editing) && (
        <BatchModal
          productId={productId}
          existing={editing ?? undefined}
          onClose={() => { setShowAdd(false); setEditing(null); }}
          onSaved={(b) => {
            setBatches((prev) => {
              const idx = prev.findIndex((x) => x.id === b.id);
              return idx === -1 ? [...prev, b] : prev.map((x) => x.id === b.id ? b : x);
            });
          }}
        />
      )}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <p className="font-semibold text-[#111]">Delete this batch?</p>
            <p className="mt-1 text-sm text-slate-500">This will remove the batch record. Stock adjustment may be needed.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteId(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
              <button type="button" onClick={() => void handleDelete(deleteId)} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
