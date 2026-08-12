import type { Router, Request, Response } from "express";
import { z } from "zod";
import { handler, parseBody, HttpError } from "../../shared/http.js";
import { requireRole, requireModule } from "../../gateway/auth.js";
import type { AuthPayload } from "../../gateway/auth.js";
import type { AiAssistantService } from "./service.js";
import { QueueProducer } from "../../orchestration/queues/queue-producer.js";
import { QueueNames } from "../../orchestration/queues/queue-names.js";

function tenantId(res: Response): string {
  return (res.locals["auth"] as AuthPayload).tenantId;
}
function actor(res: Response): { id: string | null; role: string } {
  const auth = res.locals["auth"] as AuthPayload;
  return { id: auth.userId ?? null, role: auth.role };
}

const askSchema = z.object({ question: z.string().min(1).max(2000) });
const decideSchema = z.object({});

export function registerRoutes(router: Router, service: AiAssistantService): void {
  // Gated as an enterprise add-on module — a tenant's business-type bundle
  // must include it (see shared/moduleRegistry.ts) or it 403s, same isolation
  // boundary every other vertical module uses.
  router.use(requireModule("ai_assistant"));

  // POST /ask — enqueues async processing (DESIGN_PRINCIPLES.md: AI
  // processing is async-by-default). Returns immediately with a
  // conversation id to poll; never calls the LLM synchronously in-request.
  router.post(
    "/ask",
    handler(async (req: Request, res: Response) => {
      const body = parseBody(askSchema, req.body);
      const auth = res.locals["auth"] as AuthPayload;
      const db = res.locals["db"];
      const conv = await service.createConversation(tenantId(res), auth.userId ?? "unknown", body.question);
      const producer = new QueueProducer(db);
      await producer.enqueue({
        type: QueueNames.AI_ASSISTANT_ANSWER,
        tenantId: tenantId(res),
        payload: { conversationId: conv.id },
        maxAttempts: 2,
      });
      res.status(202).json({ conversationId: conv.id, status: conv.status });
    }),
  );

  // POST /briefing — the dashboard's "AI Command Center" narration. Same
  // async-by-default pipeline as /ask (202 + poll /conversations/:id), just
  // with the sentinel question instead of user-typed text; the job handler
  // recognizes it and fetches the recommendations report to narrate.
  router.post(
    "/briefing",
    handler(async (req: Request, res: Response) => {
      const auth = res.locals["auth"] as AuthPayload;
      const db = res.locals["db"];
      const conv = await service.createBriefing(tenantId(res), auth.userId ?? "unknown");
      const producer = new QueueProducer(db);
      await producer.enqueue({
        type: QueueNames.AI_ASSISTANT_ANSWER,
        tenantId: tenantId(res),
        payload: { conversationId: conv.id },
        maxAttempts: 2,
      });
      res.status(202).json({ conversationId: conv.id, status: conv.status });
    }),
  );

  router.get(
    "/conversations",
    handler(async (_req: Request, res: Response) => {
      res.json({ items: await service.listConversations(tenantId(res)) });
    }),
  );

  router.get(
    "/conversations/:id",
    handler(async (req: Request, res: Response) => {
      const conv = await service.getConversation(tenantId(res), String(req.params["id"]));
      if (!conv) throw new HttpError(404, "not_found", "Conversation not found.");
      res.json(conv);
    }),
  );

  router.get(
    "/recommendations",
    handler(async (req: Request, res: Response) => {
      const status = typeof req.query["status"] === "string" ? req.query["status"] : undefined;
      res.json({ items: await service.listRecommendations(tenantId(res), status) });
    }),
  );

  // Approve/reject require manager+ — this is the human-approval gate the
  // charter and DESIGN_PRINCIPLES.md both require for any action that
  // changes business data. The AI never reaches these directly.
  router.post(
    "/recommendations/:id/approve",
    requireRole("manager"),
    handler(async (req: Request, res: Response) => {
      parseBody(decideSchema, req.body ?? {});
      const rec = await service.decide(tenantId(res), String(req.params["id"]), "approved", actor(res));

      // Delegate the one write action (creating a PO) to inventory's own
      // existing, tested endpoint via an internal call carrying the same
      // auth — this module never writes to purchasing's tables directly
      // (modules integrate via shared tables/events, not by importing each
      // other's service code; an internal HTTP call to an already-public,
      // already-permission-checked endpoint is the safe version of that for
      // an action this module doesn't own).
      if (rec.actionType === "create_po" && rec.sourceRef) {
        const backendUrl = process.env["BACKEND_URL"] ?? process.env["APP_URL"] ?? "http://localhost:3000";
        const authHeader = req.headers["authorization"];
        try {
          const resp = await fetch(`${backendUrl}/api/v1/inventory/pipeline/reorder-alerts/${rec.sourceRef}/create-po`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(authHeader ? { Authorization: authHeader as string } : {}),
            },
          });
          const poResult = await resp.json().catch(() => null);
          res.json({ recommendation: rec, poResult: resp.ok ? poResult : null, poError: resp.ok ? null : poResult });
          return;
        } catch (err) {
          // The recommendation is still approved either way — PO creation
          // failing is reported, not silently swallowed, but doesn't undo
          // the approval decision itself (that's a human record of intent).
          res.json({ recommendation: rec, poResult: null, poError: err instanceof Error ? err.message : "PO creation failed" });
          return;
        }
      }
      res.json({ recommendation: rec });
    }),
  );

  router.post(
    "/recommendations/:id/reject",
    requireRole("manager"),
    handler(async (req: Request, res: Response) => {
      parseBody(decideSchema, req.body ?? {});
      const rec = await service.decide(tenantId(res), String(req.params["id"]), "rejected", actor(res));
      res.json({ recommendation: rec });
    }),
  );
}
