
import { useCallback, useEffect, useState } from "react";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { TableSkeleton } from "@/components/TableSkeleton";
import { apiGet, ApiResponseError } from "@/api-client/client";
import type { AuditEvent, AuditLogResponse, AuditAction } from "@/api-client/types";
import { fmtDateTime } from "@/lib/date";

// ─── Constants ────────────────────────────────────────────────────────────────

const ACTION_BADGE: Record<AuditAction, "blue" | "green" | "red" | "yellow" | "gray" | "purple"> = {
  created:  "green",
  updated:  "blue",
  deleted:  "red",
  login:    "gray",
  logout:   "gray",
  exported: "purple",
  refunded: "yellow",
  voided:   "red",
  approved: "green",
  rejected: "red",
};

const RESOURCE_TYPE_LABELS: Record<string, string> = {
  product:       "Product",
  order:         "Order",
  purchase_order:"Purchase Order",
  discount:      "Discount",
  custom_role:   "Custom Role",
  report:        "Report",
  settings:      "Settings",
  session:       "Session",
};

const RESOURCE_TYPES = ["", "product", "order", "purchase_order", "discount", "custom_role", "report", "settings", "session"];
const ACTIONS: Array<"" | AuditAction> = ["", "created", "updated", "deleted", "login", "logout", "exported", "refunded", "voided", "approved", "rejected"];

const ctrlCls = "h-8 rounded-lg border px-3 text-[13px] outline-none transition-all focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500";
const ctrlStyle = { borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" };

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AuditLogPage() {
  const [items, setItems]     = useState<AuditEvent[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [actorQ, setActorQ]           = useState("");
  const [resourceType, setResourceType] = useState("");
  const [action, setAction]           = useState<"" | AuditAction>("");
  const [offset, setOffset]           = useState(0);
  const LIMIT = 20;

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ limit: String(LIMIT), offset: String(offset) });
      if (actorQ.trim()) params.set("actor", actorQ.trim());
      if (resourceType) params.set("resource_type", resourceType);
      if (action) params.set("action", action);
      const data = await apiGet<AuditLogResponse>(`/api/v1/audit-log?${params.toString()}`);
      setItems(data.items);
      setTotal(data.total);
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : "Failed to load audit log.");
    } finally { setLoading(false); }
  }, [actorQ, resourceType, action, offset]);

  useEffect(() => { void load(); }, [load]);

  const applyFilters = () => { setOffset(0); void load(); };

  return (
    <EnterpriseShell active="audit-log" title="Audit Log" subtitle="Full history of user actions" contentClassName="overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl space-y-4 px-5 py-5 sm:px-6">

        {/* ── Page header ──────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4" style={{ borderColor: "var(--color-border)" }}>
          <div>
            <h1 className="text-[20px] font-bold tracking-tight" style={{ color: "var(--color-text-primary)" }}>Audit Log</h1>
            <p className="mt-0.5 text-[13px]" style={{ color: "var(--color-text-secondary)" }}>Complete history of user actions across the system.</p>
          </div>
          <span className="text-[13px] tabular-nums" style={{ color: "var(--color-text-secondary)" }}>
            {total.toLocaleString()} events
          </span>
        </div>

        {/* ── Filter bar ────────────────────────────────────────────────── */}
        <div
          className="flex flex-wrap items-end gap-3 rounded-xl border p-4"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-subtle)" }}
        >
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-[0.04em]" style={{ color: "var(--color-text-secondary)" }}>
              Actor (email)
            </label>
            <input
              value={actorQ}
              onChange={(e) => setActorQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") applyFilters(); }}
              placeholder="Filter by email…"
              className={`${ctrlCls} w-52`}
              style={ctrlStyle}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-[0.04em]" style={{ color: "var(--color-text-secondary)" }}>
              Resource type
            </label>
            <select
              value={resourceType}
              onChange={(e) => { setResourceType(e.target.value); setOffset(0); }}
              className={ctrlCls}
              style={ctrlStyle}
            >
              <option value="">All types</option>
              {RESOURCE_TYPES.filter(Boolean).map((t) => (
                <option key={t} value={t}>{RESOURCE_TYPE_LABELS[t] ?? t}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-[0.04em]" style={{ color: "var(--color-text-secondary)" }}>
              Action
            </label>
            <select
              value={action}
              onChange={(e) => { setAction(e.target.value as "" | AuditAction); setOffset(0); }}
              className={ctrlCls}
              style={ctrlStyle}
            >
              <option value="">All actions</option>
              {ACTIONS.filter(Boolean).map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="primary" onClick={applyFilters}>Apply</Button>
            <Button size="sm" variant="secondary" onClick={() => { setActorQ(""); setResourceType(""); setAction(""); setOffset(0); }}>
              Reset
            </Button>
          </div>
        </div>

        {/* ── Error ────────────────────────────────────────────────────── */}
        {error && (
          <div role="alert" className="rounded-xl border px-4 py-3 text-[13px]"
            style={{ backgroundColor: "var(--color-danger-bg)", borderColor: "var(--color-danger-border)", color: "var(--color-danger-text)" }}>
            {error}
          </div>
        )}

        {/* ── Table ────────────────────────────────────────────────────── */}
        {loading ? (
          <TableSkeleton headers={["When", "Actor", "Action", "Resource", "IP", ""]} rows={10} />
        ) : items.length === 0 ? (
          <div className="rounded-xl border py-16 text-center" style={{ borderColor: "var(--color-border)" }}>
            <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>No events match the current filters.</p>
            <p className="mt-1 text-[13px]" style={{ color: "var(--color-text-secondary)" }}>Try resetting the filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border shadow-[var(--shadow-sm)]"
            style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
            <table className="w-full text-[13px]">
              <thead style={{ backgroundColor: "var(--color-table-header)", borderBottom: "1px solid var(--color-border)" }}>
                <tr>
                  {["When", "Actor", "Action", "Resource", "IP", ""].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.05em]"
                      style={{ color: "var(--color-text-secondary)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((ev) => (
                  <>
                    <tr
                      key={ev.id}
                      className="cursor-pointer border-b transition-colors duration-75"
                      style={{ borderColor: "var(--color-table-border)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--color-table-row-hover)")}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = expanded === ev.id ? "var(--color-primary-subtle)" : "")}
                      onClick={() => setExpanded(expanded === ev.id ? null : ev.id)}
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
                        {fmtDateTime(ev.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>{ev.actor.email}</div>
                        <div className="text-[11px] capitalize" style={{ color: "var(--color-text-muted)" }}>{ev.actor.role}</div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={ACTION_BADGE[ev.action as AuditAction] ?? "gray"}>{ev.action}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>{ev.resource_label}</div>
                        <div className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                          {RESOURCE_TYPE_LABELS[ev.resource_type] ?? ev.resource_type}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                        {ev.ip_address ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                        {ev.changes ? "▾ details" : ""}
                      </td>
                    </tr>
                    {expanded === ev.id && ev.changes && (
                      <tr key={`${ev.id}-details`} style={{ backgroundColor: "var(--color-primary-subtle)" }}>
                        <td colSpan={6} className="px-6 py-3">
                          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--color-text-secondary)" }}>
                            Changes
                          </p>
                          <div className="space-y-1">
                            {Object.entries(ev.changes).map(([field, { from, to }]) => (
                              <div key={field} className="flex items-center gap-3 text-[11px]">
                                <span className="w-32 shrink-0 font-mono font-medium" style={{ color: "var(--color-text-primary)" }}>{field}</span>
                                <span className="text-danger-600 line-through">{JSON.stringify(from)}</span>
                                <span style={{ color: "var(--color-text-muted)" }}>→</span>
                                <span className="text-success-700">{JSON.stringify(to)}</span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Pagination ────────────────────────────────────────────────── */}
        {total > LIMIT && (
          <div className="flex items-center justify-between">
            <span className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
              {offset + 1}–{Math.min(offset + LIMIT, total)} of {total.toLocaleString()}
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - LIMIT))}>
                ← Prev
              </Button>
              <Button size="sm" variant="secondary" disabled={offset + LIMIT >= total} onClick={() => setOffset((o) => o + LIMIT)}>
                Next →
              </Button>
            </div>
          </div>
        )}
      </div>
    </EnterpriseShell>
  );
}
