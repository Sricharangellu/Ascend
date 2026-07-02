"use client";

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
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
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
      {[1, 2, 3, 4].map((i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-slate-100" />)}
    </div>
  );

  if (error) return <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>;

  if (entries.length === 0) return (
    <div className="rounded-lg border border-dashed border-slate-200 py-12 text-center">
      <p className="text-sm text-slate-400">No audit entries for this product.</p>
    </div>
  );

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-400">{entries.length} change{entries.length !== 1 ? "s" : ""} recorded</p>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-4 py-2.5 text-xs font-semibold text-slate-500">When</th>
              <th className="px-4 py-2.5 text-xs font-semibold text-slate-500">Who</th>
              <th className="px-4 py-2.5 text-xs font-semibold text-slate-500">Action</th>
              <th className="px-4 py-2.5 text-xs font-semibold text-slate-500">Field</th>
              <th className="px-4 py-2.5 text-xs font-semibold text-slate-500">Change</th>
              <th className="px-4 py-2.5 text-xs font-semibold text-slate-500">Device</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {entries.map((e) => (
              <>
                <tr
                  key={e.id}
                  className="cursor-pointer hover:bg-slate-50 transition-colors"
                  onClick={() => setExpanded((v) => v === e.id ? null : e.id)}
                >
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtDateTime(e.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{e.actor}</div>
                    <div className="text-[11px] text-slate-400 capitalize">{e.actor_role}</div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={ACTION_BADGE[e.action] ?? "gray"}>{e.action}</Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {e.field ? (FIELD_LABELS[e.field] ?? e.field) : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {e.old_value !== null || e.new_value !== null ? (
                      <div className="flex items-center gap-1.5 text-xs">
                        {e.old_value !== null && (
                          <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-600 line-through">{formatValue(e.field, e.old_value)}</span>
                        )}
                        {e.old_value !== null && e.new_value !== null && (
                          <span className="text-slate-300">→</span>
                        )}
                        {e.new_value !== null && (
                          <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">{formatValue(e.field, e.new_value)}</span>
                        )}
                      </div>
                    ) : <span className="text-slate-400 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{e.device}</td>
                </tr>
                {expanded === e.id && (
                  <tr key={`${e.id}-exp`} className="bg-slate-50">
                    <td colSpan={6} className="px-4 py-3">
                      <div className="flex flex-wrap gap-x-8 gap-y-1 text-xs text-slate-500">
                        <span>IP: <strong className="text-slate-700">{e.ip}</strong></span>
                        <span>Device: <strong className="text-slate-700">{e.device}</strong></span>
                        {e.reason && <span>Reason: <strong className="text-slate-700">"{e.reason}"</strong></span>}
                        <span>Entry ID: <strong className="font-mono text-slate-500">{e.id}</strong></span>
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
