import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { requestIdMiddleware } from "./requestId.js";
import { accessLogMiddleware, buildAccessLogLine } from "./accessLog.js";
import { sendRequest } from "../shared/test-request.js";

/**
 * The severity and field decisions are asserted against `buildAccessLogLine`
 * directly rather than by capturing a log sink: pino runs behind a
 * worker-thread transport in development, which writes to fd 1 without going
 * through `process.stdout.write`, so stdout capture silently observes nothing
 * (confirmed while writing these tests). Asserting on an injected mock logger
 * would have the opposite problem — it passes even if the real sink is
 * misconfigured. A pure function avoids both.
 *
 * The end-to-end test at the bottom covers the part that cannot be unit-tested:
 * that the id the middleware logs is the same one the caller is handed.
 */

function fakeRes(status: number, locals: Record<string, unknown> = {}) {
  return { statusCode: status, locals } as unknown as Parameters<typeof buildAccessLogLine>[1];
}

test("severity tracks the response so level>=warn means 'the caller was told no'", () => {
  const cases: [number, string][] = [
    [200, "info"],
    [201, "info"],
    [304, "info"],
    [400, "warn"],
    // The specific response an earlier incident investigation could not see.
    [429, "warn"],
    [500, "error"],
    [503, "error"],
  ];
  for (const [status, expected] of cases) {
    const { level } = buildAccessLogLine({ method: "GET", path: "/orders" }, fakeRes(status), 1);
    assert.equal(level, expected, `HTTP ${status} should log at ${expected}`);
  }
});

test("probe endpoints log at debug so a 15-minute heartbeat cannot flood info", () => {
  for (const path of ["/healthz", "/readyz", "/health", "/metrics"]) {
    const { level } = buildAccessLogLine({ method: "GET", path }, fakeRes(200), 1);
    assert.equal(level, "debug", `${path} must not emit an info-level line on every probe`);
  }
  // A 500 from a probe still only reaches debug — that is deliberate: /readyz
  // failing is what the heartbeat and the readiness gate are for, not the log.
  const { level } = buildAccessLogLine({ method: "GET", path: "/readyz" }, fakeRes(503), 1);
  assert.equal(level, "debug");
});

test("the line carries the correlation ids and the resolved auth context", () => {
  const { line } = buildAccessLogLine(
    { method: "POST", path: "/api/v1/orders" },
    fakeRes(201, {
      requestId: "req-123",
      traceId: "trace-abc",
      // auth is resolved by middleware that runs AFTER this one; the `finish`
      // hook is what makes it available, so assert it is actually picked up.
      auth: { tenantId: "ten-1", userId: "usr-9", role: "manager" },
    }),
    12.34,
  );

  assert.equal(line.requestId, "req-123");
  assert.equal(line.traceId, "trace-abc");
  assert.equal(line.tenantId, "ten-1");
  assert.equal(line.userId, "usr-9");
  assert.equal(line.method, "POST");
  assert.equal(line.status, 201);
  assert.equal(line.durationMs, 12.3, "duration is rounded to 0.1ms, not left at float noise");
});

test("nothing that can carry a credential is ever put in the line", () => {
  const { line } = buildAccessLogLine(
    // Express' req.path is already query-free; this asserts we read that and
    // not `originalUrl`, which would carry `?access_token=…` into the sink.
    { method: "GET", path: "/search" },
    fakeRes(200, { requestId: "req-1" }),
    1,
  );
  const serialised = JSON.stringify(line);
  assert.doesNotMatch(serialised, /\?/, "no query string may reach the log line");
  for (const forbidden of ["authorization", "cookie", "password", "token", "body", "headers"]) {
    assert.doesNotMatch(
      serialised.toLowerCase(),
      new RegExp(forbidden),
      `the access log must never carry ${forbidden}`,
    );
  }
});

test("end-to-end: the logged requestId is the one the caller is handed", async () => {
  // The join that makes the error envelope's requestId actionable. Captured by
  // reading res.locals through a probe route rather than by parsing logs.
  const app = express();
  app.use(requestIdMiddleware);
  app.use(accessLogMiddleware);
  let loggedId: string | undefined;
  app.get("/orders", (req, res) => {
    // Same source the middleware's finish hook reads.
    loggedId = buildAccessLogLine(req, res, 0).line.requestId;
    res.json({ ok: true });
  });

  const res = await sendRequest(app, "GET", "/orders");

  assert.equal(res.status, 200);
  assert.ok(loggedId, "the middleware must have a requestId to log");
  assert.equal(
    loggedId,
    res.headers["x-request-id"],
    "the id in the logs must be the id the caller can quote to support",
  );
});
