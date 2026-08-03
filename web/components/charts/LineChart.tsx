"use client";

import {
  ResponsiveContainer,
  LineChart as RLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Area,
  ComposedChart,
} from "recharts";

export interface LineChartPoint {
  label: string;
  value: number;
}

interface LineChartProps {
  data: LineChartPoint[];
  height?: number;
  color?: string;
  formatValue?: (v: number) => string;
  loading?: boolean;
  showDots?: boolean;
}

export function LineChart({
  data,
  height = 220,
  color = "#1B45F4",
  formatValue = (v) => String(v),
  loading = false,
  showDots = true,
}: LineChartProps) {
  if (loading) {
    return <div className="animate-pulse rounded bg-slate-100" style={{ height }} />;
  }
  if (!data.length) {
    return (
      <div className="flex items-center justify-center text-sm text-slate-400" style={{ height }}>
        No data
      </div>
    );
  }

  const chartData = data.map((d) => ({ label: d.label, value: d.value }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`gradient-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.15} />
            <stop offset="95%" stopColor={color} stopOpacity={0.01} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="4 4" stroke="#E5E5E5" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "#A3A3A3" }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#A3A3A3" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={formatValue}
          width={56}
        />
        <Tooltip
          formatter={(v: unknown) => [formatValue(Number(v)), ""]}
          contentStyle={{
            backgroundColor: "white",
            border: "1px solid #E5E5E5",
            borderRadius: "6px",
            boxShadow: "0 4px 12px rgba(17,17,17,0.08)",
            fontSize: "12px",
          }}
          labelStyle={{ color: "#111111", fontWeight: 600 }}
        />
        <Area
          type="monotone"
          dataKey="value"
          fill={`url(#gradient-${color.replace("#", "")})`}
          stroke="none"
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          dot={showDots ? { r: 3, fill: "white", strokeWidth: 2, stroke: color } : false}
          activeDot={{ r: 5, fill: color }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
