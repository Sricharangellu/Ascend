import { z } from "zod";
import type { Router, Response } from "express";
import { handler, parseBody } from "../../shared/http.js";
import { requireRole } from "../../gateway/auth.js";
import type { AuthPayload } from "../../gateway/auth.js";
import type { InsightsService } from "./service.js";

function tenantId(res: Response): string {
  return (res.locals["auth"] as AuthPayload).tenantId;
}

const REPORT_TYPES = [
  "sales_summary", "top_products", "inventory_valuation", "p_l", "ar_aging", "ap_aging",
] as const;
const FREQUENCIES = ["daily", "weekly", "monthly"] as const;

const CreateBody = z.object({
  name: z.string().min(1).max(128),
  reportType: z.enum(REPORT_TYPES),
  frequency: z.enum(FREQUENCIES),
  recipientEmails: z.array(z.string().email()).min(1).max(20),
});

const UpdateBody = CreateBody.partial().extend({
  enabled: z.boolean().optional(),
});

export function registerRoutes(router: Router, service: InsightsService): void {
  // ── Scheduled Reports ────────────────────────────────────────────────────────

  // GET /api/v1/insights/scheduled-reports
  router.get(
    "/scheduled-reports",
    requireRole("manager"),
    handler(async (_req, res) => {
      res.json({ items: await service.listScheduledReports(tenantId(res)) });
    }),
  );

  // GET /api/v1/insights/scheduled-reports/:id
  router.get(
    "/scheduled-reports/:id",
    requireRole("manager"),
    handler(async (req, res) => {
      res.json(await service.getScheduledReport(tenantId(res), String(req.params["id"])));
    }),
  );

  // POST /api/v1/insights/scheduled-reports — owner only
  router.post(
    "/scheduled-reports",
    requireRole("owner"),
    handler(async (req, res) => {
      const body = parseBody(CreateBody, req.body);
      res.status(201).json(await service.createScheduledReport(tenantId(res), body));
    }),
  );

  // PATCH /api/v1/insights/scheduled-reports/:id — owner only
  router.patch(
    "/scheduled-reports/:id",
    requireRole("owner"),
    handler(async (req, res) => {
      const body = parseBody(UpdateBody, req.body);
      res.json(await service.updateScheduledReport(tenantId(res), String(req.params["id"]), body));
    }),
  );

  // DELETE /api/v1/insights/scheduled-reports/:id — owner only
  router.delete(
    "/scheduled-reports/:id",
    requireRole("owner"),
    handler(async (req, res) => {
      await service.deleteScheduledReport(tenantId(res), String(req.params["id"]));
      res.status(204).end();
    }),
  );

  // POST /api/v1/insights/scheduled-reports/:id/trigger — owner/manager
  // Marks the report as sent and advances next_send_at. Used by cron workers.
  router.post(
    "/scheduled-reports/:id/trigger",
    requireRole("manager"),
    handler(async (req, res) => {
      res.json(await service.triggerScheduledReport(tenantId(res), String(req.params["id"])));
    }),
  );

  // ── Forecasting ───────────────────────────────────────────────────────────────

  // GET /api/v1/insights/reorder?lookbackDays=90
  router.get(
    "/reorder",
    requireRole("manager"),
    handler(async (req, res) => {
      const lookbackDays =
        typeof req.query["lookbackDays"] === "string"
          ? Math.max(1, Math.min(365, Number(req.query["lookbackDays"])))
          : 90;
      res.json({ items: await service.reorderRecommendations(tenantId(res), lookbackDays) });
    }),
  );

  // GET /api/v1/insights/order-recommendations?lookbackDays=30&limit=20
  router.get(
    "/order-recommendations",
    requireRole("manager"),
    handler(async (req, res) => {
      const lookbackDays =
        typeof req.query["lookbackDays"] === "string"
          ? Math.max(1, Math.min(365, Number(req.query["lookbackDays"])))
          : 30;
      const limit =
        typeof req.query["limit"] === "string"
          ? Math.max(1, Math.min(100, Number(req.query["limit"])))
          : 20;
      res.json({
        items: await service.orderRecommendations(tenantId(res), lookbackDays, limit),
      });
    }),
  );
}
