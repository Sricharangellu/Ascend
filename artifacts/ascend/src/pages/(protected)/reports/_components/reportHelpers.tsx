
export function exportCsv(filename: string, rows: string[][]): void {
  const csv = rows
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-skeleton rounded ${className ?? ""}`} />;
}

export function CsvButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors hover:bg-[var(--color-surface-subtle)]"
      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-secondary)" }}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      CSV
    </button>
  );
}

export function SectionHeader({
  title, subtitle, onExport,
}: { title: string; subtitle?: string; onExport?: () => void }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-4">
      <div>
        <h2 className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>{title}</h2>
        {subtitle && <p className="text-[11px] mt-0.5" style={{ color: "var(--color-text-secondary)" }}>{subtitle}</p>}
      </div>
      {onExport && <CsvButton onClick={onExport} />}
    </div>
  );
}
