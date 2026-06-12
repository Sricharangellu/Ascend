/**
 * Typed fetch wrapper — attaches the bearer token, parses the
 * { error: { code, message, requestId } } envelope, and surfaces typed errors.
 *
 * Usage:
 *   import { apiFetch } from "@/api-client/client";
 *   const data = await apiFetch("POST", "/auth/login", { body: { email, password } });
 */

import type { ApiError } from "./types";
import { getAccessToken } from "@/lib/auth";

// ─── API Error class ──────────────────────────────────────────────────────────

export class ApiResponseError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly requestId: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "ApiResponseError";
  }
}

// ─── Config ───────────────────────────────────────────────────────────────────

// Callers pass ABSOLUTE backend paths (e.g. "/api/identity/login",
// "/api/v1/flags", "/healthz") because the backend splits routes across
// /api/identity/*, /api/v1/* and root — a single version prefix can't serve
// all three. NEXT_PUBLIC_API_BASE_URL sets the backend ORIGIN in production
// (e.g. https://finder-pos-backend.vercel.app); empty = same origin.
// In a browser, same-origin relative URLs work. In Node (tests / SSR) fetch
// requires an absolute URL, so we prefix with http://localhost.
function resolveBase(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
  if (typeof window !== "undefined") return configured;
  // Node / test environment — make it absolute
  if (configured.startsWith("http")) return configured;
  return `http://localhost${configured}`;
}

const API_BASE = resolveBase();

// ─── Core fetch helper ────────────────────────────────────────────────────────

export interface FetchOptions<TBody = unknown> {
  body?: TBody;
  /** Additional headers; Authorization is set automatically. */
  headers?: Record<string, string>;
  /** If true, skip attaching the bearer token (used for login). */
  anonymous?: boolean;
  signal?: AbortSignal;
}

/**
 * Makes an authenticated request to the POS API.
 * Throws `ApiResponseError` for any non-2xx response.
 */
export async function apiFetch<TResponse>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  options: FetchOptions = {}
): Promise<TResponse> {
  const { body, headers = {}, anonymous = false, signal } = options;

  const reqHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...headers,
  };

  if (!anonymous) {
    const token = getAccessToken();
    if (token) {
      reqHeaders["Authorization"] = `Bearer ${token}`;
    }
  }

  // Ensure path starts with /
  const url = `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;

  const response = await fetch(url, {
    method,
    headers: reqHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });

  // 204 No Content — no body to parse
  if (response.status === 204) {
    return undefined as unknown as TResponse;
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new ApiResponseError(
      "PARSE_ERROR",
      `Failed to parse response from ${method} ${path}`,
      "",
      response.status
    );
  }

  // Check for the standard error envelope
  if (!response.ok) {
    const envelope = json as Partial<ApiError>;
    const err = envelope?.error;
    throw new ApiResponseError(
      err?.code ?? "UNKNOWN_ERROR",
      err?.message ?? `HTTP ${response.status}`,
      err?.requestId ?? "",
      response.status
    );
  }

  return json as TResponse;
}

// ─── Convenience shorthands ──────────────────────────────────────────────────

export const apiGet = <T>(path: string, opts?: FetchOptions) =>
  apiFetch<T>("GET", path, opts);

export const apiPost = <T>(
  path: string,
  body?: unknown,
  opts?: FetchOptions
) => apiFetch<T>("POST", path, { ...opts, body });

export const apiPut = <T>(
  path: string,
  body?: unknown,
  opts?: FetchOptions
) => apiFetch<T>("PUT", path, { ...opts, body });

export const apiPatch = <T>(
  path: string,
  body?: unknown,
  opts?: FetchOptions
) => apiFetch<T>("PATCH", path, { ...opts, body });

export const apiDelete = <T>(path: string, opts?: FetchOptions) =>
  apiFetch<T>("DELETE", path, opts);
