import type { Router, Response } from "express";
import { z } from "zod";
import { handler, parseBody, notFound } from "../../shared/http.js";
import { requireRole } from "../../gateway/auth.js";
import type { AuthPayload } from "../../gateway/auth.js";
import type { WebhooksService } from "./service.js";

function tenantId(res: Response): string {
  return (res.locals["auth"] as AuthPayload).tenantId;
}

const subscribeSchema = z.object({
  url: z.string().url(),
  eventTypes: z.array(z.string().min(1)).optional(),
  secret: z.string().min(8).optional(),
});

const toggleSchema = z.object({
  active: z.boolean(),
});

export function registerRoutes(router: Router, service: WebhooksService): void {
  // Owner-only: subscription management
  router.post(
    "/",
    requireRole("owner"),
    handler(async (req, res) => {
      const body = parseBody(subscribeSchema, req.body);
      const sub = await service.subscribe(body, tenantId(res));
      res.status(201).json(sub);
    }),
  );

  router.get(
    "/",
    requireRole("owner"),
    handler(async (_req, res) => {
      res.json({ items: await service.list(tenantId(res)) });
    }),
  );

  router.patch(
    "/:id",
    requireRole("owner"),
    handler(async (req, res) => {
      const { active } = parseBody(toggleSchema, req.body);
      const sub = await service.toggle(String(req.params.id), tenantId(res), active);
      res.json(sub);
    }),
  );

  router.delete(
    "/:id",
    requireRole("owner"),
    handler(async (req, res) => {
      const ok = await service.remove(String(req.params.id), tenantId(res));
      if (!ok) throw notFound(`webhook '${req.params.id}' not found`);
      res.status(204).end();
    }),
  );

  router.get(
    "/deliveries",
    requireRole("owner"),
    handler(async (_req, res) => {
      res.json({ items: await service.deliveries(tenantId(res)) });
    }),
  );
}
