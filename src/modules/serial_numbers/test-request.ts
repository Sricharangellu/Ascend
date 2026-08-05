import type { Express } from "express";
import { bearer, resolveApiPath, sendRequest } from "../../shared/test-request.js";

/**
 * Tiny test client: issues one request against the app on an ephemeral port.
 * Signs a demo-tenant (tnt_demo / owner) bearer token and upgrades brevity
 * paths (/api/<module>) to the real /api/v1 mount. Plumbing is shared — see
 * src/shared/test-request.ts.
 */
export default function request(
  app: Express,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: any }> {
  return sendRequest(app, method, resolveApiPath(path), {
    body,
    headers: bearer({ sub: "usr_demo_owner", tenantId: "tnt_demo", role: "owner" }),
  });
}
