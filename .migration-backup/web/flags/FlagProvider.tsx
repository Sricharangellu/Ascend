"use client";

/**
 * Feature-flag provider.
 *
 * Fetches /api/v1/flags on mount (and re-fetches every 60 s).
 * Unknown flags default to FALSE — new code is hidden until the flag is
 * enabled in the backend, satisfying "ship behind a flag".
 *
 * The provider is inert when not authenticated; flags re-fetch after login.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { apiGet } from "@/api-client/client";
import type { FlagsResponse } from "@/api-client/types";
import { isAuthenticated } from "@/lib/auth";

// ─── Context ──────────────────────────────────────────────────────────────────

interface FlagContextValue {
  flags: Record<string, boolean>;
  /** Returns the flag value, defaulting to `false` for unknown flags */
  getFlag: (key: string) => boolean;
  /** Force a re-fetch (e.g. after login) */
  refresh: () => void;
}

const FlagContext = createContext<FlagContextValue>({
  flags: {},
  getFlag: () => false,
  refresh: () => undefined,
});

export function useFlags(): FlagContextValue {
  return useContext(FlagContext);
}

// ─── Provider ────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 60_000;

export function FlagProvider({ children }: { children: React.ReactNode }) {
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchFlags = useCallback(async () => {
    if (!isAuthenticated()) return;
    try {
      const data = await apiGet<FlagsResponse>("/api/v1/flags");
      setFlags(data.flags ?? {});
    } catch {
      // Silent — keep existing flags; don't crash the app
    }
  }, []);

  const refresh = useCallback(() => {
    void fetchFlags();
  }, [fetchFlags]);

  useEffect(() => {
    void fetchFlags();
    intervalRef.current = setInterval(fetchFlags, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchFlags]);

  const getFlag = useCallback(
    (key: string): boolean => flags[key] ?? false,
    [flags]
  );

  return (
    <FlagContext.Provider value={{ flags, getFlag, refresh }}>
      {children}
    </FlagContext.Provider>
  );
}
