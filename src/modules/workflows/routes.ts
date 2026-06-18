import { z } from "zod";
import type { Router, Response } from "express";
import { handler, parseBody } from "../../shared/http.js";
import { requireRole } from "../../gateway/auth.js";
import type { AuthPayload } from "../../gateway/auth.js";
import type { WorkflowsService } from "./service.js";

function tenantId(res: Response): string {
  return (res.locals["auth"] as AuthPayload).tenantId;
}

const TRIGGER_CONDITIONS = [
  "age_verification", "loyalty_capture", "id_scan",
  "customer_required", "signature_required", "custom_prompt",
] as const;

const STEP_TYPES = ["prompt", "gate", "capture", "external_api"] as const;

const CreateWorkflowBody = z.object({
  name: z.string().min(1).max(128),
  description: z.string().max(255).optional(),
  outletId: z.string().nullable().optional(),
});

const UpdateWorkflowBody = CreateWorkflowBody.partial().extend({
  enabled: z.boolean().optional(),
});

const CreateStepBody = z.object({
  name: z.string().min(1).max(128),
  stepType: z.enum(STEP_TYPES),
  triggerCondition: z.enum(TRIGGER_CONDITIONS),
  config: z.record(z.unknown()).optional(),
  position: z.number().int().min(0).optional(),
});

const UpdateStepBody = CreateStepBody.partial().extend({
  enabled: z.boolean().optional(),
});

export function registerRoutes(router: Router, service: WorkflowsService): void {
  // ── Workflow Definitions ──────────────────────────────────────────────────────

  // GET /api/v1/workflows?outletId=
  router.get(
    "/",
    requireRole("manager"),
    handler(async (req, res) => {
      const tid = tenantId(res);
      const outletId = typeof req.query["outletId"] === "string" ? req.query["outletId"] : undefined;
      res.json({ items: await service.list(tid, outletId) });
    }),
  );

  // GET /api/v1/workflows/:id
  router.get(
    "/:id",
    requireRole("manager"),
    handler(async (req, res) => {
      res.json(await service.get(tenantId(res), String(req.params["id"])));
    }),
  );

  // POST /api/v1/workflows — owner only
  router.post(
    "/",
    requireRole("owner"),
    handler(async (req, res) => {
      const body = parseBody(CreateWorkflowBody, req.body);
      res.status(201).json(await service.create(tenantId(res), body));
    }),
  );

  // PATCH /api/v1/workflows/:id — owner only
  router.patch(
    "/:id",
    requireRole("owner"),
    handler(async (req, res) => {
      const body = parseBody(UpdateWorkflowBody, req.body);
      res.json(await service.update(tenantId(res), String(req.params["id"]), body));
    }),
  );

  // DELETE /api/v1/workflows/:id — owner only
  router.delete(
    "/:id",
    requireRole("owner"),
    handler(async (req, res) => {
      await service.delete(tenantId(res), String(req.params["id"]));
      res.status(204).end();
    }),
  );

  // ── Steps ─────────────────────────────────────────────────────────────────────

  // POST /api/v1/workflows/:workflowId/steps
  router.post(
    "/:workflowId/steps",
    requireRole("owner"),
    handler(async (req, res) => {
      const body = parseBody(CreateStepBody, req.body);
      res.status(201).json(await service.addStep(tenantId(res), String(req.params["workflowId"]), body));
    }),
  );

  // PATCH /api/v1/workflows/:workflowId/steps/:stepId
  router.patch(
    "/:workflowId/steps/:stepId",
    requireRole("owner"),
    handler(async (req, res) => {
      const body = parseBody(UpdateStepBody, req.body);
      res.json(
        await service.updateStep(
          tenantId(res),
          String(req.params["workflowId"]),
          String(req.params["stepId"]),
          body,
        ),
      );
    }),
  );

  // DELETE /api/v1/workflows/:workflowId/steps/:stepId
  router.delete(
    "/:workflowId/steps/:stepId",
    requireRole("owner"),
    handler(async (req, res) => {
      await service.deleteStep(
        tenantId(res),
        String(req.params["workflowId"]),
        String(req.params["stepId"]),
      );
      res.status(204).end();
    }),
  );
}
