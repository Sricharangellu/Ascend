import type { Router, Request, Response } from "express";
import { z } from "zod";
import { handler, parseBody, badRequest } from "../../shared/http.js";
import { requireRole } from "../../gateway/auth.js";
import type { AuthPayload } from "../../gateway/auth.js";
import type { DemandPlanningService, ForecastPeriodType } from "./service.js";

function tenantId(res: Response): string {
  return (res.locals["auth"] as AuthPayload).tenantId;
}

function authUserId(res: Response): string | null {
  return (res.locals["auth"] as AuthPayload | undefined)?.userId ?? null;
}

function parsePeriodType(raw: unknown, fallback?: ForecastPeriodType): ForecastPeriodType {
  const v = typeof raw === "string" ? raw : fallback;
  if (v !== "day" && v !== "week" && v !== "month") {
    throw badRequest("periodType must be day, week, or month");
  }
  return v;
}

function parseRange(req: Request): { fromMs: number; toMs: number } {
  const fromMs = Number(req.query["from"]);
  const toMs = Number(req.query["to"]);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
    throw badRequest("from and to query params are required (ms epoch)");
  }
  return { fromMs, toMs };
}

const snapshotSchema = z.object({
  /** Any timestamp (ms) within the UTC day to snapshot. Defaults to yesterday if omitted. */
  date: z.number().int().optional(),
});

const forecastSchema = z.object({
  productId: z.string().min(1),
  storeId: z.string().optional().nullable(),
  periodType: z.enum(["day", "week", "month"]),
  periodStart: z.number().int(),
  forecastUnits: z.number().int().min(0),
  method: z.string().min(1).max(64).optional(),
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
      const periodType = parsePeriodType(req.query["periodType"], "day");
      const { fromMs, toMs } = parseRange(req);
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

  // ── Phase 7 item 3: forecasts + accuracy ─────────────────────────────────

  // POST /forecasts — persist a prediction for a period (manager-gated).
  router.post(
    "/forecasts",
    mgr,
    handler(async (req, res) => {
      const body = parseBody(forecastSchema, req.body ?? {});
      const forecast = await service.createForecast({
        tenantId: tenantId(res),
        productId: body.productId,
        storeId: body.storeId ?? "",
        periodType: body.periodType,
        periodStart: body.periodStart,
        forecastUnits: body.forecastUnits,
        method: body.method,
        createdBy: authUserId(res),
      });
      res.status(201).json(forecast);
    }),
  );

  // GET /forecasts?periodType=&from=&to=&productId=&storeId=
  router.get(
    "/forecasts",
    handler(async (req: Request, res: Response) => {
      const periodTypeRaw = req.query["periodType"];
      const periodType =
        periodTypeRaw === undefined || periodTypeRaw === ""
          ? null
          : parsePeriodType(periodTypeRaw);
      const { fromMs, toMs } = parseRange(req);
      const productId = typeof req.query["productId"] === "string" ? req.query["productId"] : null;
      const storeId = typeof req.query["storeId"] === "string" ? req.query["storeId"] : null;

      const forecasts = await service.listForecasts({
        tenantId: tenantId(res),
        productId,
        storeId,
        periodType,
        fromMs,
        toMs,
      });
      res.json({ forecasts });
    }),
  );

  // GET /accuracy?periodType=day|week|month&from=&to=&productId=&storeId=
  // Joins closed-period forecasts against demand_snapshots actuals.
  router.get(
    "/accuracy",
    handler(async (req: Request, res: Response) => {
      const periodType = parsePeriodType(req.query["periodType"], "day");
      const { fromMs, toMs } = parseRange(req);
      const productId = typeof req.query["productId"] === "string" ? req.query["productId"] : null;
      const storeId = typeof req.query["storeId"] === "string" ? req.query["storeId"] : null;

      const rows = await service.getForecastAccuracy({
        tenantId: tenantId(res),
        productId,
        storeId,
        periodType,
        fromMs,
        toMs,
      });
      res.json({ periodType, rows });
    }),
  );
}
