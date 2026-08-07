import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../app.js";

const request = (await import("../identity/test-request.js")).default;

let seq = 0;
const schema = () => `ops_test_${process.pid}_${Date.now().toString(36)}_${seq++}`;

const ORIGINAL_ENV = {
  NODE_ENV: process.env["NODE_ENV"],
  JWT_SECRET: process.env["JWT_SECRET"],
  DATABASE_URL: process.env["DATABASE_URL"],
  PG_SSL: process.env["PG_SSL"],
  METRICS_TOKEN: process.env["METRICS_TOKEN"],
};

function restoreEnv() {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

test("production metrics are unavailable when METRICS_TOKEN is not configured", async () => {
  process.env["NODE_ENV"] = "production";
  process.env["JWT_SECRET"] = "test-secret-finder-pos-production";
  process.env["DATABASE_URL"] ??= "postgresql://unused/ops_test";
  process.env["PG_SSL"] = "false";
  delete process.env["METRICS_TOKEN"];

  const app = await buildApp({ schema: schema() });
  const res = await request(app.express, "GET", "/metrics");

  assert.equal(res.status, 503);
  assert.equal(res.json, "metrics_unconfigured\n");

  await app.db.close();
  restoreEnv();
});

test("production metrics require the configured bearer token", async () => {
  process.env["NODE_ENV"] = "production";
  process.env["JWT_SECRET"] = "test-secret-finder-pos-production";
  process.env["DATABASE_URL"] ??= "postgresql://unused/ops_test";
  process.env["PG_SSL"] = "false";
  process.env["METRICS_TOKEN"] = "metrics-token-test";

  const app = await buildApp({ schema: schema() });

  const missing = await request(app.express, "GET", "/metrics");
  assert.equal(missing.status, 401);

  const wrong = await request(app.express, "GET", "/metrics", undefined, { Authorization: "Bearer wrong" });
  assert.equal(wrong.status, 401);

  const ok = await request(app.express, "GET", "/metrics", undefined, { Authorization: "Bearer metrics-token-test" });
  assert.equal(ok.status, 200);
  assert.match(String(ok.json), /http_requests_total/);

  await app.db.close();
  restoreEnv();
});

// The scrape has to carry the four subsystems that could previously fail with
// no external signal at all: the Postgres pool, the job queue, the ADR-003
// outbox, and the Node runtime. Before this, /metrics exposed HTTP RED counters
// and POS/UOM counters only — a stalled job drain or a growing undispatched
// outbox (money-adjacent side effects silently not happening) was observable
// only by querying the database by hand.
test("metrics expose pool, job-queue, outbox and runtime gauges", async () => {
  const app = await buildApp({ schema: schema() });
  const res = await request(app.express, "GET", "/metrics");
  assert.equal(res.status, 200);
  const body = String(res.json);

  for (const metric of [
    "db_pool_connections",
    "db_pool_max",
    "job_queue_depth",
    "job_queue_oldest_due_age_ms",
    "outbox_pending_events",
    "outbox_oldest_pending_age_ms",
    "process_uptime_seconds",
    "nodejs_heap_used_bytes",
    "nodejs_eventloop_delay_ms",
    "ascend_build_info",
  ]) {
    assert.match(body, new RegExp(`^${metric}`, "m"), `${metric} must be exposed`);
  }

  // Every gauge needs its HELP/TYPE pair or a scraper rejects the exposition.
  assert.match(body, /^# TYPE db_pool_connections gauge$/m);
  assert.match(body, /^# TYPE outbox_pending_events gauge$/m);
  // Empty tables must report a real 0, not be silently omitted — "no pending
  // work" and "the collector is broken" have to look different on a dashboard.
  assert.match(body, /^outbox_pending_events 0$/m);
  assert.match(body, /^job_queue_depth\{status="pending"\} \d+$/m);

  await app.db.close();
});

// A scrape must never take the service down with it. If the gauge queries fail
// (fresh schema mid-migration, revoked grant, dropped table), the endpoint still
// has to answer 200 with the counters it can render — a monitoring endpoint that
// 500s during an incident removes the one signal you need most.
test("metrics still render when the gauge queries fail", async () => {
  const app = await buildApp({ schema: schema() });
  await app.db.exec("DROP TABLE IF EXISTS job_queue CASCADE");
  await app.db.exec("DROP TABLE IF EXISTS event_outbox CASCADE");

  const res = await request(app.express, "GET", "/metrics");
  assert.equal(res.status, 200, "a failed gauge collection must not fail the scrape");
  const body = String(res.json);
  assert.match(body, /^http_requests_total/m, "HTTP counters still render");
  assert.match(body, /^process_uptime_seconds/m, "runtime gauges still render");
  assert.doesNotMatch(body, /^job_queue_depth/m, "an uncollectable gauge is absent, never a fake 0");
  assert.doesNotMatch(body, /^outbox_pending_events/m);

  await app.db.close();
});
