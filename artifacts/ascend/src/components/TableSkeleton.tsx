// Animated skeleton placeholder for table loading states.
// Matches the visual chrome of the enterprise table so there's no layout shift.

interface TableSkeletonProps {
  cols?: number;
  rows?: number;
  headers?: string[];
}

export function TableSkeleton({ cols = 4, rows = 8, headers }: TableSkeletonProps) {
  const colCount = headers ? headers.length : cols;

  return (
    <div
      className="overflow-hidden rounded-xl border shadow-[var(--shadow-sm)]"
      style={{ borderColor: "var(--color-table-border)", backgroundColor: "var(--color-surface)" }}
      role="status"
      aria-label="Loading…"
    >
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead style={{ backgroundColor: "var(--color-table-header)", borderBottom: "1px solid var(--color-table-border)" }}>
            <tr>
              {headers
                ? headers.map((h) => (
                    <th
                      key={h}
                      className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.05em]"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      {h}
                    </th>
                  ))
                : Array.from({ length: colCount }).map((_, i) => (
                    <th key={i} className="px-4 py-2.5">
                      <div className="h-3 w-16 animate-skeleton rounded" />
                    </th>
                  ))}
            </tr>
          </thead>
          <tbody style={{ borderColor: "var(--color-table-border)" }}>
            {Array.from({ length: rows }).map((_, ri) => (
              <tr key={ri} className="border-b last:border-0" style={{ borderColor: "var(--color-table-border)" }}>
                {Array.from({ length: colCount }).map((_, ci) => (
                  <td key={ci} className="px-4 py-3">
                    <div
                      className="h-4 animate-skeleton rounded"
                      style={{ width: `${50 + ((ri * 3 + ci * 7) % 40)}%` }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <span className="sr-only">Loading data…</span>
    </div>
  );
}
