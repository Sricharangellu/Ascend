"use client";

import { useEffect } from "react";

/**
 * ServiceWorkerInit — registers the SW and wires up outbox sync.
 * INF-8: Also registers the service worker in development so the offline
 * outbox can be tested locally (only the SW registration differs — MSW
 * still runs alongside via a different path).
 */
export function ServiceWorkerInit() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    // Register the shell/outbox SW on all envs so offline mode can be tested locally.
    // The SW only activates for same-origin requests; MSW intercepts mock paths separately.
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        // Attempt an immediate outbox drain whenever the SW activates or updates.
        reg.addEventListener("updatefound", () => {
          reg.active?.postMessage({ type: "DRAIN_OUTBOX" });
        });
      })
      .catch(() => {
        // SW registration failure is non-fatal — app works without it.
      });

    // When the SW reports a replayed item, dispatch a custom event so any
    // open terminal/orders page can refresh its display.
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "OUTBOX_ITEM_REPLAYED") {
        window.dispatchEvent(
          new CustomEvent("outbox:replayed", { detail: { id: event.data.id } }),
        );
      }
      if (event.data?.type === "OUTBOX_ITEM_FAILED") {
        window.dispatchEvent(
          new CustomEvent("outbox:failed", { detail: { id: event.data.id, status: event.data.status } }),
        );
      }
    };

    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, []);

  return null;
}
