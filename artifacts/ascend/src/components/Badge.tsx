import { clsx } from "clsx";

// ─── Variant types ────────────────────────────────────────────────────────────
export type BadgeVariant =
  | "gray"
  | "blue"
  | "green"
  | "yellow"
  | "red"
  | "purple"
  | "orange";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: "sm" | "md";
  outlined?: boolean;
}

// Solid fills — using CSS vars for theme compatibility
const solidClass: Record<BadgeVariant, string> = {
  blue:   "bg-info-50 text-info-600 border border-info-200",
  orange: "bg-warning-50 text-warning-600 border border-warning-200",
  yellow: "bg-warning-50 text-warning-600 border border-warning-200",
  green:  "bg-success-50 text-success-600 border border-success-200",
  gray:   "bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)] border border-[var(--color-border)]",
  red:    "bg-danger-50 text-danger-600 border border-danger-200",
  purple: "bg-[var(--color-primary-subtle)] text-brand-600 border border-[var(--color-primary-border)]",
};

// Outlined — same as solid in new system (already uses light bg + colored text)
const outlinedClass: Record<BadgeVariant, string> = solidClass;

export function Badge({
  children,
  variant = "gray",
  size = "md",
  outlined = false,
}: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center font-semibold whitespace-nowrap rounded-md leading-none tracking-[0.02em]",
        size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-[11px]",
        outlined ? outlinedClass[variant] : solidClass[variant]
      )}
    >
      {children}
    </span>
  );
}

// ─── Status → variant mapping ─────────────────────────────────────────────────
export function statusBadge(status: string): BadgeVariant {
  const map: Record<string, BadgeVariant> = {
    open:               "blue",
    billed:             "blue",
    active:             "green",
    completed:          "green",
    paid:               "green",
    received:           "green",
    approved:           "green",
    ready:              "green",
    partial:            "orange",
    partially_received: "orange",
    pending:            "orange",
    not_billed:         "orange",
    "not-billed":       "orange",
    in_progress:        "orange",
    draft:              "gray",
    voided:             "gray",
    void:               "gray",
    cancelled:          "gray",
    archived:           "gray",
    closed:             "gray",
    refunded:           "purple",
    overdue:            "red",
    failed:             "red",
    dunning_1:          "orange",
    dunning_2:          "orange",
    dunning_3:          "red",
  };
  return map[status.toLowerCase()] ?? "gray";
}

export function OutlinedStatusBadge({
  status,
  label,
}: {
  status: string;
  label?: string;
}) {
  const variant = statusBadge(status);
  return (
    <Badge variant={variant} outlined>
      {label ?? status}
    </Badge>
  );
}
