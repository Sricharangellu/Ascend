import type { Express } from "express";
import { bearer, resolveApiPath, sendRequest } from "../../shared/test-request.js";

/**
 * Tiny test client: issues one request against the app on an ephemeral port.
 * The signed role is selectable per call and defaults to `owner` — tests in
 * this module rely on that default, so do not "normalise" it. Plumbing is
 * shared — see src/shared/test-request.ts.
 */
export default function request(
  app: Express,
  method: string,
  path: string,
  body?: unknown,
  role: string = "owner",
): Promise<{ status: number; json: any }> {
  return sendRequest(app, method, resolveApiPath(path), {
    body,
    headers: bearer({ sub: `usr_demo_${role}`, tenantId: "tnt_demo", role }),
  });
}
