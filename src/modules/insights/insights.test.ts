/**
 * insights.test.ts — S3-INSIGHTS integration tests
 *
 * Tests:
 *   1. Owner can create a scheduled report
 *   2. List returns created scheduled reports
 *   3. Manager cannot create (403)
 *   4. Invalid email rejected (400)
 *   5. Patch updates frequency and advances next_send_at
 *   6. Trigger marks last_sent_at and advances next_send_at
 *   7. Delete removes the scheduled report
 *   8. GET /reorder returns array (empty when no qualifying products)
 *   9. GET /order-recommendations returns array (empty when no sales)
 *  10. Patch enabled=false disables the schedule
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp, type App } from "../../app.js";

let __seq = 0;
const __schema = () => `ins_test_${process.pid}_${Date.now().toString(36)}_${__seq++}`;

async function freshApp(): Promise<App> {
  process.env["JWT_SECRET"] ??= "test-secret-finder-pos";
  return buildApp({ schema: __schema() });
}

async function call(app: App, method: string, path: string, body?: unknown, role = "owner") {
  const { default: request } = await import("./test-request.js");
  return request(app.express, method, path, body, role);
}

// ── 1. Create scheduled report ────────────────────────────────────────────────
test("owner can create a scheduled report", async () => {
  const app = await freshApp();
  const { status, json } = await call(app, "POST", "/api/insights/scheduled-reports", {
    name: "Weekly Sales",
    reportType: "sales_summary",
    frequency: "weekly",
    recipientEmails: ["cfo@example.com"],
  });
  assert.equal(status, 201, JSON.stringify(json));
  assert.ok(json.id.startsWith("srp_"));
  assert.equal(json.frequency, "weekly");
  assert.deepEqual(json.recipientEmails, ["cfo@example.com"]);
  assert.ok(json.nextSendAt > Date.now());
  assert.equal(json.enabled, true);
  assert.equal(json.lastSentAt, null);
});

// ── 2. List ───────────────────────────────────────────────────────────────────
test("list returns created scheduled reports", async () => {
  const app = await freshApp();
  await call(app, "POST", "/api/insights/scheduled-reports", {
    name: "Daily P&L",
    reportType: "p_l",
    frequency: "daily",
    recipientEmails: ["owner@example.com"],
  });
  const { status, json } = await call(app, "GET", "/api/insights/scheduled-reports", undefined, "manager");
  assert.equal(status, 200);
  assert.ok(Array.isArray(json.items));
  assert.ok(json.items.some((r: any) => r.name === "Daily P&L"));
});

// ── 3. Manager cannot create (403) ────────────────────────────────────────────
test("manager cannot create a scheduled report (403)", async () => {
  const app = await freshApp();
  const { status } = await call(
    app, "POST", "/api/insights/scheduled-reports",
    { name: "X", reportType: "sales_summary", frequency: "daily", recipientEmails: ["a@b.com"] },
    "manager",
  );
  assert.equal(status, 403);
});

// ── 4. Invalid email rejected ─────────────────────────────────────────────────
test("invalid recipient email is rejected (400)", async () => {
  const app = await freshApp();
  const { status } = await call(app, "POST", "/api/insights/scheduled-reports", {
    name: "Bad",
    reportType: "sales_summary",
    frequency: "daily",
    recipientEmails: ["not-an-email"],
  });
  assert.equal(status, 400);
});

// ── 5. Patch updates frequency ────────────────────────────────────────────────
test("patch updates frequency and advances next_send_at", async () => {
  const app = await freshApp();
  const { json: created } = await call(app, "POST", "/api/insights/scheduled-reports", {
    name: "Monthly Report",
    reportType: "ar_aging",
    frequency: "weekly",
    recipientEmails: ["gm@example.com"],
  });
  const originalNext = created.nextSendAt;
  const { status, json } = await call(app, "PATCH", `/api/insights/scheduled-reports/${created.id}`, {
    frequency: "monthly",
  });
  assert.equal(status, 200);
  assert.equal(json.frequency, "monthly");
  // Monthly adds ~30 days; weekly adds 7 — new nextSendAt should be farther out.
  assert.ok(json.nextSendAt > originalNext, "nextSendAt should advance on frequency change");
});

// ── 6. Trigger marks last_sent_at ─────────────────────────────────────────────
test("trigger marks last_sent_at and advances next_send_at", async () => {
  const app = await freshApp();
  const { json: created } = await call(app, "POST", "/api/insights/scheduled-reports", {
    name: "Trigger Test",
    reportType: "top_products",
    frequency: "daily",
    recipientEmails: ["ops@example.com"],
  });
  const before = Date.now();
  const { status, json } = await call(
    app, "POST", `/api/insights/scheduled-reports/${created.id}/trigger`,
    undefined, "manager",
  );
  assert.equal(status, 200, JSON.stringify(json));
  assert.ok(json.lastSentAt >= before);
  assert.ok(json.nextSendAt > json.lastSentAt);
});

// ── 7. Delete ─────────────────────────────────────────────────────────────────
test("delete removes the scheduled report (204)", async () => {
  const app = await freshApp();
  const { json: created } = await call(app, "POST", "/api/insights/scheduled-reports", {
    name: "To Delete",
    reportType: "ap_aging",
    frequency: "weekly",
    recipientEmails: ["del@example.com"],
  });
  const { status } = await call(app, "DELETE", `/api/insights/scheduled-reports/${created.id}`);
  assert.equal(status, 204);
  const { status: s2 } = await call(app, "GET", `/api/insights/scheduled-reports/${created.id}`, undefined, "manager");
  assert.equal(s2, 404);
});

// ── 8. GET /reorder returns array ─────────────────────────────────────────────
test("GET /reorder returns an array (empty when no qualifying products)", async () => {
  const app = await freshApp();
  const { status, json } = await call(app, "GET", "/api/insights/reorder", undefined, "manager");
  assert.equal(status, 200);
  assert.ok(Array.isArray(json.items));
});

// ── 9. GET /order-recommendations returns array ───────────────────────────────
test("GET /order-recommendations returns an array (empty when no sales)", async () => {
  const app = await freshApp();
  const { status, json } = await call(app, "GET", "/api/insights/order-recommendations", undefined, "manager");
  assert.equal(status, 200);
  assert.ok(Array.isArray(json.items));
});

// ── 10. Patch enabled=false disables the schedule ─────────────────────────────
test("patch enabled=false disables the scheduled report", async () => {
  const app = await freshApp();
  const { json: created } = await call(app, "POST", "/api/insights/scheduled-reports", {
    name: "Pausable Report",
    reportType: "inventory_valuation",
    frequency: "daily",
    recipientEmails: ["pause@example.com"],
  });
  const { status, json } = await call(app, "PATCH", `/api/insights/scheduled-reports/${created.id}`, {
    enabled: false,
  });
  assert.equal(status, 200);
  assert.equal(json.enabled, false);
});
