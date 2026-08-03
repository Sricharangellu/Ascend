"use client";
import { useCallback, useEffect, useState } from "react";
import { apiGet, ApiResponseError } from "@/api-client/client";
import { formatMoney } from "@/lib/money";
import { Badge } from "@/components/Badge";
import type { BadgeVariant } from "@/components/Badge";

interface HistoryItem {
  id: string;
  po_number: string;
  supplier_name: string;
  product_name: string;
  sku: string;
  qty_ordered: number;
  qty_received: number;
  total_cost_cents: number;
  ordered_at: number;
  received_at: number;
  lead_time_days: number;
  status: "closed" | "closed_short";
  cost_variance_cents: number;
  receiver: string;
}

const STATUS_BADGE: Record<HistoryItem["status"], BadgeVariant> = {
  closed: "green",
  closed_short: "yellow",
};

const STATUS_LABEL: Record<HistoryItem["status"], string> = {
  closed: "Closed",
  closed_short: "Short",
};

function fmtDate(ms: number) {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function HistoryTab() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<{ items: HistoryItem[] }>("/api/v1/inventory/pipeline/history");
      setItems(res.items);
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : "Failed to load pipeline history.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="py-12 text-center text-sm text-slate-400">Loading…</div>;
  if (error) return <p role="alert" className="text-sm text-red-700 py-6">{error}</p>;

  const avgLead = items.length
    ? (items.reduce((s, i) => s + i.lead_time_days, 0) / items.length).toFixed(1)
    : "—";

  return (
    <div>
      <div className="mb-4 flex items-center gap-6 text-sm text-slate-500">
        <span><strong className="text-slate-900">{items.length}</strong> completed POs</span>
        <span>Avg lead time: <strong className="text-slate-900">{avgLead}d</strong></span>
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">PO / Supplier</th>
              <th className="px-4 py-3 text-left">Product</th>
              <th className="px-4 py-3 text-right">Ordered</th>
              <th className="px-4 py-3 text-right">Received</th>
              <th className="px-4 py-3 text-right">Total Cost</th>
              <th className="px-4 py-3 text-right">Variance</th>
              <th className="px-4 py-3 text-right">Lead Time</th>
              <th className="px-4 py-3 text-left">Received On</th>
              <th className="px-4 py-3 text-left">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => (
              <tr key={item.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{item.po_number}</p>
                  <p className="text-xs text-slate-400">{item.supplier_name}</p>
                </td>
                <td className="px-4 py-3">
                  <p className="text-slate-800">{item.product_name}</p>
                  <p className="text-xs text-slate-400">{item.sku} · {item.receiver}</p>
                </td>
                <td className="px-4 py-3 text-right text-slate-700">{item.qty_ordered}</td>
                <td className="px-4 py-3 text-right text-slate-700">{item.qty_received}</td>
                <td className="px-4 py-3 text-right font-medium text-slate-900">{formatMoney(item.total_cost_cents)}</td>
                <td className="px-4 py-3 text-right">
                  {item.cost_variance_cents === 0
                    ? <span className="text-slate-400">—</span>
                    : <span className={item.cost_variance_cents > 0 ? "text-red-600" : "text-green-600"}>
                        {item.cost_variance_cents > 0 ? "+" : ""}{formatMoney(Math.abs(item.cost_variance_cents))}
                      </span>
                  }
                </td>
                <td className="px-4 py-3 text-right text-slate-700">{item.lead_time_days}d</td>
                <td className="px-4 py-3 text-slate-700">{fmtDate(item.received_at)}</td>
                <td className="px-4 py-3">
                  <Badge variant={STATUS_BADGE[item.status]}>{STATUS_LABEL[item.status]}</Badge>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={9} className="py-12 text-center text-sm text-slate-400">No history yet</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
