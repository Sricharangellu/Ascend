import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { buildApp } from "../app.js";
import { requestIdMiddleware } from "./requestId.js";
import { errorEnvelopeMiddleware } from "./errorEnvelope.js";

const request = (await import("../identity/test-request.js")).default;

let seq = 0;
const schema = () => `err_env_test_${process.pid}_${Date.now().toString(36)}_${seq++}`;

/**
 * Regression tests for the error envelope.
 *
 * These exist because `errorEnvelopeMiddleware` was mounted but unreachable for
 * months: `errorMiddleware` sat in front of it and always responded, so Express
 * never advanced to it. Nothing failed — the app still returned sane `code` and
 * `message` values — so the only visible symptom was the *absence* of a field.
 * `docs/api/error-codes.md` tells callers to quote `requestId` to support, and
 * no response ever carried one.
 *
 * The `requestId` assertions below are therefore the load-bearing ones: they
 * are what fails if a second error handler is ever mounted ahead of the
 * envelope again. Asserting it equals the `x-request-id` response header is the
 * stronger form — a hardcoded or regenerated id would pass a mere "is present"
 * check while still being useless for correlating against logs.
 */

test("a 4xx error carries a requestId that correlates with the x-request-id header", async () => {
  const app = await buildApp({ schema: schema() });
  try {
    // Unauthenticated /api/v1/* rejects via next(new HttpError(401, ...)), so
    // this exercises the HttpError branch end-to-end through the real chain.
    // It is also the exact probe uptime.yml and ci.yml's smoke-test run.
    const res = await request(app.express, "GET", "/api/v1/flags");

    assert.equal(res.status, 401);
    assert.equal(res.json.error.code, "unauthenticated");
    assert.ok(res.json.error.message, "an error message must be present");

    const headerId = res.headers["x-request-id"];
    assert.ok(headerId, "requestIdMiddleware must set the x-request-id header");
    assert.equal(
      res.json.error.requestId,
      headerId,
      "the envelope's requestId must be the same id the response header carries — " +
        "otherwise support cannot correlate a reported error with the logs",
    );
  } finally {
    await app.db.close();
  }
});

test("a validation error keeps its per-field details AND gains a requestId", async () => {
  const app = await buildApp({ schema: schema() });
  try {
    // parseBody attaches structured issues in `details`. The unreachable
    // envelope had no passthrough for it, so simply swapping the handlers
    // would have silently dropped every field-level validation message.
    const res = await request(app.express, "POST", "/api/identity/login", { email: "not-an-email" });

    assert.equal(res.status, 400);
    assert.equal(res.json.error.code, "validation_error");
    assert.ok(Array.isArray(res.json.error.details), "details must survive as an array of field issues");
    assert.ok(res.json.error.details.length > 0, "details must name at least one failing field");
    assert.ok(
      res.json.error.details.every((d: unknown) =>
        typeof d === "object" && d !== null && "field" in d && "message" in d),
      "each detail must keep its {field, message} shape",
    );
    assert.equal(res.json.error.requestId, res.headers["x-request-id"]);
  } finally {
    await app.db.close();
  }
});

test("exactly one error handler is mounted, so the envelope is reachable", async () => {
  const app = await buildApp({ schema: schema() });
  try {
    // Express error handlers are the 4-arity entries in the router stack. A
    // second one mounted ahead of the envelope is precisely the defect these
    // tests exist for, and it is invisible in responses that happen to agree
    // on code and message — so assert the structure directly as well.
    const stack = (app.express as unknown as { _router?: { stack: { handle: { length: number; name: string } }[] } })
      ._router?.stack ?? [];
    const errorHandlers = stack.filter((layer) => layer.handle?.length === 4);

    assert.equal(
      errorHandlers.length,
      1,
      `expected exactly 1 error handler, found ${errorHandlers.length} (${errorHandlers.map((h) => h.handle.name || "anonymous").join(", ")}). ` +
        "Express stops at the first handler that responds, so a second one makes the envelope unreachable and drops requestId from every error.",
    );
    assert.equal(errorHandlers[0]?.handle.name, "errorEnvelopeMiddleware");
  } finally {
    await app.db.close();
  }
});

test("an unexpected (non-HttpError) throw returns a generic 500 envelope, leaking nothing", async () => {
  // Deliberately a standalone app rather than buildApp(): a route registered
  // after buildApp() returns lands *after* the error handler in the router
  // stack, and Express only looks for error handlers positioned after the
  // throwing layer — so such a route falls through to Express' own default
  // handler and never reaches this envelope at all. (Observed while writing
  // this test; it is the same mount-order sharp edge that hid the original
  // defect.) Mounting the chain here in the real order is what actually
  // exercises the non-HttpError branch.
  const app = express();
  app.use(requestIdMiddleware);
  const secret = "connection to postgres://user:hunter2@db.internal failed";
  app.get("/boom", () => {
    throw new Error(secret);
  });
  app.use(errorEnvelopeMiddleware);

  const res = await request(app, "GET", "/boom");

  assert.equal(res.status, 500);
  assert.equal(res.json.error.code, "internal", "500s use the ERROR_CODES vocabulary ('internal')");
  assert.doesNotMatch(
    JSON.stringify(res.json),
    /hunter2|postgres:\/\//,
    "internal detail must never reach the caller",
  );
  assert.ok(res.json.error.requestId, "a 500 must still be correlatable");
  assert.equal(res.json.error.requestId, res.headers["x-request-id"]);
});
