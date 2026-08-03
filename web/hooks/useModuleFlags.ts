"use client";

/**
 * useModuleFlags — enabled module keys for the current tenant.
 *
 * Backed by CapabilitiesContext (GET /api/v1/capabilities), which resolves
 * core modules + business-pack defaults + manual flag overrides server-side.
 * The previous implementation read raw /settings/feature-flags, which misses
 * pack DEFAULTS — a fresh real-backend tenant has no module flags stored, so
 * the nav collapsed to core-only. Capabilities is the single authority.
 *
 * Signature preserved for existing consumers (shell, setup, onboarding,
 * dashboard widgets). Returns the sentinel "*" member while loading or when
 * capabilities are unavailable, meaning "treat everything as enabled".
 */

import { useMemo } from "react";
import { useCapabilities } from "@/contexts/CapabilitiesContext";

export function useModuleFlags(): {
  enabled: Set<string>;
  loading: boolean;
  businessType: string;
} {
  const { capabilities, loading } = useCapabilities();

  const enabled = useMemo(() => {
    if (!capabilities) {
      // Not loaded (or fetch failed) — fail open so the nav never blanks.
      return new Set<string>(["*"]);
    }
    return new Set<string>(
      capabilities.modules.filter((m) => m.enabled).map((m) => m.key),
    );
  }, [capabilities]);

  return {
    enabled,
    loading,
    businessType: capabilities?.business.type ?? "retail",
  };
}

/** Invalidate cached capabilities (call after saving the business profile). */
export { invalidateCapabilitiesCache as invalidateModuleFlagsCache } from "@/contexts/CapabilitiesContext";
