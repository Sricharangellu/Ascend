"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { apiGet } from "@/api-client/client";

export type AccountMode = "RETAIL" | "WHOLESALE" | "ENTERPRISE";

export type FeatureFlags = {
  bulkOrdering: boolean;
  approvalWorkflow: boolean;
  contractPricing: boolean;
  teamManagement: boolean;
  purchaseOrders: boolean;
};

const MODE_FEATURES: Record<AccountMode, FeatureFlags> = {
  RETAIL: {
    bulkOrdering: false,
    approvalWorkflow: false,
    contractPricing: false,
    teamManagement: false,
    purchaseOrders: false,
  },
  WHOLESALE: {
    bulkOrdering: true,
    approvalWorkflow: false,
    contractPricing: false,
    teamManagement: false,
    purchaseOrders: true,
  },
  ENTERPRISE: {
    bulkOrdering: true,
    approvalWorkflow: true,
    contractPricing: true,
    teamManagement: true,
    purchaseOrders: true,
  },
};

interface AccountModeContextValue {
  mode: AccountMode;
  features: FeatureFlags;
  editionFlags: Record<string, boolean>;
  isRetail: boolean;
  isWholesale: boolean;
  isEnterprise: boolean;
  canAccess: (feature: keyof FeatureFlags) => boolean;
}

const DEFAULT_EDITION_FLAGS = { groupRetailPOS: true, groupWholesale: true, groupEnterprise: true };

const AccountModeContext = createContext<AccountModeContextValue>({
  mode: "ENTERPRISE",
  features: MODE_FEATURES.ENTERPRISE,
  editionFlags: DEFAULT_EDITION_FLAGS,
  isRetail: false,
  isWholesale: false,
  isEnterprise: true,
  canAccess: () => true,
});

export function AccountModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<AccountMode>("ENTERPRISE");
  const [editionFlags, setEditionFlags] = useState<Record<string, boolean>>(DEFAULT_EDITION_FLAGS);

  useEffect(() => {
    apiGet<Record<string, boolean | string>>("/api/v1/settings/feature-flags")
      .then((resp) => {
        const m = resp["accountMode"];
        if (m === "RETAIL" || m === "WHOLESALE" || m === "ENTERPRISE") setMode(m);
        const { accountMode: _, ...flags } = resp;
        setEditionFlags((prev) => ({ ...prev, ...(flags as Record<string, boolean>) }));
      })
      .catch(() => { /* keep defaults */ });
  }, []);

  const features = MODE_FEATURES[mode];
  const value: AccountModeContextValue = {
    mode,
    features,
    editionFlags,
    isRetail: mode === "RETAIL",
    isWholesale: mode === "WHOLESALE",
    isEnterprise: mode === "ENTERPRISE",
    canAccess: (feature) => features[feature],
  };

  return <AccountModeContext.Provider value={value}>{children}</AccountModeContext.Provider>;
}

export function useAccountMode() {
  return useContext(AccountModeContext);
}
