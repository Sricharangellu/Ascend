import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { buildApp, type App } from "../../app.js";
import { QueueNames } from "../queues/queue-names.js";

/**
 * M0 — serverless-safe job execution (real Postgres).
 *
 * /api/jobs/tick is the external heartbeat that drains the job queue on
 * serverless, where the in-process setInterval consumer is not guaranteed to
 * run. These tests prove the endpoint: enforces its CRON_SECRET bearer,
 * drains due jobs through registered handlers, dead-letters unknown job
 * types after max attempts, reports the dead-letter count, and is safe to
 * call repeatedly (idempotent when nothing is due).
 */

let __seq = 0;
const __schema = () => `tick_${process.pid}_${Date.now().toString(36)}_${__seq++}`;

async function freshApp(): Promise<App> {
  return await buildApp({ schema: __schema() });
}

function tick(
  app: App,
  opts: { bearer?: string; method?: string } = {},
): Promise<{ status: number; json: any }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app.express);
    server.listen(0, () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        reject(new Error("failed to bind test server"));
        return;
      }
      const headers: Record<string, string> = { connection: "close" };
      if (opts.bearer !== undefined) headers.authorization = `Bearer ${opts.bearer}`;
      const req = http.request(
        { host: "127.0.0.1", port: address.port, method: opts.method ?? "POST", path: "/api/jobs/tick", headers },
        (res) => {
          let data = "";
          res.setEncoding("utf8");
          res.on("data", (c) => (data += c));
          res.on("end", () => {
            server.close();
            let json: any;
            try { json = data ? JSON.parse(data) : undefined; } catch { json = data; }
            resolve({ status: res.statusCode ?? 0, json });
          });
        },
      );
      req.on("error", (err) => { server.close(); reject(err); });
      req.end();
    });
  });
}

async function insertJob(app: App, row: { id: string; type: string; runAt: number; maxAttempts: number }): Promise<void> {
  await app.db.query(
    `INSERT INTO job_queue (id, tenant_id, type, payload, status, attempts, max_attempts, run_at, created_at)
     VALUES (@id, 'system', @type, '{}', 'pending', 0, @maxAttempts, @runAt, @now)`,
    { id: row.id, type: row.type, maxAttempts: row.maxAttempts, runAt: row.runAt, now: Date.now() },
  );
}

test("jobs/tick: enforces CRON_SECRET bearer; open only when secret unset outside production", async () => {
  process.env["CRON_SECRET"] = "tick-secret-for-tests";
  const app = await freshApp();

  const missing = await tick(app);
  assert.equal(missing.status, 401, "missing bearer must be rejected");

  const wrong = await tick(app, { bearer: "nope" });
  assert.equal(wrong.status, 401, "wrong bearer must be rejected");

  const right = await tick(app, { bearer: "tick-secret-for-tests" });
  assert.equal(right.status, 200, "correct bearer is accepted");
  assert.ok(typeof right.json.processed === "number");

  // Dev/test convenience: unset secret leaves the endpoint open (mirrors /metrics).
  delete process.env["CRON_SECRET"];
  const open = await tick(app);
  assert.equal(open.status, 200, "unset secret outside production is open");

  await app.db.close();
});

test("jobs/tick: drains due jobs, dead-letters unknown types, and repeat ticks are idempotent", async () => {
  delete process.env["CRON_SECRET"];
  const app = await freshApp();
  const past = Date.now() - 1_000;

  // A real registered handler (safe no-op on an empty DB; re-enqueues itself in the future).
  await insertJob(app, { id: "job_tick_real", type: QueueNames.IDEMPOTENCY_EXPIRY, runAt: past, maxAttempts: 3 });
  // No handler registered for this type; max_attempts=1 → terminal 'failed' (dead letter).
  await insertJob(app, { id: "job_tick_orphan", type: "test.no_such_handler", runAt: past, maxAttempts: 1 });

  const first = await tick(app);
  assert.equal(first.status, 200);
  assert.ok(first.json.processed >= 2, `first tick drains both due jobs (got ${first.json.processed})`);

  const real = await app.db.one<{ status: string }>(
    "SELECT status FROM job_queue WHERE id = 'job_tick_real'",
  );
  assert.equal(real?.status, "completed", "registered handler job completes");

  const orphan = await app.db.one<{ status: string; attempts: number; max_attempts: number }>(
    "SELECT status, attempts, max_attempts FROM job_queue WHERE id = 'job_tick_orphan'",
  );
  assert.equal(orphan?.status, "failed", "unknown-type job is terminally failed");
  assert.ok((orphan?.attempts ?? 0) >= (orphan?.max_attempts ?? 1), "attempts exhausted → dead letter");

  // Second tick: nothing due (completed / dead / future self-requeue) — idempotent.
  const second = await tick(app);
  assert.equal(second.status, 200);
  assert.equal(second.json.processed, 0, "repeat tick with nothing due processes nothing");
  assert.ok(second.json.deadLettered >= 1, "dead-letter count is surfaced for alerting");

  await app.db.close();
});
