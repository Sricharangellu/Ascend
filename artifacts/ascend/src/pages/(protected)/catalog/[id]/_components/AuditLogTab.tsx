
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/Badge";
import { apiGet, ApiResponseError } from "@/api-client/client";
import { fmtDateTime } from "@/lib/date";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AuditEntry {
  id: string;
  product_id: string;
  actor: string;
  actor_role: string;
  action: "create" | "update" | "delete" | "archive";
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  reason: string | null;
  ip: string;
  device: string;
  created_at: number;
}

const ACTION_BADGE: Record<string, "green" | "blue" | "red" | "gray"> = {
  create: "green", update: "blue", delete: "red", archive: "gray",
};

const FIELD_LABELS: Record<string, string> = {
  price_cents: "Retail Price",
  raw_cost_price_cents: "Cost Price",
  status: "Status",
  barcode: "Barcode",
  track_inventory: "Track Inventory",
  reorder_point: "Reorder Point",
  tax_class: "Tax Class",
  name: "Name",
  sku: "SKU",
  description: "Description",
};

function formatValue(field: string | null, value: string | null): string {
  if (value === null) return "—";
  if (field?.endsWith("_cents")) {
    const n = parseInt(value);
    return isNaN(n) ? value : `$${(n / 100).toFixed(2)}`;
  }
  return value;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AuditLogTab({ productId }: { productId: string }) {
  const [entries, setEntries]   = useState<AuditEntry[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const d = await apiGet<{ items: AuditEntry[]; total: number }>(`/api/v1/catalog/${productId}/audit-log`);
      setEntries(d.items ?? []);
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : "Failed to load audit log.");
    } finally { setLoading(false); }
  }, [productId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return (
    <div className="space-y-3">
      {[1, 2, 3, 4].map((i) => <div key={i} className="h-16 animate-skeleton rounded-xl" />)}
    </div>
  );

  if (error) return (
    <p role="alert" className="rounded-xl border px-4 py-3 text-[13px]"
      style={{ backgroundColor: "var(--color-danger-bg)", borderColor: "var(--color-danger-border)", color: "var(--color-danger-text)" }}>
      {error}
    </p>
  );

  if (entries.length === 0) return (
    <div className="rounded-xl border border-dashed py-12 text-center" style={{ borderColor: "var(--color-border)" }}>
      <p className="text-[13px]" style={{ color: "var(--color-text-muted)" }}>No audit entries for this product.</p>
    </div>
  );

  return (
    <div className="space-y-2">
      <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
        {entries.length} change{entries.length !== 1 ? "s" : ""} recorded
      </p>
      <div className="overflow-hidden rounded-xl border shadow-[var(--shadow-sm)]"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
        <table className="w-full text-[13px]">
          <thead style={{ backgroundColor: "var(--color-table-header)", borderBottom: "1px solid var(--color-border)" }}>
            <tr className="text-left text-[10px] font-semibold uppercase tracking-[0.06em]"
              style={{ color: "var(--color-text-secondary)" }}>
              <th className="px-4 py-2.5">When</th>
              <th className="px-4 py-2.5">Who</th>
              <th className="px-4 py-2.5">Action</th>
              <th className="px-4 py-2.5">Field</th>
              <th className="px-4 py-2.5">Change</th>
              <th className="px-4 py-2.5">Device</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-table-border)]">
            {entries.map((e) => (
              <>
                <tr
                  key={e.id}
                  className="cursor-pointer transition-colors hover:bg-[var(--color-table-row-hover)]"
                  onClick={() => setExpanded((v) => v === e.id ? null : e.id)}
                >
                  <td className="whitespace-nowrap px-4 py-3 text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
                    {fmtDateTime(e.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium" style={{ color: "var(--color-text-primary)" }}>{e.actor}</div>
                    <div className="text-[10px] capitalize" style={{ color: "var(--color-text-muted)" }}>{e.actor_role}</div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={ACTION_BADGE[e.action] ?? "gray"}>{e.action}</Badge>
                  </td>
                  <td className="px-4 py-3 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
                    {e.field ? (FIELD_LABELS[e.field] ?? e.field) : <span style={{ color: "var(--color-text-muted)" }}>—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {e.old_value !== null || e.new_value !== null ? (
                      <div className="flex items-center gap-1.5 text-[11px]">
                        {e.old_value !== null && (
                          <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-600 line-through">
                            {formatValue(e.field, e.old_value)}
                          </span>
                        )}
                        {e.old_value !== null && e.new_value !== null && (
                          <span style={{ color: "var(--color-text-muted)" }}>→</span>
                        )}
                        {e.new_value !== null && (
                          <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">
                            {formatValue(e.field, e.new_value)}
                          </span>
                        )}
                      </div>
                    ) : <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>—</span>}
                  </td>
                  <td className="px-4 py-3 text-[11px]" style={{ color: "var(--color-text-muted)" }}>{e.device}</td>
                </tr>
                {expanded === e.id && (
                  <tr key={`${e.id}-exp`} style={{ backgroundColor: "var(--color-surface-subtle)" }}>
                    <td colSpan={6} className="px-4 py-3">
                      <div className="flex flex-wrap gap-x-8 gap-y-1 text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
                        <span>IP: <strong style={{ color: "var(--color-text-primary)" }}>{e.ip}</strong></span>
                        <span>Device: <strong style={{ color: "var(--color-text-primary)" }}>{e.device}</strong></span>
                        {e.reason && <span>Reason: <strong style={{ color: "var(--color-text-primary)" }}>"{e.reason}"</strong></span>}
                        <span>Entry ID: <strong className="font-mono" style={{ color: "var(--color-text-muted)" }}>{e.id}</strong></span>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
