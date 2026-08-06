import type { Router, Request, Response } from "express";
import { z } from "zod";
import { requireRole, type AuthPayload } from "../../gateway/auth.js";
import { handler, parseBody } from "../../shared/http.js";
import type { ProgressService, ProgressStatus } from "./service.js";

function auth(res: Response): AuthPayload {
  return res.locals["auth"] as AuthPayload;
}
function tenantId(res: Response): string {
  return auth(res).tenantId;
}
function actorId(res: Response): string {
  return auth(res).userId ?? "unknown";
}

const statusSchema = z.enum([
  "not_started",
  "planned",
  "in_progress",
  "self_reported_done",
  "evidence_attached",
  "system_verified",
  "validated",
  "invalidated",
  "blocked",
  "skipped",
]);

const createHypothesisSchema = z.object({
  statement: z.string().min(3).max(1000),
  category: z.string().min(1).max(80).optional(),
  confidenceScore: z.number().int().min(0).max(100).optional(),
  successCriteria: z.string().max(2000).nullable().optional(),
});

const createTaskSchema = z.object({
  title: z.string().min(3).max(240),
  description: z.string().max(2000).nullable().optional(),
  category: z.string().min(1).max(80).optional(),
  hypothesisId: z.string().min(1).nullable().optional(),
  verificationSource: z.string().min(1).max(80).nullable().optional(),
  dueAt: z.number().int().positive().nullable().optional(),
});

const updateTaskStatusSchema = z.object({ status: statusSchema });

const createEvidenceSchema = z.object({
  taskId: z.string().min(1).nullable().optional(),
  hypothesisId: z.string().min(1).nullable().optional(),
  evidenceType: z.string().min(1).max(80).optional(),
  title: z.string().min(3).max(240),
  url: z.string().url().max(1000).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  source: z.string().min(1).max(80).optional(),
});

const createDecisionSchema = z.object({
  decision: z.enum(["validated", "invalidated"]),
  reason: z.string().max(2000).nullable().optional(),
  nextAction: z.string().max(1000).nullable().optional(),
});

/** `?limit=` — bad input falls back to the service default rather than 400ing a
 *  read. `clampLimit` caps the ceiling; this only has to reject non-numbers. */
function queryLimit(req: Request): number | undefined {
  const raw = typeof req.query["limit"] === "string" ? Number(req.query["limit"]) : NaN;
  return Number.isFinite(raw) && raw > 0 ? raw : undefined;
}

function queryString(req: Request, key: string): string | undefined {
  const raw = req.query[key];
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

export function registerRoutes(router: Router, service: ProgressService): void {
  const mgr = requireRole("manager");

  router.get("/summary", handler(async (_req, res) => {
    res.json(await service.summary(tenantId(res)));
  }));

  router.get("/hypotheses", handler(async (req: Request, res) => {
    res.json(await service.listHypotheses(tenantId(res), queryLimit(req)));
  }));

  router.post("/hypotheses", mgr, handler(async (req, res) => {
    const body = parseBody(createHypothesisSchema, req.body);
    res.status(201).json(await service.createHypothesis(body, tenantId(res), actorId(res)));
  }));

  // The whole loop for one hypothesis — hypothesis + its tasks, evidence, and
  // decisions — so the UI renders a complete loop or none of it, never a
  // half-stitched one. Read-only: visible to any authenticated tenant user.
  router.get("/hypotheses/:id", handler(async (req, res) => {
    res.json(await service.getHypothesisDetail(String(req.params.id), tenantId(res)));
  }));

  router.get("/hypotheses/:id/decisions", handler(async (req: Request, res) => {
    res.json(await service.listDecisions(tenantId(res), String(req.params.id), queryLimit(req)));
  }));

  // Evidence is filtered, never listed tenant-wide — see service.listEvidence.
  router.get("/evidence", handler(async (req: Request, res) => {
    res.json(await service.listEvidence(
      tenantId(res),
      { taskId: queryString(req, "taskId"), hypothesisId: queryString(req, "hypothesisId") },
      queryLimit(req),
    ));
  }));

  router.post("/hypotheses/:id/decisions", mgr, handler(async (req, res) => {
    const body = parseBody(createDecisionSchema, req.body);
    res.status(201).json(await service.createDecision({
      hypothesisId: String(req.params.id),
      decision: body.decision,
      reason: body.reason,
      nextAction: body.nextAction,
    }, tenantId(res), actorId(res)));
  }));

  router.get("/tasks", handler(async (req: Request, res) => {
    const raw = queryString(req, "status");
    const parsed = raw ? statusSchema.parse(raw) as ProgressStatus : undefined;
    res.json(await service.listTasks(
      tenantId(res),
      parsed,
      { hypothesisId: queryString(req, "hypothesisId") },
      queryLimit(req),
    ));
  }));

  router.post("/tasks", mgr, handler(async (req, res) => {
    const body = parseBody(createTaskSchema, req.body);
    res.status(201).json(await service.createTask(body, tenantId(res), actorId(res)));
  }));

  router.patch("/tasks/:id/status", mgr, handler(async (req, res) => {
    const body = parseBody(updateTaskStatusSchema, req.body);
    res.json(await service.updateTaskStatus(String(req.params.id), tenantId(res), actorId(res), body.status));
  }));

  router.post("/tasks/:id/evidence", mgr, handler(async (req, res) => {
    const body = parseBody(createEvidenceSchema, { ...req.body, taskId: String(req.params.id) });
    res.status(201).json(await service.addEvidence(body, tenantId(res), actorId(res)));
  }));

  router.post("/tasks/:id/system-verify", mgr, handler(async (req, res) => {
    res.json(await service.systemVerifyTask(String(req.params.id), tenantId(res), actorId(res)));
  }));

  router.post("/evidence", mgr, handler(async (req, res) => {
    const body = parseBody(createEvidenceSchema, req.body);
    res.status(201).json(await service.addEvidence(body, tenantId(res), actorId(res)));
  }));
}
