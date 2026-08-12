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

  if (loading) return <div className="py-12 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>Loading…</div>;
  if (error) return <p role="alert" className="text-sm text-red-700 py-6">{error}</p>;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>{items.length} purchase order{items.length !== 1 ? "s" : ""} pending receipt</p>
      </div>
      <div className="overflow-hidden rounded-lg border" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
        <table className="min-w-full text-sm">
          <thead
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ backgroundColor: "var(--color-table-header)", color: "var(--color-text-muted)" }}
          >
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
          <tbody className="divide-y" style={{ borderColor: "var(--color-table-border)" }}>
            {items.map((item) => (
              <tr key={item.id} className="hover:bg-[var(--color-surface-subtle)]">
                <td className="px-4 py-3">
                  <p className="font-medium" style={{ color: "var(--color-text-primary)" }}>{item.po_number}</p>
                  <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{item.supplier_name}</p>
                </td>
                <td className="px-4 py-3">
                  <p style={{ color: "var(--color-text-primary)" }}>{item.product_name}</p>
                  <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{item.sku} · {item.outlet}</p>
                </td>
                <td className="px-4 py-3 text-right" style={{ color: "var(--color-text-secondary)" }}>{item.qty_ordered}</td>
                <td className="px-4 py-3 text-right" style={{ color: "var(--color-text-secondary)" }}>{item.qty_received}</td>
                <td className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-primary)" }}>{formatMoney(item.total_cost_cents)}</td>
                <td className="px-4 py-3">
                  <p className={item.days_overdue > 0 ? "text-red-600 font-medium" : ""}
                    style={item.days_overdue === 0 ? { color: "var(--color-text-secondary)" } : undefined}>
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
                <td colSpan={7} className="py-12 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>No pending items</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
