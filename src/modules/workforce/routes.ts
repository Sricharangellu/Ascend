import type { Router, Response } from "express";
import { z } from "zod";
import { handler, parseBody } from "../../shared/http.js";
import type { AuthPayload } from "../../gateway/auth.js";
import { requireRole } from "../../gateway/auth.js";
import type { WorkforceService, ShiftRole, TimeOffStatus } from "./service.js";

function tid(res: Response): string {
  return (res.locals["auth"] as AuthPayload).tenantId;
}

const employeeSchema = z.object({
  name: z.string().min(1).max(100),
  role: z.enum(["cashier", "manager", "stock", "supervisor", "delivery"]).optional(),
  email: z.string().email().optional().or(z.literal("")),
  avatar_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

const shiftSchema = z.object({
  employee_id: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().regex(/^\d{2}:\d{2}$/),
  notes: z.string().max(500).nullable().optional(),
});

const timeOffSchema = z.object({
  employee_id: z.string().min(1),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().max(500).nullable().optional(),
});

export function registerRoutes(router: Router, svc: WorkforceService): void {
  const mgr = requireRole("manager");

  // ── Employees ──────────────────────────────────────────────────────────────

  router.get("/workforce/employees", handler(async (_req, res) => {
    const items = await svc.listEmployees(tid(res));
    res.json({ items, total: items.length });
  }));

  router.post("/workforce/employees", mgr, handler(async (req, res) => {
    const body = parseBody(employeeSchema, req.body);
    res.status(201).json(await svc.createEmployee(tid(res), body));
  }));

  router.patch("/workforce/employees/:id", mgr, handler(async (req, res) => {
    const body = parseBody(employeeSchema.partial(), req.body);
    res.json(await svc.updateEmployee(tid(res), String(req.params["id"]), body as Parameters<WorkforceService["updateEmployee"]>[2]));
  }));

  // ── Shifts ─────────────────────────────────────────────────────────────────

  router.get("/workforce/shifts", handler(async (req, res) => {
    const date_from = typeof req.query["date_from"] === "string" ? req.query["date_from"] : undefined;
    const date_to   = typeof req.query["date_to"]   === "string" ? req.query["date_to"]   : undefined;
    const employee_id = typeof req.query["employee_id"] === "string" ? req.query["employee_id"] : undefined;
    const items = await svc.listShifts(tid(res), { date_from, date_to, employee_id });
    res.json({ items, total: items.length });
  }));

  router.post("/workforce/shifts", mgr, handler(async (req, res) => {
    const body = parseBody(shiftSchema, req.body);
    res.status(201).json(await svc.createShift(tid(res), body));
  }));

  router.patch("/workforce/shifts/:id", mgr, handler(async (req, res) => {
    const body = parseBody(shiftSchema.partial().omit({ employee_id: true }), req.body);
    res.json(await svc.updateShift(tid(res), String(req.params["id"]), body));
  }));

  router.delete("/workforce/shifts/:id", mgr, handler(async (req, res) => {
    await svc.deleteShift(tid(res), String(req.params["id"]));
    res.status(204).end();
  }));

  // ── Time-off ───────────────────────────────────────────────────────────────

  router.get("/workforce/time-off", handler(async (_req, res) => {
    const items = await svc.listTimeOff(tid(res));
    res.json({ items, total: items.length });
  }));

  router.post("/workforce/time-off", handler(async (req, res) => {
    const body = parseBody(timeOffSchema, req.body);
    res.status(201).json(await svc.createTimeOff(tid(res), body));
  }));

  router.patch("/workforce/time-off/:id", mgr, handler(async (req, res) => {
    const { status } = parseBody(z.object({ status: z.enum(["pending", "approved", "denied"]) }), req.body);
    res.json(await svc.updateTimeOffStatus(tid(res), String(req.params["id"]), status as TimeOffStatus));
  }));
}
