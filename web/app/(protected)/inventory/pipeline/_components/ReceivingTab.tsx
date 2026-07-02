"use client";
import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost, ApiResponseError } from "@/api-client/client";

interface ReceivingItem {
  id: string;
  po_number: string;
  supplier_name: string;
  product_name: string;
  sku: string;
  qty_ordered: number;
  qty_received: number;
  qty_remaining: number;
  unit_cost_cents: number;
  started_at: number;
  receiver: string;
  outlet: string;
  batch_id: string;
}

function elapsed(ms: number): string {
  const minutes = Math.floor((Date.now() - ms) / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m ago`;
}

export function ReceivingTab() {
  const [items, setItems] = useState<ReceivingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanQty, setScanQty] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<{ items: ReceivingItem[] }>("/api/v1/inventory/pipeline/receiving");
      setItems(res.items);
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : "Failed to load receiving sessions.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleScan(id: string) {
    const qty = Number(scanQty[id] ?? 0);
    if (!qty || qty <= 0) return;
    setSaving(id);
    try {
      const updated = await apiPost<ReceivingItem>(`/api/v1/inventory/pipeline/receiving/${id}/update`, { qty_scanned: qty });
      setItems((prev) => prev.map((i) => (i.id === id ? updated : i)));
      setScanQty((prev) => ({ ...prev, [id]: "" }));
    } catch {
      // silently ignore — user can retry
    } finally {
      setSaving(null);
    }
  }

  if (loading) return <div className="py-12 text-center text-sm text-slate-400">Loading…</div>;
  if (error) return <p role="alert" className="text-sm text-red-700 py-6">{error}</p>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">{items.length} active receiving session{items.length !== 1 ? "s" : ""}</p>
      {items.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-200 py-12 text-center text-sm text-slate-400">
          No active receiving sessions
        </div>
      )}
      {items.map((item) => {
        const pct = Math.round((item.qty_received / item.qty_ordered) * 100);
        return (
          <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-medium text-slate-900">{item.product_name}</p>
                <p className="text-xs text-slate-400">{item.sku} · {item.supplier_name} · {item.outlet}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {item.po_number} · {item.batch_id} · receiver: {item.receiver} · started {elapsed(item.started_at)}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-2xl font-bold text-slate-900">{item.qty_received}<span className="text-sm text-slate-400">/{item.qty_ordered}</span></p>
                <p className="text-xs text-slate-400">{item.qty_remaining} remaining</p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mt-3">
              <div className="h-2 w-full rounded-full bg-slate-100">
                <div
                  className="h-2 rounded-full bg-blue-500 transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="mt-1 text-right text-xs text-slate-400">{pct}% received</p>
            </div>

            {/* Scan input */}
            <div className="mt-3 flex items-center gap-2">
              <input
                type="number"
                min="1"
                placeholder="Enter qty scanned"
                value={scanQty[item.id] ?? ""}
                onChange={(e) => setScanQty((prev) => ({ ...prev, [item.id]: e.target.value }))}
                className="w-40 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
              />
              <button
                type="button"
                disabled={saving === item.id}
                onClick={() => handleScan(item.id)}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving === item.id ? "Saving…" : "Record"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
