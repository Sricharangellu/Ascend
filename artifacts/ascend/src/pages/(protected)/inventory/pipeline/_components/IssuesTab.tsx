import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPatch, ApiResponseError } from "@/api-client/client";
import { Badge } from "@/components/Badge";
import type { BadgeVariant } from "@/components/Badge";

interface IssueItem {
  id: string;
  po_number: string;
  supplier_name: string;
  product_name: string;
  sku: string;
  issue_type: "price_variance" | "qty_discrepancy" | "quality_reject" | "duplicate_po";
  description: string;
  severity: "high" | "medium" | "low";
  created_at: number;
  assigned_to: string;
  status: "open" | "investigating" | "resolved";
}

const SEVERITY_BADGE: Record<IssueItem["severity"], BadgeVariant> = {
  high: "red",
  medium: "yellow",
  low: "gray",
};

const STATUS_BADGE: Record<IssueItem["status"], BadgeVariant> = {
  open: "red",
  investigating: "yellow",
  resolved: "green",
};

const ISSUE_TYPE_LABELS: Record<IssueItem["issue_type"], string> = {
  price_variance: "Price Variance",
  qty_discrepancy: "Qty Discrepancy",
  quality_reject: "Quality Reject",
  duplicate_po: "Duplicate PO",
};

function fmtDate(ms: number) {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function IssuesTab() {
  const [items, setItems] = useState<IssueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<{ items: IssueItem[] }>("/api/v1/inventory/pipeline/issues");
      setItems(res.items);
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : "Failed to load issues.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function updateStatus(id: string, status: IssueItem["status"]) {
    setUpdating(id);
    try {
      const updated = await apiPatch<IssueItem>(`/api/v1/inventory/pipeline/issues/${id}`, { status });
      setItems((prev) => prev.map((i) => (i.id === id ? updated : i)));
    } catch {
      // silently ignore
    } finally {
      setUpdating(null);
    }
  }

  if (loading) return <div className="py-12 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>Loading…</div>;
  if (error) return <p role="alert" className="text-sm text-red-700 py-6">{error}</p>;

  const open = items.filter((i) => i.status !== "resolved");
  const resolved = items.filter((i) => i.status === "resolved");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 text-sm" style={{ color: "var(--color-text-muted)" }}>
        <span><strong className="text-red-600">{open.length}</strong> open</span>
        <span><strong style={{ color: "var(--color-text-muted)" }}>{resolved.length}</strong> resolved</span>
      </div>

      {[...open, ...resolved].map((item) => (
        <div
          key={item.id}
          className={`rounded-lg border p-4 ${item.status === "resolved" ? "opacity-70" : ""}`}
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: item.status === "resolved" ? "var(--color-surface-subtle)" : "var(--color-surface)",
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium" style={{ color: "var(--color-text-primary)" }}>{item.po_number}</span>
                <Badge variant={SEVERITY_BADGE[item.severity]}>{item.severity}</Badge>
                <Badge variant={STATUS_BADGE[item.status]}>{item.status}</Badge>
                <span
                  className="rounded px-1.5 py-0.5 text-xs"
                  style={{ backgroundColor: "var(--color-surface-subtle)", color: "var(--color-text-secondary)" }}
                >
                  {ISSUE_TYPE_LABELS[item.issue_type]}
                </span>
              </div>
              <p className="mt-1 text-sm" style={{ color: "var(--color-text-secondary)" }}>{item.description}</p>
              <p className="mt-1.5 text-xs" style={{ color: "var(--color-text-muted)" }}>
                {item.product_name} · {item.sku} · {item.supplier_name} · assigned to {item.assigned_to} · {fmtDate(item.created_at)}
              </p>
            </div>

            {item.status !== "resolved" && (
              <div className="flex flex-shrink-0 gap-2">
                {item.status === "open" && (
                  <button
                    type="button"
                    disabled={updating === item.id}
                    onClick={() => updateStatus(item.id, "investigating")}
                    className="rounded-md border px-2.5 py-1 text-xs hover:bg-[var(--color-surface-subtle)] disabled:opacity-50"
                    style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}
                  >
                    Investigate
                  </button>
                )}
                <button
                  type="button"
                  disabled={updating === item.id}
                  onClick={() => updateStatus(item.id, "resolved")}
                  className="rounded-md border border-green-300 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 hover:bg-green-100 disabled:opacity-50"
                >
                  {updating === item.id ? "…" : "Resolve"}
                </button>
              </div>
            )}
          </div>
        </div>
      ))}

      {items.length === 0 && (
        <div
          className="rounded-lg border border-dashed py-12 text-center text-sm"
          style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
        >
          No pipeline issues
        </div>
      )}
    </div>
  );
}
