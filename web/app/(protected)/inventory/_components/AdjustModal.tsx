"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { apiGet, apiPost, ApiResponseError } from "@/api-client/client";
import { useToast } from "@/components/Toast";

interface AdjustModalProps {
  product: { id: string; name: string; sku: string; onHand: number } | null;
  onClose: () => void;
  onSaved: () => void;
}

export function AdjustModal({ product, onClose, onSaved }: AdjustModalProps) {
  const { addToast } = useToast();
  const [reason, setReason] = useState("cycle_count");
  const [sign, setSign] = useState<1 | -1>(1);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [locationId, setLocationId] = useState("loc_main");
  const [locationOptions, setLocationOptions] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiGet<{ items: { id: string; name: string }[] }>("/api/v1/inventory/locations")
      .then((d) => {
        const items = d.items ?? [];
        setLocationOptions(items);
        if (items.length > 0 && items[0]) setLocationId(items[0].id);
      })
      .catch(() => {});
  }, []);

  if (!product) return null;

  const delta = sign * (parseInt(amount, 10) || 0);
  const newQty = product.onHand + delta;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!amount || parseInt(amount, 10) <= 0) return;
    setSaving(true);
    try {
      await apiPost("/api/v1/inventory/adjustments", {
        product_id: product!.id,
        location_id: locationId,
        delta,
        reason,
        note: note.trim() || null,
      });
      addToast({ title: "Stock adjusted", variant: "success" });
      onSaved();
      onClose();
    } catch (err) {
      addToast({
        title: "Adjustment failed",
        description: err instanceof ApiResponseError ? err.message : "Unknown error",
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-950">Adjust stock</h2>
            <p className="text-sm text-slate-500">{product.name} · {product.sku}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-950"
            aria-label="Close"
          >
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Reason</span>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 min-h-[44px] w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 focus:outline-none focus:ring-2 focus:ring-slate-950"
            >
              <option value="cycle_count">Cycle count</option>
              <option value="damage">Damage</option>
              <option value="theft">Theft</option>
              <option value="received">Received</option>
              <option value="correction">Correction</option>
              <option value="other">Other</option>
            </select>
          </label>

          <div>
            <span className="text-sm font-medium text-slate-700">Adjustment</span>
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                onClick={() => setSign(1)}
                className={`min-h-[44px] rounded-md border px-4 text-sm font-semibold transition-colors ${sign === 1 ? "border-success-600 bg-success-50 text-success-700" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"}`}
              >
                +
              </button>
              <button
                type="button"
                onClick={() => setSign(-1)}
                className={`min-h-[44px] rounded-md border px-4 text-sm font-semibold transition-colors ${sign === -1 ? "border-danger-600 bg-danger-50 text-danger-700" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"}`}
              >
                −
              </button>
              <input
                type="number"
                min="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="min-h-[44px] flex-1 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 focus:outline-none focus:ring-2 focus:ring-slate-950"
                required
              />
            </div>
            {amount && parseInt(amount, 10) > 0 && (
              <p className="mt-1 text-xs text-slate-500">
                New quantity: <span className="font-semibold text-slate-950">{newQty}</span>
              </p>
            )}
          </div>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Location</span>
            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className="mt-1 min-h-[44px] w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 focus:outline-none focus:ring-2 focus:ring-slate-950"
            >
              {locationOptions.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Note (optional)</span>
            <input
              type="text"
              maxLength={255}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Broken in transit"
              className="mt-1 min-h-[44px] w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 focus:outline-none focus:ring-2 focus:ring-slate-950"
            />
          </label>

          <div className="flex gap-2 pt-2">
            <Button variant="secondary" size="sm" fullWidth onClick={onClose} type="button">Cancel</Button>
            <Button variant="primary" size="sm" fullWidth loading={saving} type="submit">Save adjustment</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
