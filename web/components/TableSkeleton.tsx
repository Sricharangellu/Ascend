// Animated skeleton placeholder for table loading states.
// Matches the visual chrome of the Table component so there's no layout shift.

interface TableSkeletonProps {
  cols?: number;
  rows?: number;
  headers?: string[];
}

export function TableSkeleton({ cols = 4, rows = 8, headers }: TableSkeletonProps) {
  const colCount = headers ? headers.length : cols;

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-table-border)] bg-white" role="status" aria-label="Loading…">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-table-header)] border-b border-[var(--color-table-border)]">
            <tr>
              {headers
                ? headers.map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                      {h}
                    </th>
                  ))
                : Array.from({ length: colCount }).map((_, i) => (
                    <th key={i} className="px-4 py-3">
                      <div className="h-3 w-16 animate-pulse rounded bg-[#F0F0F0]" />
                    </th>
                  ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-table-border)]">
            {Array.from({ length: rows }).map((_, ri) => (
              <tr key={ri}>
                {Array.from({ length: colCount }).map((_, ci) => (
                  <td key={ci} className="px-4 py-3">
                    <div
                      className="h-4 animate-pulse rounded bg-[#F0F0F0]"
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
