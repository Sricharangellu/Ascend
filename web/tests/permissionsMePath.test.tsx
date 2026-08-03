/**
 * @vitest-environment jsdom
 *
 * PermissionsContext must read the caller's identity from the REAL backend path
 * GET /api/identity/me (mocked), NOT the legacy /api/v1/auth/me which 404s in
 * production — the old path left role="owner" for every user (a privilege bug).
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { PermissionsProvider, usePermissions } from "@/contexts/PermissionsContext";

function Probe() {
  const { role, loading, hasFeature } = usePermissions();
  if (loading) return <p>loading</p>;
  return <p>role:{role}|catalog:{String(hasFeature("catalog"))}</p>;
}

describe("PermissionsContext — identity path", () => {
  it("reads role from /api/identity/me (the real path)", async () => {
    server.use(
      http.get("*/api/identity/me", () =>
        HttpResponse.json({ userId: "usr_x", tenantId: "tnt_x", role: "manager" }),
      ),
    );
    render(
      <PermissionsProvider>
        <Probe />
      </PermissionsProvider>,
    );
    // manager → allAccess → all features (owner/admin/manager branch)
    expect(await screen.findByText("role:manager|catalog:true")).toBeInTheDocument();
    server.resetHandlers();
  });

  it("never calls the legacy /api/v1/auth/me", async () => {
    const legacyHit = vi.fn();
    server.use(
      http.get("*/api/v1/auth/me", () => {
        legacyHit();
        return HttpResponse.json({ role: "owner" });
      }),
    );
    render(
      <PermissionsProvider>
        <Probe />
      </PermissionsProvider>,
    );
    await screen.findByText(/role:/);
    expect(legacyHit).not.toHaveBeenCalled();
    server.resetHandlers();
  });
});
