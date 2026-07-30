/**
 * workflows.test.ts — S3-WORKFLOWS integration tests
 *
 * Tests:
 *   1. Owner can create a workflow definition
 *   2. List returns created workflows
 *   3. Get returns single workflow with steps
 *   4. Manager cannot create (403)
 *   5. Patch updates name and enabled flag
 *   6. Owner can add a step
 *   7. Step inherits position from order
 *   8. Update step changes trigger condition
 *   9. Delete step returns 204
 *  10. Delete workflow cascades to steps
 *  11. ?outletId filter scopes list
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp, type App } from "../../app.js";

let __seq = 0;
const __schema = () => `wf_test_${process.pid}_${Date.now().toString(36)}_${__seq++}`;

async function freshApp(): Promise<App> {
  process.env["JWT_SECRET"] ??= "test-secret-finder-pos";
  return buildApp({ schema: __schema() });
}

async function call(app: App, method: string, path: string, body?: unknown, role = "owner") {
  const { default: request } = await import("./test-request.js");
  return request(app.express, method, path, body, role);
}

// ── 1. Create workflow ────────────────────────────────────────────────────────
test("owner can create a workflow definition", async () => {
  const app = await freshApp();
  const { status, json } = await call(app, "POST", "/api/workflows/", {
    name: "Age-Gated Checkout",
    description: "Require age verification for liquor purchases",
  });
  assert.equal(status, 201, JSON.stringify(json));
  assert.ok(json.id.startsWith("wfd_"));
  assert.equal(json.name, "Age-Gated Checkout");
  assert.equal(json.enabled, true);
  assert.deepEqual(json.steps, []);
});

// ── 2. List ───────────────────────────────────────────────────────────────────
test("list returns created workflows", async () => {
  const app = await freshApp();
  await call(app, "POST", "/api/workflows/", { name: "Loyalty Flow" });
  const { status, json } = await call(app, "GET", "/api/workflows/", undefined, "manager");
  assert.equal(status, 200);
  assert.ok(Array.isArray(json.items));
  assert.ok(json.items.some((w: any) => w.name === "Loyalty Flow"));
});

// ── 3. Get with steps ─────────────────────────────────────────────────────────
test("get returns single workflow with its steps", async () => {
  const app = await freshApp();
  const { json: created } = await call(app, "POST", "/api/workflows/", { name: "ID Flow" });
  await call(app, "POST", `/api/workflows/${created.id}/steps`, {
    name: "Check ID",
    stepType: "gate",
    triggerCondition: "id_scan",
  });
  const { status, json } = await call(app, "GET", `/api/workflows/${created.id}`, undefined, "manager");
  assert.equal(status, 200);
  assert.equal(json.steps.length, 1);
  assert.equal(json.steps[0].triggerCondition, "id_scan");
});

// ── 4. Manager cannot create (403) ────────────────────────────────────────────
test("manager cannot create a workflow (403)", async () => {
  const app = await freshApp();
  const { status } = await call(app, "POST", "/api/workflows/", { name: "X" }, "manager");
  assert.equal(status, 403);
});

// ── 5. Patch updates name + enabled ──────────────────────────────────────────
test("patch updates workflow name and disables it", async () => {
  const app = await freshApp();
  const { json: created } = await call(app, "POST", "/api/workflows/", { name: "Old Name" });
  const { status, json } = await call(app, "PATCH", `/api/workflows/${created.id}`, {
    name: "New Name",
    enabled: false,
  });
  assert.equal(status, 200);
  assert.equal(json.name, "New Name");
  assert.equal(json.enabled, false);
});

// ── 6. Add step ───────────────────────────────────────────────────────────────
test("owner can add a step to a workflow", async () => {
  const app = await freshApp();
  const { json: wf } = await call(app, "POST", "/api/workflows/", { name: "Sig Flow" });
  const { status, json } = await call(app, "POST", `/api/workflows/${wf.id}/steps`, {
    name: "Capture Signature",
    stepType: "capture",
    triggerCondition: "signature_required",
    config: { prompt: "Please sign below" },
  });
  assert.equal(status, 201, JSON.stringify(json));
  assert.ok(json.id.startsWith("wst_"));
  assert.equal(json.triggerCondition, "signature_required");
  assert.equal(json.config.prompt, "Please sign below");
});

// ── 7. Auto-position ──────────────────────────────────────────────────────────
test("steps auto-assign ascending positions", async () => {
  const app = await freshApp();
  const { json: wf } = await call(app, "POST", "/api/workflows/", { name: "Multi-Step" });
  await call(app, "POST", `/api/workflows/${wf.id}/steps`, {
    name: "Step A", stepType: "prompt", triggerCondition: "custom_prompt",
  });
  await call(app, "POST", `/api/workflows/${wf.id}/steps`, {
    name: "Step B", stepType: "gate", triggerCondition: "age_verification",
  });
  const { json } = await call(app, "GET", `/api/workflows/${wf.id}`, undefined, "manager");
  assert.equal(json.steps.length, 2);
  assert.ok(json.steps[0].position < json.steps[1].position);
});

// ── 8. Update step ────────────────────────────────────────────────────────────
test("update step changes trigger condition", async () => {
  const app = await freshApp();
  const { json: wf } = await call(app, "POST", "/api/workflows/", { name: "Edit Step Flow" });
  const { json: step } = await call(app, "POST", `/api/workflows/${wf.id}/steps`, {
    name: "Old Step", stepType: "prompt", triggerCondition: "custom_prompt",
  });
  const { status, json } = await call(app, "PATCH", `/api/workflows/${wf.id}/steps/${step.id}`, {
    triggerCondition: "loyalty_capture",
  });
  assert.equal(status, 200);
  assert.equal(json.triggerCondition, "loyalty_capture");
});

// ── 9. Delete step ────────────────────────────────────────────────────────────
test("delete step returns 204 and removes it from workflow", async () => {
  const app = await freshApp();
  const { json: wf } = await call(app, "POST", "/api/workflows/", { name: "Del Step Flow" });
  const { json: step } = await call(app, "POST", `/api/workflows/${wf.id}/steps`, {
    name: "To Remove", stepType: "gate", triggerCondition: "age_verification",
  });
  const { status } = await call(app, "DELETE", `/api/workflows/${wf.id}/steps/${step.id}`);
  assert.equal(status, 204);
  const { json } = await call(app, "GET", `/api/workflows/${wf.id}`, undefined, "manager");
  assert.equal(json.steps.length, 0);
});

// ── 10. Delete workflow cascades ──────────────────────────────────────────────
test("delete workflow returns 204", async () => {
  const app = await freshApp();
  const { json: wf } = await call(app, "POST", "/api/workflows/", { name: "Doomed Flow" });
  await call(app, "POST", `/api/workflows/${wf.id}/steps`, {
    name: "Step", stepType: "prompt", triggerCondition: "customer_required",
  });
  const { status } = await call(app, "DELETE", `/api/workflows/${wf.id}`);
  assert.equal(status, 204);
  const { status: s2 } = await call(app, "GET", `/api/workflows/${wf.id}`, undefined, "manager");
  assert.equal(s2, 404);
});

// ── 11. outletId filter ───────────────────────────────────────────────────────
test("?outletId filter returns workflows for that outlet and global ones", async () => {
  const app = await freshApp();
  await call(app, "POST", "/api/workflows/", { name: "Global Flow" }); // no outletId
  await call(app, "POST", "/api/workflows/", { name: "Outlet A Flow", outletId: "outlet_abc" });
  await call(app, "POST", "/api/workflows/", { name: "Outlet B Flow", outletId: "outlet_xyz" });

  const { json } = await call(app, "GET", "/api/workflows/?outletId=outlet_abc", undefined, "manager");
  const names = json.items.map((w: any) => w.name);
  assert.ok(names.includes("Global Flow"), "global workflow should appear");
  assert.ok(names.includes("Outlet A Flow"), "outlet A workflow should appear");
  assert.ok(!names.includes("Outlet B Flow"), "outlet B workflow should not appear");
});
