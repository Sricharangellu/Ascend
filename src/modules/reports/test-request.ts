import type { Express } from "express";
import type { Role } from "../../identity/types.js";
import { bearer, resolveApiPath, sendRequest } from "../../shared/test-request.js";

/**
 * Tiny test client: issues one request against the app on an ephemeral port.
 * Signs a demo-tenant bearer token and upgrades brevity paths (/api/<module>)
 * to the real /api/v1 mount. Plumbing is shared — see
 * src/shared/test-request.ts.
 *
 * Defaults to `owner`, so existing tests are unaffected. Pass a `role` to
 * exercise the route guards — e.g. that a cashier cannot read the P&L.
 */
export default function request(
  app: Express,
  method: string,
  path: string,
  body?: unknown,
  role: Role = "owner",
): Promise<{ status: number; json: any }> {
  return sendRequest(app, method, resolveApiPath(path), {
    body,
    headers: bearer({ sub: `usr_demo_${role}`, tenantId: "tnt_demo", role }),
  });
}
