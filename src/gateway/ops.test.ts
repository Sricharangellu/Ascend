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
