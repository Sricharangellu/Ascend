import type { Router } from "express";
import { z } from "zod";
import { handler, parseBody } from "../shared/http.js";
import type { IdentityService } from "./service.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

/**
 * Register identity routes onto the provided router.
 *
 * POST /login    — verify credentials → {accessToken, refreshToken, expiresIn}
 * POST /refresh  — rotate token pair via a valid refreshToken
 * GET  /me       — return the caller's own identity (requires auth middleware upstream)
 */
export function registerIdentityRoutes(router: Router, service: IdentityService): void {
  router.post(
    "/login",
    handler(async (req, res) => {
      const body = parseBody(loginSchema, req.body);
      const tokens = await service.login(body);
      res.status(200).json(tokens);
    }),
  );

  router.post(
    "/refresh",
    handler(async (req, res) => {
      const body = parseBody(refreshSchema, req.body);
      const tokens = await service.refresh(body.refreshToken);
      res.status(200).json(tokens);
    }),
  );

  // /me is protected — auth middleware must be mounted on this router upstream.
  router.get(
    "/me",
    handler(async (_req, res) => {
      const auth = res.locals["auth"] as { userId: string; tenantId: string; role: string } | undefined;
      if (!auth) {
        res.status(401).json({ error: { code: "unauthenticated", message: "Not authenticated." } });
        return;
      }
      res.json({ userId: auth.userId, tenantId: auth.tenantId, role: auth.role });
    }),
  );
}
