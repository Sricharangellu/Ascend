"use client";

/**
 * useOffline — subscribes to browser online/offline events.
 *
 * Returns `true` when the browser believes it is offline.
 * The POS uses this to show an offline indicator and switch
 * checkout into queued mode.
 */

import { useEffect, useState, useCallback } from "react";

export interface OfflineState {
  isOffline: boolean;
  /** Milliseconds since the last offline → online transition (or null) */
  reconnectedAt: number | null;
}

export function useOffline(): OfflineState {
  const [state, setState] = useState<OfflineState>(() => ({
    // SSR-safe: assume online on the server
    isOffline:
      typeof window !== "undefined" ? !window.navigator.onLine : false,
    reconnectedAt: null,
  }));

  const handleOffline = useCallback(() => {
    setState((prev) => ({ ...prev, isOffline: true }));
  }, []);

  const handleOnline = useCallback(() => {
    setState({ isOffline: false, reconnectedAt: Date.now() });
  }, []);

  useEffect(() => {
    // Sync with current browser state in case it changed during SSR hydration
    setState((prev) => ({
      ...prev,
      isOffline: !window.navigator.onLine,
    }));

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [handleOffline, handleOnline]);

  return state;
}
