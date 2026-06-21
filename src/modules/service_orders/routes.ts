import type { Router, Response } from "express";
import { z } from "zod";
import { handler, parseBody } from "../../shared/http.js";
import type { AuthPayload } from "../../gateway/auth.js";
import { requireRole } from "../../gateway/auth.js";
import type { ServiceOrdersService, ServiceOrderStatus } from "./service.js";

function tid(res: Response): string {
  return (res.locals["auth"] as AuthPayload).tenantId;
}

const createSchema = z.object({
  customer_id: z.string().min(1).nullable().optional(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  assigned_to: z.string().min(1).nullable().optional(),
  estimate_cents: z.number().int().nonnegative().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  assigned_to: z.string().min(1).nullable().optional(),
  estimate_cents: z.number().int().nonnegative().optional(),
  actual_cents: z.number().int().nonnegative().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  status: z.enum(["draft", "open", "in_progress", "ready", "closed"]).optional(),
});

export function registerRoutes(router: Router, svc: ServiceOrdersService): void {
  const mgr = requireRole("manager");

  router.get("/service-orders", handler(async (req, res) => {
    const limit = Math.min(Number(req.query["limit"] ?? 50), 200);
    const offset = Number(req.query["offset"] ?? 0);
    const status = typeof req.query["status"] === "string"
      ? (req.query["status"] as ServiceOrderStatus) : undefined;
    const q = typeof req.query["q"] === "string" ? req.query["q"] : undefined;
    res.json(await svc.list(tid(res), { limit, offset, status, q }));
  }));

  router.post("/service-orders", mgr, handler(async (req, res) => {
    const body = parseBody(createSchema, req.body);
    res.status(201).json(await svc.create(tid(res), body));
  }));

  router.get("/service-orders/:id", handler(async (req, res) => {
    res.json(await svc.get(tid(res), String(req.params["id"])));
  }));

  router.patch("/service-orders/:id", mgr, handler(async (req, res) => {
    const body = parseBody(updateSchema, req.body);
    const { status, ...rest } = body;
    if (status) {
      return res.json(await svc.transition(tid(res), String(req.params["id"]), status));
    }
    res.json(await svc.update(tid(res), String(req.params["id"]), rest));
  }));
}
