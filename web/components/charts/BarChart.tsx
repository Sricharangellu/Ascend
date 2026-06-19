"use client";

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

const PAD = { top: 8, right: 8, bottom: 28, left: 8 };

export function BarChart({
  data,
  height = 160,
  color = "#3b82f6",
  formatValue = String,
  loading = false,
  showEveryNthLabel = 4,
}: BarChartProps) {
  if (loading) {
    return (
      <div className="animate-pulse rounded bg-slate-100" style={{ height }} />
    );
  }
  if (!data.length) {
    return (
      <div className="flex items-center justify-center text-sm text-slate-400" style={{ height }}>
        No data
      </div>
    );
  }

  const W = 600;
  const H = height;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const barW = innerW / data.length;
  const gap = Math.max(1, barW * 0.15);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      style={{ height }}
      aria-hidden="true"
    >
      {data.map((d, i) => {
        const barH = (d.value / maxVal) * innerH;
        const x = PAD.left + i * barW + gap / 2;
        const y = PAD.top + innerH - barH;
        const w = barW - gap;
        return (
          <g key={i}>
            <title>{`${d.label}: ${formatValue(d.value)}`}</title>
            <rect
              x={x}
              y={y}
              width={Math.max(w, 1)}
              height={Math.max(barH, 1)}
              rx="2"
              fill={d.value > 0 ? color : "#e2e8f0"}
              fillOpacity={d.value > 0 ? 0.85 : 1}
            />
            {i % showEveryNthLabel === 0 && (
              <text
                x={x + w / 2}
                y={H - 6}
                textAnchor="middle"
                fontSize="10"
                fill="#94a3b8"
              >
                {d.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
