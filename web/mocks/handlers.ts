/**
 * MSW request handlers — mock every known API path.
 *
 * These handlers are the offline stand-in for the backend.
 * They mirror the contract in contracts/openapi.yaml and the types in
 * api-client/types.ts.
 *
 * Toggle individual endpoints from mock → live by removing them from this
 * file once the backend ships the real route.
 */

import { http, HttpResponse, delay } from "msw";
import type {
  LoginResponse,
  RefreshResponse,
  HealthzResponse,
  ReadyzResponse,
  FlagsResponse,
  UserProfile,
} from "@/api-client/types";

// Match both relative (browser) and absolute (Node/test) URL forms
const BASE = "*/api/v1";

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_USER: UserProfile = {
  id: "usr_01hx0000000000000000000001",
  email: "cashier@finder-pos.dev",
  name: "Demo Cashier",
  role: "cashier",
  tenantId: "ten_01hx0000000000000000000001",
};

// In-memory "refresh token store" for the mock
const VALID_REFRESH_TOKEN = "mock-refresh-token-dev";

// ─── Simulated latency ────────────────────────────────────────────────────────
const LAT = { min: 80, max: 200 } as const;
const latency = () =>
  delay(Math.floor(Math.random() * (LAT.max - LAT.min) + LAT.min));

// ─── Handlers ────────────────────────────────────────────────────────────────

export const handlers = [
  // ── POST /api/v1/auth/login ─────────────────────────────────────────────
  http.post(`${BASE}/auth/login`, async ({ request }) => {
    await latency();
    const body = (await request.json()) as { email?: string; password?: string };

    // Accept any non-empty credentials in dev
    if (!body.email || !body.password) {
      return HttpResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "email and password are required",
            requestId: mockRequestId(),
          },
        },
        { status: 400 }
      );
    }

    // Simulate wrong-password path if password === "wrong"
    if (body.password === "wrong") {
      return HttpResponse.json(
        {
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Invalid email or password",
            requestId: mockRequestId(),
          },
        },
        { status: 401 }
      );
    }

    const response: LoginResponse = {
      accessToken: `mock-access-token.${Date.now()}`,
      expiresIn: 900, // 15 min
      refreshToken: VALID_REFRESH_TOKEN,
      user: {
        ...MOCK_USER,
        email: body.email,
      },
    };

    return HttpResponse.json(response, { status: 200 });
  }),

  // ── POST /api/v1/auth/refresh ────────────────────────────────────────────
  http.post(`${BASE}/auth/refresh`, async ({ request }) => {
    await latency();
    const body = (await request.json()) as { refreshToken?: string };

    if (body.refreshToken !== VALID_REFRESH_TOKEN) {
      return HttpResponse.json(
        {
          error: {
            code: "INVALID_REFRESH_TOKEN",
            message: "Refresh token is invalid or expired",
            requestId: mockRequestId(),
          },
        },
        { status: 401 }
      );
    }

    const response: RefreshResponse = {
      accessToken: `mock-access-token.${Date.now()}`,
      expiresIn: 900,
    };

    return HttpResponse.json(response, { status: 200 });
  }),

  // ── POST /api/v1/auth/logout ─────────────────────────────────────────────
  http.post(`${BASE}/auth/logout`, async () => {
    await latency();
    return new HttpResponse(null, { status: 204 });
  }),

  // ── GET /api/v1/healthz ──────────────────────────────────────────────────
  http.get(`${BASE}/healthz`, async () => {
    const response: HealthzResponse = { status: "ok", ts: Date.now() };
    return HttpResponse.json(response, { status: 200 });
  }),

  // ── GET /api/v1/readyz ───────────────────────────────────────────────────
  http.get(`${BASE}/readyz`, async () => {
    const response: ReadyzResponse = {
      status: "ready",
      checks: { db: "ok", cache: "ok" },
    };
    return HttpResponse.json(response, { status: 200 });
  }),

  // ── GET /api/v1/flags ────────────────────────────────────────────────────
  http.get(`${BASE}/flags`, async () => {
    await latency();
    const response: FlagsResponse = {
      flags: {
        // Wave 1 features — all off in dev until explicitly toggled
        product_grid: false,
        cart: false,
        tender_screen: false,
        offline_checkout: false,
        // Wave 2
        reporting_dashboard: false,
        multi_store_switcher: false,
      },
    };
    return HttpResponse.json(response, { status: 200 });
  }),
];

// ─── Helper ───────────────────────────────────────────────────────────────────

function mockRequestId(): string {
  return `mock-${Math.random().toString(36).slice(2, 10)}`;
}
