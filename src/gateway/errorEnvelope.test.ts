/**
 * Error envelope contract: every error response carries a `requestId`.
 *
 * Regression guard for a defect that survived because nothing tested it.
 * `src/app.ts` mounted `errorMiddleware` and then `errorEnvelopeMiddleware`,
 * with a comment saying the envelope "must be last". It was last, and it was
 * unreachable — errorMiddleware always responds and never calls `next(err)`.
 * So the documented `{ error: { code, message, requestId } }` contract was
 * never delivered and no error response carried a requestId, leaving a customer
 * report with nothing to correlate against the server logs. The frontend had
 * been reading the field the whole time (web/contexts/StoreAuthContext.tsx).
 *
 * The envelope's behaviour now lives in errorMiddleware itself. These tests
 * pin the three properties that fix has to keep true.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { Request, Response } from "express";
import { buildApp } from "../app.js";
import { errorMiddleware, HttpError } from "../shared/http.js";

// ── Unit fakes ──────────────────────────────────────────────────────────────
// errorMiddleware is a pure function of (err, req, res); driving it directly is
// the only way to exercise the 500 branch, since no route deliberately throws.
interface Captured {
  status: number;
  body: { error: { code: string; message: string; requestId?: string; details?: unknown } };
}

function fakes(requestId = "req-under-test"): {
  req: Request;
  res: Response;
  captured: Captured;
} {
  const captured = { status: 0, body: undefined as unknown } as Captured;
  const req = {
    path: "/api/v1/thing",
    method: "POST",
    headers: {},
  } as unknown as Request;
  const res = {
    locals: { requestId, traceId: "trace-under-test", spanId: "span" },
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(payload: unknown) {
      captured.body = payload as Captured["body"];
      return this;
    },
  } as unknown as Response;
  return { req, res, captured };
}

// ── Integration ─────────────────────────────────────────────────────────────

let server: http.Server;

before(async () => {
  const { express: app } = await buildApp({ schema: `test_errenv_${process.pid}` });
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
});

after(() => {
  server?.close();
});

function get(path: string): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  const addr = server.address() as { port: number };
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "127.0.0.1", port: addr.port, path, method: "GET" },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

test("a real 401 carries a requestId that matches the x-request-id header", async () => {
  // The auth middleware rejects with next(new HttpError(401, ...)), so this
  // travels the same path any error does. It is also the exact probe that
  // ci.yml's smoke-test and uptime.yml already run against production.
  const res = await get("/api/v1/flags");
  assert.equal(res.status, 401);

  const parsed = JSON.parse(res.body) as Captured["body"];
  assert.equal(parsed.error.code, "unauthenticated");

  const requestId = parsed.error.requestId;
  assert.ok(requestId, "401 response body must carry error.requestId");
  assert.notEqual(requestId, "unknown", "requestId must come from requestIdMiddleware, not the fallback");

  // The header and the body must agree — that agreement is the whole point:
  // a customer quotes one, an operator greps the other.
  assert.equal(
    requestId,
    res.headers["x-request-id"],
    "error.requestId must equal the x-request-id response header",
  );
});

// ── Unit ────────────────────────────────────────────────────────────────────

test("validation errors keep their structured details AND gain a requestId", () => {
  // Reordering the two handlers would have satisfied the requestId half while
  // silently dropping `details` — the envelope never forwarded it. The frontend
  // renders per-field validation messages from it, so this assertion is what
  // makes the non-breaking fix non-breaking.
  const { req, res, captured } = fakes();
  const details = [{ field: "email", message: "Invalid email" }];
  errorMiddleware(
    new HttpError(400, "validation_error", "email: Invalid email", details),
    req,
    res,
    () => {},
  );

  assert.equal(captured.status, 400);
  assert.equal(captured.body.error.code, "validation_error");
  assert.equal(captured.body.error.requestId, "req-under-test");
  assert.deepEqual(captured.body.error.details, details);
});

test("an unexpected error returns a requestId and never leaks internals", () => {
  const { req, res, captured } = fakes();
  const secret = "SELECT * FROM users WHERE password_hash = 'leaked'";
  errorMiddleware(new Error(secret), req, res, () => {});

  assert.equal(captured.status, 500);
  assert.equal(captured.body.error.code, "internal");
  assert.equal(captured.body.error.requestId, "req-under-test");

  // Security property that predates this change and must survive it.
  const serialized = JSON.stringify(captured.body);
  assert.ok(!serialized.includes(secret), "500 response must not echo the raw error text");
  assert.ok(!serialized.includes("SELECT"), "500 response must not leak SQL");
});

test("requestId falls back to 'unknown' rather than throwing when locals are absent", () => {
  // Errors raised before requestIdMiddleware runs still have to produce a valid
  // envelope; the previous envelope handler used the same fallback.
  const captured = { status: 0, body: undefined as unknown } as Captured;
  const req = { path: "/", method: "GET", headers: {} } as unknown as Request;
  const res = {
    locals: {},
    status(code: number) { captured.status = code; return this; },
    json(payload: unknown) { captured.body = payload as Captured["body"]; return this; },
  } as unknown as Response;

  errorMiddleware(new HttpError(404, "not_found", "nope"), req, res, () => {});

  assert.equal(captured.status, 404);
  assert.equal(captured.body.error.requestId, "unknown");
});
