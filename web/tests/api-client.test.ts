/**
 * Integration test for the API client against MSW mocks.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { apiPost, ApiResponseError } from "@/api-client/client";
import type { LoginResponse } from "@/api-client/types";
import { clearSession } from "@/lib/auth";

beforeEach(() => {
  clearSession();
});

describe("apiFetch — login flow", () => {
  it("returns a session on valid credentials", async () => {
    const data = await apiPost<LoginResponse>(
      "/auth/login",
      { email: "test@example.com", password: "anypassword" },
      { anonymous: true }
    );
    expect(data.accessToken).toBeTruthy();
    expect(data.expiresIn).toBeGreaterThan(0);
    expect(data.user.email).toBe("test@example.com");
    expect(data.refreshToken).toBeTruthy();
  });

  it("throws ApiResponseError on wrong credentials", async () => {
    await expect(
      apiPost(
        "/auth/login",
        { email: "test@example.com", password: "wrong" },
        { anonymous: true }
      )
    ).rejects.toBeInstanceOf(ApiResponseError);
  });

  it("ApiResponseError carries code and requestId", async () => {
    try {
      await apiPost(
        "/auth/login",
        { email: "test@example.com", password: "wrong" },
        { anonymous: true }
      );
    } catch (err) {
      expect(err).toBeInstanceOf(ApiResponseError);
      const apiErr = err as ApiResponseError;
      expect(apiErr.code).toBe("INVALID_CREDENTIALS");
      expect(apiErr.status).toBe(401);
      expect(apiErr.requestId).toBeTruthy();
    }
  });
});

describe("apiFetch — health endpoints", () => {
  it("GET /healthz returns ok", async () => {
    const { apiGet } = await import("@/api-client/client");
    const data = await apiGet<{ status: string }>("/healthz");
    expect(data.status).toBe("ok");
  });

  it("GET /flags returns a flags map", async () => {
    const { apiGet } = await import("@/api-client/client");
    const { setSession } = await import("@/lib/auth");
    // Need a valid session so the client adds the auth header
    setSession("test-token", 900, "ref", {
      id: "u1",
      email: "e@e.com",
      name: "T",
      role: "cashier",
      tenantId: "t1",
    });
    const data = await apiGet<{ flags: Record<string, boolean> }>("/flags");
    expect(typeof data.flags).toBe("object");
  });
});
