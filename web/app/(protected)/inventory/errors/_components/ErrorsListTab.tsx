"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPatch, ApiResponseError } from "@/api-client/client";
import { Badge, BadgeVariant } from "@/components/Badge";
import { Button } from "@/components/Button";
import { fmtDateTime } from "@/lib/date";

type ErrCategory =
  | "sku_mapping" | "supplier_mapping" | "price_mismatch" | "qty_mismatch"
  | "duplicate_doc" | "missing_barcode" | "missing_cost" | "below_min_order"
  | "expiry_risk" | "unapproved_supplier" | "edi_parse" | "po_invoice_mismatch"
  | "receiving_mismatch";

type ErrSeverity = "critical" | "high" | "medium" | "low";
type ErrStatus = "open" | "in_review" | "resolved" | "ignored" | "escalated";

export interface InventoryError {
  id: string;
  category: ErrCategory;
  severity: ErrSeverity;
  status: ErrStatus;
  title: string;
  description: string;
  affected_entity_type: string;
  affected_entity_name: string;
  detected_at: number;
  resolved_at: number | null;
  resolved_by: string | null;
  resolution: string | null;
  po_number: string | null;
  supplier_name: string | null;
  sku: string | null;
  notes: string | null;
}

const SEVERITY_BADGE: Record<ErrSeverity, BadgeVariant> = {
  critical: "red",
  high: "yellow",
  medium: "blue",
  low: "gray",
};

const STATUS_BADGE: Record<ErrStatus, BadgeVariant> = {
  open: "red",
  in_review: "yellow",
  resolved: "green",
  ignored: "gray",
  escalated: "purple",
};

const CATEGORY_LABELS: Record<ErrCategory, string> = {
  sku_mapping: "SKU Mapping",
  supplier_mapping: "Supplier Mapping",
  price_mismatch: "Price Mismatch",
  qty_mismatch: "Quantity Mismatch",
  duplicate_doc: "Duplicate Document",
  missing_barcode: "Missing Barcode",
  missing_cost: "Missing Cost",
  below_min_order: "Below Min. Order",
  expiry_risk: "Expiry Risk",
  unapproved_supplier: "Unapproved Supplier",
  edi_parse: "EDI Parse Error",
  po_invoice_mismatch: "PO / Invoice Mismatch",
  receiving_mismatch: "Receiving Mismatch",
};

const CATEGORY_ICONS: Record<ErrCategory, string> = {
  sku_mapping: "🔗",
  supplier_mapping: "🏭",
  price_mismatch: "💰",
  qty_mismatch: "📦",
  duplicate_doc: "📋",
  missing_barcode: "🔲",
  missing_cost: "❓",
  below_min_order: "⬇",
  expiry_risk: "⏱",
  unapproved_supplier: "🚫",
  edi_parse: "⚠",
  po_invoice_mismatch: "📄",
  receiving_mismatch: "🔍",
};

interface ActionModalProps {
  error: InventoryError;
  onClose: () => void;
  onDone: (updated: InventoryError) => void;
}

function ActionModal({ error, onClose, onDone }: ActionModalProps) {
  const [action, setAction] = useState<"resolve" | "ignore" | "escalate" | "review">("review");
  const [resolution, setResolution] = useState("");
  const [notes, setNotes] = useState(error.notes ?? "");
  const [saving, setSaving] = useState(false);

  const ACTION_LABELS = {
    review:   "Mark In Review",
    resolve:  "Mark Resolved",
    ignore:   "Ignore (with reason)",
    escalate: "Escalate to Admin",
  };

  async function submit() {
    setSaving(true);
    try {
      const updated = await apiPatch<InventoryError>(`/api/v1/inventory/errors/${error.id}`, {
        action,
        resolution: resolution || undefined,
        notes: notes || undefined,
      });
      onDone(updated);
    } catch {
      // keep modal open on error
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">Resolve Error</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">✕</button>
        </div>
        <div className="space-y-4 px-5 py-4">
          <p className="text-sm font-medium text-slate-800">{error.title}</p>
          <p className="text-xs text-slate-500">{error.description}</p>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">Action</label>
            <div className="grid grid-cols-2 gap-2">
              {(["review", "resolve", "ignore", "escalate"] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAction(a)}
                  className={[
                    "rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
                    action === a
                      ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                      : "border-slate-200 text-slate-600 hover:border-slate-300",
                  ].join(" ")}
                >
                  {ACTION_LABELS[a]}
                </button>
              ))}
            </div>
          </div>

          {(action === "resolve" || action === "ignore") && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">
                {action === "resolve" ? "Resolution notes" : "Reason for ignoring"}
              </label>
              <textarea
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                placeholder="Describe what was done or why this is being ignored…"
                rows={3}
                className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional context…"
              rows={2}
              className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <Button variant="primary" onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Confirm"}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface Props {
  category?: ErrCategory | "all";
  showResolved?: boolean;
}

export function ErrorsListTab({ category = "all", showResolved = false }: Props) {
  const [errors, setErrors] = useState<InventoryError[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filterCat, setFilterCat] = useState<string>(category);
  const [filterSev, setFilterSev] = useState("all");
  const [filterStatus, setFilterStatus] = useState(showResolved ? "all" : "open");
  const [q, setQ] = useState("");
  const [acting, setActing] = useState<InventoryError | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams();
      if (filterCat !== "all") params.set("category", filterCat);
      if (filterSev !== "all") params.set("severity", filterSev);
      if (filterStatus !== "all") params.set("status", filterStatus);
      if (q) params.set("q", q);
      const data = await apiGet<{ items: InventoryError[]; total: number }>(
        `/api/v1/inventory/errors?${params}`
      );
      setErrors(data.items);
    } catch (e) {
      setErr(e instanceof ApiResponseError ? e.message : "Failed to load errors.");
    } finally {
      setLoading(false);
    }
  }, [filterCat, filterSev, filterStatus, q]);

  useEffect(() => { load(); }, [load]);

  function handleDone(updated: InventoryError) {
    setErrors((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    setActing(null);
  }

  const openCount  = errors.filter((e) => e.status === "open").length;
  const criticalCount = errors.filter((e) => e.severity === "critical" && e.status === "open").length;

  return (
    <div className="space-y-4">
      {/* Stats banner */}
      {!showResolved && (openCount > 0 || criticalCount > 0) && (
        <div className="flex items-center gap-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <span className="text-sm font-semibold text-red-800">{openCount} open errors</span>
          {criticalCount > 0 && (
            <span className="rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-bold text-white">
              {criticalCount} critical
            </span>
          )}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder="Search errors…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-8 w-52 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <select
          value={filterCat}
          onChange={(e) => setFilterCat(e.target.value)}
          className="h-8 rounded-lg border border-slate-200 px-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="all">All categories</option>
          {(Object.keys(CATEGORY_LABELS) as ErrCategory[]).map((c) => (
            <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
          ))}
        </select>
        <select
          value={filterSev}
          onChange={(e) => setFilterSev(e.target.value)}
          className="h-8 rounded-lg border border-slate-200 px-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="all">All severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="h-8 rounded-lg border border-slate-200 px-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="open">Open</option>
          <option value="in_review">In Review</option>
          <option value="all">All statuses</option>
          <option value="resolved">Resolved</option>
          <option value="ignored">Ignored</option>
          <option value="escalated">Escalated</option>
        </select>
      </div>

      {err && <p role="alert" className="text-sm text-red-700">{err}</p>}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-sm text-slate-400">Loading…</div>
      ) : errors.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <p className="text-sm font-medium">No errors found</p>
          <p className="text-xs">All clear for the current filters</p>
        </div>
      ) : (
        <div className="space-y-2">
          {errors.map((e) => (
            <div
              key={e.id}
              className={[
                "rounded-xl border bg-white p-4 transition-shadow hover:shadow-sm",
                e.severity === "critical" && e.status === "open"
                  ? "border-red-300"
                  : "border-slate-200",
              ].join(" ")}
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-xl" aria-hidden="true">
                  {CATEGORY_ICONS[e.category]}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">{e.title}</p>
                    <Badge variant={SEVERITY_BADGE[e.severity]}>{e.severity}</Badge>
                    <Badge variant={STATUS_BADGE[e.status]}>{e.status.replace("_", " ")}</Badge>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                      {CATEGORY_LABELS[e.category]}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500 leading-relaxed">{e.description}</p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                    <span>{e.affected_entity_name}</span>
                    {e.po_number && <span>PO: {e.po_number}</span>}
                    {e.supplier_name && <span>Supplier: {e.supplier_name}</span>}
                    {e.sku && <span>SKU: {e.sku}</span>}
                    <span>Detected {fmtDateTime(e.detected_at)}</span>
                    {e.resolved_by && <span>By {e.resolved_by}</span>}
                  </div>
                  {e.notes && (
                    <p className="mt-1 text-xs italic text-slate-400">{e.notes}</p>
                  )}
                  {e.resolution && (
                    <p className="mt-1 text-xs text-green-700">✓ {e.resolution}</p>
                  )}
                </div>
                {(e.status === "open" || e.status === "in_review") && (
                  <button
                    type="button"
                    onClick={() => setActing(e)}
                    className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-indigo-400 hover:text-indigo-700 transition-colors"
                  >
                    Resolve
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {acting && (
        <ActionModal
          error={acting}
          onClose={() => setActing(null)}
          onDone={handleDone}
        />
      )}
    </div>
  );
}
