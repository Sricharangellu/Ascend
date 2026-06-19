"use client";

/**
 * KpiCard — dashboard KPI tile with optional trend indicator.
 * Adapted from Kimi_Agent wholesale POS reference implementation.
 */

interface KpiCardProps {
  title: string;
  value: string | number;
  icon?: React.ReactNode;
  trend?: { value: number; label: string };
  tone?: "blue" | "green" | "amber" | "red" | "neutral";
  loading?: boolean;
}

const TONE_ICON: Record<string, string> = {
  blue: "bg-blue-50 text-blue-600",
  green: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  red: "bg-red-50 text-red-600",
  neutral: "bg-slate-100 text-slate-500",
};

export function KpiCard({ title, value, icon, trend, tone = "neutral", loading = false }: KpiCardProps) {
  const isPositive = trend ? trend.value >= 0 : true;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        {icon ? (
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${TONE_ICON[tone]}`}>
            {icon}
          </div>
        ) : <div />}
      </div>

      {loading ? (
        <div className="h-8 w-3/4 animate-pulse rounded bg-slate-200 mt-1" />
      ) : (
        <p className="text-2xl font-bold tabular-nums text-slate-950">{value}</p>
      )}
      <p className="mt-0.5 text-xs font-medium uppercase tracking-[0.1em] text-slate-500">{title}</p>

      {trend && !loading && (
        <div className="mt-2 flex items-center gap-1">
          <svg
            width="12" height="12" viewBox="0 0 12 12" fill="none"
            className={isPositive ? "text-emerald-600" : "text-red-600"}
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          >
            {isPositive
              ? <><path d="M2 9L6 3L10 9" /><path d="M6 3v0" /></>
              : <><path d="M2 3L6 9L10 3" /><path d="M6 9v0" /></>}
          </svg>
          <span className={`text-xs font-semibold ${isPositive ? "text-emerald-600" : "text-red-600"}`}>
            {isPositive ? "+" : ""}{trend.value}%
          </span>
          <span className="text-xs text-slate-400">{trend.label}</span>
        </div>
      )}
    </div>
  );
}
