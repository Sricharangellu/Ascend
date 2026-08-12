import type { Router, Response } from "express";
import { z } from "zod";
import { handler, parseBody } from "../../shared/http.js";
import type { AuthPayload } from "../../gateway/auth.js";
import { requireRole } from "../../gateway/auth.js";
import type { StoreLocationsService } from "./service.js";

function tid(res: Response): string {
  return (res.locals["auth"] as AuthPayload).tenantId;
}

const locationSchema = z.object({
  outlet_id: z.string().min(1).nullable().optional(),
  aisle: z.string().min(1).max(50),
  shelf: z.string().max(50).optional(),
  bin: z.string().max(50).optional(),
  description: z.string().max(255).nullable().optional(),
});

const assignSchema = z.object({
  product_id: z.string().min(1),
  location_id: z.string().min(1),
  qty_at_location: z.number().int().nonnegative().optional(),
  notes: z.string().max(500).nullable().optional(),
});

const bulkAssignSchema = z.object({
  assignments: z.array(z.object({
    product_id: z.string().min(1),
    location_id: z.string().min(1),
    notes: z.string().max(500).nullable().optional(),
  })).min(1).max(500),
});

export function registerRoutes(router: Router, svc: StoreLocationsService): void {
  const mgr = requireRole("manager");

  // Store location CRUD
  router.get("/store-locations", handler(async (req, res) => {
    const outletId = typeof req.query.outlet_id === "string" ? req.query.outlet_id : undefined;
    res.json({ items: await svc.listLocations(tid(res), outletId) });
  }));

  router.get("/store-locations/map", handler(async (req, res) => {
    const outletId = typeof req.query.outlet_id === "string" ? req.query.outlet_id : undefined;
    res.json(await svc.getStoreMap(tid(res), outletId));
  }));

  router.post("/store-locations", mgr, handler(async (req, res) => {
    const body = parseBody(locationSchema, req.body);
    res.status(201).json(await svc.createLocation(body, tid(res)));
  }));

  router.patch("/store-locations/:id", mgr, handler(async (req, res) => {
    const body = parseBody(locationSchema.partial(), req.body);
    res.json(await svc.updateLocation(String(req.params.id), body, tid(res)));
  }));

  router.delete("/store-locations/:id", mgr, handler(async (req, res) => {
    await svc.deleteLocation(String(req.params.id), tid(res));
    res.status(204).end();
  }));

  // Product location assignments
  router.get("/product-locations", handler(async (req, res) => {
    const locationId = typeof req.query.location_id === "string" ? req.query.location_id : undefined;
    const productId = typeof req.query.product_id === "string" ? req.query.product_id : undefined;
    res.json({ items: await svc.listProductLocations(tid(res), { location_id: locationId, product_id: productId }) });
  }));

  router.post("/product-locations", mgr, handler(async (req, res) => {
    const body = parseBody(assignSchema, req.body);
    res.status(201).json(await svc.assignProduct(body, tid(res)));
  }));

  router.post("/product-locations/bulk", mgr, handler(async (req, res) => {
    const body = parseBody(bulkAssignSchema, req.body);
    res.json(await svc.bulkAssign(body, tid(res)));
  }));

  router.delete("/product-locations", mgr, handler(async (req, res) => {
    const productId = String(req.query.product_id ?? "");
    const locationId = String(req.query.location_id ?? "");
    if (!productId || !locationId) {
      res.status(400).json({ error: { code: "missing_params" } });
      return;
    }
    await svc.removeProductLocation(productId, locationId, tid(res));
    res.status(204).end();
  }));
}
