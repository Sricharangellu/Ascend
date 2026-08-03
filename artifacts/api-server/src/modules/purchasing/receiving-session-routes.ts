import type { Router, Response } from "express";
import { z } from "zod";
import { handler, parseBody } from "../../shared/http.js";
import type { AuthPayload } from "../../gateway/auth.js";
import { requireRole } from "../../gateway/auth.js";
import type { ReceivingSessionService } from "./receiving-sessions.js";
import type { ReceivingDashboardService } from "./receiving-dashboard.js";

function tenantId(res: Response): string {
  return (res.locals["auth"] as AuthPayload).tenantId;
}

function actor(res: Response): { id: string | null; role: string; name?: string | null } {
  const a = res.locals["auth"] as AuthPayload;
  return { id: a.userId ?? null, role: a.role };
}

/**
 * Receiving-session HTTP surface.
 * Mounted on the purchasing router → `/api/v1/purchasing/receiving/...`
 */
export function registerReceivingSessionRoutes(
  router: Router,
  sessions: ReceivingSessionService,
  dashboard: ReceivingDashboardService,
): void {
  const mgr = requireRole("manager");

  router.get("/receiving/dashboard", handler(async (_req, res) => {
    res.json(await dashboard.summary(tenantId(res)));
  }));

  router.get("/receiving/sessions", handler(async (_req, res) => {
    res.json(await sessions.listActive(tenantId(res)));
  }));

  router.post("/receiving/sessions", mgr, handler(async (req, res) => {
    const b = parseBody(
      z.object({
        poId: z.string().min(1),
        mode: z.enum(["standard", "blind", "asn"]).optional(),
        dockCode: z.string().max(64).nullable().optional(),
        notes: z.string().max(2000).nullable().optional(),
      }),
      req.body,
    );
    res.status(201).json(
      await sessions.begin(b.poId, tenantId(res), actor(res), {
        mode: b.mode,
        dockCode: b.dockCode,
        notes: b.notes,
      }),
    );
  }));

  router.get("/receiving/sessions/:id", handler(async (req, res) => {
    res.json(await sessions.get(String(req.params.id), tenantId(res)));
  }));

  router.post("/receiving/sessions/:id/dock", mgr, handler(async (req, res) => {
    const b = parseBody(
      z.object({ dockCode: z.string().max(64).nullable().optional() }),
      req.body ?? {},
    );
    res.json(await sessions.markDocked(String(req.params.id), tenantId(res), b.dockCode));
  }));

  router.post("/receiving/sessions/:id/scan", mgr, handler(async (req, res) => {
    const b = parseBody(
      z.object({
        barcode: z.string().min(1).max(128),
        qty: z.number().int().positive().optional(),
        lotCode: z.string().min(1).max(120).nullable().optional(),
        expiryDate: z.number().int().positive().nullable().optional(),
        manufactureDate: z.number().int().positive().nullable().optional(),
        unitCostCents: z.number().int().nonnegative().nullable().optional(),
        costOverrideReason: z.string().min(1).max(500).nullable().optional(),
        locationId: z.string().min(1).nullable().optional(),
        hold: z.boolean().optional(),
        reject: z.boolean().optional(),
      }),
      req.body,
    );
    res.json(await sessions.scan(String(req.params.id), tenantId(res), b));
  }));

  router.patch("/receiving/sessions/:id/lines/:lineId", mgr, handler(async (req, res) => {
    const b = parseBody(
      z.object({
        acceptedQty: z.number().int().nonnegative().optional(),
        heldQty: z.number().int().nonnegative().optional(),
        rejectedQty: z.number().int().nonnegative().optional(),
        lotCode: z.string().min(1).max(120).nullable().optional(),
        expiryDate: z.number().int().positive().nullable().optional(),
        manufactureDate: z.number().int().positive().nullable().optional(),
        unitCostCents: z.number().int().nonnegative().nullable().optional(),
        costOverrideReason: z.string().min(1).max(500).nullable().optional(),
        locationId: z.string().min(1).nullable().optional(),
      }),
      req.body ?? {},
    );
    res.json(
      await sessions.updateLine(
        String(req.params.id),
        String(req.params.lineId),
        tenantId(res),
        b,
      ),
    );
  }));

  router.get("/receiving/sessions/:id/intelligence/:productId", handler(async (req, res) => {
    const session = await sessions.get(String(req.params.id), tenantId(res));
    res.json(
      await sessions.lineIntelligence(
        String(req.params.productId),
        session.po_id,
        tenantId(res),
        null,
      ),
    );
  }));

  router.post("/receiving/sessions/:id/close", mgr, handler(async (req, res) => {
    const b = parseBody(
      z.object({ forceComplete: z.boolean().optional() }),
      req.body ?? {},
    );
    res.json(await sessions.close(String(req.params.id), tenantId(res), b));
  }));

  router.post("/receiving/sessions/:id/cancel", mgr, handler(async (req, res) => {
    res.json(await sessions.cancel(String(req.params.id), tenantId(res)));
  }));
}
