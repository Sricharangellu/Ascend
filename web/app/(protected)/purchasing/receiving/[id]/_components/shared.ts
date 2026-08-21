import type {
  ReceivingSession,
  ReceivingSessionLine,
  ScanOutcome,
} from "@/api-client/types";

/** Quantity still expected on a line, floored at zero (over-receipt is not "negative remaining"). */
export function remainingQty(line: ReceivingSessionLine): number {
  return Math.max(0, line.expected_qty - line.accepted_qty - line.rejected_qty - line.held_qty);
}

/** Everything physically accounted for on a line, however it was dispositioned. */
export function accountedQty(line: ReceivingSessionLine): number {
  return line.accepted_qty + line.held_qty + line.rejected_qty;
}

/** The cost this line will actually post at — the override if one was entered, else the PO cost. */
export function effectiveCostCents(line: ReceivingSessionLine): number {
  return line.unit_cost_cents ?? line.po_unit_cost_cents ?? 0;
}

/** Signed difference between what we are about to pay and what the PO said. */
export function costVarianceCents(line: ReceivingSessionLine): number {
  const po = line.po_unit_cost_cents;
  if (po == null || line.unit_cost_cents == null) return 0;
  return line.unit_cost_cents - po;
}

export function costVariancePct(line: ReceivingSessionLine): number | null {
  const po = line.po_unit_cost_cents;
  if (po == null || po === 0 || line.unit_cost_cents == null) return null;
  return ((line.unit_cost_cents - po) / po) * 100;
}

/**
 * How a line has actually turned out, as one word — this is what drives the
 * status column and the review summary, so the two can never disagree.
 *
 * Order matters: a rejected/held line is an exception no matter how the
 * quantities land, and an over-receipt outranks a clean match.
 */
export type LineOutcome =
  | "pending" | "short" | "over_received" | "damaged"
  | "quality_hold" | "matched";

export function lineOutcome(line: ReceivingSessionLine): LineOutcome {
  if (line.rejected_qty > 0) return "damaged";
  if (line.held_qty > 0) return "quality_hold";
  if (accountedQty(line) === 0) return "pending";
  if (line.accepted_qty > line.expected_qty) return "over_received";
  if (line.accepted_qty < line.expected_qty) return "short";
  return "matched";
}

export interface SessionTotals {
  expected: number;
  accepted: number;
  held: number;
  rejected: number;
  /** Lines with nothing scanned against them yet. */
  untouched: number;
  shortLines: number;
  overLines: number;
  costChangedLines: number;
  /** Total value of accepted goods at the cost they will post at. */
  acceptedValueCents: number;
  /** Same quantities priced at the PO cost — the difference is the bill impact. */
  poValueCents: number;
}

export function sessionTotals(session: ReceivingSession | null): SessionTotals {
  const empty: SessionTotals = {
    expected: 0, accepted: 0, held: 0, rejected: 0, untouched: 0,
    shortLines: 0, overLines: 0, costChangedLines: 0,
    acceptedValueCents: 0, poValueCents: 0,
  };
  if (!session) return empty;

  return session.lines.reduce<SessionTotals>((acc, line) => {
    const outcome = lineOutcome(line);
    acc.expected += line.expected_qty;
    acc.accepted += line.accepted_qty;
    acc.held += line.held_qty;
    acc.rejected += line.rejected_qty;
    if (accountedQty(line) === 0) acc.untouched += 1;
    if (outcome === "short") acc.shortLines += 1;
    if (outcome === "over_received") acc.overLines += 1;
    if (costVarianceCents(line) !== 0) acc.costChangedLines += 1;
    acc.acceptedValueCents += line.accepted_qty * effectiveCostCents(line);
    acc.poValueCents += line.accepted_qty * (line.po_unit_cost_cents ?? 0);
    return acc;
  }, { ...empty });
}

/** Presentation for each scan outcome — tone drives colour, so they cannot drift apart. */
export const SCAN_FEEDBACK: Record<
  ScanOutcome,
  { tone: "success" | "warning" | "danger" | "info"; title: string }
> = {
  matched:          { tone: "success", title: "Matched" },
  unknown:          { tone: "danger",  title: "Not on this purchase order" },
  over_qty:         { tone: "warning", title: "More than expected" },
  expired:          { tone: "danger",  title: "Expired" },
  near_expiry:      { tone: "warning", title: "Close to expiry" },
  cost_variance:    { tone: "warning", title: "Cost has changed" },
  already_complete: { tone: "info",    title: "Line already complete" },
};

export const TONE_CLASS: Record<"success" | "warning" | "danger" | "info", string> = {
  success: "border-success-200 bg-success-50 text-success-700",
  warning: "border-warning-200 bg-warning-50 text-warning-800",
  danger:  "border-danger-200 bg-danger-50 text-danger-700",
  info:    "border-info-200 bg-info-50 text-info-600",
};

/** `2026-08-11` for a date input, or "" when there is no date. */
export function toDateInput(ms: number | null | undefined): string {
  if (ms == null) return "";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

/** Midnight UTC for a `2026-08-11` input value, or null when cleared. */
export function fromDateInput(value: string): number | null {
  if (!value) return null;
  const ms = new Date(`${value}T00:00:00.000Z`).getTime();
  return Number.isNaN(ms) ? null : ms;
}
