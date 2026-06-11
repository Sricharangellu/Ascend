import type { Router, Request } from "express";
import { z } from "zod";
import { handler, parseBody, notFound, badRequest } from "../../shared/http.js";
import type { CatalogService, ProductStatus, TaxClass } from "./service.js";

const taxClassSchema = z.enum(["standard", "exempt"]);
const statusSchema = z.enum(["active", "draft", "archived"]);

const PRODUCT_STATUSES: readonly ProductStatus[] = ["active", "draft", "archived"];

function readStatusFilter(value: unknown): ProductStatus | undefined {
  if (typeof value !== "string" || value === "") return undefined;
  if (!PRODUCT_STATUSES.includes(value as ProductStatus)) {
    throw badRequest(
      `invalid status '${value}'; expected one of ${PRODUCT_STATUSES.join(", ")}`,
    );
  }
  return value as ProductStatus;
}

const createSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  price_cents: z.number().int().nonnegative(),
  category: z.string().min(1).optional(),
  tax_class: taxClassSchema.optional(),
  barcode: z.string().min(1).nullable().optional(),
  status: statusSchema.optional(),
});

const updateSchema = z
  .object({
    name: z.string().min(1).optional(),
    price_cents: z.number().int().nonnegative().optional(),
    category: z.string().min(1).optional(),
    tax_class: taxClassSchema.optional(),
    barcode: z.string().min(1).nullable().optional(),
    status: statusSchema.optional(),
  })
  .refine((o) => Object.keys(o).length > 0, {
    message: "at least one field is required",
  });

function parseInt0(value: unknown): number | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function readQuery(req: Request) {
  const category = typeof req.query.category === "string" ? req.query.category : undefined;
  const status = readStatusFilter(req.query.status);
  return {
    category,
    status,
    limit: parseInt0(req.query.limit),
    offset: parseInt0(req.query.offset),
  };
}

export function registerRoutes(router: Router, service: CatalogService): void {
  router.post(
    "/",
    handler(async (req, res) => {
      const body = parseBody(createSchema, req.body);
      const product = await service.create({
        ...body,
        tax_class: body.tax_class as TaxClass | undefined,
        status: body.status as ProductStatus | undefined,
      });
      res.status(201).json(product);
    }),
  );

  router.get(
    "/",
    handler(async (req, res) => {
      const page = await service.list(readQuery(req));
      res.json(page);
    }),
  );

  router.get(
    "/:id",
    handler(async (req, res) => {
      const id = String(req.params.id);
      const product = await service.get(id);
      if (!product) throw notFound(`product '${id}' not found`);
      res.json(product);
    }),
  );

  router.patch(
    "/:id",
    handler(async (req, res) => {
      const body = parseBody(updateSchema, req.body);
      const product = await service.update(String(req.params.id), body);
      res.json(product);
    }),
  );

  router.delete(
    "/:id",
    handler(async (req, res) => {
      const product = await service.archive(String(req.params.id));
      res.json(product);
    }),
  );
}
