"use client";

/**
 * ProgressLoop — container for the progress-intelligence surface. Fetches the
 * hypothesis list and the selected hypothesis's full loop from the real
 * `/api/v1/progress` API, and wires the two mutations this page owns
 * (attach evidence, record decision).
 *
 * Split from the presentational components on purpose: `HypothesisList` and
 * `HypothesisDetail` take data + callbacks, so they are unit-testable without a
 * network, a router, or a toast provider.
 */

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost, ApiResponseError } from "@/api-client/client";
import { useToast } from "@/components/Toast";
import { hasRole } from "@/lib/auth";
import type {
  AttachEvidenceInput,
  CreateHypothesisInput,
  ProgressHypothesesResponse,
  ProgressHypothesis,
  ProgressHypothesisDetail,
  RecordDecisionInput,
} from "@/api-client/types";
import { HypothesisList } from "./HypothesisList";
import { HypothesisDetail } from "./HypothesisDetail";

function message(e: unknown, fallback: string): string {
  return e instanceof ApiResponseError ? e.message : fallback;
}

export default function ProgressLoop() {
  const [hypotheses, setHypotheses] = useState<ProgressHypothesis[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProgressHypothesisDetail | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { addToast } = useToast();
  const canManage = hasRole("manager");

  const loadList = useCallback(async (): Promise<ProgressHypothesis[]> => {
    setListLoading(true);
    setError(null);
    try {
      const res = await apiGet<ProgressHypothesesResponse>("/api/v1/progress/hypotheses");
      setHypotheses(res.items);
      return res.items;
    } catch (e) {
      setError(message(e, "Failed to load hypotheses."));
      return [];
    } finally {
      setListLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setError(null);
    try {
      setDetail(await apiGet<ProgressHypothesisDetail>(`/api/v1/progress/hypotheses/${id}`));
    } catch (e) {
      setDetail(null);
      setError(message(e, "Failed to load this hypothesis."));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // Initial load — auto-select the newest hypothesis so the page opens on
  // something useful rather than an empty right pane.
  useEffect(() => {
    void loadList().then((items) => {
      const first = items[0];
      if (first) setSelectedId(first.id);
    });
  }, [loadList]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  /** Run a mutation, then refresh whatever it could have changed. */
  const mutate = useCallback(
    async (op: () => Promise<unknown>, success: string, fallback: string) => {
      setBusy(true);
      setError(null);
      try {
        await op();
        addToast({ title: success, variant: "success" });
        await loadList();
        if (selectedId) await loadDetail(selectedId);
      } catch (e) {
        const msg = message(e, fallback);
        setError(msg);
        addToast({ title: fallback, description: msg, variant: "error" });
      } finally {
        setBusy(false);
      }
    },
    [addToast, loadList, loadDetail, selectedId],
  );

  const onCreate = useCallback(
    async (input: CreateHypothesisInput) => {
      setBusy(true);
      setError(null);
      try {
        const created = await apiPost<ProgressHypothesis>("/api/v1/progress/hypotheses", input);
        addToast({ title: "Hypothesis added", variant: "success" });
        await loadList();
        setSelectedId(created.id);
      } catch (e) {
        const msg = message(e, "Could not add the hypothesis.");
        setError(msg);
        addToast({ title: "Could not add the hypothesis.", description: msg, variant: "error" });
      } finally {
        setBusy(false);
      }
    },
    [addToast, loadList],
  );

  const onAttachEvidence = useCallback(
    (hypothesisId: string, input: AttachEvidenceInput) =>
      mutate(
        () => apiPost("/api/v1/progress/evidence", { ...input, hypothesisId }),
        "Evidence attached",
        "Could not attach the evidence.",
      ),
    [mutate],
  );

  const onRecordDecision = useCallback(
    (hypothesisId: string, input: RecordDecisionInput) =>
      mutate(
        () => apiPost(`/api/v1/progress/hypotheses/${hypothesisId}/decisions`, input),
        input.decision === "validated" ? "Hypothesis validated" : "Hypothesis invalidated",
        "Could not record the decision.",
      ),
    [mutate],
  );

  return (
    <div className="space-y-4">
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-danger-100 bg-danger-50 px-3 py-2 text-sm text-danger-700"
        >
          {error}
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(280px,1fr)_minmax(0,1.6fr)]">
        <HypothesisList
          hypotheses={hypotheses}
          selectedId={selectedId}
          canManage={canManage}
          loading={listLoading}
          busy={busy}
          onSelect={setSelectedId}
          onCreate={onCreate}
        />
        <HypothesisDetail
          detail={detail}
          canManage={canManage}
          loading={detailLoading}
          busy={busy}
          onAttachEvidence={onAttachEvidence}
          onRecordDecision={onRecordDecision}
        />
      </div>
    </div>
  );
}
