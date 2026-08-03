import type { Router, Request, Response } from "express";
import { z } from "zod";
import { handler, parseBody, badRequest } from "../../shared/http.js";
import { requireRole } from "../../gateway/auth.js";
import type { AuthPayload } from "../../gateway/auth.js";
import type { DemandPlanningService } from "./service.js";

function tenantId(res: Response): string {
  return (res.locals["auth"] as AuthPayload).tenantId;
}

const snapshotSchema = z.object({
  /** Any timestamp (ms) within the UTC day to snapshot. Defaults to yesterday if omitted. */
  date: z.number().int().optional(),
});

const DAY_MS = 86_400_000;

export function registerRoutes(router: Router, service: DemandPlanningService): void {
  const mgr = requireRole("manager");

  // POST /snapshot — manually trigger a day's aggregation (manager-gated).
  // The nightly orchestration job (demand-snapshot.job.ts) calls the same
  // service method for "yesterday" automatically; this exists for backfill
  // and for verifying the pipeline without waiting on the job scheduler.
  router.post(
    "/snapshot",
    mgr,
    handler(async (req, res) => {
      const body = parseBody(snapshotSchema, req.body ?? {});
      const date = body.date ?? Date.now() - DAY_MS;
      const result = await service.snapshotDay(date);
      res.json(result);
    }),
  );

  // GET /history/:productId?periodType=day|week|month&from=<ms>&to=<ms>&storeId=<id>
  router.get(
    "/history/:productId",
    handler(async (req: Request, res: Response) => {
      const periodType = (req.query["periodType"] as string) ?? "day";
      if (periodType !== "day" && periodType !== "week" && periodType !== "month") {
        throw badRequest("periodType must be day, week, or month");
      }
      const fromMs = Number(req.query["from"]);
      const toMs = Number(req.query["to"]);
      if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
        throw badRequest("from and to query params are required (ms epoch)");
      }
      const storeId = typeof req.query["storeId"] === "string" ? req.query["storeId"] : null;

      const points = await service.getDemandHistory({
        tenantId: tenantId(res),
        productId: String(req.params.productId),
        periodType,
        fromMs,
        toMs,
        storeId,
      });
      res.json({ productId: req.params.productId, periodType, points });
    }),
  );
}
