/**
 * tokens.ts — the single place that decides what claims an Ascend session token
 * carries.
 *
 * This module exists because there were two token minters. `IdentityService`
 * built claims one way for password login and refresh; `SsoService` hand-rolled
 * its own `jwt.sign` for SSO login and built them a different way — it omitted
 * `customRoleId` and `permissions` entirely. Nothing enforced that the two
 * agreed, so they drifted, and the drift was invisible until you diffed the two
 * call sites by eye.
 *
 * Both paths now call `issueTokenPair`, so a claim added here reaches every
 * login route at once. Do not re-introduce a local `jwt.sign` for session
 * tokens; if a caller needs an extra claim, pass `extraClaims`.
 */
import jwt from "jsonwebtoken";
import { v7 as uuidv7 } from "uuid";
import type { DB } from "../shared/db.js";
import type { Role } from "./types.js";

export const ACCESS_TOKEN_TTL = "15m";
export const REFRESH_TOKEN_TTL = "7d";
/** Access-token lifetime in seconds — the `expiresIn` value clients read. */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds
}

export interface IssueTokenPairInput {
  userId: string;
  tenantId: string;
  role: Role;
  /** Tenant-defined role id (Plus tier); omitted from the token when absent. */
  customRoleId?: string;
  /** Fine-grained permission strings from the custom role, e.g. "orders:read". */
  permissions?: string[];
  /**
   * Additional descriptive claims (e.g. `ssoProvider`). Reserved names are
   * stripped — see RESERVED_CLAIMS — so this can never be a route to privilege.
   */
  extraClaims?: Record<string, unknown>;
}

/**
 * Claim names `extraClaims` may not set.
 *
 * The authorization claims are here for the obvious reason: a caller must not
 * be able to hand itself a role, a tenant, or a permission set. Ordering the
 * spread so the real values land last is *not* sufficient — when a user has no
 * custom role the real value is absent, the conditional spread contributes
 * nothing, and a forged `customRoleId` survives. A regression test in
 * sso-token-claims.test.ts pins exactly that case.
 *
 * The registered JWT names are here for a duller reason: `jwt.sign` sets them
 * from its options object and throws if the payload already carries one.
 */
const RESERVED_CLAIMS = new Set([
  "tenantId", "role", "customRoleId", "permissions",
  "sub", "jti", "iat", "exp", "nbf", "aud", "iss",
]);

/**
 * Mint an access/refresh pair. Both tokens carry identical claims and differ
 * only in signing secret and lifetime, which is the behaviour password login
 * has always had — `refresh()` re-reads the user row and re-resolves
 * permissions anyway, so the claims in a refresh token are never trusted as
 * the source of privilege.
 */
export function issueTokenPair(secret: string, input: IssueTokenPairInput): TokenPair {
  const descriptive = Object.fromEntries(
    Object.entries(input.extraClaims ?? {}).filter(([k]) => !RESERVED_CLAIMS.has(k)),
  );
  const claims: Record<string, unknown> = {
    ...descriptive,
    tenantId: input.tenantId,
    role: input.role,
    ...(input.customRoleId ? { customRoleId: input.customRoleId } : {}),
    ...(input.permissions && input.permissions.length > 0 ? { permissions: input.permissions } : {}),
  };
  const accessToken = jwt.sign(claims, secret, {
    subject: input.userId,
    expiresIn: ACCESS_TOKEN_TTL,
    jwtid: `atk_${uuidv7()}`,
  });
  const refreshToken = jwt.sign(claims, secret + ":refresh", {
    subject: input.userId,
    expiresIn: REFRESH_TOKEN_TTL,
    jwtid: `rtk_${uuidv7()}`,
  });
  return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
}

/**
 * Read the permission list attached to a custom role. Returns `[]` for a
 * missing row or unparseable JSON — a user whose custom role has gone away
 * falls back to their base role rather than inheriting stale grants.
 */
export async function resolveCustomRolePermissions(db: DB, customRoleId: string): Promise<string[]> {
  const row = await db.one<{ permissions: string }>(
    "SELECT permissions FROM custom_roles WHERE id = @id",
    { id: customRoleId },
  );
  if (!row) return [];
  try {
    return JSON.parse(row.permissions) as string[];
  } catch {
    return [];
  }
}
