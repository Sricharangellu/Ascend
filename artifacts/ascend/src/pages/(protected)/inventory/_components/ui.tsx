
import { Card } from "@/components/Card";
import type { CatalogCategory } from "@/api-client/types";
import type { StockStatus } from "./shared";

export function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
        active
          ? "border-slate-950 text-slate-950"
          : "border-transparent hover:border-[var(--color-border)]",
      ].join(" ")}
      style={active ? undefined : { color: "var(--color-text-muted)" }}
    >
      {children}
    </button>
  );
}

export function DropdownItem({
  onClick,
  children,
}: {
  onClick: () => void;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full px-4 py-2 text-left text-sm hover:bg-[var(--color-surface-subtle)]"
      style={{ color: "var(--color-text-secondary)" }}
    >
      {children}
    </button>
  );
}

export function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3" style={{ borderColor: "var(--color-border)" }}>
      <p className="text-xs font-medium uppercase" style={{ color: "var(--color-text-muted)" }}>{label}</p>
      <p className="mt-1 text-lg font-bold" style={{ color: "var(--color-text-primary)" }}>{value}</p>
    </div>
  );
}

export function Metric({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "warning";
}) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase" style={{ color: "var(--color-text-muted)" }}>{label}</span>
      <span
        className={
          tone === "warning"
            ? "text-2xl font-bold text-warning-700"
            : "text-2xl font-bold"
        }
        style={tone === "warning" ? undefined : { color: "var(--color-text-primary)" }}
      >
        {value}
      </span>
      <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>{detail}</span>
    </Card>
  );
}

export function ClockIcon() {
  return (
    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

export function LedgerStatus({ label }: { label: StockStatus }) {
  const classes =
    label === "Reorder"
      ? "bg-warning-100 text-warning-700"
      : label === "Watch"
      ? "bg-blue-50 text-blue-700 ring-blue-200"
      : "bg-success-100 text-success-700";
  return (
    <span className={`inline-flex rounded px-2 py-1 text-xs font-semibold ring-1 ring-inset ${classes}`}>
      {label}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const classes =
    status === "active"
      ? "bg-success-100 text-success-700"
      : status === "archived"
      ? "bg-danger-100 text-danger-700"
      : undefined;
  return (
    <span
      className={`inline-flex rounded px-2 py-1 text-xs font-semibold capitalize ${classes ?? ""}`}
      style={!classes ? { backgroundColor: "var(--color-surface-subtle)", color: "var(--color-text-secondary)" } : undefined}
    >
      {status}
    </span>
  );
}

export function buildCategoryName(
  cat: CatalogCategory,
  allCats: CatalogCategory[],
): string {
  if (!cat.parent_id) return cat.name;
  const parent = allCats.find((c) => c.id === cat.parent_id);
  if (!parent) return cat.name;
  return `${parent.name} / ${cat.name}`;
}
