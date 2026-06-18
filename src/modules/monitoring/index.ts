import { z } from "zod";
import type { PosModule } from "../types.js";
import { handler, parseBody } from "../../shared/http.js";
import { logError, logInfo } from "../../shared/monitoring.js";

const ErrorReportBody = z.object({
  message: z.string().min(1).max(2000),
  source: z.string().max(500).optional(),
  stack: z.string().max(5000).optional(),
  level: z.enum(["error", "warning"]).default("error"),
  context: z.record(z.unknown()).optional(),
  timestamp: z.string().optional(),
  userAgent: z.string().max(500).optional(),
  url: z.string().max(500).optional(),
});

/** Monitoring module — receives client-side error reports and emits structured logs. */
export const monitoringModule: PosModule = {
  name: "monitoring",
  migrations: [],
  register({ router }) {
    // POST /api/v1/monitoring/errors — accepts client-side error reports.
    // Auth is optional: unauthenticated reports are accepted (pre-login errors matter).
    router.post(
      "/errors",
      handler(async (req, res) => {
        const body = parseBody(ErrorReportBody, req.body);
        const auth = res.locals["auth"] as { tenantId?: string; userId?: string } | undefined;

        if (body.level === "error") {
          const fakeErr = new Error(body.message);
          fakeErr.stack = body.stack ? `${body.message}\n${body.stack}` : body.message;
          logError(fakeErr, {
            tenantId: auth?.tenantId,
            path: body.source,
            ...(body.context as Record<string, unknown> | undefined ?? {}),
          });
        } else {
          logInfo(`[client-warning] ${body.message}`, {
            source: body.source,
            tenantId: auth?.tenantId,
            url: body.url,
          });
        }

        res.status(202).json({ ok: true });
      }),
    );

    // GET /api/v1/monitoring/health — lightweight liveness probe.
    router.get(
      "/health",
      handler(async (_req, res) => {
        res.json({ status: "ok", uptime: process.uptime(), timestamp: new Date().toISOString() });
      }),
    );
  },
};
