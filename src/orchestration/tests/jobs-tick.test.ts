/**
 * jobs-tick.test.ts — GET/POST /api/jobs/tick
 *
 * This deploy target (Vercel serverless) does not guarantee an always-on
 * background process, so background jobs (trial-expiry sweep, outbox relay,
 * etc.) can also be driven by an external scheduler hitting this endpoint —
 * vercel.json's `crons` entry hits it daily — instead of relying solely on
 * QueueConsumer's in-process poll interval. Covers: fail-closed when no
 * secret is configured, rejects a wrong secret, processes a due job with the
 * generic X-Jobs-Tick-Secret header, and with Vercel Cron's own
 * `Authorization: Bearer <CRON_SECRET>` convention over GET.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp, type App } from "../../app.js";
import { QueueProducer } from "../queues/queue-producer.js";
import { QueueNames } from "../queues/queue-names.js";

let __seq = 0;
const __schema = () => `tick_test_${process.pid}_${Date.now().toString(36)}_${__seq++}`;

async function freshApp(): Promise<App> {
  process.env["JWT_SECRET"] = "test-jwt-secret-tick";
  return buildApp({ schema: __schema() });
}

const request = (await import("../../identity/test-request.js")).default;

test("POST /api/jobs/tick is disabled (503) when neither JOBS_TICK_SECRET nor CRON_SECRET is configured", async () => {
  const app = await freshApp();
  const savedTick = process.env["JOBS_TICK_SECRET"];
  const savedCron = process.env["CRON_SECRET"];
  delete process.env["JOBS_TICK_SECRET"];
  delete process.env["CRON_SECRET"];
  try {
    const r = await request(app.express, "POST", "/api/jobs/tick");
    assert.equal(r.status, 503);
    assert.equal(r.json.error.code, "jobs_tick_disabled");
  } finally {
    if (savedTick !== undefined) process.env["JOBS_TICK_SECRET"] = savedTick;
    if (savedCron !== undefined) process.env["CRON_SECRET"] = savedCron;
  }
});

test("POST /api/jobs/tick rejects a missing/incorrect secret", async () => {
  const app = await freshApp();
  process.env["JOBS_TICK_SECRET"] = "correct-secret";
  try {
    const noHeader = await request(app.express, "POST", "/api/jobs/tick");
    assert.equal(noHeader.status, 401);

    const wrongHeader = await request(app.express, "POST", "/api/jobs/tick", undefined, {
      "x-jobs-tick-secret": "wrong-secret",
    });
    assert.equal(wrongHeader.status, 401);
  } finally {
    delete process.env["JOBS_TICK_SECRET"];
  }
});

test("POST /api/jobs/tick processes a due job with the correct secret", async () => {
  const app = await freshApp();
  process.env["JOBS_TICK_SECRET"] = "correct-secret";
  try {
    // Enqueue a due system job directly (background auto-seeding is disabled
    // in test env via FINDER_BACKGROUND_JOBS=false, so nothing is queued yet).
    const producer = new QueueProducer(app.db);
    await producer.enqueue({
      type: QueueNames.TRIAL_EXPIRY,
      tenantId: "system",
      payload: {},
      runAt: Date.now(),
      maxAttempts: 3,
    });

    const r = await request(app.express, "POST", "/api/jobs/tick", undefined, {
      "x-jobs-tick-secret": "correct-secret",
    });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.ok(r.json.processed >= 1, "at least the seeded job was processed");

    const row = await app.db.one<{ status: string }>(
      "SELECT status FROM job_queue WHERE type = @type ORDER BY created_at DESC LIMIT 1",
      { type: QueueNames.TRIAL_EXPIRY },
    );
    assert.equal(row?.status, "completed");
  } finally {
    delete process.env["JOBS_TICK_SECRET"];
  }
});

test("GET /api/jobs/tick honors Vercel Cron's Authorization: Bearer <CRON_SECRET> convention", async () => {
  const app = await freshApp();
  process.env["CRON_SECRET"] = "vercel-cron-secret";
  try {
    const producer = new QueueProducer(app.db);
    await producer.enqueue({
      type: QueueNames.TRIAL_EXPIRY,
      tenantId: "system",
      payload: {},
      runAt: Date.now(),
      maxAttempts: 3,
    });

    const wrong = await request(app.express, "GET", "/api/jobs/tick", undefined, {
      authorization: "Bearer wrong-secret",
    });
    assert.equal(wrong.status, 401);

    const r = await request(app.express, "GET", "/api/jobs/tick", undefined, {
      authorization: "Bearer vercel-cron-secret",
    });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.ok(r.json.processed >= 1);
  } finally {
    delete process.env["CRON_SECRET"];
  }
});
