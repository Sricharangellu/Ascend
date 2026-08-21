/**
 * @vitest-environment jsdom
 *
 * StoreAuthContext must go through the ONE shared API client (`@/api-client`),
 * not a private `fetch` fork.
 *
 * Regression guard for the duplicated-helper bug found in the 2026-08-04 AI-slop
 * audit: this context carried its own 8-line `apiFetch` that read the error
 * envelope as `{ error: string }`. The gateway actually sends
 * `{ error: { code, message, requestId } }` (src/shared/http.ts), so
 * the `?? "Request failed"` fallback never fired and `new Error(<object>)`
 * stringified to the literal text "[object Object]" — which is what a customer
 * saw on a failed storefront sign-in. The fork also read `NEXT_PUBLIC_API_BASE`,
 * a variable defined nowhere in the repo (everything else uses
 * `NEXT_PUBLIC_API_BASE_URL`).
 *
 * These assertions fail against that fork and pass against the shared client.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { StoreAuthProvider, useStoreAuth } from "@/contexts/StoreAuthContext";

/** Storefront auth is Preview-gated off unless mocks or demo mode are on. */
function enableStoreAuth() {
  window.localStorage.setItem("finder_pos_demo", "1");
}

function LoginProbe() {
  const { login, loading } = useStoreAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <button
        onClick={() => {
          login("nobody@example.com", "wrong-password").catch((err: unknown) => {
            const el = document.querySelector("[data-testid=message]");
            if (el) el.textContent = err instanceof Error ? err.message : String(err);
          });
        }}
      >
        sign in
      </button>
      <span data-testid="message" />
    </div>
  );
}

describe("StoreAuthContext — shared API client, not a private fetch fork", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("surfaces the error envelope's message, not '[object Object]'", async () => {
    enableStoreAuth();
    server.use(
      http.post("*/api/v1/ecommerce/auth/login", () =>
        HttpResponse.json(
          {
            error: {
              code: "invalid_credentials",
              message: "Invalid email or password.",
              requestId: "req_test",
            },
          },
          { status: 401 },
        ),
      ),
    );

    render(
      <StoreAuthProvider>
        <LoginProbe />
      </StoreAuthProvider>,
    );

    screen.getByRole("button", { name: "sign in" }).click();

    await waitFor(() => {
      expect(screen.getByTestId("message").textContent).toBe("Invalid email or password.");
    });
    // The precise symptom of the old fork.
    expect(screen.getByTestId("message").textContent).not.toBe("[object Object]");
  });

  it("restores a saved session by sending the CUSTOMER token as the bearer", async () => {
    enableStoreAuth();
    window.localStorage.setItem("ascend_store_token", "store-token-123");

    let seenAuth: string | null = null;
    server.use(
      http.get("*/api/v1/ecommerce/auth/me", ({ request }) => {
        seenAuth = request.headers.get("authorization");
        return HttpResponse.json({
          id: "cus_1",
          name: "Ada",
          email: "ada@example.com",
          created_at: 0,
        });
      }),
    );

    function Probe() {
      const { customer, loading } = useStoreAuth();
      return (
        <span data-testid="who">{loading ? "…" : (customer?.name ?? "none")}</span>
      );
    }

    render(
      <StoreAuthProvider>
        <Probe />
      </StoreAuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("who").textContent).toBe("Ada"));
    // The storefront credential, never the staff session token from getAccessToken().
    expect(seenAuth).toBe("Bearer store-token-123");
  });

  it("clears a rejected saved session instead of leaving a stale token", async () => {
    enableStoreAuth();
    window.localStorage.setItem("ascend_store_token", "expired-token");

    server.use(
      http.get("*/api/v1/ecommerce/auth/me", () =>
        HttpResponse.json(
          { error: { code: "unauthenticated", message: "Token expired.", requestId: "r" } },
          { status: 401 },
        ),
      ),
    );

    function Probe() {
      const { customer, loading } = useStoreAuth();
      return <span data-testid="who">{loading ? "…" : (customer?.name ?? "none")}</span>;
    }

    render(
      <StoreAuthProvider>
        <Probe />
      </StoreAuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("who").textContent).toBe("none"));
    expect(window.localStorage.getItem("ascend_store_token")).toBeNull();
  });
});
