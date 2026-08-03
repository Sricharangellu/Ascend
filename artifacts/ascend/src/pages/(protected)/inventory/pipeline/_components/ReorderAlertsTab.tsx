import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost, ApiResponseError } from "@/api-client/client";
import { formatMoney } from "@/lib/money";
import { Badge } from "@/components/Badge";
import type { BadgeVariant } from "@/components/Badge";

interface ReorderAlert {
  id: string;
  product_id: string;
  product_name: string;
  sku: string;
  current_stock: number;
  reorder_point: number;
  safety_stock: number;
  avg_daily_sales: number;
  days_until_stockout: number;
  preferred_supplier: string;
  suggested_qty: number;
  estimated_cost_cents: number;
  urgency: "critical" | "warning";
  open_po_qty: number;
}

const URGENCY_BADGE: Record<ReorderAlert["urgency"], BadgeVariant> = {
  critical: "red",
  warning: "yellow",
};

export function ReorderAlertsTab() {
  const [items, setItems] = useState<ReorderAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<{ items: ReorderAlert[] }>("/api/v1/inventory/pipeline/reorder-alerts");
      setItems(res.items);
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : "Failed to load reorder alerts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createPO(id: string, productName: string) {
    setCreating(id);
    try {
      const res = await apiPost<{ po_number: string }>(`/api/v1/inventory/pipeline/reorder-alerts/${id}/create-po`, {});
      setToast(`PO ${res.po_number} created for ${productName}`);
      setTimeout(() => setToast(null), 4000);
    } catch {
      setToast("Failed to create PO");
      setTimeout(() => setToast(null), 4000);
    } finally {
      setCreating(null);
    }
  }

  if (loading) return <div className="py-12 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>Loading…</div>;
  if (error) return <p role="alert" className="text-sm text-red-700 py-6">{error}</p>;

  return (
    <div>
      {toast && (
        <div className="mb-4 rounded-lg bg-green-50 border border-green-200 px-4 py-2 text-sm text-green-700">
          {toast}
        </div>
      )}
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          {items.filter((i) => i.urgency === "critical").length} critical · {items.filter((i) => i.urgency === "warning").length} warning
        </p>
      </div>
      <div className="overflow-hidden rounded-lg border" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
        <table className="min-w-full text-sm">
          <thead
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ backgroundColor: "var(--color-table-header)", color: "var(--color-text-muted)" }}
          >
            <tr>
              <th className="px-4 py-3 text-left">Product</th>
              <th className="px-4 py-3 text-right">Stock</th>
              <th className="px-4 py-3 text-right">Reorder At</th>
              <th className="px-4 py-3 text-right">Stockout In</th>
              <th className="px-4 py-3 text-left">Supplier</th>
              <th className="px-4 py-3 text-right">Suggested Qty</th>
              <th className="px-4 py-3 text-right">Est. Cost</th>
              <th className="px-4 py-3 text-left">Urgency</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: "var(--color-table-border)" }}>
            {items.map((item) => (
              <tr
                key={item.id}
                className={item.urgency === "critical" ? "bg-red-50/40 hover:bg-red-50" : "hover:bg-[var(--color-surface-subtle)]"}
              >
                <td className="px-4 py-3">
                  <p className="font-medium" style={{ color: "var(--color-text-primary)" }}>{item.product_name}</p>
                  <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{item.sku}</p>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className={`font-semibold ${item.current_stock === 0 ? "text-red-600" : ""}`}
                    style={item.current_stock !== 0 ? { color: "var(--color-text-primary)" } : undefined}>
                    {item.current_stock}
                  </span>
                  {item.open_po_qty > 0 && (
                    <p className="text-xs text-blue-500">+{item.open_po_qty} on order</p>
                  )}
                </td>
                <td className="px-4 py-3 text-right" style={{ color: "var(--color-text-secondary)" }}>{item.reorder_point}</td>
                <td className="px-4 py-3 text-right">
                  {item.days_until_stockout === 0
                    ? <span className="font-semibold text-red-600">Out of stock</span>
                    : <span className={item.days_until_stockout <= 3 ? "text-red-600 font-medium" : ""}
                        style={item.days_until_stockout > 3 ? { color: "var(--color-text-secondary)" } : undefined}>
                        {item.days_until_stockout}d
                      </span>
                  }
                </td>
                <td className="px-4 py-3" style={{ color: "var(--color-text-secondary)" }}>{item.preferred_supplier}</td>
                <td className="px-4 py-3 text-right" style={{ color: "var(--color-text-secondary)" }}>{item.suggested_qty}</td>
                <td className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-primary)" }}>{formatMoney(item.estimated_cost_cents)}</td>
                <td className="px-4 py-3">
                  <Badge variant={URGENCY_BADGE[item.urgency]}>{item.urgency}</Badge>
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    disabled={creating === item.id}
                    onClick={() => createPO(item.id, item.product_name)}
                    className="rounded-md border border-blue-300 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                  >
                    {creating === item.id ? "Creating…" : "Create PO"}
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={9} className="py-12 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>No reorder alerts — all products above reorder points</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
