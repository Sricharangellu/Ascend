import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProgressPanelView } from "@/app/(protected)/dashboard/_components/ProgressPanel";
import {
  DashboardRecommendations,
  type RecommendationReport,
} from "@/app/(protected)/dashboard/_components/DashboardRecommendations";
import type { ProgressStatus, ProgressSummary, ProgressTask } from "@/api-client/types";

const now = Date.now();

const zeroCounts = (): Record<ProgressStatus, number> => ({
  not_started: 0, planned: 0, in_progress: 0, self_reported_done: 0,
  evidence_attached: 0, system_verified: 0, validated: 0, invalidated: 0,
  blocked: 0, skipped: 0,
});

const summary: ProgressSummary = {
  hypotheses: zeroCounts(),
  tasks: { ...zeroCounts(), self_reported_done: 2, evidence_attached: 3, system_verified: 1, validated: 1, invalidated: 1 },
  evidenceCount: 5,
  decisionsCount: 2,
};

function mkTask(over: Partial<ProgressTask>): ProgressTask {
  return {
    id: "tsk_x", tenant_id: "tnt_demo", hypothesis_id: null, title: "Task",
    description: null, category: "retail_readiness", status: "planned",
    verification_source: null, due_at: null, completed_at: null,
    created_by: "u", created_at: now, updated_at: now, ...over,
  };
}

const tasks: ProgressTask[] = [
  mkTask({ id: "tsk_1", title: "Add your first products", status: "system_verified", verification_source: "retail.first_product" }),
  mkTask({ id: "tsk_2", title: "Record your first sale", status: "planned", verification_source: "retail.first_sale" }),
  mkTask({ id: "tsk_3", title: "Write a marketing plan", status: "planned", verification_source: null }),
];

const noop = () => {};

function renderView(props: Partial<React.ComponentProps<typeof ProgressPanelView>> = {}) {
  return render(
    <ProgressPanelView
      summary={summary}
      tasks={tasks}
      canManage
      loading={false}
      error={null}
      onCreateTask={noop}
      onAdvanceStatus={noop}
      onAttachEvidence={noop}
      onSystemVerify={noop}
      {...props}
    />,
  );
}

describe("ProgressPanelView", () => {
  it("summarizes the five truth-status buckets with their counts", () => {
    renderView();
    const region = screen.getByRole("group", { name: "Truth-status summary" });
    const bucket = (label: string) => within(region).getByText(label).closest("div")!;
    expect(within(bucket("Self-reported")).getByText("2")).toBeInTheDocument();
    expect(within(bucket("Evidence attached")).getByText("3")).toBeInTheDocument();
    expect(within(bucket("System verified")).getByText("1")).toBeInTheDocument();
    expect(within(bucket("Validated")).getByText("1")).toBeInTheDocument();
    expect(within(bucket("Invalidated")).getByText("1")).toBeInTheDocument();
  });

  it("shows each task's current truth-status as a badge", () => {
    renderView();
    const row = screen.getByText("Add your first products").closest("li")!;
    expect(within(row).getByText("System verified")).toBeInTheDocument();
  });

  it("creates a task through the callback, defaulting to manual (no verification source)", async () => {
    const onCreateTask = vi.fn();
    renderView({ onCreateTask });
    await userEvent.type(screen.getByLabelText("New task"), "Verify supplier lead times");
    await userEvent.click(screen.getByRole("button", { name: /add task/i }));
    expect(onCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Verify supplier lead times", verificationSource: null }),
    );
  });

  it("attaches a verification source when one is chosen at creation", async () => {
    const onCreateTask = vi.fn();
    renderView({ onCreateTask });
    await userEvent.type(screen.getByLabelText("New task"), "Confirm first sale");
    await userEvent.selectOptions(screen.getByLabelText(/verify from/i), "retail.first_sale");
    await userEvent.click(screen.getByRole("button", { name: /add task/i }));
    expect(onCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Confirm first sale", verificationSource: "retail.first_sale" }),
    );
  });

  it("advances a task to a manual status through the real API callback", async () => {
    const onAdvanceStatus = vi.fn();
    renderView({ onAdvanceStatus });
    const row = screen.getByText("Record your first sale").closest("li")!;
    await userEvent.selectOptions(within(row).getByLabelText("Change status for Record your first sale"), "in_progress");
    expect(onAdvanceStatus).toHaveBeenCalledWith("tsk_2", "in_progress");
  });

  it("attaches evidence to a task (moves it toward evidence-backed, not validated)", async () => {
    const onAttachEvidence = vi.fn();
    renderView({ onAttachEvidence });
    const row = screen.getByText("Record your first sale").closest("li")!;
    await userEvent.click(within(row).getByRole("button", { name: /attach evidence/i }));
    await userEvent.type(screen.getByLabelText("Evidence title"), "PO #1042 received");
    await userEvent.click(screen.getByRole("button", { name: /save evidence/i }));
    expect(onAttachEvidence).toHaveBeenCalledWith(
      "tsk_2",
      expect.objectContaining({ title: "PO #1042 received" }),
    );
  });

  it("only enables system verification when the task is anchored to a data source", () => {
    renderView();
    const withSource = screen.getByText("Record your first sale").closest("li")!;
    const withoutSource = screen.getByText("Write a marketing plan").closest("li")!;
    expect(within(withSource).getByRole("button", { name: /verify with data/i })).toBeEnabled();
    expect(within(withoutSource).getByRole("button", { name: /verify with data/i })).toBeDisabled();
  });

  it("does not enable system verification for an already-verified task", () => {
    renderView();
    const verified = screen.getByText("Add your first products").closest("li")!;
    expect(within(verified).getByRole("button", { name: /verify with data/i })).toBeDisabled();
  });

  it("triggers system verification against real data through the callback", async () => {
    const onSystemVerify = vi.fn();
    renderView({ onSystemVerify });
    const row = screen.getByText("Record your first sale").closest("li")!;
    await userEvent.click(within(row).getByRole("button", { name: /verify with data/i }));
    expect(onSystemVerify).toHaveBeenCalledWith("tsk_2");
  });

  it("hides management controls from read-only roles", () => {
    renderView({ canManage: false });
    expect(screen.queryByLabelText("New task")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /verify with data/i })).not.toBeInTheDocument();
  });

  it("surfaces an error message", () => {
    renderView({ error: "Action failed." });
    expect(screen.getByRole("alert")).toHaveTextContent("Action failed.");
  });
});

const recReport: RecommendationReport = {
  ready: false,
  generatedAt: now,
  recentDays: 30,
  summary: { total: 1, critical: 0, warning: 1, info: 0 },
  recommendations: [
    {
      id: "rec_low_stock", signalCode: "low_stock", category: "inventory", severity: "warning",
      title: "Restock low inventory", detail: "Some products are at or below reorder point.",
      action: "Review reorder list", href: "/inventory/reorder", count: 4, rank: 1,
    },
  ],
};

describe("DashboardRecommendations → progress task", () => {
  it("turns a recommendation into a tracked task when onTrackTask is provided", async () => {
    const onTrackTask = vi.fn();
    render(<DashboardRecommendations report={recReport} loading={false} error={null} onTrackTask={onTrackTask} />);
    await userEvent.click(screen.getByRole("button", { name: /track "restock low inventory" as a progress task/i }));
    expect(onTrackTask).toHaveBeenCalledWith(expect.objectContaining({ id: "rec_low_stock" }));
  });

  it("omits the track action when no handler is provided", () => {
    render(<DashboardRecommendations report={recReport} loading={false} error={null} />);
    expect(screen.queryByRole("button", { name: /track .* as a progress task/i })).not.toBeInTheDocument();
  });
});
