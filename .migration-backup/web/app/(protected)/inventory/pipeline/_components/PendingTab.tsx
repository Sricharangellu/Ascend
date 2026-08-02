"use client";
import { useCallback, useEffect, useState } from "react";
import { apiGet, ApiResponseError } from "@/api-client/client";
import { formatMoney } from "@/lib/money";
import { Badge } from "@/components/Badge";
import type { BadgeVariant } from "@/components/Badge";

interface PendingItem {
  id: string;
  po_number: string;
  supplier_name: string;
  product_name: string;
  sku: string;
  qty_ordered: number;
  qty_received: number;
  unit_cost_cents: number;
  total_cost_cents: number;
  expected_date: number;
  status: "ordered" | "partial";
  days_overdue: number;
  outlet: string;
}

const STATUS_BADGE: Record<PendingItem["status"], BadgeVariant> = {
  ordered: "blue",
  partial: "yellow",
};

function fmtDate(ms: number) {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function PendingTab() {
  const [items, setItems] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<{ items: PendingItem[] }>("/api/v1/inventory/pipeline/pending");
      setItems(res.items);
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : "Failed to load pending items.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="py-12 text-center text-sm text-slate-400">Loading…</div>;
  if (error) return <p role="alert" className="text-sm text-red-700 py-6">{error}</p>;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-500">{items.length} purchase order{items.length !== 1 ? "s" : ""} pending receipt</p>
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">PO / Supplier</th>
              <th className="px-4 py-3 text-left">Product</th>
              <th className="px-4 py-3 text-right">Ordered</th>
              <th className="px-4 py-3 text-right">Received</th>
              <th className="px-4 py-3 text-right">Value</th>
              <th className="px-4 py-3 text-left">Expected</th>
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
                  <p className="text-xs text-slate-400">{item.sku} · {item.outlet}</p>
                </td>
                <td className="px-4 py-3 text-right text-slate-700">{item.qty_ordered}</td>
                <td className="px-4 py-3 text-right text-slate-700">{item.qty_received}</td>
                <td className="px-4 py-3 text-right font-medium text-slate-900">{formatMoney(item.total_cost_cents)}</td>
                <td className="px-4 py-3">
                  <p className={item.days_overdue > 0 ? "text-red-600 font-medium" : "text-slate-700"}>
                    {fmtDate(item.expected_date)}
                  </p>
                  {item.days_overdue > 0 && (
                    <p className="text-xs text-red-500">{item.days_overdue}d overdue</p>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={STATUS_BADGE[item.status]}>{item.status}</Badge>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="py-12 text-center text-sm text-slate-400">No pending items</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
