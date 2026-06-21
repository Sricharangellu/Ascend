import type { Router, Response, Request } from "express";
import { handler } from "../../shared/http.js";
import type { AuthPayload } from "../../gateway/auth.js";
import type { AuditLogService } from "./service.js";

function tenantId(res: Response): string {
  return (res.locals["auth"] as AuthPayload).tenantId;
}

function readInt(val: unknown, fallback: number): number {
  const n = Number(val);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

export function registerRoutes(router: Router, service: AuditLogService): void {
  router.get(
    "/",
    handler(async (req: Request, res) => {
      const actor = typeof req.query.actor === "string" ? req.query.actor : undefined;
      const resourceType = typeof req.query.resource_type === "string" ? req.query.resource_type || undefined : undefined;
      const action = typeof req.query.action === "string" ? req.query.action || undefined : undefined;
      const limit = readInt(req.query.limit, 20);
      const offset = readInt(req.query.offset, 0);
      res.json(await service.list(tenantId(res), { actor, resourceType, action, limit, offset }));
    }),
  );
}
