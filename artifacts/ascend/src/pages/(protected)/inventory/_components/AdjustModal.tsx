
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

  const inputCls = "mt-1 min-h-[44px] w-full rounded-md border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-950";
  const inputStyle = {
    borderColor: "var(--color-border)",
    backgroundColor: "var(--color-surface)",
    color: "var(--color-text-primary)",
  };

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
        className="w-full max-w-md rounded-lg p-6 shadow-xl"
        style={{ backgroundColor: "var(--color-surface)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold" style={{ color: "var(--color-text-primary)" }}>Adjust stock</h2>
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>{product.name} · {product.sku}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 focus:outline-none focus:ring-2 focus:ring-slate-950"
            style={{ color: "var(--color-text-muted)" }}
            aria-label="Close"
          >
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
          <label className="block">
            <span className="text-sm font-medium" style={{ color: "var(--color-text-secondary)" }}>Reason</span>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={inputCls}
              style={inputStyle}
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
            <span className="text-sm font-medium" style={{ color: "var(--color-text-secondary)" }}>Adjustment</span>
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                onClick={() => setSign(1)}
                className={`min-h-[44px] rounded-md border px-4 text-sm font-semibold transition-colors ${sign === 1 ? "border-success-600 bg-success-50 text-success-700" : "hover:bg-[var(--color-surface-subtle)]"}`}
                style={sign !== 1 ? { borderColor: "var(--color-border)", color: "var(--color-text-secondary)", backgroundColor: "var(--color-surface)" } : undefined}
              >
                +
              </button>
              <button
                type="button"
                onClick={() => setSign(-1)}
                className={`min-h-[44px] rounded-md border px-4 text-sm font-semibold transition-colors ${sign === -1 ? "border-danger-600 bg-danger-50 text-danger-700" : "hover:bg-[var(--color-surface-subtle)]"}`}
                style={sign !== -1 ? { borderColor: "var(--color-border)", color: "var(--color-text-secondary)", backgroundColor: "var(--color-surface)" } : undefined}
              >
                −
              </button>
              <input
                type="number"
                min="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="min-h-[44px] flex-1 rounded-md border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-950"
                style={inputStyle}
                required
              />
            </div>
            {amount && parseInt(amount, 10) > 0 && (
              <p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
                New quantity: <span className="font-semibold" style={{ color: "var(--color-text-primary)" }}>{newQty}</span>
              </p>
            )}
          </div>

          <label className="block">
            <span className="text-sm font-medium" style={{ color: "var(--color-text-secondary)" }}>Location</span>
            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className={inputCls}
              style={inputStyle}
            >
              {locationOptions.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium" style={{ color: "var(--color-text-secondary)" }}>Note (optional)</span>
            <input
              type="text"
              maxLength={255}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Broken in transit"
              className={inputCls}
              style={inputStyle}
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
