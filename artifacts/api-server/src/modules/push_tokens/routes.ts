import type { Router, Response } from "express";
import { z } from "zod";
import { handler, parseBody } from "../../shared/http.js";
import type { AuthPayload } from "../../gateway/auth.js";
import type { PushTokensService } from "./service.js";

function auth(res: Response): AuthPayload {
  return res.locals["auth"] as AuthPayload;
}

const registerSchema = z.object({
  token: z.string().min(1),
  platform: z.enum(["ios", "android", "web"]),
});

const unregisterSchema = z.object({
  token: z.string().min(1),
});

export function registerRoutes(router: Router, service: PushTokensService): void {
  // Register a push token for the authenticated user
  router.post(
    "/",
    handler(async (req, res) => {
      const { token, platform } = parseBody(registerSchema, req.body);
      const { tenantId, userId } = auth(res);
      await service.register(tenantId, userId, token, platform);
      res.status(201).json({ ok: true });
    }),
  );

  // Remove a push token (e.g. on logout)
  router.delete(
    "/",
    handler(async (req, res) => {
      const { token } = parseBody(unregisterSchema, req.body);
      const { tenantId } = auth(res);
      await service.unregister(tenantId, token);
      res.json({ ok: true });
    }),
  );
}
