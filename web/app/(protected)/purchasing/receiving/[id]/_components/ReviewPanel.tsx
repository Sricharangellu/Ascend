"use client";

import { clsx } from "clsx";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { formatMoney } from "@/lib/money";
import type { ReceivingSession } from "@/api-client/types";
import {
  costVarianceCents,
  effectiveCostCents,
  lineOutcome,
  sessionTotals,
} from "./shared";

/**
 * The last look before the receipt posts.
 *
 * Everything here is a *finding*, not a form: shortages, overages, held and
 * rejected units, cost changes, and lines nobody ever scanned. Each finding
 * links back to its row, because the rule for this step is that you never have
 * to walk back through the workflow to fix something — you jump to the row,
 * correct it in place, and the summary updates underneath you.
 */

function Finding({
  tone,
  count,
  label,
  detail,
}: {
  tone: "danger" | "warning" | "info" | "neutral";
  count: number;
  label: string;
  detail?: string;
}) {
  if (count === 0) return null;
  const toneClass = {
    danger:  "border-danger-200 bg-danger-50 text-danger-700",
    warning: "border-warning-200 bg-warning-50 text-warning-800",
    info:    "border-info-200 bg-info-50 text-info-600",
    neutral: "border-[var(--color-border)] bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)]",
  }[tone];

  return (
    <li className={clsx("rounded-lg border px-3 py-2", toneClass)}>
      <p className="text-[13px] font-semibold">
        {count} {label}
      </p>
      {detail && <p className="mt-0.5 text-[12px] opacity-90">{detail}</p>}
    </li>
  );
}

export function ReviewPanel({
  session,
  onJumpToLine,
  onFinalise,
  onCancel,
  finalising,
  canManage,
  error,
}: {
  session: ReceivingSession;
  onJumpToLine: (lineId: string) => void;
  onFinalise: (forceComplete: boolean) => void;
  onCancel: () => void;
  finalising: boolean;
  canManage: boolean;
  error: string | null;
}) {
  const totals = sessionTotals(session);
  const costDelta = totals.acceptedValueCents - totals.poValueCents;

  const exceptions = session.lines.filter((l) => {
    const o = lineOutcome(l);
    return o !== "matched" || costVarianceCents(l) !== 0;
  });

  // "Everything that arrived matches what we ordered, at the price we agreed."
  const clean = exceptions.length === 0 && totals.untouched === 0;

  return (
    <section
      aria-label="Review receiving"
      className="flex flex-col gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="text-[15px] font-semibold text-[var(--color-text-primary)]">
          Review receiving
        </h3>
        <Badge variant={clean ? "green" : "orange"}>
          {clean ? "No exceptions" : `${exceptions.length + (totals.untouched > 0 ? 1 : 0)} to review`}
        </Badge>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        {[
          { label: "Expected", value: totals.expected },
          { label: "Accepted", value: totals.accepted },
          { label: "Held", value: totals.held },
          { label: "Rejected", value: totals.rejected },
        ].map((s) => (
          <div key={s.label}>
            <dt className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--color-text-muted)]">
              {s.label}
            </dt>
            <dd className="text-[18px] font-bold tabular-nums text-[var(--color-text-primary)]">
              {s.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3 py-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[13px] text-[var(--color-text-secondary)]">Total received value</span>
          <span className="text-[18px] font-bold tabular-nums text-[var(--color-text-primary)]">
            {formatMoney(totals.acceptedValueCents)}
          </span>
        </div>
        {costDelta !== 0 && (
          <p
            className={clsx(
              "mt-1 text-[12px] font-semibold tabular-nums",
              costDelta > 0 ? "text-danger-700" : "text-success-700",
            )}
          >
            {costDelta > 0 ? "+" : "−"}{formatMoney(Math.abs(costDelta))} against PO pricing
            {" · "}
            {totals.costChangedLines} line{totals.costChangedLines === 1 ? "" : "s"} repriced
          </p>
        )}
      </div>

      <ul className="flex flex-col gap-2">
        <Finding
          tone="warning" count={totals.shortLines} label="short"
          detail="Fewer units arrived than the purchase order expected."
        />
        <Finding
          tone="danger" count={totals.overLines} label="over-received"
          detail="More units arrived than were ordered — confirm before posting."
        />
        <Finding
          tone="danger" count={totals.rejected} label="units rejected"
          detail="Damaged or refused at the dock. These will not enter inventory."
        />
        <Finding
          tone="warning" count={totals.held} label="units on quality hold"
          detail="Received but quarantined pending inspection."
        />
        <Finding
          tone="info" count={totals.untouched} label="lines never scanned"
          detail="Nothing has been recorded against these lines yet."
        />
        {clean && (
          <li className="rounded-lg border border-success-200 bg-success-50 px-3 py-2 text-[13px] font-semibold text-success-700">
            Everything ordered arrived, at the agreed cost.
          </li>
        )}
      </ul>

      {exceptions.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--color-text-muted)]">
            Needs a look
          </p>
          <ul className="flex flex-col divide-y divide-[var(--color-border-subtle)]">
            {exceptions.map((line) => {
              const delta = costVarianceCents(line);
              return (
                <li key={line.id}>
                  <button
                    type="button"
                    onClick={() => onJumpToLine(line.id)}
                    className="flex w-full items-baseline justify-between gap-3 py-1.5 text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                  >
                    <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--color-text-primary)]">
                      {line.product_name ?? line.sku ?? "Unnamed product"}
                    </span>
                    <span className="shrink-0 text-[12px] tabular-nums text-[var(--color-text-secondary)]">
                      {line.accepted_qty}/{line.expected_qty}
                      {delta !== 0 && (
                        <span className={delta > 0 ? " text-danger-700" : " text-success-700"}>
                          {" "}{delta > 0 ? "+" : "−"}{formatMoney(Math.abs(delta))}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-[13px] text-danger-700">
          {error}
        </p>
      )}

      {canManage ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            size="lg"
            loading={finalising}
            onClick={() => onFinalise(false)}
          >
            Post receipt
          </Button>
          {(totals.shortLines > 0 || totals.untouched > 0) && (
            <Button
              variant="secondary"
              size="lg"
              disabled={finalising}
              onClick={() => onFinalise(true)}
              title="Close the purchase order even though some lines are short"
            >
              Post &amp; close short
            </Button>
          )}
          <Button variant="ghost" size="lg" disabled={finalising} onClick={onCancel}>
            Cancel session
          </Button>
        </div>
      ) : (
        <p className="text-[13px] text-[var(--color-text-secondary)]">
          Posting a receipt needs manager access. Ask a manager to review and post this session.
        </p>
      )}
    </section>
  );
}
