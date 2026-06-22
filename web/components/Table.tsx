"use client";
import { clsx } from "clsx";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  className?: string;
  headerClassName?: string;
}

interface TableProps<T> {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  emptyMessage?: string;
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
}

export function Table<T>({ columns, rows, loading, emptyMessage = "No data", rowKey, onRowClick }: TableProps<T>) {
  if (loading) {
    return (
      <div className="overflow-hidden rounded-lg border border-[var(--color-table-border)] bg-white">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-table-header)]">
            <tr>
              {columns.map(col => (
                <th key={col.key} className={clsx("px-4 py-3 text-left font-medium text-[var(--color-text-secondary)] text-xs uppercase tracking-wide", col.headerClassName)}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-table-border)]">
            {Array.from({ length: 5 }).map((_, i) => (
              <tr key={i}>
                {columns.map(col => (
                  <td key={col.key} className="px-4 py-3">
                    <div className="h-4 rounded bg-[#F0F0F0] animate-pulse" style={{ width: `${60 + (i * 7) % 40}%` }} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="overflow-hidden rounded-lg border border-[var(--color-table-border)] bg-white">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-table-header)]">
            <tr>
              {columns.map(col => (
                <th key={col.key} className={clsx("px-4 py-3 text-left font-medium text-[var(--color-text-secondary)] text-xs uppercase tracking-wide", col.headerClassName)}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
        </table>
        <div className="py-16 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-table-header)]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--color-text-secondary)]" aria-hidden="true">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <p className="text-sm font-medium text-[var(--color-text-secondary)]">{emptyMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--color-table-border)] bg-white">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-table-header)] border-b border-[var(--color-table-border)]">
            <tr>
              {columns.map(col => (
                <th key={col.key} className={clsx("px-4 py-3 text-left font-medium text-[var(--color-text-secondary)] text-xs uppercase tracking-wide", col.headerClassName)}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-table-border)]">
            {rows.map(row => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={clsx("transition-colors", onRowClick && "cursor-pointer hover:bg-[var(--color-page-bg)]")}
              >
                {columns.map(col => (
                  <td key={col.key} className={clsx("px-4 py-3 text-[var(--color-text-primary)]", col.className)}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
