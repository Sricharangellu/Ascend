
import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { formatMoney } from "@/lib/money";
import { apiGet, apiPost } from "@/api-client/client";
import { useToast } from "@/components/Toast";
import { urgencyBadge, urgencyLabel } from "./insightsTypes";
import type { ReorderRec, OrderRec } from "./insightsTypes";

export function ForecastingTab() {
  const [reorder, setReorder] = useState<ReorderRec[]>([]);
  const [topSellers, setTopSellers] = useState<OrderRec[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingPOs, setCreatingPOs] = useState(false);
  const { addToast } = useToast();

  const handleCreateReorderPOs = useCallback(async () => {
    setCreatingPOs(true);
    try {
      const result = await apiPost<{ created: number; pos: Array<{ id: string; supplierId: string | null; lineCount: number }> }>(
        "/api/v1/insights/create-reorder-pos", {},
      );
      if (result.created === 0) {
        addToast({ title: "No POs needed", description: "All products above reorder point", variant: "info" });
      } else {
        addToast({ title: `${result.created} draft PO${result.created > 1 ? "s" : ""} created`, description: "Go to Purchasing to review", variant: "success" });
      }
    } catch (e) {
      addToast({ title: "Failed to create POs", description: e instanceof Error ? e.message : undefined, variant: "error" });
    } finally { setCreatingPOs(false); }
  }, [addToast]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiGet<{ items: ReorderRec[] }>("/api/v1/insights/reorder"),
      apiGet<{ items: OrderRec[] }>("/api/v1/insights/order-recommendations"),
    ]).then(([r, t]) => {
      if (!cancelled) {
        setReorder(r.items ?? []);
        setTopSellers(t.items ?? []);
      }
    }).catch(() => {}).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <p className="text-sm" style={{ color: "var(--color-text-muted)" }} aria-busy="true">Loading…</p>;

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden p-0">
        <div className="flex items-start justify-between gap-3 px-4 py-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <div>
            <h2 className="text-base font-semibold" style={{ color: "var(--color-text-primary)" }}>Reorder recommendations</h2>
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Products at or below reorder point, or projected to run out before lead time.</p>
          </div>
          {reorder.some((r) => r.belowReorderPoint) && (
            <Button variant="primary" size="sm" loading={creatingPOs} onClick={() => void handleCreateReorderPOs()}>
              Create Draft POs
            </Button>
          )}
        </div>
        {reorder.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>All products are well-stocked.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr
                className="text-left text-xs font-semibold uppercase tracking-[0.08em]"
                style={{ borderBottom: "1px solid var(--color-border)", backgroundColor: "var(--color-table-header)", color: "var(--color-text-muted)" }}
              >
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">On hand</th>
                <th className="px-4 py-3 hidden sm:table-cell">Reorder qty</th>
                <th className="px-4 py-3 hidden md:table-cell">Days of stock</th>
                <th className="px-4 py-3 hidden md:table-cell">Velocity/day</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-table-border)]">
              {reorder.map((r) => (
                <tr key={r.productId} className="hover:bg-[var(--color-surface-subtle)] transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium" style={{ color: "var(--color-text-primary)" }}>{r.name}</p>
                    <p className="text-xs font-mono" style={{ color: "var(--color-text-muted)" }}>{r.sku}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={r.currentStock === 0 ? "font-semibold text-red-600" : r.belowReorderPoint ? "font-semibold text-amber-600" : ""}
                          style={r.currentStock === 0 || r.belowReorderPoint ? {} : { color: "var(--color-text-secondary)" }}>
                      {r.currentStock}
                    </span>
                    <span className="text-xs ml-1" style={{ color: "var(--color-text-muted)" }}>/ {r.reorderPoint} min</span>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell" style={{ color: "var(--color-text-secondary)" }}>
                    {r.reorderQuantity > 0 ? r.reorderQuantity : "—"}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell" style={{ color: "var(--color-text-secondary)" }}>
                    {r.daysOfStock >= 9999 ? "∞" : `${r.daysOfStock}d`}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell" style={{ color: "var(--color-text-muted)" }}>
                    {r.velocityPerDay.toFixed(1)} u/day
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={urgencyBadge(r)}>{urgencyLabel(r)}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <h2 className="text-base font-semibold" style={{ color: "var(--color-text-primary)" }}>Top sellers — order recommendations</h2>
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Highest-velocity products over the last 30 days. Flag indicates below reorder point.</p>
        </div>
        {topSellers.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>No sales data available yet.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr
                className="text-left text-xs font-semibold uppercase tracking-[0.08em]"
                style={{ borderBottom: "1px solid var(--color-border)", backgroundColor: "var(--color-table-header)", color: "var(--color-text-muted)" }}
              >
                <th className="px-4 py-3 w-10">#</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Units sold</th>
                <th className="px-4 py-3 hidden sm:table-cell">Gross revenue</th>
                <th className="px-4 py-3">Stock status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-table-border)]">
              {topSellers.map((t) => (
                <tr key={t.productId} className="hover:bg-[var(--color-surface-subtle)] transition-colors">
                  <td className="px-4 py-3 font-medium" style={{ color: "var(--color-text-muted)" }}>{t.rank}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium" style={{ color: "var(--color-text-primary)" }}>{t.name}</p>
                    <p className="text-xs font-mono" style={{ color: "var(--color-text-muted)" }}>{t.sku}</p>
                  </td>
                  <td className="px-4 py-3 font-semibold" style={{ color: "var(--color-text-primary)" }}>{t.totalUnitsSold.toLocaleString()}</td>
                  <td className="px-4 py-3 hidden sm:table-cell" style={{ color: "var(--color-text-secondary)" }}>{formatMoney(t.revenueGrossCents)}</td>
                  <td className="px-4 py-3">
                    {t.belowReorderPoint
                      ? <Badge variant="yellow">Reorder needed</Badge>
                      : <Badge variant="green">In stock</Badge>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
