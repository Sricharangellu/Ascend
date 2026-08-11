"use client";

/**
 * Scan & Receive — the focused receiving workspace.
 *
 * Before this page existed, receiving a delivery meant: Inventory → Purchasing
 * → find the PO → open it → Receive tab → "Open receive form" → fill a modal →
 * confirm. Six clicks and three surfaces before the first box is counted, with
 * no cost context anywhere and no way to correct a line without reopening the
 * form.
 *
 * The backend for a much better flow has been sitting complete and unused:
 * stateful sessions, barcode scan matching, per-line patching, close/cancel,
 * and a full cost-intelligence read (last purchase cost, previous vendor cost,
 * average, historical range, trend, variance band). This page is the client for
 * it — one screen, sidebar collapsed, scan field always focused, every line
 * editable in place, and the review step folded in rather than bolted on.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { WorkspaceHeader } from "@/components/WorkspaceHeader";
import { Button } from "@/components/Button";
import { Badge, statusBadge, statusLabel } from "@/components/Badge";
import { Skeleton } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { apiGet, apiPost, apiPatch, ApiResponseError } from "@/api-client/client";
import { formatMoney } from "@/lib/money";
import { hasRole } from "@/lib/auth";
import type {
  ReceivingSession,
  ReceiveLineIntelligence,
  ScanResult,
  UpdateReceivingLineRequest,
} from "@/api-client/types";
import { ScanBar } from "./_components/ScanBar";
import { ReceivingLinesTable } from "./_components/ReceivingLinesTable";
import { CostIntelligencePanel } from "./_components/CostIntelligencePanel";
import { ReviewPanel } from "./_components/ReviewPanel";
import { sessionTotals } from "./_components/shared";

const CLOSED_STATUSES = new Set(["completed", "cancelled"]);

export default function ScanReceivePage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = String(params.id);

  const [session, setSession] = useState<ReceivingSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [barcode, setBarcode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState<ScanResult | null>(null);
  const [focusToken, setFocusToken] = useState(0);

  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [intelligence, setIntelligence] = useState<ReceiveLineIntelligence | null>(null);
  const [intelLoading, setIntelLoading] = useState(false);
  const [savingLineId, setSavingLineId] = useState<string | null>(null);
  const [finalising, setFinalising] = useState(false);

  const canManage = hasRole("manager");
  const readOnly = !canManage || (session != null && CLOSED_STATUSES.has(session.status));

  const load = useCallback(async () => {
    setError(null);
    try {
      setSession(await apiGet<ReceivingSession>(`/api/v1/purchasing/receiving/sessions/${sessionId}`));
    } catch (e) {
      setError(
        e instanceof ApiResponseError ? e.message : "Could not load this receiving session.",
      );
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => { void load(); }, [load]);

  const activeLine = useMemo(
    () => session?.lines.find((l) => l.id === activeLineId) ?? null,
    [session, activeLineId],
  );

  // Cost intelligence follows whichever line is in focus. A scan brings its own
  // intelligence back in the response, so this only fetches when the operator
  // picks a row by hand — no duplicate round trip on the hot path.
  const intelFetchedFor = useRef<string | null>(null);
  useEffect(() => {
    const productId = activeLine?.product_id;
    if (!productId) { setIntelligence(null); intelFetchedFor.current = null; return; }
    if (intelFetchedFor.current === productId) return;
    intelFetchedFor.current = productId;
    let cancelled = false;
    setIntelLoading(true);
    void (async () => {
      try {
        const data = await apiGet<ReceiveLineIntelligence>(
          `/api/v1/purchasing/receiving/sessions/${sessionId}/intelligence/${productId}`,
        );
        if (!cancelled) setIntelligence(data);
      } catch {
        // Intelligence is advisory — a receipt is still correct without it.
        if (!cancelled) setIntelligence(null);
      } finally {
        if (!cancelled) setIntelLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeLine?.product_id, sessionId]);

  const submitScan = useCallback(async () => {
    const code = barcode.trim();
    if (!code || scanning || readOnly) return;
    setScanning(true);
    setActionError(null);
    try {
      const result = await apiPost<ScanResult>(
        `/api/v1/purchasing/receiving/sessions/${sessionId}/scan`,
        { barcode: code },
      );
      setSession(result.session);
      setLastScan(result);
      if (result.matched_line_id) {
        setActiveLineId(result.matched_line_id);
        // The scan response already carries this product's intelligence —
        // adopt it and suppress the follow-up fetch.
        const matched = result.session.lines.find((l) => l.id === result.matched_line_id);
        if (result.intelligence !== undefined && matched) {
          intelFetchedFor.current = matched.product_id;
          setIntelligence(result.intelligence ?? null);
          setIntelLoading(false);
        }
      }
      setBarcode("");
    } catch (e) {
      setActionError(
        e instanceof ApiResponseError ? e.message : "That scan could not be recorded.",
      );
    } finally {
      setScanning(false);
      // Straight back to the gun, whatever happened.
      setFocusToken((t) => t + 1);
    }
  }, [barcode, scanning, readOnly, sessionId]);

  const patchLine = useCallback(
    async (lineId: string, patch: UpdateReceivingLineRequest) => {
      if (readOnly) return;
      setSavingLineId(lineId);
      setActionError(null);
      try {
        const updated = await apiPatch<ReceivingSession>(
          `/api/v1/purchasing/receiving/sessions/${sessionId}/lines/${lineId}`,
          patch,
        );
        setSession(updated);
      } catch (e) {
        setActionError(
          e instanceof ApiResponseError ? e.message : "That change could not be saved.",
        );
        // Re-read so the table shows what the server actually holds, not our
        // optimistic guess at it.
        void load();
      } finally {
        setSavingLineId(null);
      }
    },
    [readOnly, sessionId, load],
  );

  const finalise = useCallback(
    async (forceComplete: boolean) => {
      setFinalising(true);
      setActionError(null);
      try {
        await apiPost(`/api/v1/purchasing/receiving/sessions/${sessionId}/close`, { forceComplete });
        router.push(`/purchasing/${session?.po_id ?? ""}`);
      } catch (e) {
        setActionError(
          e instanceof ApiResponseError ? e.message : "The receipt could not be posted.",
        );
        setFinalising(false);
      }
    },
    [sessionId, router, session?.po_id],
  );

  const cancelSession = useCallback(async () => {
    setFinalising(true);
    setActionError(null);
    try {
      await apiPost(`/api/v1/purchasing/receiving/sessions/${sessionId}/cancel`, {});
      router.push("/purchasing/receiving");
    } catch (e) {
      setActionError(
        e instanceof ApiResponseError ? e.message : "The session could not be cancelled.",
      );
      setFinalising(false);
    }
  }, [sessionId, router]);

  const totals = sessionTotals(session);
  const poLabel = session?.po_number != null ? `PO-${session.po_number}` : "Purchase order";

  return (
    <EnterpriseShell
      active="purchasing"
      title={session ? `Receiving ${session.session_number}` : "Receiving"}
      subtitle={session?.supplier_name ?? ""}
      contentClassName="overflow-y-auto"
    >
      {loading && !session && (
        <div className="flex flex-col gap-4 p-6">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {error && !session && (
        <div className="p-6">
          <EmptyState
            title="This receiving session could not be opened"
            description={error}
            action={
              <Button variant="secondary" onClick={() => router.push("/purchasing/receiving")}>
                Back to Receiving
              </Button>
            }
          />
        </div>
      )}

      {session && (
        <>
          <WorkspaceHeader
            breadcrumbs={[
              { label: "Purchasing", href: "/purchasing" },
              { label: "Receiving", href: "/purchasing/receiving" },
              { label: session.session_number },
            ]}
            heading={`${session.session_number} · ${poLabel}`}
            subheading={
              <>
                <span className="font-medium text-[var(--color-text-primary)]">
                  {session.supplier_name ?? "Unknown supplier"}
                </span>
                <Badge variant={statusBadge(session.status)} size="sm">
                  {statusLabel(session.status)}
                </Badge>
                {session.dock_code && (
                  <span className="text-[var(--color-text-muted)]">Dock {session.dock_code}</span>
                )}
                {session.mode !== "standard" && (
                  <Badge variant="purple" size="sm">{statusLabel(session.mode)}</Badge>
                )}
              </>
            }
            facts={[
              { label: "Expected", value: totals.expected, numeric: true },
              { label: "Accepted", value: totals.accepted, numeric: true },
              ...(totals.held > 0 ? [{ label: "Held", value: totals.held, numeric: true }] : []),
              ...(totals.rejected > 0 ? [{ label: "Rejected", value: totals.rejected, numeric: true }] : []),
              { label: "Value", value: formatMoney(totals.acceptedValueCents), numeric: true },
            ]}
            actions={
              <Button
                variant="secondary"
                onClick={() => router.push(`/purchasing/${session.po_id}`)}
              >
                Open purchase order
              </Button>
            }
          >
            <ScanBar
              value={barcode}
              onChange={setBarcode}
              onScan={() => void submitScan()}
              busy={scanning}
              lastScan={lastScan}
              disabled={readOnly}
              focusToken={focusToken}
            />
          </WorkspaceHeader>

          <div className="px-4 py-4 lg:px-6">
            {actionError && (
              <p
                role="alert"
                className="mb-3 rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-[13px] text-danger-700"
              >
                {actionError}
              </p>
            )}

            {readOnly && CLOSED_STATUSES.has(session.status) && (
              <p className="mb-3 rounded-lg border border-info-200 bg-info-50 px-3 py-2 text-[13px] text-info-600">
                This session is {statusLabel(session.status).toLowerCase()} and is now read-only.
                Corrections go through a vendor credit or an inventory adjustment against the
                purchase order.
              </p>
            )}
            {!canManage && !CLOSED_STATUSES.has(session.status) && (
              <p className="mb-3 rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-[13px] text-warning-800">
                You can review this session, but recording receipts needs manager access.
              </p>
            )}

            {/* Split view: the work on the left, the context on the right.
                The panel drops below the table under ~1280px so nothing is
                squeezed into an unreadable column on a laptop. */}
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="flex min-w-0 flex-col gap-4">
                <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-elev-sm">
                  {session.lines.length === 0 ? (
                    <EmptyState
                      title="Nothing on this session yet"
                      description="Scan the first item to start recording what arrived."
                    />
                  ) : (
                    <ReceivingLinesTable
                      lines={session.lines}
                      activeLineId={activeLineId}
                      onSelect={setActiveLineId}
                      onPatch={(lineId, patch) => void patchLine(lineId, patch)}
                      readOnly={readOnly}
                      savingLineId={savingLineId}
                    />
                  )}
                </div>

                {!CLOSED_STATUSES.has(session.status) && session.lines.length > 0 && (
                  <ReviewPanel
                    session={session}
                    onJumpToLine={setActiveLineId}
                    onFinalise={(force) => void finalise(force)}
                    onCancel={() => void cancelSession()}
                    finalising={finalising}
                    canManage={canManage}
                    error={null}
                  />
                )}
              </div>

              <aside className="xl:sticky xl:top-[152px] xl:self-start">
                <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-elev-sm">
                  <CostIntelligencePanel
                    line={activeLine}
                    intelligence={intelligence}
                    loading={intelLoading}
                  />
                </div>
              </aside>
            </div>
          </div>
        </>
      )}
    </EnterpriseShell>
  );
}
