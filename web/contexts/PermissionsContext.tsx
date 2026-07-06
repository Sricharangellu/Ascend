"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { apiGet } from "@/api-client/client";
import { ALL_FEATURES } from "@/lib/features";

// ── Types ─────────────────────────────────────────────────────────────────────

// Real GET /api/identity/me returns { userId, tenantId, role }. The mock adds
// name/email/features. Only role is guaranteed; the rest are optional so the
// same handler works against both.
interface MeResponse {
  userId?: string;
  tenantId?: string;
  id?: string;
  name?: string;
  email?: string;
  role: string;
  features?: string[];
}

interface PermissionsState {
  role: string;
  features: Set<string>;
  loading: boolean;
  hasFeature: (id: string) => boolean;
}

// ── Context ───────────────────────────────────────────────────────────────────

const PermissionsContext = createContext<PermissionsState>({
  role: "owner",
  features: new Set(ALL_FEATURES),
  loading: false,
  hasFeature: () => true,
});

// ── Provider ──────────────────────────────────────────────────────────────────

export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<string>("owner");
  const [features, setFeatures] = useState<Set<string>>(new Set(ALL_FEATURES));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Real backend serves the caller's identity at /api/identity/me (not the
    // legacy /api/v1/auth/me, which 404s → the old catch kept role="owner" for
    // EVERY user, a privilege bug). Owner/admin/manager get all features
    // (matches backend allAccess); custom roles use their granted feature list;
    // absent a feature list we fail open (the real /me exposes only role — the
    // capabilities module gate is the tenant-level authority for nav).
    apiGet<MeResponse>("/api/identity/me")
      .then((r) => {
        setRole(r.role);
        if (r.role === "owner" || r.role === "admin" || r.role === "manager") {
          setFeatures(new Set(ALL_FEATURES));
        } else if (r.features && r.features.length > 0) {
          setFeatures(new Set(r.features));
        } else {
          setFeatures(new Set(ALL_FEATURES)); // no per-user feature list → fail open
        }
      })
      .catch(() => {
        // Fail open — full access on network error so the app stays usable
        setFeatures(new Set(ALL_FEATURES));
      })
      .finally(() => setLoading(false));
  }, []);

  const hasFeature = useCallback(
    (id: string) => {
      if (loading) return true; // show everything during initial load
      if (role === "owner" || role === "admin") return true;
      return features.has(id);
    },
    [loading, role, features],
  );

  return (
    <PermissionsContext.Provider value={{ role, features, loading, hasFeature }}>
      {children}
    </PermissionsContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function usePermissions(): PermissionsState {
  return useContext(PermissionsContext);
}
