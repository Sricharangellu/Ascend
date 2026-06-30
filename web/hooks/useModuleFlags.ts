"use client";

/**
 * useModuleFlags — reads module feature flags from the settings API.
 *
 * Returns a Set<string> of enabled module keys. All core modules are always
 * included. Returns all modules (open) when flags haven't loaded yet so
 * the nav doesn't flicker to empty state on first render.
 *
 * The hook caches flags in sessionStorage (5-minute TTL) so nav renders
 * instantly on subsequent page loads without blocking on a network request.
 */

import { useEffect, useState } from "react";
import { apiGet, safeLoad } from "@/api-client/client";

const CACHE_KEY  = "finder_module_flags";
const CACHE_TTL  = 5 * 60 * 1000; // 5 min

// Core modules always visible — no flag check needed.
const ALWAYS_ON = new Set([
  "dashboard", "catalog", "inventory", "customers", "payments",
  "reports", "settings", "team", "notifications",
]);

// Accept both legacy bare module keys from the mock API and the
// namespaced `module:*` shape used by the shell.
const MODULE_FLAG_KEYS = new Set([
  "pos_terminal",
  "discounts",
  "loyalty",
  "gift_cards",
  "ecommerce",
  "quotes",
  "sales_orders",
  "purchasing",
  "accounting",
  "billing",
  "tables",
  "appointments",
  "healthcare",
  "automotive",
  "room_billing",
  "production_orders",
  "rental_contracts",
  "tickets",
  "student_accounts",
  "workforce",
  "wms",
  "shipping_mgmt",
  "webhooks",
]);

interface FlagCache {
  flags: Record<string, boolean>;
  at: number;
}

function readCache(): Record<string, boolean> | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cache = JSON.parse(raw) as FlagCache;
    if (Date.now() - cache.at > CACHE_TTL) return null;
    return cache.flags;
  } catch {
    return null;
  }
}

function writeCache(flags: Record<string, boolean>): void {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ flags, at: Date.now() }));
  } catch { /* quota — ignore */ }
}

export function useModuleFlags(): {
  enabled: Set<string>;
  loading: boolean;
  businessType: string;
} {
  const [flags, setFlags]   = useState<Record<string, boolean> | null>(() => readCache());
  const [loading, setLoading] = useState(!readCache());
  const [businessType, setBusinessType] = useState("retail");

  useEffect(() => {
    const cached = readCache();
    if (cached) { setFlags(cached); setLoading(false); return; }

    setLoading(true);
    safeLoad(
      apiGet<Record<string, boolean>>("/api/v1/settings/feature-flags")
        .then((data) => {
          setFlags(data);
          writeCache(data);
        })
        .finally(() => setLoading(false)),
    );

    // Fetch business type separately
    safeLoad(
      apiGet<{ businessType?: string; bundles: unknown; modules: unknown }>("/api/v1/settings/business-profile")
        .then((d) => { if (d.businessType) setBusinessType(d.businessType); }),
    );
  }, []);

  const enabled = new Set<string>(ALWAYS_ON);

  if (flags) {
    for (const [key, value] of Object.entries(flags)) {
      if (!value) continue;
      if (key.startsWith("module:")) {
        enabled.add(key.slice(7)); // strip "module:" prefix
      } else if (MODULE_FLAG_KEYS.has(key)) {
        enabled.add(key);
      }
    }
  } else {
    // Not loaded yet — show everything to avoid blank nav.
    enabled.add("*");
  }

  return { enabled, loading, businessType };
}

/** Invalidate the module flags cache (call after saving business profile). */
export function invalidateModuleFlagsCache(): void {
  try { sessionStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
}
