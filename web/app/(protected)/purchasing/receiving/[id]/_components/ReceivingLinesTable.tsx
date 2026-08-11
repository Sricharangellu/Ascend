"use client";

import { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import { Badge, statusBadge, statusLabel } from "@/components/Badge";
import { formatMoney, parseToCents } from "@/lib/money";
import type { ReceivingSessionLine, UpdateReceivingLineRequest } from "@/api-client/types";
import {
  costVariancePct,
  effectiveCostCents,
  lineOutcome,
  remainingQty,
  toDateInput,
  fromDateInput,
} from "./shared";

/**
 * The receiving table — and the only place a receipt gets edited.
 *
 * The old flow put a read-only table on the page and the editable copy of the
 * same data inside a modal, so fixing a miscount meant reopening a form and
 * re-reading rows you had already checked. Here the row *is* the form: quantity,
 * cost, lot and expiry are edited in place and saved on blur or Enter, which is
 * also what makes the review step non-destructive — you fix things where you
 * find them instead of going back through the workflow.
 */

/** An editable cell that commits on blur/Enter and reverts on Escape. */
function EditableCell({
  value,
  onCommit,
  disabled,
  type = "text",
  align = "right",
  width = "w-20",
  ariaLabel,
  placeholder,
  invalid,
  mono,
}: {
  value: string;
  onCommit: (next: string) => void;
  disabled?: boolean;
  type?: "text" | "number" | "date";
  align?: "left" | "right";
  width?: string;
  ariaLabel: string;
  placeholder?: string;
  invalid?: boolean;
  mono?: boolean;
}) {
  const [draft, setDraft] = useState(value);

  // Escape has to beat the blur handler to the punch. `setDraft(value)` is a
  // state update, so it has not landed yet by the time blur fires — reverting
  // through state alone would still commit the abandoned edit. This ref tells
  // the blur handler to stand down.
  const reverting = useRef(false);

  // Re-sync when the server sends back a different value than we typed
  // (a scan bumping the quantity, or the backend clamping an over-receipt).
  useEffect(() => { setDraft(value); }, [value]);

  return (
    <input
      type={type}
      value={draft}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      placeholder={placeholder}
      inputMode={type === "number" ? "decimal" : undefined}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (reverting.current) { reverting.current = false; setDraft(value); return; }
        if (draft !== value) onCommit(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
        if (e.key === "Escape") {
          reverting.current = true;
          setDraft(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={clsx(
        width,
        "min-h-[34px] rounded border px-2 py-1 text-[13px]",
        align === "right" ? "text-right tabular-nums" : "text-left",
        mono && "font-mono text-[12px]",
        "bg-[var(--color-surface)] text-[var(--color-text-primary)]",
        invalid
          ? "border-danger-300 bg-danger-50"
          : "border-transparent hover:border-[var(--color-border-strong)]",
        "focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30",
        "disabled:cursor-not-allowed disabled:opacity-60",
      )}
    />
  );
}

export function ReceivingLinesTable({
  lines,
  activeLineId,
  onSelect,
  onPatch,
  readOnly,
  savingLineId,
}: {
  lines: ReceivingSessionLine[];
  activeLineId: string | null;
  onSelect: (lineId: string) => void;
  onPatch: (lineId: string, patch: UpdateReceivingLineRequest) => void;
  readOnly: boolean;
  savingLineId: string | null;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] border-collapse text-[13px]">
        <caption className="sr-only">
          Receiving lines. Quantity, cost, lot and expiry are editable in place.
        </caption>
        <thead>
          <tr className="border-b border-[var(--color-table-border)] bg-[var(--color-table-header)] text-left">
            <th scope="col" className="px-3 py-2.5 font-semibold text-[var(--color-text-secondary)]">Product</th>
            <th scope="col" className="px-2 py-2.5 text-right font-semibold text-[var(--color-text-secondary)]">Expected</th>
            <th scope="col" className="px-2 py-2.5 text-right font-semibold text-[var(--color-text-secondary)]">Received</th>
            <th scope="col" className="px-2 py-2.5 text-right font-semibold text-[var(--color-text-secondary)]">Remaining</th>
            <th scope="col" className="px-2 py-2.5 text-right font-semibold text-[var(--color-text-secondary)]">PO cost</th>
            <th scope="col" className="px-2 py-2.5 text-right font-semibold text-[var(--color-text-secondary)]">Cost</th>
            <th scope="col" className="px-2 py-2.5 text-right font-semibold text-[var(--color-text-secondary)]">Variance</th>
            <th scope="col" className="px-2 py-2.5 font-semibold text-[var(--color-text-secondary)]">Lot</th>
            <th scope="col" className="px-2 py-2.5 font-semibold text-[var(--color-text-secondary)]">Expiry</th>
            <th scope="col" className="px-2 py-2.5 font-semibold text-[var(--color-text-secondary)]">Status</th>
            <th scope="col" className="px-2 py-2.5 text-right font-semibold text-[var(--color-text-secondary)]">Line total</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => {
            const outcome = lineOutcome(line);
            const variancePct = costVariancePct(line);
            const cost = effectiveCostCents(line);
            const isActive = line.id === activeLineId;
            const overReceived = line.accepted_qty > line.expected_qty;

            return (
              <tr
                key={line.id}
                onClick={() => onSelect(line.id)}
                className={clsx(
                  "border-b border-[var(--color-table-border)] transition-colors",
                  isActive
                    ? "bg-[var(--color-primary-subtle)]"
                    : "hover:bg-[var(--color-table-row-hover)]",
                  savingLineId === line.id && "opacity-70",
                )}
              >
                <td className="px-3 py-2">
                  {/* Selecting a row drives the intelligence panel, so it needs
                      to be reachable by keyboard, not just by click. */}
                  <button
                    type="button"
                    onClick={() => onSelect(line.id)}
                    className="max-w-[240px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                    aria-pressed={isActive}
                  >
                    <span className="block truncate font-medium text-[var(--color-text-primary)]">
                      {line.product_name ?? "Unnamed product"}
                    </span>
                    <span className="block truncate font-mono text-[11px] text-[var(--color-text-muted)]">
                      {line.sku ?? line.barcode_scanned ?? "—"}
                    </span>
                  </button>
                </td>

                <td className="px-2 py-2 text-right tabular-nums text-[var(--color-text-secondary)]">
                  {line.expected_qty}
                </td>

                <td className="px-2 py-2 text-right">
                  <EditableCell
                    ariaLabel={`Received quantity for ${line.product_name ?? "line"}`}
                    value={String(line.accepted_qty)}
                    type="number"
                    disabled={readOnly}
                    invalid={overReceived}
                    onCommit={(next) => {
                      const qty = Number(next);
                      if (!Number.isFinite(qty) || qty < 0) return;
                      onPatch(line.id, { acceptedQty: Math.trunc(qty) });
                    }}
                  />
                </td>

                <td className="px-2 py-2 text-right tabular-nums">
                  <span
                    className={clsx(
                      remainingQty(line) > 0
                        ? "font-semibold text-warning-800"
                        : "text-[var(--color-text-muted)]",
                    )}
                  >
                    {remainingQty(line)}
                  </span>
                </td>

                <td className="px-2 py-2 text-right tabular-nums text-[var(--color-text-secondary)]">
                  {line.po_unit_cost_cents != null ? formatMoney(line.po_unit_cost_cents) : "—"}
                </td>

                <td className="px-2 py-2 text-right">
                  <EditableCell
                    ariaLabel={`Unit cost for ${line.product_name ?? "line"}`}
                    value={(cost / 100).toFixed(2)}
                    width="w-24"
                    disabled={readOnly}
                    onCommit={(next) => {
                      const cents = parseToCents(next);
                      if (!Number.isFinite(cents) || cents < 0) return;
                      onPatch(line.id, { unitCostCents: cents });
                    }}
                  />
                </td>

                <td className="px-2 py-2 text-right tabular-nums">
                  {variancePct == null || variancePct === 0 ? (
                    <span className="text-[var(--color-text-muted)]">—</span>
                  ) : (
                    <span
                      className={clsx(
                        "font-semibold",
                        variancePct > 0 ? "text-danger-700" : "text-success-700",
                      )}
                    >
                      {variancePct > 0 ? "+" : ""}{variancePct.toFixed(2)}%
                    </span>
                  )}
                </td>

                <td className="px-2 py-2">
                  <EditableCell
                    ariaLabel={`Lot code for ${line.product_name ?? "line"}`}
                    value={line.lot_code ?? ""}
                    align="left"
                    width="w-28"
                    mono
                    placeholder="—"
                    disabled={readOnly}
                    onCommit={(next) => onPatch(line.id, { lotCode: next.trim() || null })}
                  />
                </td>

                <td className="px-2 py-2">
                  <EditableCell
                    ariaLabel={`Expiry date for ${line.product_name ?? "line"}`}
                    value={toDateInput(line.expiry_date)}
                    type="date"
                    align="left"
                    width="w-36"
                    disabled={readOnly}
                    onCommit={(next) => onPatch(line.id, { expiryDate: fromDateInput(next) })}
                  />
                </td>

                <td className="px-2 py-2">
                  <div className="flex flex-col items-start gap-1">
                    <Badge variant={statusBadge(outcome)} size="sm">
                      {statusLabel(outcome)}
                    </Badge>
                    {(line.held_qty > 0 || line.rejected_qty > 0) && (
                      <span className="text-[11px] text-[var(--color-text-muted)]">
                        {line.held_qty > 0 && `${line.held_qty} held`}
                        {line.held_qty > 0 && line.rejected_qty > 0 && " · "}
                        {line.rejected_qty > 0 && `${line.rejected_qty} rejected`}
                      </span>
                    )}
                  </div>
                </td>

                <td className="px-2 py-2 text-right font-semibold tabular-nums text-[var(--color-text-primary)]">
                  {formatMoney(line.accepted_qty * cost)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
