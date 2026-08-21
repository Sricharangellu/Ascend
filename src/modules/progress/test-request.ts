import type { App } from "../../app.js";
import { bearer, resolveApiPath, sendRequest } from "../../shared/test-request.js";

/**
 * Tiny test client for the progress module. Unlike the other helpers it takes
 * the `App` wrapper rather than the bare Express instance, requires an explicit
 * role (progress tests exercise several), and allows a non-default tenant so
 * cross-tenant isolation can be checked. Subjects are `usr_test_*` here, not
 * `usr_demo_*`. Plumbing is shared — see src/shared/test-request.ts.
 */
export function request(
  app: App,
  method: string,
  path: string,
  role: string,
  body?: unknown,
  tenantId = "tnt_demo",
): Promise<{ status: number; json: any }> {
  return sendRequest(app.express, method, resolveApiPath(path), {
    body,
    headers: bearer({ sub: `usr_test_${role}`, tenantId, role }),
  });
}
