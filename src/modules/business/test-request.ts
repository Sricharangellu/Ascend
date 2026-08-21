import type { Express } from "express";
import { bearer, resolveApiPath, sendRequest } from "../../shared/test-request.js";

/**
 * Tiny test client for the business module. Like the other modules' helpers it
 * spins up the app on an ephemeral port for one request, but it lets each test
 * sign a DIFFERENT identity (user/tenant/role) so access-separation can be
 * exercised. Defaults to the demo owner. Plumbing is shared — see
 * src/shared/test-request.ts.
 */
export interface TestClaims {
  sub?: string;
  tenantId?: string;
  role?: string;
}

export default function request(
  app: Express,
  method: string,
  path: string,
  body?: unknown,
  claims: TestClaims = {},
): Promise<{ status: number; json: any }> {
  return sendRequest(app, method, resolveApiPath(path), {
    body,
    headers: bearer({
      sub: claims.sub ?? "usr_demo_owner",
      tenantId: claims.tenantId ?? "tnt_demo",
      role: claims.role ?? "owner",
    }),
  });
}
