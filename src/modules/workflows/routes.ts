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

interface WorkflowTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  installs: number;
  steps: Array<{
    name: string;
    stepType: (typeof STEP_TYPES)[number];
    triggerCondition: (typeof TRIGGER_CONDITIONS)[number];
  }>;
}

/** Product-defined starter workflows offered to every tenant. */
const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  { id: "tpl_1", name: "Age Verification (21+)", category: "compliance", installs: 1240,
    description: "Prompts cashier to scan ID and confirm customer is 21+. Blocks transaction until confirmed.",
    steps: [
      { name: "Scan ID", stepType: "capture", triggerCondition: "age_verification" },
      { name: "Confirm 21+", stepType: "gate", triggerCondition: "age_verification" },
    ] },
  { id: "tpl_2", name: "Age Verification (18+)", category: "compliance", installs: 890,
    description: "Prompts cashier to verify customer is 18+ for tobacco, lottery, or other age-restricted items.",
    steps: [
      { name: "Scan ID", stepType: "capture", triggerCondition: "age_verification" },
      { name: "Confirm 18+", stepType: "gate", triggerCondition: "age_verification" },
    ] },
  { id: "tpl_3", name: "Loyalty Phone Capture", category: "loyalty", installs: 2100,
    description: "Prompts cashier to ask for loyalty phone number before completing the transaction.",
    steps: [{ name: "Capture phone", stepType: "capture", triggerCondition: "loyalty_capture" }] },
  { id: "tpl_4", name: "Manager Price Override", category: "approvals", installs: 560,
    description: "Requires manager PIN entry when a manual price override exceeds 10% of retail.",
    steps: [
      { name: "Detect override", stepType: "prompt", triggerCondition: "custom_prompt" },
      { name: "Manager PIN", stepType: "gate", triggerCondition: "custom_prompt" },
      { name: "Log approval", stepType: "capture", triggerCondition: "custom_prompt" },
    ] },
  { id: "tpl_5", name: "Signature Required", category: "compliance", installs: 340,
    description: "Captures customer signature on screen for orders over the configured threshold.",
    steps: [{ name: "Capture signature", stepType: "capture", triggerCondition: "signature_required" }] },
  { id: "tpl_6", name: "SNAP/EBT Eligible Check", category: "payments", installs: 210,
    description: "Prompts cashier to confirm which items are SNAP-eligible before EBT tender.",
    steps: [
      { name: "Flag eligible items", stepType: "prompt", triggerCondition: "custom_prompt" },
      { name: "Confirm tender split", stepType: "gate", triggerCondition: "custom_prompt" },
    ] },
  { id: "tpl_7", name: "ID Scan Required", category: "compliance", installs: 780,
    description: "Captures government-issued ID barcode or manual entry for restricted product categories.",
    steps: [{ name: "Scan ID barcode", stepType: "capture", triggerCondition: "id_scan" }] },
  { id: "tpl_8", name: "Customer Required (B2B)", category: "b2b", installs: 420,
    description: "Blocks checkout until a customer account is selected — enforces B2B order tracking.",
    steps: [{ name: "Require customer", stepType: "gate", triggerCondition: "customer_required" }] },
];

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

  // ── Templates — static product catalog; registered before /:id so
  // "templates" isn't captured as a workflow id. installed = a workflow with
  // the template's name already exists for this tenant.
  router.get(
    "/templates",
    requireRole("manager"),
    handler(async (_req, res) => {
      const existing = await service.list(tenantId(res));
      const names = new Set(existing.map((w) => w.name));
      res.json({
        items: WORKFLOW_TEMPLATES.map((t) => ({
          id: t.id,
          name: t.name,
          category: t.category,
          description: t.description,
          steps: t.steps.length,
          installs: t.installs,
          installed: names.has(t.name),
        })),
      });
    }),
  );

  // POST /api/v1/workflows/templates/:id/install — owner only.
  router.post(
    "/templates/:id/install",
    requireRole("owner"),
    handler(async (req, res) => {
      const tpl = WORKFLOW_TEMPLATES.find((t) => t.id === String(req.params["id"]));
      if (!tpl) {
        res.status(404).json({ error: { code: "not_found", message: "template not found" } });
        return;
      }
      const tid = tenantId(res);
      const existing = await service.list(tid);
      if (existing.some((w) => w.name === tpl.name)) {
        res.status(409).json({ error: { code: "conflict", message: "template already installed" } });
        return;
      }
      const workflow = await service.create(tid, { name: tpl.name, description: tpl.description });
      for (const [i, step] of tpl.steps.entries()) {
        await service.addStep(tid, workflow.id, { ...step, position: i });
      }
      res.status(201).json({ workflow: await service.get(tid, workflow.id) });
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
