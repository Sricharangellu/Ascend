import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HypothesisList } from "@/app/(protected)/progress/_components/HypothesisList";
import { HypothesisDetail } from "@/app/(protected)/progress/_components/HypothesisDetail";
import type {
  ProgressDecision,
  ProgressEvidence,
  ProgressHypothesis,
  ProgressHypothesisDetail,
  ProgressTask,
} from "@/api-client/types";

const now = Date.now();
const noop = () => {};

function mkHypothesis(over: Partial<ProgressHypothesis> = {}): ProgressHypothesis {
  return {
    id: "hyp_1", tenant_id: "tnt_demo",
    statement: "Best sellers run out before the next delivery.",
    category: "inventory_health", status: "planned", confidence_score: 0,
    success_criteria: "Two restock cycles with no stockouts.",
    created_by: "u", created_at: now, updated_at: now, ...over,
  };
}

function mkTask(over: Partial<ProgressTask> = {}): ProgressTask {
  return {
    id: "tsk_1", tenant_id: "tnt_demo", hypothesis_id: "hyp_1", title: "Check 30-day sales",
    description: null, category: "retail_readiness", status: "planned",
    verification_source: null, due_at: null, completed_at: null,
    created_by: "u", created_at: now, updated_at: now, ...over,
  };
}

function mkEvidence(over: Partial<ProgressEvidence> = {}): ProgressEvidence {
  return {
    id: "evd_1", tenant_id: "tnt_demo", task_id: null, hypothesis_id: "hyp_1",
    evidence_type: "note", title: "Sales export", url: null, notes: null,
    source: "manual", created_by: "u", created_at: now, ...over,
  };
}

function mkDecision(over: Partial<ProgressDecision> = {}): ProgressDecision {
  return {
    id: "dec_1", tenant_id: "tnt_demo", hypothesis_id: "hyp_1", decision: "validated",
    reason: "The export confirmed it.", next_action: "Raise reorder points.",
    created_by: "u", created_at: now, ...over,
  };
}

function mkDetail(over: Partial<ProgressHypothesisDetail> = {}): ProgressHypothesisDetail {
  return { hypothesis: mkHypothesis(), tasks: [], evidence: [], decisions: [], ...over };
}

function renderList(props: Partial<React.ComponentProps<typeof HypothesisList>> = {}) {
  return render(
    <HypothesisList
      hypotheses={[mkHypothesis()]}
      selectedId="hyp_1"
      canManage
      loading={false}
      onSelect={noop}
      onCreate={noop}
      {...props}
    />,
  );
}

function renderDetail(props: Partial<React.ComponentProps<typeof HypothesisDetail>> = {}) {
  return render(
    <HypothesisDetail
      detail={mkDetail()}
      canManage
      loading={false}
      onAttachEvidence={noop}
      onRecordDecision={noop}
      {...props}
    />,
  );
}

describe("HypothesisList", () => {
  it("lists each hypothesis with its truth status", () => {
    renderList({
      hypotheses: [
        mkHypothesis({ id: "hyp_1", statement: "Best sellers run out.", status: "evidence_attached" }),
        mkHypothesis({ id: "hyp_2", statement: "Card fees eat the margin.", status: "invalidated" }),
      ],
    });
    expect(within(screen.getByText("Best sellers run out.").closest("li")!).getByText("Evidence attached")).toBeInTheDocument();
    expect(within(screen.getByText("Card fees eat the margin.").closest("li")!).getByText("Invalidated")).toBeInTheDocument();
  });

  it("marks the selected hypothesis for assistive tech, not just visually", () => {
    renderList({
      hypotheses: [mkHypothesis({ id: "hyp_1" }), mkHypothesis({ id: "hyp_2", statement: "Second belief." })],
      selectedId: "hyp_2",
    });
    expect(screen.getByText("Second belief.").closest("button")).toHaveAttribute("aria-current", "true");
    expect(screen.getByText("Best sellers run out before the next delivery.").closest("button")).not.toHaveAttribute("aria-current");
  });

  it("selects a hypothesis through the callback", async () => {
    const onSelect = vi.fn();
    renderList({ hypotheses: [mkHypothesis({ id: "hyp_9", statement: "A ninth belief." })], onSelect });
    await userEvent.click(screen.getByText("A ninth belief."));
    expect(onSelect).toHaveBeenCalledWith("hyp_9");
  });

  it("creates a hypothesis with its category and success criteria", async () => {
    const onCreate = vi.fn();
    renderList({ onCreate });
    await userEvent.type(screen.getByLabelText("New hypothesis"), "Slow movers block shelf space");
    await userEvent.selectOptions(screen.getByLabelText("Category"), "margin");
    await userEvent.type(screen.getByLabelText(/how you'll know/i), "Two SKUs cleared");
    await userEvent.click(screen.getByRole("button", { name: /add hypothesis/i }));
    expect(onCreate).toHaveBeenCalledWith({
      statement: "Slow movers block shelf space",
      category: "margin",
      successCriteria: "Two SKUs cleared",
    });
  });

  it("rejects a too-short statement in the form rather than sending it", async () => {
    const onCreate = vi.fn();
    renderList({ onCreate });
    await userEvent.type(screen.getByLabelText("New hypothesis"), "no");
    await userEvent.click(screen.getByRole("button", { name: /add hypothesis/i }));
    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByText(/at least 3 characters/i)).toBeInTheDocument();
  });

  it("shows a loading state before the first list arrives", () => {
    renderList({ hypotheses: [], loading: true });
    expect(screen.getByRole("status", { name: "Loading hypotheses" })).toBeInTheDocument();
  });

  it("shows an empty state that tells a read-only role who can add one", () => {
    renderList({ hypotheses: [], canManage: false });
    expect(screen.getByText("No hypotheses yet")).toBeInTheDocument();
    expect(screen.getByText(/a manager can add the first one/i)).toBeInTheDocument();
  });

  it("hides the create form from read-only roles", () => {
    renderList({ canManage: false });
    expect(screen.queryByLabelText("New hypothesis")).not.toBeInTheDocument();
  });
});

describe("HypothesisDetail", () => {
  it("prompts for a selection when nothing is chosen", () => {
    renderDetail({ detail: null });
    expect(screen.getByText("Select a hypothesis")).toBeInTheDocument();
  });

  it("shows a loading state while the loop is being fetched", () => {
    renderDetail({ detail: null, loading: true });
    expect(screen.getByRole("status", { name: "Loading hypothesis" })).toBeInTheDocument();
  });

  it("renders the whole loop: statement, tasks, evidence and decisions", () => {
    renderDetail({
      detail: mkDetail({
        hypothesis: mkHypothesis({ status: "validated", confidence_score: 100 }),
        tasks: [mkTask({ title: "Check 30-day sales", status: "system_verified", verification_source: "retail.first_sale" })],
        evidence: [mkEvidence({ title: "Sales export", source: "system" })],
        decisions: [mkDecision({ reason: "The export confirmed it." })],
      }),
    });
    expect(screen.getByText("Best sellers run out before the next delivery.")).toBeInTheDocument();
    expect(screen.getByText(/two restock cycles with no stockouts/i)).toBeInTheDocument();
    expect(screen.getByText("Tasks (1)")).toBeInTheDocument();
    expect(screen.getByText("Evidence (1)")).toBeInTheDocument();
    expect(screen.getByText("First completed sale")).toBeInTheDocument();
    expect(screen.getByText(/verified by ascend/i)).toBeInTheDocument();
    expect(screen.getByText("The export confirmed it.")).toBeInTheDocument();
    expect(screen.getByText("Raise reorder points.")).toBeInTheDocument();
  });

  it("blocks a decision until evidence exists — matching the backend rule", () => {
    renderDetail({ detail: mkDetail({ evidence: [] }) });
    expect(screen.getByRole("button", { name: "Validate" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Invalidate" })).toBeDisabled();
    expect(screen.getByText(/attach at least one piece of evidence/i)).toBeInTheDocument();
  });

  it("enables the decision once evidence is attached", () => {
    renderDetail({ detail: mkDetail({ evidence: [mkEvidence()] }) });
    expect(screen.getByRole("button", { name: "Validate" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Invalidate" })).toBeEnabled();
  });

  it("records a validation with its reason and next action", async () => {
    const onRecordDecision = vi.fn();
    renderDetail({ detail: mkDetail({ evidence: [mkEvidence()] }), onRecordDecision });
    await userEvent.type(screen.getByLabelText(/reason/i), "Two SKUs had no movement.");
    await userEvent.type(screen.getByLabelText(/next action/i), "Discount and clear them.");
    await userEvent.click(screen.getByRole("button", { name: "Validate" }));
    expect(onRecordDecision).toHaveBeenCalledWith("hyp_1", {
      decision: "validated",
      reason: "Two SKUs had no movement.",
      nextAction: "Discount and clear them.",
    });
  });

  it("records an invalidation through the opposite button", async () => {
    const onRecordDecision = vi.fn();
    renderDetail({ detail: mkDetail({ evidence: [mkEvidence()] }), onRecordDecision });
    await userEvent.click(screen.getByRole("button", { name: "Invalidate" }));
    expect(onRecordDecision).toHaveBeenCalledWith(
      "hyp_1",
      expect.objectContaining({ decision: "invalidated" }),
    );
  });

  it("attaches evidence directly to the hypothesis", async () => {
    const onAttachEvidence = vi.fn();
    renderDetail({ onAttachEvidence });
    await userEvent.type(screen.getByLabelText("Attach evidence"), "Shelf photo");
    await userEvent.type(screen.getByLabelText(/link/i), "https://example.test/a.png");
    await userEvent.click(screen.getByRole("button", { name: "Attach" }));
    expect(onAttachEvidence).toHaveBeenCalledWith("hyp_1", {
      title: "Shelf photo",
      url: "https://example.test/a.png",
      source: "manual",
    });
  });

  it("closes the loop once decided — no further evidence or decision controls", () => {
    renderDetail({
      detail: mkDetail({
        hypothesis: mkHypothesis({ status: "invalidated" }),
        evidence: [mkEvidence()],
        decisions: [mkDecision({ decision: "invalidated", reason: "Fees were 0.3% of revenue." })],
      }),
    });
    expect(screen.getByText("Fees were 0.3% of revenue.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Validate" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Attach evidence")).not.toBeInTheDocument();
  });

  it("hides every mutation control from read-only roles", () => {
    renderDetail({ detail: mkDetail({ evidence: [mkEvidence()] }), canManage: false });
    expect(screen.queryByLabelText("Attach evidence")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Validate" })).not.toBeInTheDocument();
    expect(screen.getByText("Evidence (1)")).toBeInTheDocument();
  });
});
