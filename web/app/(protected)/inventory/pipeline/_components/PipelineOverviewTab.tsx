"use client";
import { useCallback, useEffect, useState } from "react";
import { apiGet, ApiResponseError } from "@/api-client/client";
import { formatMoney } from "@/lib/money";

interface Stage {
  key: string;
  label: string;
  count: number;
  value_cents: number;
}

interface KPIs {
  pending_pos: number;
  overdue_pos: number;
  open_issues: number;
  reorder_alerts: number;
  receiving_active: number;
  total_pipeline_value_cents: number;
  avg_lead_time_days: number;
  on_time_delivery_pct: number;
}

interface Summary {
  stages: Stage[];
  kpis: KPIs;
}

const STAGE_COLORS: Record<string, string> = {
  suggested: "bg-slate-100 text-slate-700 border-slate-200",
  draft: "bg-blue-50 text-blue-700 border-blue-200",
  sent: "bg-indigo-50 text-indigo-700 border-indigo-200",
  confirmed: "bg-violet-50 text-violet-700 border-violet-200",
  in_transit: "bg-amber-50 text-amber-700 border-amber-200",
  partially_received: "bg-orange-50 text-orange-700 border-orange-200",
  receiving: "bg-yellow-50 text-yellow-800 border-yellow-200",
  billed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  closed: "bg-green-50 text-green-700 border-green-200",
};

export function PipelineOverviewTab() {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<Summary>("/api/v1/inventory/pipeline/summary");
      setData(res);
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : "Failed to load pipeline summary.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="py-12 text-center text-sm text-slate-400">Loading pipeline…</div>;
  if (error) return <p role="alert" className="text-sm text-red-700 py-6">{error}</p>;
  if (!data) return null;

  const { stages, kpis } = data;

  return (
    <div className="space-y-6">
      {/* KPI Banner */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Pipeline Value", value: formatMoney(kpis.total_pipeline_value_cents), sub: "across all stages" },
          { label: "Pending POs", value: String(kpis.pending_pos), sub: `${kpis.overdue_pos} overdue`, alert: kpis.overdue_pos > 0 },
          { label: "Avg Lead Time", value: `${kpis.avg_lead_time_days}d`, sub: "days supplier→shelf" },
          { label: "On-Time Delivery", value: `${kpis.on_time_delivery_pct}%`, sub: "last 90 days", alert: kpis.on_time_delivery_pct < 90 },
        ].map((k) => (
          <div key={k.label} className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs text-slate-500">{k.label}</p>
            <p className={`mt-1 text-xl font-semibold ${k.alert ? "text-red-600" : "text-slate-900"}`}>{k.value}</p>
            <p className="text-xs text-slate-400">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Alert row */}
      {(kpis.open_issues > 0 || kpis.reorder_alerts > 0 || kpis.receiving_active > 0) && (
        <div className="flex flex-wrap gap-2">
          {kpis.open_issues > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700 border border-red-200">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
              {kpis.open_issues} open issue{kpis.open_issues !== 1 ? "s" : ""}
            </span>
          )}
          {kpis.reorder_alerts > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 border border-amber-200">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              {kpis.reorder_alerts} reorder alert{kpis.reorder_alerts !== 1 ? "s" : ""}
            </span>
          )}
          {kpis.receiving_active > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 border border-blue-200">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
              {kpis.receiving_active} receiving in progress
            </span>
          )}
        </div>
      )}

      {/* Stage flow */}
      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Pipeline Stages</h3>
        <div className="flex flex-wrap gap-2">
          {stages.map((stage, i) => (
            <div key={stage.key} className="flex items-center gap-2">
              <div className={`rounded-lg border px-3 py-2.5 min-w-[110px] ${STAGE_COLORS[stage.key] ?? "bg-slate-50 text-slate-700 border-slate-200"}`}>
                <p className="text-[11px] font-medium leading-tight">{stage.label}</p>
                <p className="mt-0.5 text-lg font-bold leading-none">{stage.count}</p>
                <p className="text-[10px] opacity-70">{formatMoney(stage.value_cents)}</p>
              </div>
              {i < stages.length - 1 && (
                <svg className="h-4 w-4 flex-shrink-0 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
