import { Link } from "wouter";
import { format } from "date-fns";

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

const SEVERITY_STYLES: Record<RecommendationSeverity, { dot: string; text: string }> = {
  critical: { dot: "bg-danger-500 shadow-[0_0_8px_rgba(207,19,34,0.6)]", text: "text-danger-700" },
  warning:  { dot: "bg-warning-500 shadow-[0_0_8px_rgba(212,136,6,0.6)]", text: "text-warning-700" },
  info:     { dot: "bg-info-500", text: "text-info-700" },
};

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 18) return "Good Afternoon";
  return "Good Evening";
}

export function DashboardAiCommandCenter({
  report,
  loading,
  onTrackTask,
  reorderCount
}: {
  report?: RecommendationReport;
  loading: boolean;
  onTrackTask?: (rec: DashboardRecommendation) => void | Promise<void>;
  reorderCount: number;
}) {
  const recommendations = [...(report?.recommendations ?? [])].sort((a, b) => a.rank - b.rank);

  return (
    <section className="flex flex-col rounded-2xl border border-brand-500/20 bg-gradient-to-b from-brand-900 to-[#0A2540] shadow-lg overflow-hidden relative">
      {/* Decorative AI Glow */}
      <div className="absolute top-0 right-0 h-40 w-40 -translate-y-1/2 translate-x-1/2 rounded-full bg-brand-500/20 blur-[64px]" />
      
      <div className="flex items-center gap-3 border-b border-white/10 px-6 py-4 relative z-10">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/20 text-brand-300 ring-1 ring-brand-500/30">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
          </svg>
        </div>
        <h2 className="text-[15px] font-bold tracking-tight text-white">AI Command Center</h2>
      </div>

      <div className="px-6 pt-5 pb-6 relative z-10 flex-1">
        <p className="text-xl font-semibold text-white tracking-tight">{getGreeting()}.</p>
        <p className="mt-1 text-[13px] text-brand-200">Here are today's priorities.</p>

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
            <div className="space-y-3 mt-4">
              <div className="h-4 w-3/4 animate-skeleton rounded bg-white/10" />
              <div className="h-4 w-2/3 animate-skeleton rounded bg-white/10" />
              <div className="h-4 w-5/6 animate-skeleton rounded bg-white/10" />
            </div>
          ) : (
            recommendations.slice(0, 5).map(rec => {
              const style = SEVERITY_STYLES[rec.severity];
              return (
                <li key={rec.id} className="group flex items-start gap-3">
                  <span className={`mt-1.5 flex h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] leading-relaxed text-white/90 group-hover:text-white transition-colors">
                      {rec.title}
                    </p>
                    <div className="mt-1 flex items-center gap-3">
                      <Link href={rec.href} className="text-[11px] font-medium text-brand-300 hover:text-brand-200 hover:underline">
                        {rec.action} →
                      </Link>
                      {onTrackTask && (
                        <button 
                          onClick={() => onTrackTask(rec)}
                          className="text-[11px] font-medium text-white/40 hover:text-white/80 transition-colors"
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
      
      <div className="border-t border-white/10 bg-black/20 px-6 py-3 relative z-10">
        <Link href="/reports" className="text-[12px] font-medium text-brand-300 hover:text-brand-200 transition-colors flex items-center gap-1.5">
          View all insights 
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
        </Link>
      </div>
    </section>
  );
}
