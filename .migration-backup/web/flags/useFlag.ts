"use client";

/**
 * useFlag(key) — returns a single feature flag value (default false).
 *
 * Example:
 *   const showReports = useFlag("reporting_dashboard");
 *   if (!showReports) return null;
 */

import { useFlags } from "./FlagProvider";

export function useFlag(key: string): boolean {
  const { getFlag } = useFlags();
  return getFlag(key);
}
