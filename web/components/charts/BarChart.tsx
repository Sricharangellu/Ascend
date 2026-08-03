"use client";

import {
  ResponsiveContainer,
  BarChart as RBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";

export interface BarChartPoint {
  label: string;
  value: number;
}

interface BarChartProps {
  data: BarChartPoint[];
  height?: number;
  color?: string;
  formatValue?: (v: number) => string;
  loading?: boolean;
  showEveryNthLabel?: number;
}

export function BarChart({
  data,
  height = 160,
  color = "#1B45F4",
  formatValue = (v) => String(v),
  loading = false,
  showEveryNthLabel = 4,
}: BarChartProps) {
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

  const maxVal = Math.max(...data.map((d) => d.value), 1);

  const tickFormatter = (_: unknown, index: number) =>
    index % showEveryNthLabel === 0 ? data[index]?.label ?? "" : "";

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RBarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap="20%">
        <CartesianGrid strokeDasharray="4 4" stroke="#E5E5E5" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: "#A3A3A3" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={tickFormatter}
          interval={0}
        />
        <YAxis hide />
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
        <Bar dataKey="value" radius={[2, 2, 0, 0]}>
          {data.map((entry, index) => (
            <Cell
              key={index}
              fill={entry.value > 0 ? color : "#E5E5E5"}
              fillOpacity={entry.value === maxVal ? 1 : 0.7}
            />
          ))}
        </Bar>
      </RBarChart>
    </ResponsiveContainer>
  );
}
