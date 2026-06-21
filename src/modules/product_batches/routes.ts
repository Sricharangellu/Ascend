import type { Router, Response } from "express";
import { z } from "zod";
import { handler, parseBody } from "../../shared/http.js";
import type { AuthPayload } from "../../gateway/auth.js";
import { requireRole } from "../../gateway/auth.js";
import type { ProductBatchesService, ExpiryStatus } from "./service.js";

function tid(res: Response): string {
  return (res.locals["auth"] as AuthPayload).tenantId;
}

const batchSchema = z.object({
  product_id: z.string().min(1),
  batch_number: z.string().max(100).optional(),
  expiry_date: z.number().int().positive().nullable().optional(),
  qty: z.number().int().nonnegative(),
  cost_cents: z.number().int().nonnegative().optional(),
  received_at: z.number().int().positive().optional(),
  supplier_name: z.string().max(200).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

const VALID_STATUSES: ExpiryStatus[] = ["expired", "critical", "warning", "ok"];

export function registerRoutes(router: Router, svc: ProductBatchesService): void {
  const mgr = requireRole("manager");

  router.get("/product-batches/summary", handler(async (_req, res) => {
    res.json(await svc.getExpirySummary(tid(res)));
  }));

  router.get("/product-batches", handler(async (req, res) => {
    const productId = typeof req.query.product_id === "string" ? req.query.product_id : undefined;
    const status = typeof req.query.status === "string" && VALID_STATUSES.includes(req.query.status as ExpiryStatus)
      ? (req.query.status as ExpiryStatus)
      : undefined;
    const days = typeof req.query.days === "string" ? parseInt(req.query.days, 10) || undefined : undefined;
    res.json({ items: await svc.listBatches(tid(res), { product_id: productId, status, days }) });
  }));

  router.post("/product-batches", mgr, handler(async (req, res) => {
    const body = parseBody(batchSchema, req.body);
    res.status(201).json(await svc.createBatch(body, tid(res)));
  }));

  router.patch("/product-batches/:id", mgr, handler(async (req, res) => {
    const body = parseBody(batchSchema.partial().omit({ product_id: true }), req.body);
    res.json(await svc.updateBatch(String(req.params.id), body, tid(res)));
  }));

  router.delete("/product-batches/:id", mgr, handler(async (req, res) => {
    await svc.deleteBatch(String(req.params.id), tid(res));
    res.status(204).end();
  }));
}
