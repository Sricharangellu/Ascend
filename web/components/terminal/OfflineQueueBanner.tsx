"use client";

/**
 * OfflineQueueBanner — shows pending queued sales count + triggers reconciliation.
 *
 * Rendered in the terminal header when:
 * 1. The device is currently offline, OR
 * 2. The device just came back online and there are pending items to reconcile.
 */

import { useCallback, useEffect, useState } from "react";
import { clsx } from "clsx";
import { useOffline } from "@/lib/useOffline";
import {
  getQueue,
  dequeue,
  incrementRetry,
  pendingCount,
} from "@/lib/syncOutbox";
import {
  pendingCount as idbPendingCount,
  requestSync,
} from "@/lib/offlineOutbox";
import { apiPost } from "@/api-client/client";
import type { SyncQueueItem } from "@/api-client/types";

export function OfflineQueueBanner() {
  const { isOffline, reconnectedAt } = useOffline();
  // localStorage queue (cart sync orders)
  const [count, setCount] = useState(0);
  // IndexedDB queue (payment captures awaiting SW Background Sync)
  const [idbCount, setIdbCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<"success" | "partial" | null>(null);

  const refreshCounts = useCallback(() => {
    setCount(pendingCount());
    idbPendingCount().then(setIdbCount).catch(() => {});
  }, []);

  // Refresh counts whenever offline state changes or component mounts
  useEffect(() => { refreshCounts(); }, [isOffline, reconnectedAt, refreshCounts]);

  // Listen for SW messages: OUTBOX_ITEM_REPLAYED / OUTBOX_ITEM_FAILED
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const handler = (event: MessageEvent) => {
      if (
        event.data?.type === "OUTBOX_ITEM_REPLAYED" ||
        event.data?.type === "OUTBOX_ITEM_FAILED"
      ) {
        refreshCounts();
      }
    };
    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, [refreshCounts]);

  // Auto-reconcile localStorage queue + trigger SW IDB drain when back online
  useEffect(() => {
    if (!isOffline && reconnectedAt !== null) {
      if (count > 0) void reconcile();
      // Ask SW to drain the IDB payment-capture queue
      void requestSync();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reconnectedAt]);

  const totalCount = count + idbCount;

  const reconcile = useCallback(async () => {
    const queue = getQueue();
    if (queue.length === 0) return;

    setSyncing(true);
    setLastSyncResult(null);
    let failed = 0;

    for (const item of queue) {
      try {
        await replayItem(item);
        dequeue(item.id);
      } catch {
        incrementRetry(item.id);
        failed++;
      }
    }

    setSyncing(false);
    refreshCounts();
    setLastSyncResult(failed === 0 ? "success" : "partial");
  }, []);

  if (!isOffline && totalCount === 0 && lastSyncResult === null) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={clsx(
        "flex items-center justify-between px-4 py-2 text-sm",
        isOffline
          ? "bg-warning-600 text-white"
          : lastSyncResult === "success"
          ? "bg-success-600 text-white"
          : "bg-brand-600 text-white"
      )}
    >
      <div className="flex items-center gap-2">
        {isOffline ? (
          <>
            <WifiOffIcon />
            <span className="font-medium">
              Offline{totalCount > 0 ? ` — ${totalCount} item${totalCount !== 1 ? "s" : ""} queued` : " — sales will be queued"}
            </span>
          </>
        ) : lastSyncResult === "success" && totalCount === 0 ? (
          <>
            <CheckIcon />
            <span className="font-medium">All queued sales synced</span>
          </>
        ) : (
          <>
            <SyncIcon spinning={syncing} />
            <span className="font-medium">
              {syncing
                ? `Syncing ${count} order${count !== 1 ? "s" : ""}…`
                : `${totalCount} item${totalCount !== 1 ? "s" : ""} pending sync${idbCount > 0 ? ` (${idbCount} payment${idbCount !== 1 ? "s" : ""} via background sync)` : ""}`}
            </span>
          </>
        )}
      </div>

      {!isOffline && !syncing && totalCount > 0 && (
        <button
          type="button"
          onClick={() => void reconcile()}
          className={clsx(
            "text-xs font-semibold underline underline-offset-2",
            "focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none rounded",
            "min-h-[44px] px-2"
          )}
        >
          Sync now
        </button>
      )}
    </div>
  );
}

// ─── Replay logic ─────────────────────────────────────────────────────────────

async function replayItem(item: SyncQueueItem): Promise<void> {
  switch (item.type) {
    case "create_order":
      await apiPost("/api/v1/orders", item.payload);
      break;
    case "capture_payment":
      await apiPost("/api/v1/payments", item.payload);
      break;
    default:
      throw new Error(`Unknown outbox type: ${item.type as string}`);
  }
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function WifiOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
      <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
      <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
      <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <circle cx="12" cy="20" r="1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function SyncIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={spinning ? "animate-spin" : undefined}
    >
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
      <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" />
    </svg>
  );
}
