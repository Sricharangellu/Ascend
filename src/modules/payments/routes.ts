import type { Router, Request, Response } from "express";
import { z } from "zod";
import { handler, parseBody, badRequest } from "../../shared/http.js";
import { PaymentsService } from "./service.js";

const captureSchema = z.object({
  orderId: z.string().min(1),
  method: z.enum(["cash", "card", "split"]),
  cashCents: z.number().int().nonnegative().optional(),
  cardCents: z.number().int().nonnegative().optional(),
  tenderedCents: z.number().int().nonnegative().optional(),
});

export function registerRoutes(router: Router, service: PaymentsService): void {
  router.post(
    "/",
    handler(async (req: Request, res: Response) => {
      const body = parseBody(captureSchema, req.body);
      const payment = await service.capture(body);
      res.status(201).json(payment);
    }),
  );

  router.get(
    "/",
    handler(async (req: Request, res: Response) => {
      const orderId = req.query.orderId;
      if (typeof orderId !== "string" || orderId.length === 0) {
        throw badRequest("orderId query parameter is required");
      }
      res.json(await service.listByOrder(orderId));
    }),
  );

  router.get(
    "/:id",
    handler(async (req: Request, res: Response) => {
      res.json(await service.get(String(req.params.id)));
    }),
  );
}
