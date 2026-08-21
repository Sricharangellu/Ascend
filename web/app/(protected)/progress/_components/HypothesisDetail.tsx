"use client";

/**
 * HypothesisDetail — the right panel of the progress loop. Shows one
 * hypothesis with everything that hangs off it: the tasks planned against it,
 * every piece of evidence that counts toward it, the decisions already
 * recorded, and the form that closes it out.
 *
 * The decision form is deliberately gated on evidence existing. That mirrors
 * the backend rule (`createDecision` rejects a decision on a hypothesis with no
 * evidence) rather than duplicating a second, looser rule in the UI — and the
 * disabled state explains *why*, so it reads as a workflow step and not a bug.
 *
 * Presentational only — data + callbacks via props, no fetching.
 */

import { useState, type FormEvent } from "react";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Badge } from "@/components/Badge";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/Skeleton";
import type {
  AttachEvidenceInput,
  ProgressHypothesisDetail,
  RecordDecisionInput,
} from "@/api-client/types";
import {
  PROGRESS_STATUS_BADGE,
  PROGRESS_STATUS_LABEL,
  categoryLabel,
  formatProgressDate,
  isDecided,
  verificationLabel,
} from "@/lib/progress";

interface HypothesisDetailProps {
  detail: ProgressHypothesisDetail | null;
  canManage: boolean;
  loading: boolean;
  busy?: boolean;
  onAttachEvidence: (hypothesisId: string, input: AttachEvidenceInput) => void | Promise<void>;
  onRecordDecision: (hypothesisId: string, input: RecordDecisionInput) => void | Promise<void>;
}

export function HypothesisDetail({
  detail,
  canManage,
  loading,
  busy = false,
  onAttachEvidence,
  onRecordDecision,
}: HypothesisDetailProps) {
  const [evidenceTitle, setEvidenceTitle] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [nextAction, setNextAction] = useState("");

  if (loading && !detail) {
    return (
      <Card>
        <div role="status" aria-label="Loading hypothesis">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="mt-3 h-4 w-1/3" />
          <Skeleton className="mt-6 h-24 w-full" />
          <Skeleton className="mt-3 h-24 w-full" />
        </div>
      </Card>
    );
  }

  if (!detail) {
    return (
      <Card>
        <EmptyState
          title="Select a hypothesis"
          description="Pick one from the list to see its tasks, the evidence behind it, and what was decided."
        />
      </Card>
    );
  }

  const { hypothesis, tasks, evidence, decisions } = detail;
  const decided = isDecided(hypothesis.status);
  const hasEvidence = evidence.length > 0;

  function submitEvidence(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = evidenceTitle.trim();
    if (trimmed.length < 3) {
      setEvidenceError("Describe the evidence in at least 3 characters.");
      return;
    }
    setEvidenceError(null);
    void onAttachEvidence(hypothesis.id, {
      title: trimmed,
      url: evidenceUrl.trim() || null,
      source: "manual",
    });
    setEvidenceTitle("");
    setEvidenceUrl("");
  }

  function submitDecision(decision: "validated" | "invalidated") {
    void onRecordDecision(hypothesis.id, {
      decision,
      reason: reason.trim() || null,
      nextAction: nextAction.trim() || null,
    });
    setReason("");
    setNextAction("");
  }

  return (
    <Card>
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-[200px] flex-1">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
            {hypothesis.statement}
          </h2>
          <p className="mt-1 text-[11px] text-[var(--color-text-secondary)]">
            {categoryLabel(hypothesis.category)} · stated {formatProgressDate(hypothesis.created_at)}
            {" · "}confidence {hypothesis.confidence_score}%
          </p>
          {hypothesis.success_criteria && (
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              <span className="font-medium text-[var(--color-text-primary)]">How we&apos;ll know: </span>
              {hypothesis.success_criteria}
            </p>
          )}
        </div>
        <Badge variant={PROGRESS_STATUS_BADGE[hypothesis.status]}>
          {PROGRESS_STATUS_LABEL[hypothesis.status]}
        </Badge>
      </div>

      {/* ── Tasks ─────────────────────────────────────────────────────────── */}
      <section aria-labelledby="hyp-tasks" className="mt-6">
        <h3 id="hyp-tasks" className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
          Tasks ({tasks.length})
        </h3>
        {tasks.length === 0 ? (
          <p className="mt-2 rounded-md border border-erp-table-border bg-erp-table-header px-3 py-3 text-sm text-[var(--color-text-secondary)]">
            No tasks planned against this hypothesis yet. Tasks are created on the dashboard&apos;s
            progress panel and linked here.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-erp-table-border">
            {tasks.map((task) => {
              const vLabel = verificationLabel(task.verification_source);
              return (
                <li key={task.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
                  <div className="min-w-[160px] flex-1">
                    <p className="text-sm text-[var(--color-text-primary)]">{task.title}</p>
                    {vLabel && (
                      <p className="mt-0.5 text-[11px] text-[var(--color-text-secondary)]">
                        Verifiable from: <span className="font-medium">{vLabel}</span>
                      </p>
                    )}
                  </div>
                  <Badge variant={PROGRESS_STATUS_BADGE[task.status]} size="sm">
                    {PROGRESS_STATUS_LABEL[task.status]}
                  </Badge>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── Evidence ──────────────────────────────────────────────────────── */}
      <section aria-labelledby="hyp-evidence" className="mt-6">
        <h3 id="hyp-evidence" className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
          Evidence ({evidence.length})
        </h3>
        {evidence.length === 0 ? (
          <p className="mt-2 rounded-md border border-erp-table-border bg-erp-table-header px-3 py-3 text-sm text-[var(--color-text-secondary)]">
            Nothing attached yet. Evidence is what turns a belief into a result — attach it
            directly here, or to any task above.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-erp-table-border">
            {evidence.map((ev) => (
              <li key={ev.id} className="py-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm text-[var(--color-text-primary)]">{ev.title}</p>
                  <span className="text-[11px] text-[var(--color-text-secondary)]">
                    {ev.source === "system" ? "Verified by Ascend" : "Added manually"} ·{" "}
                    {formatProgressDate(ev.created_at)}
                  </span>
                </div>
                {ev.notes && (
                  <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">{ev.notes}</p>
                )}
                {ev.url && (
                  <a
                    href={ev.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-0.5 inline-block rounded text-xs text-erp-link underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
                  >
                    Open link
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}

        {canManage && !decided && (
          <form onSubmit={submitEvidence} className="mt-3 flex flex-wrap items-end gap-2 rounded-md border border-erp-table-border bg-erp-table-header p-3">
            <div className="min-w-[180px] flex-1">
              <Input
                label="Attach evidence"
                value={evidenceTitle}
                onChange={(e) => setEvidenceTitle(e.target.value)}
                placeholder="e.g. 30-day sales export"
                error={evidenceError ?? undefined}
                maxLength={240}
              />
            </div>
            <div className="min-w-[160px] flex-1">
              <Input
                label="Link (optional)"
                type="url"
                value={evidenceUrl}
                onChange={(e) => setEvidenceUrl(e.target.value)}
                placeholder="https://…"
                maxLength={1000}
              />
            </div>
            <Button type="submit" variant="secondary" size="lg" loading={busy}>
              Attach
            </Button>
          </form>
        )}
      </section>

      {/* ── Decisions ─────────────────────────────────────────────────────── */}
      <section aria-labelledby="hyp-decisions" className="mt-6">
        <h3 id="hyp-decisions" className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
          Decision
        </h3>

        {decisions.length > 0 && (
          <ul className="mt-2 divide-y divide-erp-table-border">
            {decisions.map((d) => (
              <li key={d.id} className="py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={d.decision === "validated" ? "green" : "red"} size="sm">
                    {d.decision === "validated" ? "Validated" : "Invalidated"}
                  </Badge>
                  <span className="text-[11px] text-[var(--color-text-secondary)]">
                    {formatProgressDate(d.created_at)}
                  </span>
                </div>
                {d.reason && (
                  <p className="mt-1 text-sm text-[var(--color-text-primary)]">{d.reason}</p>
                )}
                {d.next_action && (
                  <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
                    <span className="font-medium">Next: </span>
                    {d.next_action}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}

        {canManage && !decided && (
          // No onSubmit: "validate" and "invalidate" are opposite outcomes, so
          // Enter must not pick one. Both buttons are explicit.
          <form
            aria-label="Record a decision"
            onSubmit={(e: FormEvent<HTMLFormElement>) => e.preventDefault()}
            className="mt-3 space-y-3 rounded-md border border-erp-table-border p-3"
          >
            <Input
              label="Reason (optional)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="What the evidence actually showed"
              maxLength={2000}
            />
            <Input
              label="Next action (optional)"
              value={nextAction}
              onChange={(e) => setNextAction(e.target.value)}
              placeholder="What you'll do about it"
              maxLength={1000}
            />
            {!hasEvidence && (
              <p className="text-sm text-[var(--color-text-secondary)]">
                Attach at least one piece of evidence before deciding — Ascend records results,
                not opinions.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="primary"
                size="lg"
                loading={busy}
                disabled={!hasEvidence || busy}
                title={hasEvidence ? undefined : "Attach evidence first"}
                onClick={() => submitDecision("validated")}
              >
                Validate
              </Button>
              <Button
                type="button"
                variant="danger"
                size="lg"
                disabled={!hasEvidence || busy}
                title={hasEvidence ? undefined : "Attach evidence first"}
                onClick={() => submitDecision("invalidated")}
              >
                Invalidate
              </Button>
            </div>
          </form>
        )}

        {decided && decisions.length === 0 && (
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            This hypothesis is {PROGRESS_STATUS_LABEL[hypothesis.status].toLowerCase()}.
          </p>
        )}
      </section>
    </Card>
  );
}
