import type { Express } from "express";
import { bearer, resolveApiPath, sendRequest } from "../../shared/test-request.js";

/**
 * Tiny test client for the custom-roles module. Beyond the selectable role it
 * can attach a `customRoleId` and an explicit `permissions` array, so tests can
 * exercise permission resolution for roles that are not one of the built-ins.
 * Plumbing is shared — see src/shared/test-request.ts.
 */
export default function request(
  app: Express,
  method: string,
  path: string,
  body?: unknown,
  role: string = "owner",
  extra?: { customRoleId?: string; permissions?: string[] },
): Promise<{ status: number; json: any }> {
  return sendRequest(app, method, resolveApiPath(path), {
    body,
    headers: bearer({
      sub: `usr_demo_${role}`,
      tenantId: "tnt_demo",
      role,
      ...(extra?.customRoleId ? { customRoleId: extra.customRoleId } : {}),
      ...(extra?.permissions ? { permissions: extra.permissions } : {}),
    }),
  });
}
