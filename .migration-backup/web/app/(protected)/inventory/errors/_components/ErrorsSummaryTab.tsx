"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, ApiResponseError } from "@/api-client/client";

type ErrCategory =
  | "sku_mapping" | "supplier_mapping" | "price_mismatch" | "qty_mismatch"
  | "duplicate_doc" | "missing_barcode" | "missing_cost" | "below_min_order"
  | "expiry_risk" | "unapproved_supplier" | "edi_parse" | "po_invoice_mismatch"
  | "receiving_mismatch";

interface Summary {
  open: number;
  in_review: number;
  critical: number;
  by_category: Record<ErrCategory, { label: string; open: number }>;
}

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

interface Props {
  onCategoryClick: (category: ErrCategory) => void;
}

export function ErrorsSummaryTab({ onCategoryClick }: Props) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<Summary>("/api/v1/inventory/errors/summary");
      setSummary(data);
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : "Failed to load summary.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="flex items-center justify-center py-16 text-sm text-slate-400">Loading…</div>;
  }

  if (error) return <p role="alert" className="text-sm text-red-700">{error}</p>;
  if (!summary) return null;

  const cats = Object.entries(summary.by_category) as [ErrCategory, { label: string; open: number }][];
  const activeCategories = cats.filter(([, v]) => v.open > 0);
  const clearCategories = cats.filter(([, v]) => v.open === 0);

  return (
    <div className="space-y-6">
      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-4">
        <div className={[
          "flex flex-col gap-1 rounded-xl border p-4",
          summary.critical > 0 ? "border-red-300 bg-red-50" : "border-slate-200 bg-white",
        ].join(" ")}>
          <p className="text-xs font-medium text-slate-500">Critical</p>
          <p className={[
            "text-3xl font-bold",
            summary.critical > 0 ? "text-red-700" : "text-slate-900",
          ].join(" ")}>{summary.critical}</p>
          <p className="text-xs text-slate-400">require immediate action</p>
        </div>
        <div className={[
          "flex flex-col gap-1 rounded-xl border p-4",
          summary.open > 0 ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white",
        ].join(" ")}>
          <p className="text-xs font-medium text-slate-500">Open Errors</p>
          <p className={[
            "text-3xl font-bold",
            summary.open > 0 ? "text-amber-700" : "text-slate-900",
          ].join(" ")}>{summary.open}</p>
          <p className="text-xs text-slate-400">need resolution</p>
        </div>
        <div className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">In Review</p>
          <p className="text-3xl font-bold text-slate-900">{summary.in_review}</p>
          <p className="text-xs text-slate-400">being investigated</p>
        </div>
      </div>

      {/* Active categories */}
      {activeCategories.length > 0 && (
        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Categories with open errors
          </h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {activeCategories
              .sort(([, a], [, b]) => b.open - a.open)
              .map(([key, val]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => onCategoryClick(key)}
                  className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition-all hover:border-indigo-300 hover:shadow-sm"
                >
                  <span className="text-2xl" aria-hidden="true">{CATEGORY_ICONS[key]}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900">{val.label}</p>
                    <p className="text-xs text-slate-500">{val.open} open</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-700">
                    {val.open}
                  </span>
                </button>
              ))}
          </div>
        </div>
      )}

      {/* Clear categories */}
      {clearCategories.length > 0 && (
        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
            All clear
          </h3>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {clearCategories.map(([key, val]) => (
              <div
                key={key}
                className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
              >
                <span className="text-lg" aria-hidden="true">{CATEGORY_ICONS[key]}</span>
                <span className="text-xs text-slate-500">{val.label}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2.5" className="ml-auto text-green-500" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
            ))}
          </div>
        </div>
      )}

      {summary.open === 0 && summary.critical === 0 && (
        <div className="flex flex-col items-center gap-3 py-8 text-slate-400">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.5" className="text-green-500" aria-hidden="true">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <p className="text-sm font-medium text-green-700">No open errors — inventory is healthy</p>
        </div>
      )}
    </div>
  );
}
