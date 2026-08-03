"use client";

import { Card } from "@/components/Card";
import { LineChart } from "@/components/charts/LineChart";
import { BarChart } from "@/components/charts/BarChart";
import { formatMoney } from "@/lib/money";

function SkeletonBox({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded bg-slate-200 ${className}`} />;
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
          <div className="px-5 pb-4 pt-2">
            <LineChart
              data={trendPoints}
              height={200}
              color="#10b981"
              loading={loadingTrend}
              formatValue={(v) => formatMoney(v)}
            />
          </div>
        </Card>
      </section>

      {/* Sales by Hour + Payment Mix */}
      <section aria-label="Sales patterns" className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="Sales by Hour" noPadding>
          <div className="px-5 pb-4 pt-2">
            <BarChart
              data={hourlyPoints}
              height={160}
              color="#6366f1"
              loading={loadingHourly}
              showEveryNthLabel={4}
              formatValue={(v) => formatMoney(v)}
            />
          </div>
        </Card>

        <Card title="Revenue Mix by Payment Method" noPadding>
          {loadingPayments ? (
            <div className="space-y-3 px-5 py-4">
              {[0, 1, 2].map((i) => <SkeletonBox key={i} className="h-6 w-full" />)}
            </div>
          ) : paymentEntries.length === 0 ? (
            <p className="px-5 py-4 text-sm text-slate-400">No payments in this period.</p>
          ) : (
            <div className="space-y-3 px-5 py-4">
              {paymentEntries.map(([method, cents]) => {
                const pct = paymentTotal > 0 ? Math.round((cents / paymentTotal) * 100) : 0;
                return (
                  <div key={method}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium capitalize text-slate-700">{method}</span>
                      <span className="tabular-nums text-slate-600">
                        {formatMoney(cents)}{" "}
                        <span className="text-xs text-slate-400">({pct}%)</span>
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-2 rounded-full bg-brand-500 transition-all"
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
