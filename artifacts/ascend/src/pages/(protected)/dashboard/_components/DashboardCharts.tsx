import { useQuery } from "@/lib/useQuery";
import { apiGet } from "@/api-client/client";
import { LineChart } from "@/components/charts/LineChart";
import { BarChart } from "@/components/charts/BarChart";
import { formatMoney } from "@/lib/money";

function SkeletonBox({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-skeleton rounded border border-[var(--color-border)] ${className}`} />;
}

interface TrendDay { date: string; label: string; revenueCents: number; orderCount: number; }
interface TrendResponse { items: TrendDay[]; }

interface HourlyBucket { hour: number; label: string; orderCount: number; revenueCents: number; value: number; }
interface HourlyResponse { items: HourlyBucket[]; }

export function DashboardCharts({ range, scope }: { range: string; scope: string }) {
  const trendRange = range === "today" ? "7d" : range;

  const { data: trendData, loading: loadingTrend } = useQuery(
    `dashboard:trend:${trendRange}:${scope}`,
    () => apiGet<TrendResponse>(`/api/v1/reports/revenue-trend?range=${trendRange}&${scope}`)
  );
  
  const { data: hourlyData, loading: loadingHourly } = useQuery(
    `dashboard:hourly:${range}:${scope}`,
    () => apiGet<HourlyResponse>(`/api/v1/reports/hourly?range=${range}&${scope}`)
  );

  const trendPoints = (trendData?.items ?? []).map((d) => ({ label: d.label, value: d.revenueCents }));
  const hourlyPoints = (hourlyData?.items ?? []).map((d) => ({ label: d.label, value: d.revenueCents }));

  return (
    <section>
      <h2 className="mb-4 text-lg font-bold tracking-tight text-[var(--color-text-primary)]">Performance Analytics</h2>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Trend */}
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
          <div className="mb-4">
            <h3 className="text-[13px] font-semibold text-[var(--color-text-primary)]">Revenue Trend</h3>
            <p className="mt-0.5 text-[12px] text-[var(--color-text-secondary)]">Trailing {trendRange === "7d" ? "7" : "30"} days</p>
          </div>
          {loadingTrend ? (
            <SkeletonBox className="h-[250px] w-full" />
          ) : trendPoints.length === 0 ? (
            <div className="flex h-[250px] items-center justify-center rounded border border-dashed border-[var(--color-border)] text-[13px] text-[var(--color-text-muted)]">
              No trend data available.
            </div>
          ) : (
            <div className="h-[250px] w-full">
              <LineChart
                data={trendPoints}
                height={250}
                color="var(--color-primary)"
                formatValue={(val) => formatMoney(val)}
              />
            </div>
          )}
        </div>

        {/* Hourly */}
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
          <div className="mb-4">
            <h3 className="text-[13px] font-semibold text-[var(--color-text-primary)]">Hourly Performance</h3>
            <p className="mt-0.5 text-[12px] text-[var(--color-text-secondary)]">Revenue by hour of day</p>
          </div>
          {loadingHourly ? (
            <SkeletonBox className="h-[250px] w-full" />
          ) : hourlyPoints.length === 0 ? (
            <div className="flex h-[250px] items-center justify-center rounded border border-dashed border-[var(--color-border)] text-[13px] text-[var(--color-text-muted)]">
              No hourly data available.
            </div>
          ) : (
            <div className="h-[250px] w-full">
              <BarChart
                data={hourlyPoints}
                height={250}
                color="var(--color-primary)"
                formatValue={(val) => formatMoney(val)}
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
