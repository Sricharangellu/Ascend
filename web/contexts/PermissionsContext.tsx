"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { apiGet } from "@/api-client/client";
import { ALL_FEATURES } from "@/lib/features";

// ── Types ─────────────────────────────────────────────────────────────────────

interface MeResponse {
  id: string;
  name: string;
  email: string;
  role: string;
  features: string[];
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
    apiGet<MeResponse>("/api/v1/auth/me")
      .then((r) => {
        setRole(r.role);
        // Owner and admin always get all features regardless of what the server says
        if (r.role === "owner" || r.role === "admin") {
          setFeatures(new Set(ALL_FEATURES));
        } else {
          setFeatures(new Set(r.features));
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
