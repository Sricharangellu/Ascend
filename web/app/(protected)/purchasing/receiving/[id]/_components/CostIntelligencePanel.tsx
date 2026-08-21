"use client";

import { clsx } from "clsx";
import { Badge } from "@/components/Badge";
import { Skeleton } from "@/components/Skeleton";
import { formatMoney } from "@/lib/money";
import { fmtDate } from "@/lib/date";
import type { ReceiveLineIntelligence, ReceivingSessionLine } from "@/api-client/types";
import { effectiveCostCents } from "./shared";

/**
 * What Ascend already knows about this product's cost, shown at the one moment
 * it can still change the outcome: while the goods are on the dock.
 *
 * The backend has computed all of this for a long time — last purchase cost,
 * previous vendor cost, average, historical range, trend, variance band — and
 * nothing had ever rendered it. Catching "$8.50 on the PO, $8.75 on the
 * invoice, $8.25 last time" here is the difference between a priced-correctly
 * receipt and a margin leak nobody notices until month end.
 */

function VarianceRow({
  label,
  costCents,
  againstCents,
}: {
  label: string;
  costCents: number | null;
  againstCents: number;
}) {
  if (costCents == null) {
    return (
      <div className="flex items-baseline justify-between gap-3 py-1.5">
        <span className="text-[13px] text-[var(--color-text-secondary)]">{label}</span>
        <span className="text-[13px] text-[var(--color-text-muted)]">No history</span>
      </div>
    );
  }
  const delta = againstCents - costCents;
  const pct = costCents === 0 ? null : (delta / costCents) * 100;
  const tone =
    delta === 0 ? "text-[var(--color-text-muted)]"
    : delta > 0 ? "text-danger-700"   // paying more than we did
    : "text-success-700";             // paying less

  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-[13px] text-[var(--color-text-secondary)]">{label}</span>
      <span className="flex items-baseline gap-2">
        <span className="text-[13px] font-semibold tabular-nums text-[var(--color-text-primary)]">
          {formatMoney(costCents)}
        </span>
        {delta !== 0 && (
          <span className={clsx("text-[12px] font-semibold tabular-nums", tone)}>
            {delta > 0 ? "+" : "−"}{formatMoney(Math.abs(delta))}
            {pct != null && ` / ${delta > 0 ? "+" : "−"}${Math.abs(pct).toFixed(2)}%`}
          </span>
        )}
      </span>
    </div>
  );
}

const BAND_LABEL: Record<string, { text: string; variant: "green" | "yellow" | "red" | "gray" }> = {
  green:   { text: "Within tolerance", variant: "green" },
  yellow:  { text: "Review",           variant: "yellow" },
  red:     { text: "Outside tolerance", variant: "red" },
  neutral: { text: "No baseline",      variant: "gray" },
};

const TREND_LABEL: Record<string, string> = {
  up: "Trending up", down: "Trending down", flat: "Stable", unknown: "No trend yet",
};

export function CostIntelligencePanel({
  line,
  intelligence,
  loading,
}: {
  line: ReceivingSessionLine | null;
  intelligence: ReceiveLineIntelligence | null;
  loading: boolean;
}) {
  if (!line) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-12 text-center">
        <p className="text-[13px] font-medium text-[var(--color-text-secondary)]">
          Cost intelligence
        </p>
        <p className="max-w-[24ch] text-[13px] text-[var(--color-text-muted)]">
          Scan an item or pick a line to see what it cost last time, and what it costs now.
        </p>
      </div>
    );
  }

  const current = effectiveCostCents(line);
  const poCost = line.po_unit_cost_cents ?? 0;
  const band = intelligence ? BAND_LABEL[intelligence.variance_band] ?? BAND_LABEL["neutral"]! : null;

  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--color-text-muted)]">
          Cost intelligence
        </p>
        <p className="mt-1 truncate text-[14px] font-semibold text-[var(--color-text-primary)]">
          {line.product_name ?? "Unnamed product"}
        </p>
        <p className="font-mono text-[12px] text-[var(--color-text-muted)]">{line.sku ?? "—"}</p>
      </div>

      {/* Receiving at — the number that will actually post */}
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3 py-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[12px] font-medium uppercase tracking-[0.04em] text-[var(--color-text-secondary)]">
            Receiving at
          </span>
          <span className="text-[18px] font-bold tabular-nums text-[var(--color-text-primary)]">
            {formatMoney(current)}
          </span>
        </div>
        {band && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant={band.variant} size="sm">{band.text}</Badge>
            {intelligence?.variance_vs_po_pct != null && intelligence.variance_vs_po_pct !== 0 && (
              <span className="text-[12px] font-semibold tabular-nums text-[var(--color-text-secondary)]">
                {intelligence.variance_vs_po_pct > 0 ? "+" : ""}
                {intelligence.variance_vs_po_pct.toFixed(2)}% vs PO
              </span>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-3/4" />
        </div>
      ) : (
        <>
          <div className="divide-y divide-[var(--color-border-subtle)]">
            <VarianceRow label="PO cost" costCents={poCost || null} againstCents={current} />
            <VarianceRow
              label="Last received"
              costCents={intelligence?.last_purchase_cost_cents ?? null}
              againstCents={current}
            />
            <VarianceRow
              label="Previous supplier cost"
              costCents={intelligence?.prev_vendor_cost_cents ?? null}
              againstCents={current}
            />
            <VarianceRow
              label="Average cost"
              costCents={intelligence?.avg_purchase_cost_cents ?? null}
              againstCents={current}
            />
          </div>

          {intelligence && (
            <>
              {(intelligence.lowest_historical_cost_cents != null ||
                intelligence.highest_historical_cost_cents != null) && (
                <div className="flex items-baseline justify-between gap-3 text-[12px]">
                  <span className="text-[var(--color-text-secondary)]">Historical range</span>
                  <span className="font-medium tabular-nums text-[var(--color-text-primary)]">
                    {intelligence.lowest_historical_cost_cents != null
                      ? formatMoney(intelligence.lowest_historical_cost_cents) : "—"}
                    {" – "}
                    {intelligence.highest_historical_cost_cents != null
                      ? formatMoney(intelligence.highest_historical_cost_cents) : "—"}
                    <span className="ml-2 text-[var(--color-text-muted)]">
                      {TREND_LABEL[intelligence.cost_trend] ?? ""}
                    </span>
                  </span>
                </div>
              )}

              <div className="rounded-lg border border-[var(--color-border)] px-3 py-2.5">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--color-text-muted)]">
                  Supply &amp; stock
                </p>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
                  <dt className="text-[var(--color-text-secondary)]">On hand</dt>
                  <dd className="text-right font-semibold tabular-nums text-[var(--color-text-primary)]">
                    {intelligence.stock_on_hand}
                  </dd>
                  {intelligence.lead_time_days != null && (
                    <>
                      <dt className="text-[var(--color-text-secondary)]">Lead time</dt>
                      <dd className="text-right font-semibold tabular-nums text-[var(--color-text-primary)]">
                        {intelligence.lead_time_days} days
                      </dd>
                    </>
                  )}
                  {intelligence.fill_rate_pct != null && (
                    <>
                      <dt className="text-[var(--color-text-secondary)]">Fill rate</dt>
                      <dd className="text-right font-semibold tabular-nums text-[var(--color-text-primary)]">
                        {intelligence.fill_rate_pct.toFixed(0)}%
                      </dd>
                    </>
                  )}
                  {intelligence.moq != null && (
                    <>
                      <dt className="text-[var(--color-text-secondary)]">MOQ</dt>
                      <dd className="text-right font-semibold tabular-nums text-[var(--color-text-primary)]">
                        {intelligence.moq}
                      </dd>
                    </>
                  )}
                  {intelligence.preferred_supplier_name && (
                    <>
                      <dt className="text-[var(--color-text-secondary)]">Preferred</dt>
                      <dd className="truncate text-right font-semibold text-[var(--color-text-primary)]">
                        {intelligence.preferred_supplier_name}
                      </dd>
                    </>
                  )}
                </dl>
              </div>

              {(intelligence.previous_lot_code || intelligence.rotation_warning) && (
                <div
                  className={clsx(
                    "rounded-lg border px-3 py-2.5 text-[12px]",
                    intelligence.rotation_warning
                      ? "border-warning-200 bg-warning-50 text-warning-800"
                      : "border-[var(--color-border)] text-[var(--color-text-secondary)]",
                  )}
                >
                  <p className="font-semibold">
                    {intelligence.rotation_warning ? "Rotation warning" : "Previous lot"}
                  </p>
                  {intelligence.rotation_warning && <p className="mt-0.5">{intelligence.rotation_warning}</p>}
                  {intelligence.previous_lot_code && (
                    <p className="mt-0.5">
                      {intelligence.previous_lot_code}
                      {intelligence.previous_lot_qty != null && ` · ${intelligence.previous_lot_qty} on hand`}
                      {intelligence.previous_lot_expiry != null &&
                        ` · expires ${fmtDate(intelligence.previous_lot_expiry)}`}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
