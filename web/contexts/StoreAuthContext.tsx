"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

import { apiFetch } from "@/api-client";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StoreCustomer {
  id: string;
  name: string;
  email: string;
  created_at: number;
}

interface StoreAuthState {
  customer: StoreCustomer | null;
  token: string | null;
  loading: boolean;
  /** True while storefront customer auth has no real backend — the account
   *  surface is a UI preview and login/register are disabled outside mocks. */
  previewMode: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const TOKEN_KEY = "ascend_store_token";

// The /api/v1/ecommerce/auth/* endpoints exist only as MSW mocks — there is no
// backend customer-auth surface yet (see AUDIT_2026-07-18T005030Z §2). Until
// one ships, storefront auth is Preview-only: with mocks off (real backend)
// it is disabled up front instead of failing with a confusing 404 after submit.
// Mirrors MockWorkerInit's ENV_MOCKS switch, plus the runtime demo-mode flag.
function storeAuthPreview(): boolean {
  if (process.env.NEXT_PUBLIC_STORE_AUTH_ENABLED === "1") return false; // real backend shipped
  const envMocks =
    process.env.NEXT_PUBLIC_MOCK === "true" ||
    (process.env.NEXT_PUBLIC_MOCK !== "false" && process.env.NODE_ENV === "development");
  const demoMode =
    typeof window !== "undefined" && window.localStorage.getItem("finder_pos_demo") === "1";
  return !envMocks && !demoMode; // mocks answer these routes → usable; otherwise preview
}

// ── Context ───────────────────────────────────────────────────────────────────

const StoreAuthContext = createContext<StoreAuthState>({
  customer: null, token: null, loading: true, previewMode: true,
  login: async () => {}, register: async () => {}, logout: async () => {},
});

export function useStoreAuth() {
  return useContext(StoreAuthContext);
}

// ── Provider ──────────────────────────────────────────────────────────────────

/**
 * Storefront requests go through the ONE shared API client, like every other
 * caller in the app — this file used to carry a private 8-line `apiFetch` fork
 * instead, which silently diverged from it in three ways:
 *
 *  - it read `NEXT_PUBLIC_API_BASE`, a variable that exists nowhere else in the
 *    repo (env templates, next.config.mjs's `env` allowlist, middleware.ts's CSP
 *    `connect-src`, playwright and the docs all use `NEXT_PUBLIC_API_BASE_URL`),
 *    so Next inlined it as `undefined` and every storefront call went
 *    same-origin regardless of how the backend origin was configured;
 *  - it treated the error envelope's `error` as a string, but the gateway sends
 *    `{ error: { code, message, requestId } }` (src/gateway/errorEnvelope.ts) —
 *    an object, so the `?? "Request failed"` fallback never fired and users saw
 *    `[object Object]` on any failed sign-in;
 *  - it had none of the shared client's 429 `Retry-After` retry, network-error
 *    wrapping, or 204 handling.
 *
 * `anonymous: true` is deliberate: the customer token below is a DIFFERENT
 * credential from the staff session token, so the client must not attach
 * `getAccessToken()` or run the staff 401-refresh/redirect-to-/login path.
 */
function storeFetch<T>(
  method: "GET" | "POST",
  path: string,
  opts: { body?: unknown; token?: string | null } = {},
): Promise<T> {
  const { body, token } = opts;
  return apiFetch<T>(method, path, {
    anonymous: true,
    ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    ...(body !== undefined ? { body } : {}),
  });
}

export function StoreAuthProvider({ children }: { children: React.ReactNode }) {
  const [customer, setCustomer] = useState<StoreCustomer | null>(null);
  const [token, setToken]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(true);
  const [previewMode, setPreviewMode] = useState(true);

  // Restore session on mount
  useEffect(() => {
    setPreviewMode(storeAuthPreview()); // client-side: demo-mode flag is readable here
    const saved = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
    if (!saved) { setLoading(false); return; }
    setToken(saved);
    storeFetch<StoreCustomer>("GET", "/api/v1/ecommerce/auth/me", { token: saved })
      .then((c) => setCustomer(c))
      .catch(() => { localStorage.removeItem(TOKEN_KEY); setToken(null); })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    if (storeAuthPreview()) {
      throw new Error("Store accounts are a preview — customer sign-in isn't available yet.");
    }
    const res = await storeFetch<{ token: string; customer: StoreCustomer }>(
      "POST",
      "/api/v1/ecommerce/auth/login",
      { body: { email, password } },
    );
    localStorage.setItem(TOKEN_KEY, res.token);
    setToken(res.token);
    setCustomer(res.customer);
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    if (storeAuthPreview()) {
      throw new Error("Store accounts are a preview — registration isn't available yet.");
    }
    const res = await storeFetch<{ token: string; customer: StoreCustomer }>(
      "POST",
      "/api/v1/ecommerce/auth/register",
      { body: { name, email, password } },
    );
    localStorage.setItem(TOKEN_KEY, res.token);
    setToken(res.token);
    setCustomer(res.customer);
  }, []);

  const logout = useCallback(async () => {
    if (token) {
      await storeFetch("POST", "/api/v1/ecommerce/auth/logout", { token }).catch(() => {});
    }
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setCustomer(null);
  }, [token]);

  return (
    <StoreAuthContext.Provider value={{ customer, token, loading, previewMode, login, register, logout }}>
      {children}
    </StoreAuthContext.Provider>
  );
}
