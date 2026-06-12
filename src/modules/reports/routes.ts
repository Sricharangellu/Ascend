import type { Router, Response } from "express";
import { handler } from "../../shared/http.js";
import type { AuthPayload } from "../../gateway/auth.js";
import type { ReportsService } from "./service.js";

function tenantId(res: Response): string {
  return (res.locals["auth"] as AuthPayload).tenantId;
}

export function registerRoutes(router: Router, service: ReportsService): void {
  // GET /api/v1/reports/summary — tenant-scoped sales summary.
  router.get(
    "/summary",
    handler(async (_req, res) => {
      res.json(await service.salesSummary(tenantId(res)));
    }),
  );
}
