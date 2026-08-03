"use client";

/**
 * OfflineBanner — sticky indicator when the browser is offline.
 * INF-8: also shows queued sale count and triggers replay on reconnect.
 */

import { useEffect, useState } from "react";
import { useOffline } from "@/lib/useOffline";
import { pendingCount, drainOutboxMainThread, requestSync } from "@/lib/offlineOutbox";
import { getAccessToken } from "@/lib/auth";

export function OfflineBanner() {
  const { isOffline, reconnectedAt } = useOffline();
  const [queued, setQueued] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ ok: number; failed: number } | null>(null);

  // Refresh queued count whenever offline state changes or after a sync.
  useEffect(() => {
    pendingCount().then(setQueued).catch(() => {});
  }, [isOffline, syncResult]);

  // Also listen for SW messages about replayed/failed items.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const handler = (event: MessageEvent) => {
      if (
        event.data?.type === "OUTBOX_ITEM_REPLAYED" ||
        event.data?.type === "OUTBOX_ITEM_FAILED"
      ) {
        pendingCount().then(setQueued).catch(() => {});
      }
    };
    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, []);

  // When connection is restored, drain the outbox.
  useEffect(() => {
    if (!reconnectedAt || queued === 0) return;
    setSyncing(true);
    setSyncResult(null);

    // First try Background Sync (SW handles it asynchronously).
    requestSync().catch(() => {});

    // Also try draining from main thread for Safari/Firefox compatibility.
    drainOutboxMainThread(getAccessToken)
      .then((result) => {
        setSyncResult({ ok: result.succeeded, failed: result.failed });
        pendingCount().then(setQueued).catch(() => {});
      })
      .catch(() => {})
      .finally(() => setSyncing(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reconnectedAt]);

  // Nothing to show when online and no pending items.
  if (!isOffline && queued === 0 && !syncResult) return null;

  if (!isOffline && syncResult) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-success-500 px-4 py-2 text-sm font-medium text-white"
      >
        <span aria-hidden="true">✓</span>
        {syncResult.ok > 0 && `${syncResult.ok} offline sale${syncResult.ok !== 1 ? "s" : ""} synced. `}
        {syncResult.failed > 0 && `${syncResult.failed} failed — contact support.`}
        {syncResult.ok > 0 && syncResult.failed === 0 && "All clear."}
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-warning-600 px-4 py-2 text-sm font-medium text-white"
    >
      <span aria-hidden="true">⚡</span>
      {isOffline ? (
        <>
          Offline
          {queued > 0 && (
            <span className="ml-1 rounded bg-white/20 px-1.5 py-0.5 text-xs font-semibold">
              {queued} sale{queued !== 1 ? "s" : ""} queued
            </span>
          )}
          — cash sales are queued and will sync when reconnected.
        </>
      ) : syncing ? (
        <>
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
          Syncing {queued} offline sale{queued !== 1 ? "s" : ""}…
        </>
      ) : null}
    </div>
  );
}
