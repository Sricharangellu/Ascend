import type { Router, Request } from "express";
import { z } from "zod";
import { handler, parseBody, badRequest } from "../../shared/http.js";
import type { SyncEngine, SyncStatus } from "./service.js";

const onlineSchema = z.object({ online: z.boolean() });

const SYNC_STATUSES: readonly SyncStatus[] = ["pending", "synced", "failed"];

function parseInt0(value: unknown): number | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function readQueueQuery(req: Request) {
  let status: SyncStatus | undefined;
  if (typeof req.query.status === "string" && req.query.status !== "") {
    if (!SYNC_STATUSES.includes(req.query.status as SyncStatus)) {
      throw badRequest(
        `invalid status '${req.query.status}'; expected one of ${SYNC_STATUSES.join(", ")}`,
      );
    }
    status = req.query.status as SyncStatus;
  }
  return {
    status,
    limit: parseInt0(req.query.limit),
    offset: parseInt0(req.query.offset),
  };
}

export function registerRoutes(router: Router, engine: SyncEngine): void {
  router.get(
    "/status",
    handler(async (_req, res) => {
      res.json(await engine.status());
    }),
  );

  router.post(
    "/online",
    handler(async (req, res) => {
      const { online } = parseBody(onlineSchema, req.body);
      engine.setOnline(online);
      let drained = { attempted: 0, synced: 0, failed: 0 };
      if (online) drained = await engine.pushSync({ forceAll: true });
      res.json({ online: engine.isOnline(), drained, ...(await engine.counts()) });
    }),
  );

  router.post(
    "/push",
    handler(async (_req, res) => {
      const result = await engine.pushSync({ forceAll: true });
      res.json({ online: engine.isOnline(), ...result, ...(await engine.counts()) });
    }),
  );

  router.get(
    "/queue",
    handler(async (req, res) => {
      res.json(await engine.list(readQueueQuery(req)));
    }),
  );

  router.post(
    "/pull",
    handler((_req, res) => {
      res.json({ pulled: 0, note: "pull sync stub — Year 2" });
    }),
  );
}
