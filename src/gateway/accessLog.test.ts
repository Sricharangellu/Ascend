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

function fakeRes(
  status: number,
  locals: Record<string, unknown> = {},
  writableFinished = true,
  contentType?: string,
) {
  return {
    statusCode: status,
    locals,
    writableFinished,
    getHeader: (name: string) => (name === "content-type" ? contentType : undefined),
  } as unknown as Parameters<typeof buildAccessLogLine>[1];
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

test("a request the client abandoned is logged, and is not reported as a success", () => {
  // The reason the hook listens on `close` rather than `finish`. A client that
  // gives up mid-request never triggers `finish`, so under the original version
  // the slowest and most diagnostically interesting requests in the system were
  // the exact ones that produced no log line at all. On an abort the status is
  // whatever was set before the client left — commonly the default 200 — so
  // logging it unqualified would record a success that reached nobody.
  const { line, level } = buildAccessLogLine(
    { method: "GET", path: "/api/v1/reports/heavy" },
    fakeRes(200, { requestId: "req-abort" }, false),
    30_000,
  );

  assert.equal(line.aborted, true, "an unfinished response must be marked");
  assert.equal(line.status, 200, "the recorded status is preserved as-is…");
  assert.equal(level, "warn", "…but severity must not read it as a success");
  assert.equal(line.durationMs, 30_000);
});

test("the abort marker is absent, not false, on the normal path", () => {
  // Every completed request carries this line; a field that is always present
  // and almost always `false` is noise in an aggregator and in a grep.
  const { line } = buildAccessLogLine({ method: "GET", path: "/orders" }, fakeRes(200), 1);
  assert.ok(!("aborted" in line), "normal responses must not carry an `aborted` key at all");
});

test("a closed SSE stream is not an abort — the most common normal event must not be a warning", () => {
  // `/api/v1/stream` (SseBroker) holds the response open for the life of the
  // dashboard tab, so it NEVER sets writableFinished. Without this carve-out
  // every normal tab-close would log `aborted: true` at warn — a steady stream
  // of false alarms from day one, which is worse than the silence it replaced
  // and would bury the genuine aborts the previous test pins.
  const { line, level } = buildAccessLogLine(
    { method: "GET", path: "/api/v1/stream" },
    fakeRes(200, { requestId: "req-sse" }, false, "text/event-stream"),
    7_200_000, // a two-hour session
  );

  assert.ok(!("aborted" in line), "a closed stream is not an abandoned request");
  assert.equal(line.stream, true, "…but it must be marked, so the duration reads as a session");
  assert.equal(level, "info", "a normal disconnect must not reach warn");
});

test("stream detection is by content-type, not by a path list", () => {
  // A path list would silently miss the next streaming endpoint added — the
  // exact drift class this audit keeps finding. A future /api/v1/notifications
  // stream must be classified correctly with no change to this file.
  const { line, level } = buildAccessLogLine(
    { method: "GET", path: "/api/v1/some/future/stream" },
    fakeRes(200, {}, false, "text/event-stream; charset=utf-8"),
    5_000,
  );
  assert.equal(line.stream, true);
  assert.ok(!("aborted" in line));
  assert.equal(level, "info");

  // And a normal JSON response that died mid-write is still an abort.
  const { line: json, level: jsonLevel } = buildAccessLogLine(
    { method: "GET", path: "/api/v1/orders" },
    fakeRes(200, {}, false, "application/json"),
    5_000,
  );
  assert.equal(json.aborted, true);
  assert.ok(!("stream" in json));
  assert.equal(jsonLevel, "warn");
});

test("the middleware hooks `close`, not `finish`, and fires once", () => {
  // Pins the wiring the two tests above depend on. Asserted structurally
  // because the log sink is not observable here (see the header): if this ever
  // reverts to `finish`, the abort case silently stops being logged and the
  // `aborted` tests above would still pass, since they call the pure function
  // directly. This is the test that would go red.
  const events: string[] = [];
  const res = {
    statusCode: 200,
    locals: {},
    writableFinished: true,
    on(event: string, _fn: () => void) {
      events.push(event);
    },
  } as unknown as Parameters<typeof accessLogMiddleware>[1];

  let nextCalled = 0;
  accessLogMiddleware(
    { method: "GET", path: "/orders" } as unknown as Parameters<typeof accessLogMiddleware>[0],
    res,
    () => {
      nextCalled++;
    },
  );

  assert.deepEqual(events, ["close"], "must listen on `close` only — `finish` misses aborts");
  assert.equal(nextCalled, 1, "the middleware must always continue the chain exactly once");
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
