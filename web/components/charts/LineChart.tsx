"use client";

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

const PAD = { top: 12, right: 16, bottom: 32, left: 52 };

function ticks(min: number, max: number, count: number): number[] {
  if (max === min) return [min];
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, i) => min + i * step);
}

export function LineChart({
  data,
  height = 220,
  color = "#3b82f6",
  formatValue = String,
  loading = false,
  showDots = true,
}: LineChartProps) {
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

  const W = 600; // internal viewBox width
  const H = height;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const minVal = Math.min(...data.map((d) => d.value), 0);

  const xScale = (i: number) => PAD.left + (i / (data.length - 1 || 1)) * innerW;
  const yScale = (v: number) => PAD.top + innerH - ((v - minVal) / (maxVal - minVal || 1)) * innerH;

  const points = data.map((d, i) => `${xScale(i)},${yScale(d.value)}`).join(" ");
  const areaPath = [
    `M ${xScale(0)},${PAD.top + innerH}`,
    ...data.map((d, i) => `L ${xScale(i)},${yScale(d.value)}`),
    `L ${xScale(data.length - 1)},${PAD.top + innerH}`,
    "Z",
  ].join(" ");

  const yTickValues = ticks(minVal, maxVal, 4);

  // Show at most 8 x-axis labels to avoid crowding
  const xLabelEvery = Math.ceil(data.length / 8);

  const fillId = `area-${color.replace("#", "")}`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      style={{ height }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {/* Y-axis grid lines + labels */}
      {yTickValues.map((v, i) => {
        const y = yScale(v);
        return (
          <g key={i}>
            <line
              x1={PAD.left}
              y1={y}
              x2={PAD.left + innerW}
              y2={y}
              stroke="#e2e8f0"
              strokeWidth="1"
            />
            <text
              x={PAD.left - 6}
              y={y + 4}
              textAnchor="end"
              fontSize="11"
              fill="#94a3b8"
            >
              {formatValue(v)}
            </text>
          </g>
        );
      })}

      {/* Area fill */}
      <path d={areaPath} fill={`url(#${fillId})`} />

      {/* Line */}
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Dots */}
      {showDots &&
        data.map((d, i) => (
          <circle
            key={i}
            cx={xScale(i)}
            cy={yScale(d.value)}
            r="3"
            fill="white"
            stroke={color}
            strokeWidth="2"
          />
        ))}

      {/* X-axis labels */}
      {data.map((d, i) => {
        if (i % xLabelEvery !== 0 && i !== data.length - 1) return null;
        return (
          <text
            key={i}
            x={xScale(i)}
            y={H - 8}
            textAnchor="middle"
            fontSize="11"
            fill="#94a3b8"
          >
            {d.label}
          </text>
        );
      })}
    </svg>
  );
}
