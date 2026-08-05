import type { Router, Response } from "express";
import { z } from "zod";
import { handler, parseBody } from "../../shared/http.js";
import type { AuthPayload } from "../../gateway/auth.js";
import { requireRole } from "../../gateway/auth.js";
import type { SerialNumbersService, SerialStatus } from "./service.js";

function tid(res: Response): string {
  return (res.locals["auth"] as AuthPayload).tenantId;
}

const receiveSchema = z.object({
  product_id: z.string().min(1),
  serial: z.string().min(1).max(100),
  notes: z.string().max(500).nullable().optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(["in_stock", "sold", "returned", "service"]),
  service_order_id: z.string().min(1).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export function registerRoutes(router: Router, svc: SerialNumbersService): void {
  const mgr = requireRole("manager");

  router.get("/inventory/serials", handler(async (req, res) => {
    const limit = Math.min(Number(req.query["limit"] ?? 50), 200);
    const offset = Number(req.query["offset"] ?? 0);
    const product_id = typeof req.query["product_id"] === "string" ? req.query["product_id"] : undefined;
    const status = typeof req.query["status"] === "string"
      ? (req.query["status"] as SerialStatus) : undefined;
    const q = typeof req.query["q"] === "string" ? req.query["q"] : undefined;
    res.json(await svc.list(tid(res), { limit, offset, product_id, status, q }));
  }));

  router.post("/inventory/serials", mgr, handler(async (req, res) => {
    const body = parseBody(receiveSchema, req.body);
    res.status(201).json(await svc.receive(tid(res), body));
  }));

  router.get("/inventory/serials/:id", handler(async (req, res) => {
    res.json(await svc.get(tid(res), String(req.params["id"])));
  }));

  router.patch("/inventory/serials/:id", mgr, handler(async (req, res) => {
    const body = parseBody(updateStatusSchema, req.body);
    res.json(await svc.updateStatus(tid(res), String(req.params["id"]), body));
  }));
}
