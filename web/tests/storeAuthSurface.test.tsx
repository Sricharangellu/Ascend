/**
 * @vitest-environment jsdom
 *
 * StoreAuthContext surfaces that the H-2 fix left uncovered.
 *
 * `storeAuthErrorEnvelope.test.tsx` guards the bug that was found (the error
 * envelope). This file guards the parts of the same context that the audit
 * flagged as untested — most importantly the `anonymous: true` flag, which the
 * code comments call "deliberate and load-bearing" while nothing asserted it.
 *
 * The customer token is a DIFFERENT credential from the staff session token.
 * Dropping `anonymous: true` would (a) attach the staff bearer to storefront
 * requests and (b) put storefront 401s on the staff refresh-then-redirect-to-
 * /login path — logging a shopper out of the back office. Neither shows up as
 * a type error and neither breaks the success path, so only a test catches it.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { StoreAuthProvider, useStoreAuth } from "@/contexts/StoreAuthContext";
import { setSession, clearSession, getAccessToken } from "@/lib/auth";

const TOKEN_KEY = "ascend_store_token";
const STAFF_TOKEN = "staff-access-token-must-not-leak";

/** Storefront auth is Preview-gated off unless mocks or demo mode are on. */
function enableStoreAuth() {
  window.localStorage.setItem("finder_pos_demo", "1");
}

function signInStaff() {
  setSession(STAFF_TOKEN, 3600, "staff-refresh", {
    id: "usr_staff",
    email: "staff@example.com",
    name: "Staff",
    role: "owner",
    tenantId: "tnt_demo",
  });
}

/** Drives one context action and records the resulting error, if any. */
function Probe({ run }: { run: (auth: ReturnType<typeof useStoreAuth>) => Promise<unknown> }) {
  const auth = useStoreAuth();
  return (
    <div>
      <span data-testid="who">{auth.loading ? "…" : (auth.customer?.name ?? "none")}</span>
      <span data-testid="error" />
      <button
        onClick={() => {
          void Promise.resolve(run(auth)).catch((err: unknown) => {
            const el = document.querySelector("[data-testid=error]");
            if (el) el.textContent = err instanceof Error ? err.message : String(err);
          });
        }}
      >
        go
      </button>
    </div>
  );
}

function renderProbe(run: (auth: ReturnType<typeof useStoreAuth>) => Promise<unknown>) {
  render(
    <StoreAuthProvider>
      <Probe run={run} />
    </StoreAuthProvider>,
  );
  return () => screen.getByRole("button", { name: "go" }).click();
}

describe("StoreAuthContext — the customer credential is not the staff credential", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    clearSession();
  });
  afterEach(() => {
    clearSession();
  });

  it("never attaches the staff bearer token to a storefront request", async () => {
    enableStoreAuth();
    signInStaff();
    expect(getAccessToken()).toBe(STAFF_TOKEN); // precondition: staff IS signed in

    let seenAuth: string | null = "unset";
    server.use(
      http.post("*/api/v1/ecommerce/auth/login", async ({ request }) => {
        seenAuth = request.headers.get("authorization");
        return HttpResponse.json({
          token: "store-token-abc",
          customer: { id: "cus_1", name: "Ada", email: "ada@example.com", created_at: 0 },
        });
      }),
    );

    const click = renderProbe((auth) => auth.login("ada@example.com", "pw"));
    await waitFor(() => expect(screen.getByTestId("who").textContent).toBe("none"));
    click();

    await waitFor(() => expect(screen.getByTestId("who").textContent).toBe("Ada"));
    // Sign-in carries no bearer at all, and above all not the staff one.
    expect(seenAuth).not.toBe(`Bearer ${STAFF_TOKEN}`);
    expect(seenAuth).toBeNull();
  });

  it("leaves the staff session intact when a storefront request 401s", async () => {
    enableStoreAuth();
    signInStaff();

    server.use(
      http.post("*/api/v1/ecommerce/auth/login", () =>
        HttpResponse.json(
          { error: { code: "invalid_credentials", message: "Nope.", requestId: "r" } },
          { status: 401 },
        ),
      ),
    );

    const click = renderProbe((auth) => auth.login("ada@example.com", "wrong"));
    await waitFor(() => expect(screen.getByTestId("who").textContent).toBe("none"));
    click();

    await waitFor(() => expect(screen.getByTestId("error").textContent).toBe("Nope."));
    // A shopper's bad password must not run the staff refresh-then-clearSession
    // path: the back-office session survives untouched.
    expect(getAccessToken()).toBe(STAFF_TOKEN);
    expect(window.location.pathname).not.toBe("/login");
  });
});

describe("StoreAuthContext — untested surfaces: register, logout, preview gate", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    clearSession();
  });

  it("login persists the customer token so the session survives a reload", async () => {
    enableStoreAuth();
    server.use(
      http.post("*/api/v1/ecommerce/auth/login", () =>
        HttpResponse.json({
          token: "store-token-login",
          customer: { id: "cus_1", name: "Ada", email: "ada@example.com", created_at: 0 },
        }),
      ),
    );

    const click = renderProbe((auth) => auth.login("ada@example.com", "pw"));
    await waitFor(() => expect(screen.getByTestId("who").textContent).toBe("none"));
    click();

    await waitFor(() => expect(screen.getByTestId("who").textContent).toBe("Ada"));
    expect(window.localStorage.getItem(TOKEN_KEY)).toBe("store-token-login");
  });

  it("register persists the token and exposes the new customer", async () => {
    enableStoreAuth();
    server.use(
      http.post("*/api/v1/ecommerce/auth/register", () =>
        HttpResponse.json({
          token: "store-token-register",
          customer: { id: "cus_2", name: "Grace", email: "grace@example.com", created_at: 0 },
        }),
      ),
    );

    const click = renderProbe((auth) => auth.register("Grace", "grace@example.com", "pw"));
    await waitFor(() => expect(screen.getByTestId("who").textContent).toBe("none"));
    click();

    await waitFor(() => expect(screen.getByTestId("who").textContent).toBe("Grace"));
    expect(window.localStorage.getItem(TOKEN_KEY)).toBe("store-token-register");
  });

  it("logout clears the local session even when the logout call fails", async () => {
    enableStoreAuth();
    window.localStorage.setItem(TOKEN_KEY, "store-token-123");

    server.use(
      http.get("*/api/v1/ecommerce/auth/me", () =>
        HttpResponse.json({ id: "cus_1", name: "Ada", email: "ada@example.com", created_at: 0 }),
      ),
      // The server rejecting logout must not strand the shopper signed-in
      // locally — the context's `.catch(() => {})` is what guarantees that.
      http.post("*/api/v1/ecommerce/auth/logout", () =>
        HttpResponse.json(
          { error: { code: "server_error", message: "boom", requestId: "r" } },
          { status: 500 },
        ),
      ),
    );

    const click = renderProbe((auth) => auth.logout());
    await waitFor(() => expect(screen.getByTestId("who").textContent).toBe("Ada"));
    click();

    await waitFor(() => expect(screen.getByTestId("who").textContent).toBe("none"));
    expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it("the preview gate refuses sign-in without reaching the network", async () => {
    // Deliberately no enableStoreAuth(): mocks off + demo off = preview mode.
    let called = false;
    server.use(
      http.post("*/api/v1/ecommerce/auth/login", () => {
        called = true;
        return HttpResponse.json({ token: "t", customer: null });
      }),
    );

    const click = renderProbe((auth) => auth.login("ada@example.com", "pw"));
    await waitFor(() => expect(screen.getByTestId("who").textContent).toBe("none"));
    click();

    await waitFor(() =>
      expect(screen.getByTestId("error").textContent).toContain("preview"),
    );
    expect(called).toBe(false);
  });
});
