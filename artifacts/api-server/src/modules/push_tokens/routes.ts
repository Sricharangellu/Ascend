import type { Router, Response } from "express";
import { z } from "zod";
import { handler, parseBody, badRequest } from "../../shared/http.js";
import { requireRole } from "../../gateway/auth.js";
import type { AuthPayload } from "../../gateway/auth.js";
import type { PushTokensService } from "./service.js";
import { isValidTimezone } from "./service.js";

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

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

const quietHoursSchema = z.object({
  enabled: z.boolean(),
  start: z.string().regex(HHMM, "must be HH:MM (24h)"),
  end: z.string().regex(HHMM, "must be HH:MM (24h)"),
  timezone: z.string().min(1),
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

  // Quiet hours control tenant-wide notification behavior, so both read and
  // write are owner-only (matching the owner-facing mobile settings entry).
  const ownerOnly = requireRole("owner");

  // Read the tenant's quiet-hours config (defaults when never configured)
  router.get(
    "/quiet-hours",
    ownerOnly,
    handler(async (_req, res) => {
      const { tenantId } = auth(res);
      res.json(await service.getQuietHours(tenantId));
    }),
  );

  // Update the tenant's quiet-hours config
  router.put(
    "/quiet-hours",
    ownerOnly,
    handler(async (req, res) => {
      const body = parseBody(quietHoursSchema, req.body);
      if (!isValidTimezone(body.timezone)) {
        throw badRequest(`unknown timezone: ${body.timezone}`);
      }
      const { tenantId } = auth(res);
      res.json(await service.setQuietHours(tenantId, body));
    }),
  );
}
