
import { Card } from "@/components/Card";
import { LineChart } from "@/components/charts/LineChart";
import { BarChart } from "@/components/charts/BarChart";
import { formatMoney } from "@/lib/money";

function SkeletonBox({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-skeleton rounded ${className}`} />;
}

interface ChartPoint { label: string; value: number; }

interface Props {
  trendPoints: ChartPoint[];
  hourlyPoints: ChartPoint[];
  paymentsByMethod: Record<string, number> | undefined;
  loadingTrend: boolean;
  loadingHourly: boolean;
  loadingPayments: boolean;
  trendRange: string;
}

export function DashboardCharts({
  trendPoints,
  hourlyPoints,
  paymentsByMethod,
  loadingTrend,
  loadingHourly,
  loadingPayments,
  trendRange,
}: Props) {
  const paymentEntries = Object.entries(paymentsByMethod ?? {});
  const paymentTotal = paymentEntries.reduce((s, [, v]) => s + v, 0);

  return (
    <>
      {/* Revenue Trend */}
      <section aria-label="Revenue trend">
        <Card
          title={`Revenue Trend — Last ${trendRange === "7d" ? "7 Days" : "30 Days"}`}
          noPadding
        >
          <div className="px-5 pb-5 pt-3">
            <LineChart
              data={trendPoints}
              height={200}
              color="#389E0D"
              loading={loadingTrend}
              formatValue={(v) => formatMoney(v)}
            />
          </div>
        </Card>
      </section>

      {/* Sales by Hour + Payment Mix */}
      <section aria-label="Sales patterns" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Sales by Hour" noPadding>
          <div className="px-5 pb-5 pt-3">
            <BarChart
              data={hourlyPoints}
              height={160}
              color="#5D5FEF"
              loading={loadingHourly}
              showEveryNthLabel={4}
              formatValue={(v) => formatMoney(v)}
            />
          </div>
        </Card>

        <Card title="Revenue by Payment Method" noPadding>
          {loadingPayments ? (
            <div className="space-y-3.5 px-5 py-5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="space-y-1.5">
                  <SkeletonBox className="h-3.5 w-1/3" />
                  <SkeletonBox className="h-2 w-full" />
                </div>
              ))}
            </div>
          ) : paymentEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center px-5">
              <p className="text-[13px] text-[var(--color-text-secondary)]">No payments in this period.</p>
            </div>
          ) : (
            <div className="space-y-4 px-5 py-5">
              {paymentEntries.map(([method, cents]) => {
                const pct = paymentTotal > 0 ? Math.round((cents / paymentTotal) * 100) : 0;
                return (
                  <div key={method}>
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-[13px] font-medium capitalize text-[var(--color-text-primary)]">
                        {method}
                      </span>
                      <span className="text-[13px] tabular-nums text-[var(--color-text-secondary)]">
                        {formatMoney(cents)}{" "}
                        <span className="text-[11px] text-[var(--color-text-muted)]">({pct}%)</span>
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-border-subtle)]">
                      <div
                        className="h-full rounded-full bg-brand-500 transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </section>
    </>
  );
}
