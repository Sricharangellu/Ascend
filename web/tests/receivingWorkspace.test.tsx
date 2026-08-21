import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReceivingLinesTable } from "@/app/(protected)/purchasing/receiving/[id]/_components/ReceivingLinesTable";
import { ReviewPanel } from "@/app/(protected)/purchasing/receiving/[id]/_components/ReviewPanel";
import { CostIntelligencePanel } from "@/app/(protected)/purchasing/receiving/[id]/_components/CostIntelligencePanel";
import {
  lineOutcome,
  sessionTotals,
  costVariancePct,
  remainingQty,
  fromDateInput,
  toDateInput,
} from "@/app/(protected)/purchasing/receiving/[id]/_components/shared";
import { isFocusedRoute } from "@/components/EnterpriseShell";
import { buildLifecycle } from "@/components/LifecycleTrail";
import { statusBadge } from "@/components/Badge";
import type {
  ReceiveLineIntelligence,
  ReceivingSession,
  ReceivingSessionLine,
} from "@/api-client/types";

const now = Date.now();

function mkLine(over: Partial<ReceivingSessionLine> = {}): ReceivingSessionLine {
  return {
    id: "rsl_1", session_id: "rcv_1", po_line_id: "pol_1", product_id: "prod_1",
    expected_qty: 10, scanned_qty: 0, accepted_qty: 0, held_qty: 0, rejected_qty: 0,
    unit_cost_cents: null, cost_override_reason: null,
    lot_code: null, expiry_date: null, manufacture_date: null,
    location_id: null, barcode_scanned: null, status: "pending",
    created_at: now, updated_at: now,
    product_name: "Organic Dark Roast Beans", sku: "COF-001",
    barcode: "0700000000011", po_unit_cost_cents: 850,
    ...over,
  };
}

function mkSession(lines: ReceivingSessionLine[]): ReceivingSession {
  return {
    id: "rcv_1", po_id: "po_1", session_number: "RCV-1042", status: "receiving",
    mode: "standard", receiver_id: null, receiver_name: null,
    dock_code: "D2", notes: null,
    started_at: now, completed_at: null, created_at: now, updated_at: now,
    po_number: 118, supplier_id: "sup_acme", supplier_name: "Acme Wholesale",
    lines,
  };
}

// ── Line outcome: the rule the status column and the review summary share ────

describe("lineOutcome", () => {
  it("is pending until something is recorded against the line", () => {
    expect(lineOutcome(mkLine())).toBe("pending");
  });

  it("is matched only when the accepted quantity equals what was expected", () => {
    expect(lineOutcome(mkLine({ accepted_qty: 10 }))).toBe("matched");
    expect(lineOutcome(mkLine({ accepted_qty: 9 }))).toBe("short");
    expect(lineOutcome(mkLine({ accepted_qty: 11 }))).toBe("over_received");
  });

  it("treats rejected and held units as exceptions regardless of the count", () => {
    // A fully-counted line is still not "matched" if some of it was refused.
    expect(lineOutcome(mkLine({ accepted_qty: 8, rejected_qty: 2 }))).toBe("damaged");
    expect(lineOutcome(mkLine({ accepted_qty: 8, held_qty: 2 }))).toBe("quality_hold");
  });

  it("maps every outcome to a colour, so no status renders as an untinted default", () => {
    for (const outcome of ["pending", "short", "over_received", "damaged", "quality_hold", "matched"]) {
      expect(statusBadge(outcome)).not.toBe("gray");
    }
  });
});

describe("remainingQty", () => {
  it("counts held and rejected units as accounted for, not still outstanding", () => {
    expect(remainingQty(mkLine({ accepted_qty: 4, held_qty: 3, rejected_qty: 1 }))).toBe(2);
  });

  it("never reports a negative remainder on an over-receipt", () => {
    expect(remainingQty(mkLine({ accepted_qty: 15 }))).toBe(0);
  });
});

describe("costVariancePct", () => {
  it("is null while the cost is untouched, so an unedited line shows no variance", () => {
    expect(costVariancePct(mkLine())).toBeNull();
  });

  it("reports the signed percentage against the PO cost", () => {
    // $8.50 on the PO, $8.75 on the invoice → +2.94%, the worked example in the brief.
    const pct = costVariancePct(mkLine({ unit_cost_cents: 875 }));
    expect(pct).toBeCloseTo(2.94, 2);
  });

  it("guards against dividing by a zero PO cost", () => {
    expect(costVariancePct(mkLine({ po_unit_cost_cents: 0, unit_cost_cents: 500 }))).toBeNull();
  });
});

describe("sessionTotals", () => {
  it("prices accepted goods at the override when one was entered, PO cost otherwise", () => {
    const totals = sessionTotals(mkSession([
      mkLine({ id: "a", accepted_qty: 10, unit_cost_cents: 875 }),          // 10 × 8.75
      mkLine({ id: "b", accepted_qty: 5, po_unit_cost_cents: 320 }),        // 5 × 3.20
    ]));
    expect(totals.acceptedValueCents).toBe(10 * 875 + 5 * 320);
    // The PO-priced comparison is what makes the bill impact visible.
    expect(totals.poValueCents).toBe(10 * 850 + 5 * 320);
    expect(totals.costChangedLines).toBe(1);
  });

  it("counts shortages, overages and never-scanned lines separately", () => {
    const totals = sessionTotals(mkSession([
      mkLine({ id: "a", accepted_qty: 8 }),   // short
      mkLine({ id: "b", accepted_qty: 12 }),  // over
      mkLine({ id: "c" }),                    // untouched
    ]));
    expect(totals.shortLines).toBe(1);
    expect(totals.overLines).toBe(1);
    expect(totals.untouched).toBe(1);
  });

  it("returns a zeroed shape rather than throwing when there is no session yet", () => {
    expect(sessionTotals(null).expected).toBe(0);
  });
});

describe("date round-tripping", () => {
  it("survives a trip through the date input without shifting the day", () => {
    const ms = fromDateInput("2026-08-11");
    expect(toDateInput(ms)).toBe("2026-08-11");
  });

  it("treats a cleared field as no date rather than the epoch", () => {
    expect(fromDateInput("")).toBeNull();
    expect(toDateInput(null)).toBe("");
  });
});

// ── Inline editing ───────────────────────────────────────────────────────────

describe("ReceivingLinesTable", () => {
  it("saves a corrected quantity from the row itself", async () => {
    const onPatch = vi.fn();
    render(
      <ReceivingLinesTable
        lines={[mkLine({ accepted_qty: 10 })]}
        activeLineId={null}
        onSelect={() => {}}
        onPatch={onPatch}
        readOnly={false}
        savingLineId={null}
      />,
    );

    const qty = screen.getByLabelText(/Received quantity for Organic Dark Roast Beans/i);
    await userEvent.clear(qty);
    await userEvent.type(qty, "9");
    await userEvent.tab();

    expect(onPatch).toHaveBeenCalledWith("rsl_1", { acceptedQty: 9 });
  });

  it("converts a typed cost into integer cents", async () => {
    const onPatch = vi.fn();
    render(
      <ReceivingLinesTable
        lines={[mkLine()]} activeLineId={null} onSelect={() => {}}
        onPatch={onPatch} readOnly={false} savingLineId={null}
      />,
    );

    const cost = screen.getByLabelText(/Unit cost for Organic Dark Roast Beans/i);
    await userEvent.clear(cost);
    await userEvent.type(cost, "8.75");
    await userEvent.tab();

    expect(onPatch).toHaveBeenCalledWith("rsl_1", { unitCostCents: 875 });
  });

  it("abandons an edit on Escape without saving", async () => {
    const onPatch = vi.fn();
    render(
      <ReceivingLinesTable
        lines={[mkLine({ accepted_qty: 10 })]} activeLineId={null} onSelect={() => {}}
        onPatch={onPatch} readOnly={false} savingLineId={null}
      />,
    );

    const qty = screen.getByLabelText(/Received quantity for Organic Dark Roast Beans/i);
    await userEvent.clear(qty);
    await userEvent.type(qty, "3{Escape}");

    expect(onPatch).not.toHaveBeenCalled();
  });

  it("locks every field once the session is read-only", () => {
    render(
      <ReceivingLinesTable
        lines={[mkLine()]} activeLineId={null} onSelect={() => {}}
        onPatch={vi.fn()} readOnly savingLineId={null}
      />,
    );
    expect(screen.getByLabelText(/Received quantity/i)).toBeDisabled();
    expect(screen.getByLabelText(/Unit cost/i)).toBeDisabled();
    expect(screen.getByLabelText(/Lot code/i)).toBeDisabled();
    expect(screen.getByLabelText(/Expiry date/i)).toBeDisabled();
  });

  it("flags an over-receipt on the quantity field for assistive tech, not just by colour", () => {
    render(
      <ReceivingLinesTable
        lines={[mkLine({ accepted_qty: 12 })]} activeLineId={null} onSelect={() => {}}
        onPatch={vi.fn()} readOnly={false} savingLineId={null}
      />,
    );
    expect(screen.getByLabelText(/Received quantity/i)).toHaveAttribute("aria-invalid", "true");
  });
});

// ── Review ───────────────────────────────────────────────────────────────────

describe("ReviewPanel", () => {
  const noopProps = {
    onJumpToLine: () => {}, onFinalise: () => {}, onCancel: () => {},
    finalising: false, error: null,
  };

  it("says so plainly when the delivery is clean", () => {
    render(
      <ReviewPanel
        session={mkSession([mkLine({ accepted_qty: 10 })])}
        canManage {...noopProps}
      />,
    );
    expect(screen.getByText(/Everything ordered arrived, at the agreed cost/i)).toBeInTheDocument();
    expect(screen.getByText("No exceptions")).toBeInTheDocument();
  });

  it("surfaces shortages and repricing as findings, and links back to the line", async () => {
    const onJumpToLine = vi.fn();
    render(
      <ReviewPanel
        session={mkSession([mkLine({ accepted_qty: 8, unit_cost_cents: 875 })])}
        canManage {...noopProps} onJumpToLine={onJumpToLine}
      />,
    );

    expect(screen.getByText(/1 short/i)).toBeInTheDocument();
    // +$0.25 × 8 units against PO pricing.
    expect(screen.getByText(/\+\$2\.00 against PO pricing/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Organic Dark Roast Beans/i }));
    expect(onJumpToLine).toHaveBeenCalledWith("rsl_1");
  });

  it("only offers 'close short' when something is actually outstanding", () => {
    const { rerender } = render(
      <ReviewPanel session={mkSession([mkLine({ accepted_qty: 10 })])} canManage {...noopProps} />,
    );
    expect(screen.queryByRole("button", { name: /close short/i })).not.toBeInTheDocument();

    rerender(
      <ReviewPanel session={mkSession([mkLine({ accepted_qty: 8 })])} canManage {...noopProps} />,
    );
    expect(screen.getByRole("button", { name: /close short/i })).toBeInTheDocument();
  });

  it("hides posting entirely from a user without manager access", () => {
    render(
      <ReviewPanel
        session={mkSession([mkLine({ accepted_qty: 10 })])}
        canManage={false} {...noopProps}
      />,
    );
    expect(screen.queryByRole("button", { name: /post receipt/i })).not.toBeInTheDocument();
    expect(screen.getByText(/needs manager access/i)).toBeInTheDocument();
  });
});

// ── Cost intelligence ────────────────────────────────────────────────────────

describe("CostIntelligencePanel", () => {
  const intel: ReceiveLineIntelligence = {
    product_id: "prod_1", last_purchase_cost_cents: 825, prev_vendor_cost_cents: 810,
    avg_purchase_cost_cents: 831, lowest_historical_cost_cents: 780,
    highest_historical_cost_cents: 899, cost_trend: "up",
    variance_vs_po_pct: 2.94, variance_band: "yellow",
    preferred_supplier_id: "sup_acme", preferred_supplier_name: "Acme Wholesale",
    lead_time_days: 5, moq: 24, fill_rate_pct: 96.4, stock_on_hand: 62,
    previous_lot_code: "L-2402", previous_lot_expiry: now, previous_lot_qty: 18,
    rotation_warning: null,
  };

  it("prompts for a line instead of rendering an empty shell", () => {
    render(<CostIntelligencePanel line={null} intelligence={null} loading={false} />);
    expect(screen.getByText(/Scan an item or pick a line/i)).toBeInTheDocument();
  });

  it("shows the cost being received and how it compares to every known baseline", () => {
    render(
      <CostIntelligencePanel
        line={mkLine({ unit_cost_cents: 875 })} intelligence={intel} loading={false}
      />,
    );

    // The number that will actually post.
    expect(screen.getByText("$8.75")).toBeInTheDocument();
    // PO cost, and the +$0.25 / +2.94% delta from the brief's worked example.
    expect(screen.getByText("$8.50")).toBeInTheDocument();
    expect(screen.getByText(/\+\$0\.25 \/ \+2\.94%/)).toBeInTheDocument();
    // Last received $8.25 → +$0.50 against it.
    expect(screen.getByText("$8.25")).toBeInTheDocument();
    expect(screen.getByText("Review")).toBeInTheDocument();
  });

  it("says 'No history' rather than inventing a baseline it does not have", () => {
    render(
      <CostIntelligencePanel
        line={mkLine({ unit_cost_cents: 875 })}
        intelligence={{ ...intel, prev_vendor_cost_cents: null, avg_purchase_cost_cents: null }}
        loading={false}
      />,
    );
    expect(screen.getAllByText("No history").length).toBe(2);
  });

  it("raises a rotation warning where one exists", () => {
    render(
      <CostIntelligencePanel
        line={mkLine()}
        intelligence={{ ...intel, rotation_warning: "Older lot L-2310 is already past expiry." }}
        loading={false}
      />,
    );
    expect(screen.getByText(/Rotation warning/i)).toBeInTheDocument();
  });
});

// ── Focused-workspace routing policy ─────────────────────────────────────────

describe("isFocusedRoute", () => {
  it("collapses navigation for task screens", () => {
    expect(isFocusedRoute("/purchasing/receiving/rcv_1")).toBe(true);
    expect(isFocusedRoute("/inventory/receive-stock")).toBe(true);
    expect(isFocusedRoute("/terminal")).toBe(true);
    expect(isFocusedRoute("/purchase")).toBe(true);
  });

  it("leaves navigation open on browsing screens", () => {
    expect(isFocusedRoute("/dashboard")).toBe(false);
    expect(isFocusedRoute("/purchasing")).toBe(false);
    expect(isFocusedRoute("/reports")).toBe(false);
    expect(isFocusedRoute("/settings")).toBe(false);
  });

  it("keeps the receiving list itself a browsing screen, not a task", () => {
    // Same prefix as the workspace — the exemption is what separates them.
    expect(isFocusedRoute("/purchasing/receiving")).toBe(false);
    expect(isFocusedRoute("/purchasing/receiving/rcv_1")).toBe(true);
  });
});

// ── Lifecycle ────────────────────────────────────────────────────────────────

describe("buildLifecycle", () => {
  const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;

  it("distinguishes goods-in-the-building from money-having-moved", () => {
    const stages = buildLifecycle({
      orderedQty: 100, receivedQty: 100, billedQty: 100,
      billedCents: 85000, paidCents: 0, formatMoney: fmt,
    });
    const by = Object.fromEntries(stages.map((s) => [s.key, s]));
    expect(by["received"]!.state).toBe("done");
    expect(by["billed"]!.state).toBe("done");
    expect(by["paid"]!.state).toBe("pending");
  });

  it("marks a part-delivered order partial, not complete", () => {
    const stages = buildLifecycle({
      orderedQty: 100, receivedQty: 40, billedQty: 0,
      billedCents: 0, paidCents: 0, formatMoney: fmt,
    });
    expect(stages.find((s) => s.key === "received")!.state).toBe("partial");
    expect(stages.find((s) => s.key === "received")!.detail).toBe("40 of 100");
  });

  it("treats over-receipt and over-payment as exceptions rather than success", () => {
    const stages = buildLifecycle({
      orderedQty: 100, receivedQty: 105, billedQty: 100,
      billedCents: 85000, paidCents: 90000, formatMoney: fmt,
    });
    expect(stages.find((s) => s.key === "received")!.state).toBe("exception");
    expect(stages.find((s) => s.key === "paid")!.state).toBe("exception");
  });
});
