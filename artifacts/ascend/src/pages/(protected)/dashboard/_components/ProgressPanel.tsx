
/**
 * ProgressPanel — the operating surface for Ascend's truth-tracking model
 * (Hypothesis → Task → Evidence → Verified Result → Decision), backed by the
 * live `/api/v1/progress` module. It lets an operator see how much work is
 * merely self-reported vs. evidence-backed vs. system-verified, create and
 * advance tasks, attach evidence, and ask Ascend to verify a task from real
 * tenant data.
 *
 * Split for testability: `ProgressPanelView` is presentational (data + callbacks
 * via props); `ProgressPanel` is the container that fetches and wires mutations.
 * Mutations are manager+ only — read-only roles never see the controls, and the
 * backend enforces the same (hiding the UI is convenience, not the guard).
 */

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Badge, type BadgeVariant } from "@/components/Badge";
import { hasRole } from "@/lib/auth";
import { apiGet, apiPost, apiPatch, ApiResponseError } from "@/api-client/client";
import type {
  ProgressTask,
  ProgressStatus,
  ProgressSummary,
  ProgressTasksResponse,
  CreateProgressTaskInput,
  AttachEvidenceInput,
} from "@/api-client/types";
import { MANUAL_PROGRESS_STATUSES } from "@/api-client/types";

// ─── Display maps ─────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<ProgressStatus, string> = {
  not_started: "Not started",
  planned: "Planned",
  in_progress: "In progress",
  self_reported_done: "Self-reported",
  evidence_attached: "Evidence attached",
  system_verified: "System verified",
  validated: "Validated",
  invalidated: "Invalidated",
  blocked: "Blocked",
  skipped: "Skipped",
};

const STATUS_BADGE: Record<ProgressStatus, BadgeVariant> = {
  not_started: "gray",
  planned: "gray",
  in_progress: "blue",
  self_reported_done: "yellow",
  evidence_attached: "purple",
  system_verified: "green",
  validated: "green",
  invalidated: "red",
  blocked: "red",
  skipped: "gray",
};

/** The five truth-status buckets the dashboard summarizes (issue #22 AC). */
const SUMMARY_BUCKETS: ProgressStatus[] = [
  "self_reported_done",
  "evidence_attached",
  "system_verified",
  "validated",
  "invalidated",
];

/** Verification sources Ascend can prove from internal data, with friendly labels. */
export const VERIFICATION_SOURCES: { value: string; label: string }[] = [
  { value: "retail.first_product", label: "First product added" },
  { value: "retail.first_receiving", label: "First stock received" },
  { value: "retail.first_sale", label: "First completed sale" },
  { value: "retail.expenses_categorized", label: "Expenses fully categorized" },
  { value: "retail.cost_prices_complete", label: "Cost prices complete" },
];

function verificationLabel(source: string | null): string | null {
  if (!source) return null;
  return VERIFICATION_SOURCES.find((s) => s.value === source)?.label ?? source;
}

/** System verification is only offered once the task is anchored to a source
 *  Ascend can check, and it hasn't already been proven or decided. */
function canSystemVerify(task: ProgressTask): boolean {
  return (
    Boolean(task.verification_source) &&
    task.status !== "system_verified" &&
    task.status !== "validated" &&
    task.status !== "invalidated"
  );
}

// ─── Presentational view ────────────────────────────────────────────────────

interface ProgressPanelViewProps {
  summary: ProgressSummary | null;
  tasks: ProgressTask[];
  canManage: boolean;
  loading: boolean;
  error: string | null;
  busy?: boolean;
  onCreateTask: (input: CreateProgressTaskInput) => void | Promise<void>;
  onAdvanceStatus: (id: string, status: ProgressStatus) => void | Promise<void>;
  onAttachEvidence: (id: string, input: AttachEvidenceInput) => void | Promise<void>;
  onSystemVerify: (id: string) => void | Promise<void>;
}

function BucketTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border p-3 text-center shadow-[var(--shadow-sm)]"
      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
      <p className="text-xl font-semibold tabular-nums" style={{ color: "var(--color-text-primary)" }}>{value}</p>
      <p className="mt-0.5 text-[11px] font-medium leading-tight" style={{ color: "var(--color-text-secondary)" }}>{label}</p>
    </div>
  );
}

/** Presentational progress surface — pure render + callbacks, no data fetching. */
export function ProgressPanelView({
  summary,
  tasks,
  canManage,
  loading,
  error,
  busy = false,
  onCreateTask,
  onAdvanceStatus,
  onAttachEvidence,
  onSystemVerify,
}: ProgressPanelViewProps) {
  const [title, setTitle] = useState("");
  const [verificationSource, setVerificationSource] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [evidenceFor, setEvidenceFor] = useState<string | null>(null);
  const [evidenceTitle, setEvidenceTitle] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");

  function submitCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const trimmed = title.trim();
    if (trimmed.length < 3) {
      setFormError("Give the task a title of at least 3 characters.");
      return;
    }
    void onCreateTask({
      title: trimmed,
      category: "retail_readiness",
      verificationSource: verificationSource || null,
    });
    setTitle("");
    setVerificationSource("");
  }

  function submitEvidence(e: FormEvent<HTMLFormElement>, taskId: string) {
    e.preventDefault();
    const trimmed = evidenceTitle.trim();
    if (trimmed.length < 3) return;
    void onAttachEvidence(taskId, {
      title: trimmed,
      url: evidenceUrl.trim() || null,
      source: "manual",
    });
    setEvidenceFor(null);
    setEvidenceTitle("");
    setEvidenceUrl("");
  }

  const taskCounts = summary?.tasks;

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Progress &amp; verification</h2>
          <p className="mt-0.5 text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
            Track work from self-reported to evidence-backed to system-verified — Ascend only
            marks a task verified when it can prove it from your real data.
          </p>
        </div>
      </div>

      {/* ── Truth-status summary ──────────────────────────────────────────── */}
      {loading && !summary ? (
        <div role="status" aria-label="Loading progress summary" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {SUMMARY_BUCKETS.map((b) => (
            <div key={b} className="h-16 animate-skeleton rounded-xl border" style={{ borderColor: "var(--color-border)" }} />
          ))}
        </div>
      ) : (
        <div role="group" aria-label="Truth-status summary" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {SUMMARY_BUCKETS.map((b) => (
            <BucketTile key={b} label={STATUS_LABEL[b]} value={taskCounts?.[b] ?? 0} />
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {/* ── Create task ───────────────────────────────────────────────────── */}
      {canManage && (
        <form onSubmit={submitCreate} className="mt-4 flex flex-wrap items-end gap-2 border-t pt-4" style={{ borderColor: "var(--color-border)" }}>
          <div className="min-w-[200px] flex-1">
            <label htmlFor="progress-title" className="mb-1 block text-[11px] font-medium" style={{ color: "var(--color-text-secondary)" }}>
              New task
            </label>
            <input
              id="progress-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Receive first purchase order"
              className="h-9 w-full rounded-lg border px-3 text-[13px] outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }}
            />
          </div>
          <div>
            <label htmlFor="progress-source" className="mb-1 block text-[11px] font-medium" style={{ color: "var(--color-text-secondary)" }}>
              Verify from (optional)
            </label>
            <select
              id="progress-source"
              value={verificationSource}
              onChange={(e) => setVerificationSource(e.target.value)}
              className="h-9 rounded-lg border px-2 text-[13px] outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }}
            >
              <option value="">Manual only</option>
              {VERIFICATION_SOURCES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="primary" size="md" loading={busy}>
            Add task
          </Button>
          {formError && (
            <p role="alert" className="w-full text-sm text-red-700">{formError}</p>
          )}
        </form>
      )}

      {/* ── Task list ─────────────────────────────────────────────────────── */}
      <div className="mt-4">
        {loading && tasks.length === 0 ? (
          <div role="status" aria-label="Loading tasks" className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 animate-skeleton rounded-xl border" style={{ borderColor: "var(--color-border)" }} />
            ))}
          </div>
        ) : tasks.length === 0 ? (
          <p className="rounded-xl border px-3 py-4 text-[13px]" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-subtle)", color: "var(--color-text-secondary)" }}>
            No progress tasks yet. {canManage ? "Add one above" : "A manager can add one"} to start tracking
            what still needs to be proven.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--color-table-border)]">
            {tasks.map((task) => {
              const vLabel = verificationLabel(task.verification_source);
              const verifiable = canSystemVerify(task);
              return (
                <li key={task.id} className="py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-[180px] flex-1">
                      <p className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>{task.title}</p>
                      {task.description && (
                        <p className="mt-0.5 line-clamp-2 text-[11px]" style={{ color: "var(--color-text-secondary)" }}>{task.description}</p>
                      )}
                      {vLabel && (
                        <p className="mt-1 text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
                          Verifiable from: <span className="font-medium">{vLabel}</span>
                        </p>
                      )}
                    </div>
                    <Badge variant={STATUS_BADGE[task.status]}>{STATUS_LABEL[task.status]}</Badge>
                  </div>

                  {canManage && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <select
                        aria-label={`Change status for ${task.title}`}
                        value=""
                        disabled={busy}
                        onChange={(e) => {
                          const next = e.target.value as ProgressStatus;
                          if (next) void onAdvanceStatus(task.id, next);
                        }}
                        className="h-8 rounded-lg border px-2 text-[11px] outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }}
                      >
                        <option value="">Set status…</option>
                        {MANUAL_PROGRESS_STATUSES.map((s) => (
                          <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                        ))}
                      </select>

                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={busy}
                        onClick={() => {
                          setEvidenceFor(evidenceFor === task.id ? null : task.id);
                          setEvidenceTitle("");
                          setEvidenceUrl("");
                        }}
                      >
                        Attach evidence
                      </Button>

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={busy || !verifiable}
                        title={
                          verifiable
                            ? "Ask Ascend to verify this task from your real data"
                            : "Add a verification source to enable system verification"
                        }
                        onClick={() => onSystemVerify(task.id)}
                      >
                        Verify with data
                      </Button>
                    </div>
                  )}

                  {canManage && evidenceFor === task.id && (
                    <form
                      onSubmit={(e) => submitEvidence(e, task.id)}
                      className="mt-2 flex flex-wrap items-end gap-2 rounded-xl border p-3"
                      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-subtle)" }}
                    >
                      <div className="min-w-[160px] flex-1">
                        <label htmlFor={`ev-title-${task.id}`} className="mb-1 block text-[11px] font-medium" style={{ color: "var(--color-text-secondary)" }}>
                          Evidence title
                        </label>
                        <input
                          id={`ev-title-${task.id}`}
                          value={evidenceTitle}
                          onChange={(e) => setEvidenceTitle(e.target.value)}
                          placeholder="e.g. PO #1042 received"
                          className="h-8 w-full rounded-lg border px-2 text-[11px] outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }}
                        />
                      </div>
                      <div className="min-w-[140px]">
                        <label htmlFor={`ev-url-${task.id}`} className="mb-1 block text-[11px] font-medium" style={{ color: "var(--color-text-secondary)" }}>
                          Link (optional)
                        </label>
                        <input
                          id={`ev-url-${task.id}`}
                          value={evidenceUrl}
                          onChange={(e) => setEvidenceUrl(e.target.value)}
                          placeholder="https://…"
                          className="h-8 w-full rounded-lg border px-2 text-[11px] outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }}
                        />
                      </div>
                      <Button type="submit" variant="primary" size="sm" loading={busy}>
                        Save evidence
                      </Button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}

// ─── Container ────────────────────────────────────────────────────────────────

/**
 * Container — fetches progress summary + tasks and wires mutations to the real
 * `/api/v1/progress` API. `refreshSignal` lets a sibling (the dashboard's
 * "Track as task" recommendation action) force a reload after it creates a task.
 */
export default function ProgressPanel({ refreshSignal = 0 }: { refreshSignal?: number }) {
  const [tasks, setTasks] = useState<ProgressTask[]>([]);
  const [summary, setSummary] = useState<ProgressSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canManage = hasRole("manager");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, sum] = await Promise.all([
        apiGet<ProgressTasksResponse>("/api/v1/progress/tasks"),
        apiGet<ProgressSummary>("/api/v1/progress/summary"),
      ]);
      setTasks(list.items);
      setSummary(sum);
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : "Failed to load progress.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshSignal]);

  const mutate = useCallback(
    async (op: () => Promise<unknown>) => {
      setBusy(true);
      setError(null);
      try {
        await op();
        await load();
      } catch (e) {
        setError(e instanceof ApiResponseError ? e.message : "Action failed.");
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  const onCreateTask = useCallback(
    (input: CreateProgressTaskInput) => mutate(() => apiPost("/api/v1/progress/tasks", input)),
    [mutate],
  );
  const onAdvanceStatus = useCallback(
    (id: string, status: ProgressStatus) => mutate(() => apiPatch(`/api/v1/progress/tasks/${id}/status`, { status })),
    [mutate],
  );
  const onAttachEvidence = useCallback(
    (id: string, input: AttachEvidenceInput) => mutate(() => apiPost(`/api/v1/progress/tasks/${id}/evidence`, input)),
    [mutate],
  );
  const onSystemVerify = useCallback(
    (id: string) => mutate(() => apiPost(`/api/v1/progress/tasks/${id}/system-verify`, {})),
    [mutate],
  );

  return (
    <ProgressPanelView
      summary={summary}
      tasks={tasks}
      canManage={canManage}
      loading={loading}
      error={error}
      busy={busy}
      onCreateTask={onCreateTask}
      onAdvanceStatus={onAdvanceStatus}
      onAttachEvidence={onAttachEvidence}
      onSystemVerify={onSystemVerify}
    />
  );
}
