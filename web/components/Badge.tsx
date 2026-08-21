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

// Tinted fills. Badge text is 10–11px semibold — small text, so every pair
// here has to clear WCAG AA at 4.5:1, not the 3:1 large-text allowance.
//
// The `-600` text stops these used to carry did not: green was 3.37:1, orange
// 2.76:1, red 3.71:1 and purple 4.19:1 against their own backgrounds. Each is
// now one or two stops darker — which also lands them on the `--color-*-text`
// values globals.css had already nominated for exactly this job. Backgrounds
// and borders are untouched, so the badges look like themselves, just legible.
const solidClass: Record<BadgeVariant, string> = {
  blue:   "bg-info-50 text-info-600 border border-info-200",          // 4.60:1
  orange: "bg-warning-50 text-warning-800 border border-warning-200", // 6.53:1
  yellow: "bg-warning-50 text-warning-800 border border-warning-200", // 6.53:1
  green:  "bg-success-50 text-success-700 border border-success-200", // 5.51:1
  gray:   "bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)] border border-[var(--color-border)]",
  red:    "bg-danger-50 text-danger-700 border border-danger-200",    // 5.07:1
  purple: "bg-[var(--color-primary-subtle)] text-brand-700 border border-[var(--color-primary-border)]", // 5.36:1
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
//
// One rule decides the colour, so a status the operator has never seen before
// still reads correctly at a glance:
//
//   gray   — nothing has happened yet, or it never will (draft, void, closed)
//   blue   — committed and in flight, waiting on someone else (ordered, billed)
//   orange — underway but incomplete, and that is expected (partial, pending)
//   green  — finished cleanly (received, paid, matched)
//   red    — finished badly, or blocked on a human (variance, rejected, overdue)
//   purple — a financial correction against something already settled
//
// Where a stage needs to be distinguished from another stage of the same colour
// — Received vs Paid are both "finished cleanly" — the label and the
// LifecycleTrail carry the difference, rather than minting another hue.
export function statusBadge(status: string): BadgeVariant {
  const map: Record<string, BadgeVariant> = {
    open:               "blue",
    billed:             "blue",
    ordered:            "blue",
    submitted:          "blue",
    awaiting_approval:  "blue",
    in_transit:         "blue",
    docked:             "blue",
    active:             "green",
    completed:          "green",
    paid:               "green",
    received:           "green",
    approved:           "green",
    ready:              "green",
    matched:            "green",
    reconciled:         "green",
    posted:             "green",
    accepted:           "green",
    partial:            "orange",
    partially_received: "orange",
    partially_billed:   "orange",
    partially_paid:     "orange",
    pending:            "orange",
    not_billed:         "orange",
    "not-billed":       "orange",
    unbilled:           "orange",
    in_progress:        "orange",
    receiving:          "orange",
    scanning:           "orange",
    backordered:        "orange",
    draft:              "gray",
    voided:             "gray",
    void:               "gray",
    cancelled:          "gray",
    archived:           "gray",
    closed:             "gray",
    refunded:           "purple",
    credited:           "purple",
    credit:             "purple",
    adjusted:           "purple",
    overdue:            "red",
    failed:             "red",
    // Receiving / three-way-match exceptions — every one of these means a
    // human has to decide something, so they all read as red.
    exception:          "red",
    variance:           "red",
    cost_variance:      "red",
    qty_variance:       "red",
    over_received:      "red",
    short:              "red",
    shortage:           "red",
    damaged:            "red",
    expired:            "red",
    rejected:           "red",
    quality_hold:       "red",
    held:               "red",
    unmatched:          "red",
    duplicate:          "red",
    dunning_1:          "orange",
    dunning_2:          "orange",
    dunning_3:          "red",
  };
  return map[status.toLowerCase()] ?? "gray";
}

/** Human label for a snake_case status, e.g. `partially_received` → "Partially received". */
export function statusLabel(status: string): string {
  const s = status.replace(/[_-]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Badge that renders a raw backend status with the right colour and a readable label. */
export function StatusBadge({
  status,
  size,
}: {
  status: string;
  size?: "sm" | "md";
}) {
  return (
    <Badge variant={statusBadge(status)} size={size}>
      {statusLabel(status)}
    </Badge>
  );
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
