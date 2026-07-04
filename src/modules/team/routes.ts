import { z } from "zod";
import type { Router, Response } from "express";
import { handler, parseBody, HttpError } from "../../shared/http.js";
import type { AuthPayload } from "../../gateway/auth.js";
import type { TeamService } from "./service.js";

function auth(res: Response): AuthPayload {
  return res.locals["auth"] as AuthPayload;
}

function requireManagement(res: Response): string {
  const { role, tenantId } = auth(res);
  if (role !== "owner" && role !== "manager") {
    throw new HttpError(403, "forbidden", "team directory requires owner or manager");
  }
  return tenantId;
}

const createMemberSchema = z.object({
  name: z.string().min(1).max(128),
  email: z.string().email(),
  role: z.enum(["cashier", "manager", "owner"]).optional(),
});

export function registerRoutes(router: Router, service: TeamService): void {
  // GET /api/v1/team — owner/manager only.
  router.get(
    "/",
    handler(async (_req, res) => {
      res.json({ items: await service.list(requireManagement(res)) });
    }),
  );

  // POST /api/v1/team — invite a member (owner/manager only). Only an owner
  // may grant the owner role.
  router.post(
    "/",
    handler(async (req, res) => {
      const tenantId = requireManagement(res);
      const body = parseBody(createMemberSchema, req.body);
      if (body.role === "owner" && auth(res).role !== "owner") {
        throw new HttpError(403, "forbidden", "only an owner can grant the owner role");
      }
      res.status(201).json(await service.create(body, tenantId));
    }),
  );

  // GET /api/v1/team/:id — single member (owner/manager only).
  router.get(
    "/:id",
    handler(async (req, res) => {
      res.json(await service.get(String(req.params.id), requireManagement(res)));
    }),
  );
}
