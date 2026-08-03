
interface SparklinePoint {
  value: number;
}

interface KpiCardProps {
  title: string;
  value: string | number;
  icon?: React.ReactNode;
  /** +/- percentage vs prior period */
  trend?: { value: number; label: string };
  tone?: "blue" | "green" | "amber" | "red" | "purple" | "neutral";
  loading?: boolean;
  /** Last N data points for the sparkline (renders when ≥ 2 points provided) */
  sparkline?: SparklinePoint[];
  /** Deep-link for "View report" — renders a small link below the KPI */
  reportHref?: string;
}

// Tone → icon background + text color (using CSS var tokens where possible)
const TONE_ICON_BG: Record<string, string> = {
  blue:    "bg-info-50 text-info-600",
  green:   "bg-success-50 text-success-600",
  amber:   "bg-warning-50 text-warning-600",
  red:     "bg-danger-50 text-danger-600",
  purple:  "bg-[var(--color-primary-subtle)] text-brand-600",
  neutral: "bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)]",
};

const TONE_SPARK: Record<string, string> = {
  blue:    "#1890FF",
  green:   "#389E0D",
  amber:   "#D48806",
  red:     "#CF1322",
  purple:  "#5D5FEF",
  neutral: "#697386",
};

function Sparkline({ points, color }: { points: SparklinePoint[]; color: string }) {
  if (points.length < 2) return null;
  const W = 72;
  const H = 28;
  const vals = points.map((p) => p.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const xs = vals.map((_, i) => (i / (vals.length - 1)) * W);
  const ys = vals.map((v) => H - ((v - min) / range) * (H - 4) - 2);
  const d = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i]!.toFixed(1)}`).join(" ");
  const fill = `${d} L${W},${H} L0,${H} Z`;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" className="shrink-0 opacity-80">
      <path d={fill} fill={color} fillOpacity={0.1} />
      <path d={d} stroke={color} strokeWidth={1.75} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SkeletonLine({ w = "w-3/4", h = "h-7" }: { w?: string; h?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`${h} ${w} rounded animate-skeleton`}
    />
  );
}

export function KpiCard({
  title,
  value,
  icon,
  trend,
  tone = "neutral",
  loading = false,
  sparkline,
  reportHref,
}: KpiCardProps) {
  const isPositive = trend ? trend.value >= 0 : true;
  const sparkColor = TONE_SPARK[tone] ?? "#697386";

  return (
    <div
      className="flex flex-col gap-3 rounded-xl border bg-[var(--color-surface)] p-4 shadow-[var(--shadow-sm)] transition-shadow duration-200 hover:shadow-[var(--shadow-md)]"
      style={{ borderColor: "var(--color-border)" }}
    >
      {/* Header: icon + sparkline */}
      <div className="flex items-start justify-between">
        {icon ? (
          <div className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm ${TONE_ICON_BG[tone]}`}>
            {icon}
          </div>
        ) : <div className="h-8 w-8" />}
        {sparkline && !loading && sparkline.length >= 2 && (
          <Sparkline points={sparkline} color={sparkColor} />
        )}
      </div>

      {/* Value */}
      <div>
        {loading ? (
          <div className="space-y-1.5">
            <SkeletonLine h="h-7" w="w-2/3" />
            <SkeletonLine h="h-3" w="w-1/2" />
          </div>
        ) : (
          <>
            <p className="text-[22px] font-bold tabular-nums leading-none tracking-tight text-[var(--color-text-primary)]">
              {value}
            </p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--color-text-muted)]">
              {title}
            </p>
          </>
        )}
      </div>

      {/* Footer: trend + report link */}
      {!loading && (
        <div className="flex items-center justify-between pt-0.5 border-t border-[var(--color-border-subtle)]">
          {trend ? (
            <div className="flex items-center gap-1">
              <span
                className={`inline-flex items-center justify-center rounded text-[10px] font-bold px-1 py-0.5 ${
                  isPositive
                    ? "bg-success-50 text-success-600"
                    : "bg-danger-50 text-danger-600"
                }`}
              >
                {isPositive ? "↑" : "↓"} {Math.abs(trend.value).toFixed(1)}%
              </span>
              <span className="text-[11px] text-[var(--color-text-muted)]">{trend.label}</span>
            </div>
          ) : <div />}

          {reportHref && (
            <a
              href={reportHref}
              className="text-[11px] font-medium text-brand-600 hover:text-brand-700 hover:underline transition-colors"
            >
              Report →
            </a>
          )}
        </div>
      )}
    </div>
  );
}
