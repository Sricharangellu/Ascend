import type { Router, Request, Response } from "express";
import { z } from "zod";
import { handler, parseBody, notFound, badRequest } from "../../shared/http.js";
import type { OrdersService, OrderStatus } from "./service.js";
import type { AuthPayload } from "../../gateway/auth.js";

const stateSchema = z.enum(["CA", "NY", "TX", "FL"]);

const ORDER_STATUSES: readonly OrderStatus[] = ["open", "completed", "refunded", "voided"];

function readStatusFilter(value: unknown): OrderStatus | undefined {
  if (typeof value !== "string" || value === "") return undefined;
  if (!ORDER_STATUSES.includes(value as OrderStatus)) {
    throw badRequest(
      `invalid status '${value}'; expected one of ${ORDER_STATUSES.join(", ")}`,
    );
  }
  return value as OrderStatus;
}

const createSchema = z.object({
  stateCode: stateSchema,
  lines: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1),
  discountCents: z.number().int().nonnegative().optional(),
  customerId: z.string().min(1).nullable().optional(),
});

function parseInt0(value: unknown): number | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function tenantId(res: Response): string {
  return (res.locals["auth"] as AuthPayload).tenantId;
}

export function registerRoutes(router: Router, service: OrdersService): void {
  router.post(
    "/",
    handler(async (req: Request, res: Response) => {
      const body = parseBody(createSchema, req.body);
      const order = await service.create(body, tenantId(res));
      res.status(201).json(order);
    }),
  );

  router.get(
    "/",
    handler(async (req: Request, res: Response) => {
      const status = readStatusFilter(req.query.status);
      const page = await service.list(
        {
          status,
          limit: parseInt0(req.query.limit),
          offset: parseInt0(req.query.offset),
        },
        tenantId(res),
      );
      res.json(page);
    }),
  );

  router.get(
    "/:id",
    handler(async (req: Request, res: Response) => {
      const id = String(req.params.id);
      const order = await service.get(id, tenantId(res));
      if (!order) throw notFound(`order '${id}' not found`);
      res.json(order);
    }),
  );

  router.post(
    "/:id/refund",
    handler(async (req: Request, res: Response) => {
      res.json(await service.refund(String(req.params.id), tenantId(res)));
    }),
  );

  router.post(
    "/:id/void",
    handler(async (req: Request, res: Response) => {
      res.json(await service.void(String(req.params.id), tenantId(res)));
    }),
  );
}
