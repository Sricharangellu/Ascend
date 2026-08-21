"use client";

import { clsx } from "clsx";

/**
 * The procure-to-pay spine, drawn as one strip.
 *
 * Ordered → Received → Billed → Paid are four different facts about the same
 * purchase, and the operator constantly needs to know which of them are true.
 * Four same-coloured status badges scattered across a page cannot answer that:
 * "Received" and "Paid" both read as green, and neither tells you what has
 * *not* happened yet.
 *
 * So the distinction is carried by position and completeness rather than by
 * minting more hues — each stage owns a fixed slot, and a stage is filled,
 * in-progress, or empty. You can read "goods are in, nobody has invoiced us"
 * without reading a single word.
 */

export type LifecycleStageKey = "ordered" | "received" | "billed" | "paid";

export type LifecycleStageState =
  | "done"       // fully satisfied
  | "partial"    // started, not finished (e.g. 40 of 100 received)
  | "pending"    // not started yet
  | "exception"; // started and went wrong — needs a human

export interface LifecycleStage {
  key: LifecycleStageKey;
  label: string;
  state: LifecycleStageState;
  /** Short factual detail under the label, e.g. "98 of 100" or "$1,240.00". */
  detail?: string;
}

const STAGE_COLOR: Record<LifecycleStageKey, string> = {
  ordered:  "var(--color-stage-ordered)",
  received: "var(--color-stage-received)",
  billed:   "var(--color-stage-billed)",
  paid:     "var(--color-stage-paid)",
};

/** Screen-reader wording — the visual state is colour + fill, which needs a text equivalent. */
const STATE_WORD: Record<LifecycleStageState, string> = {
  done:      "complete",
  partial:   "in progress",
  pending:   "not started",
  exception: "needs attention",
};

function stageColor(stage: LifecycleStage): string {
  if (stage.state === "exception") return "var(--color-stage-exception)";
  if (stage.state === "partial") return "var(--color-stage-partial)";
  if (stage.state === "pending") return "var(--color-border-strong)";
  return STAGE_COLOR[stage.key];
}

export function LifecycleTrail({
  stages,
  className,
}: {
  stages: LifecycleStage[];
  className?: string;
}) {
  return (
    <ol
      className={clsx("flex flex-wrap items-stretch gap-1", className)}
      aria-label="Purchase lifecycle"
    >
      {stages.map((stage) => {
        const color = stageColor(stage);
        const reached = stage.state !== "pending";
        return (
          <li key={stage.key} className="min-w-[104px] flex-1">
            {/* The rail itself: filled for reached stages, hollow for pending.
                Colour alone never carries the meaning — fill does too. */}
            <div
              className="h-1 w-full rounded-full"
              style={{
                backgroundColor: reached ? color : "var(--color-border)",
              }}
            />
            <div className="mt-1.5 flex flex-col gap-0.5">
              <span
                className="text-[11px] font-semibold uppercase tracking-[0.06em]"
                style={{
                  color: reached ? color : "var(--color-text-muted)",
                }}
              >
                {stage.label}
                <span className="sr-only"> — {STATE_WORD[stage.state]}</span>
              </span>
              <span className="text-[13px] font-medium tabular-nums text-[var(--color-text-primary)]">
                {stage.detail ?? (reached ? "—" : "Not yet")}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Derives the four stages from the quantities and amounts a purchase actually
 * carries, so callers never hand-roll the "is this partial?" logic — that
 * judgement lives in exactly one place.
 *
 * Kept pure and exported so it can be unit-tested without rendering.
 */
export function buildLifecycle(input: {
  orderedQty: number;
  receivedQty: number;
  billedQty: number;
  /** Integer cents, matching the backend money convention. */
  billedCents: number;
  paidCents: number;
  /** Set when a variance/exception has been raised against this purchase. */
  hasException?: boolean;
  formatMoney: (cents: number) => string;
}): LifecycleStage[] {
  const {
    orderedQty, receivedQty, billedQty,
    billedCents, paidCents, hasException, formatMoney,
  } = input;

  const qtyState = (got: number, of: number): LifecycleStageState => {
    if (of <= 0) return "pending";
    if (got <= 0) return "pending";
    if (got > of) return "exception"; // over-receipt / over-billing is never "done"
    return got === of ? "done" : "partial";
  };

  return [
    {
      key: "ordered",
      label: "Ordered",
      state: orderedQty > 0 ? "done" : "pending",
      detail: orderedQty > 0 ? `${orderedQty} units` : undefined,
    },
    {
      key: "received",
      label: "Received",
      state: hasException && receivedQty > 0 ? "exception" : qtyState(receivedQty, orderedQty),
      detail: receivedQty > 0 ? `${receivedQty} of ${orderedQty}` : undefined,
    },
    {
      key: "billed",
      label: "Billed",
      state: qtyState(billedQty, receivedQty > 0 ? receivedQty : orderedQty),
      detail: billedCents > 0 ? formatMoney(billedCents) : undefined,
    },
    {
      key: "paid",
      label: "Paid",
      state:
        paidCents <= 0 ? "pending"
        : paidCents > billedCents ? "exception"
        : paidCents === billedCents ? "done"
        : "partial",
      detail: paidCents > 0 ? formatMoney(paidCents) : undefined,
    },
  ];
}
