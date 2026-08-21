"use client";

import Link from "next/link";

export type RecommendationSeverity = "critical" | "warning" | "info";

export interface DashboardRecommendation {
  id: string;
  signalCode: string | null;
  category: "setup" | "inventory" | "pricing" | "sales" | "expenses" | "profit";
  severity: RecommendationSeverity;
  title: string;
  detail: string;
  action: string;
  href: string;
  count: number;
  rank: number;
}

export interface RecommendationReport {
  ready: boolean;
  recommendations: DashboardRecommendation[];
  summary: { total: number; critical: number; warning: number; info: number };
  generatedAt: number;
  recentDays: number;
}

const SEVERITY_STYLES: Record<RecommendationSeverity, { dot: string }> = {
  critical: { dot: "bg-danger-500 shadow-[0_0_8px_rgba(207,19,34,0.6)]" },
  warning: { dot: "bg-warning-500 shadow-[0_0_8px_rgba(212,136,6,0.6)]" },
  info: { dot: "bg-[var(--color-info)]" },
};

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 18) return "Good Afternoon";
  return "Good Evening";
}

export function DashboardPrioritiesPanel({
  report,
  loading,
  onTrackTask,
  reorderCount,
  error = null,
}: {
  report?: RecommendationReport;
  loading: boolean;
  onTrackTask?: (rec: DashboardRecommendation) => void | Promise<void>;
  reorderCount: number;
  error?: string | null;
}) {
  const recommendations = [...(report?.recommendations ?? [])].sort((a, b) => a.rank - b.rank);

  return (
    <section className="relative flex flex-col overflow-hidden rounded-2xl border border-brand-500/20 bg-gradient-to-b from-brand-900 to-[#0A2540] shadow-lg">
      <div className="absolute right-0 top-0 h-40 w-40 -translate-y-1/2 translate-x-1/2 rounded-full bg-brand-500/20 blur-[64px]" />

      <div className="relative z-10 flex items-center gap-3 border-b border-white/10 px-6 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/20 text-brand-300 ring-1 ring-brand-500/30">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
          </svg>
        </div>
        <h2 className="text-[15px] font-bold tracking-tight text-white">Recommendations</h2>
      </div>

      <div className="relative z-10 flex-1 px-6 pb-6 pt-5">
        <p className="text-xl font-semibold tracking-tight text-white">{getGreeting()}.</p>
        <p className="mt-1 text-[13px] text-brand-200">Here are today&apos;s priorities.</p>

        {error && (
          <p className="mt-4 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[12px] text-brand-100" role="alert">
            {error}
          </p>
        )}

        <ul className="mt-6 space-y-3">
          {reorderCount > 0 && (
            <li className="flex items-start gap-3">
              <span className="mt-1.5 flex h-1.5 w-1.5 shrink-0 rounded-full bg-warning-500 shadow-[0_0_8px_rgba(212,136,6,0.6)]" />
              <span className="text-[13px] leading-relaxed text-white/90">
                <strong className="font-semibold text-white">{reorderCount} products</strong> need reordering.
              </span>
            </li>
          )}

          {loading ? (
            <div className="mt-4 space-y-3">
              <div className="h-4 w-3/4 animate-skeleton rounded bg-white/10" />
              <div className="h-4 w-2/3 animate-skeleton rounded bg-white/10" />
              <div className="h-4 w-5/6 animate-skeleton rounded bg-white/10" />
            </div>
          ) : (
            recommendations.slice(0, 5).map((rec) => {
              const style = SEVERITY_STYLES[rec.severity];
              return (
                <li key={rec.id} className="group flex items-start gap-3">
                  <span className={`mt-1.5 flex h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] leading-relaxed text-white/90 transition-colors group-hover:text-white">{rec.title}</p>
                    <div className="mt-1 flex items-center gap-3">
                      <Link href={rec.href} className="text-[11px] font-medium text-brand-300 hover:text-brand-200 hover:underline">
                        {rec.action} →
                      </Link>
                      {onTrackTask && (
                        <button
                          type="button"
                          onClick={() => onTrackTask(rec)}
                          className="min-h-touch text-[11px] font-medium text-white/40 transition-colors hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
                        >
                          Track task
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })
          )}

          {!loading && recommendations.length === 0 && reorderCount === 0 && (
            <li className="flex items-start gap-3">
              <span className="mt-1.5 flex h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
              <span className="text-[13px] leading-relaxed text-white/90">
                All systems nominal. No urgent actions required.
              </span>
            </li>
          )}
        </ul>
      </div>

      <div className="relative z-10 border-t border-white/10 bg-black/20 px-6 py-3">
        <Link
          href="/reports"
          className="flex min-h-touch items-center gap-1.5 text-[12px] font-medium text-brand-300 transition-colors hover:text-brand-200"
        >
          View all insights
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="5" y1="12" x2="19" y2="12"></line>
            <polyline points="12 5 19 12 12 19"></polyline>
          </svg>
        </Link>
      </div>
    </section>
  );
}
