import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { buildApp, type App } from "./app.js";
import { QueueProducer } from "./orchestration/queues/queue-producer.js";
import { QueueNames } from "./orchestration/queues/queue-names.js";

// ─── GET /jobs/tick (ACPA M1.2) — cron-driven job runtime for serverless ─────

let __seq = 0;
const __schema = () => `tick_${process.pid}_${Date.now().toString(36)}_${__seq++}`;
async function freshApp(): Promise<App> { return buildApp({ schema: __schema() }); }

/** Unauthenticated infra endpoint — the per-module test-request helpers attach
 *  a tenant bearer token and rewrite /api paths, so use a bare HTTP client. */
function get(app: App, path: string, headers: Record<string, string> = {}): Promise<{ status: number; json: any }> {
  return new Promise((resolve, reject) => {
    const server = app.express.listen(0, () => {
      const { port } = server.address() as { port: number };
      const req = http.request({ host: "127.0.0.1", port, path, method: "GET", headers }, (res) => {
        let data = "";
        res.on("data", (c: Buffer) => (data += c));
        res.on("end", () => {
          server.close();
          resolve({ status: res.statusCode ?? 0, json: data ? JSON.parse(data) : null });
        });
      });
      req.on("error", (err) => { server.close(); reject(err); });
      req.end();
    });
  });
}

test("tick requires the CRON_SECRET bearer when configured", async () => {
  const app = await freshApp();
  process.env["CRON_SECRET"] = "tick-test-secret";
  try {
    assert.equal((await get(app, "/jobs/tick")).status, 401);
    assert.equal((await get(app, "/jobs/tick", { authorization: "Bearer wrong" })).status, 401);
    const ok = await get(app, "/jobs/tick", { authorization: "Bearer tick-test-secret" });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.status, "ok");
  } finally {
    delete process.env["CRON_SECRET"];
  }
});

// `.env.example` has documented JOBS_TICK_SECRET (sent as X-Jobs-Tick-Secret)
// as an alternative to Vercel's CRON_SECRET since the endpoint existed, but
// nothing read it — an operator on a non-Vercel host who set only that var got
// a 503 in production and no background jobs, silently.
test("tick accepts JOBS_TICK_SECRET via X-Jobs-Tick-Secret", async () => {
  const app = await freshApp();
  process.env["JOBS_TICK_SECRET"] = "tick-header-secret";
  try {
    assert.equal((await get(app, "/jobs/tick")).status, 401);
    assert.equal((await get(app, "/jobs/tick", { "x-jobs-tick-secret": "wrong" })).status, 401);
    // The Vercel-style bearer must NOT be accepted when only JOBS_TICK_SECRET is set.
    assert.equal((await get(app, "/jobs/tick", { authorization: "Bearer tick-header-secret" })).status, 401);
    const ok = await get(app, "/jobs/tick", { "x-jobs-tick-secret": "tick-header-secret" });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.status, "ok");
  } finally {
    delete process.env["JOBS_TICK_SECRET"];
  }
});

test("tick accepts either credential when both are configured", async () => {
  const app = await freshApp();
  process.env["CRON_SECRET"] = "bearer-secret";
  process.env["JOBS_TICK_SECRET"] = "header-secret";
  try {
    assert.equal((await get(app, "/jobs/tick", { authorization: "Bearer bearer-secret" })).status, 200);
    assert.equal((await get(app, "/jobs/tick", { "x-jobs-tick-secret": "header-secret" })).status, 200);
    assert.equal((await get(app, "/jobs/tick", { authorization: "Bearer header-secret" })).status, 401);
    assert.equal((await get(app, "/jobs/tick")).status, 401);
  } finally {
    delete process.env["CRON_SECRET"];
    delete process.env["JOBS_TICK_SECRET"];
  }
});

test("tick drains due jobs and reconciles pending outbox rows in one call", async () => {
  const app = await freshApp();

  // A due job — the registered idempotency-expiry sweep (harmless, self-re-
  // enqueues 6 h out, so exactly one run is due now).
  await new QueueProducer(app.db).enqueue({
    type: QueueNames.IDEMPOTENCY_EXPIRY,
    tenantId: "system",
    payload: {},
    maxAttempts: 3,
  });

  // A crash-orphaned outbox row older than the reconciler's in-flight window,
  // with a durable consumer waiting for it.
  let redelivered = 0;
  app.outbox.onDurable("tick.test_event", async () => { redelivered++; });
  await app.db.query(
    `INSERT INTO event_outbox (id, tenant_id, type, payload, aggregate_id, occurred_at, dispatched, status, attempts, created_at)
     VALUES ('obx_tick_1', 'tnt_demo', 'tick.test_event', '{}', 'obx_tick_1', @occ, TRUE, 'pending', 0, @past)`,
    { occ: new Date().toISOString(), past: Date.now() - 60_000 },
  );

  const r = await get(app, "/jobs/tick"); // CRON_SECRET unset + NODE_ENV=test → open
  assert.equal(r.status, 200);
  assert.equal(r.json.jobsProcessed, 1);
  assert.equal(r.json.outbox.delivered, 1);
  assert.equal(redelivered, 1);

  const job = await app.db.one<{ status: string }>(
    "SELECT status FROM job_queue WHERE type = @t AND status = 'completed' LIMIT 1",
    { t: QueueNames.IDEMPOTENCY_EXPIRY },
  );
  assert.ok(job, "the due job must be claimed and completed by the tick");
  const row = await app.db.one<{ status: string }>(
    "SELECT status FROM event_outbox WHERE id = 'obx_tick_1'", {},
  );
  assert.equal(row!.status, "delivered");

  // A second tick is a safe no-op: nothing due, nothing pending.
  const again = await get(app, "/jobs/tick");
  assert.equal(again.json.jobsProcessed, 0);
  assert.equal(again.json.outbox.delivered, 0);
  assert.equal(redelivered, 1);
});
