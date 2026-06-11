"use client";

/**
 * OfflineBanner — visible indicator when the browser is offline.
 *
 * Renders a sticky banner at the top of the screen.
 * Accessible: role="status" + aria-live="polite" so screen readers announce changes.
 */

import { useOffline } from "@/lib/useOffline";

export function OfflineBanner() {
  const { isOffline } = useOffline();

  if (!isOffline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sticky top-0 z-40 flex items-center justify-center gap-2
                 bg-warning-600 px-4 py-2 text-sm font-medium text-white"
    >
      <span aria-hidden="true">⚡</span>
      You are offline — sales will be queued and synced when reconnected.
    </div>
  );
}
