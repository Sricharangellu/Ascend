import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp, type App } from "../../app.js";
import { request } from "./test-request.js";

let seq = 0;
const schema = () => `test_${process.pid}_${Date.now().toString(36)}_${seq++}`;
async function freshApp(): Promise<App> { return buildApp({ schema: schema() }); }

test("progress: hypothesis/task/evidence keep self-reported work separate from proof", async () => {
  const app = await freshApp();

  let r = await request(app, "POST", "/api/progress/hypotheses", "manager", {
    statement: "Best-selling products are not being restocked fast enough.",
    category: "inventory_health",
    successCriteria: "Receive stock and record at least one sale.",
  });
  assert.equal(r.status, 201);
  const hypothesisId = r.json.id;
  assert.equal(r.json.status, "planned");

  r = await request(app, "POST", "/api/progress/tasks", "manager", {
    hypothesisId,
    title: "Track first real sale",
    verificationSource: "retail.first_sale",
  });
  assert.equal(r.status, 201);
  const taskId = r.json.id;

  r = await request(app, "PATCH", `/api/progress/tasks/${taskId}/status`, "manager", { status: "validated" });
  assert.equal(r.status, 400, "validated cannot be set casually");

  r = await request(app, "PATCH", `/api/progress/tasks/${taskId}/status`, "manager", { status: "self_reported_done" });
  assert.equal(r.status, 200);
  assert.equal(r.json.status, "self_reported_done");
  assert.ok(r.json.completed_at, "self-reported done records completion time");

  r = await request(app, "POST", `/api/progress/tasks/${taskId}/evidence`, "manager", {
    evidenceType: "note",
    title: "Interview notes uploaded",
    notes: "Owner reports two products are frequently out of stock.",
  });
  assert.equal(r.status, 201);

  r = await request(app, "GET", "/api/progress/tasks?status=evidence_attached", "owner");
  assert.equal(r.status, 200);
  assert.equal(r.json.items.length, 1);
  assert.equal(r.json.items[0].id, taskId);

  r = await request(app, "POST", `/api/progress/hypotheses/${hypothesisId}/decisions`, "manager", {
    decision: "validated",
    reason: "Attached customer evidence supports the restock problem.",
    nextAction: "Raise reorder points for fast movers.",
  });
  assert.equal(r.status, 201);
  assert.equal(r.json.decision, "validated");
});

test("progress: system verification only passes when Ascend can prove it from tenant data", async () => {
  const app = await freshApp();

  let r = await request(app, "POST", "/api/progress/tasks", "manager", {
    title: "Record first sale",
    verificationSource: "retail.first_sale",
  });
  assert.equal(r.status, 201);
  const taskId = r.json.id;

  r = await request(app, "POST", `/api/progress/tasks/${taskId}/system-verify`, "manager");
  assert.equal(r.status, 400, "no completed order yet");

  const p = await request(app, "POST", "/api/catalog/", "manager", {
    sku: "PROG-SALE",
    name: "Progress Sale Widget",
    price_cents: 1000,
    category: "general",
  });
  assert.equal(p.status, 201);
  await request(app, "POST", `/api/inventory/${p.json.id}/receive`, "manager", { quantity: 3 });
  const order = await request(app, "POST", "/api/orders/", "cashier", {
    stateCode: "CA",
    lines: [{ productId: p.json.id, quantity: 1 }],
  });
  assert.equal(order.status, 201);
  // Payment capture now requires manager+ (money-movement gate), so this
  // system-verification setup captures as "manager" rather than "cashier".
  const payment = await request(app, "POST", "/api/payments/", "manager", {
    orderId: order.json.id,
    method: "cash",
    tenderedCents: order.json.total_cents,
  });
  assert.equal(payment.status, 201);

  r = await request(app, "POST", `/api/progress/tasks/${taskId}/system-verify`, "manager");
  assert.equal(r.status, 200);
  assert.equal(r.json.status, "system_verified");

  r = await request(app, "GET", "/api/progress/summary", "owner");
  assert.equal(r.status, 200);
  assert.equal(r.json.tasks.system_verified, 1);
  assert.equal(r.json.evidenceCount, 1, "system verification creates evidence");
});

test("progress: manager+ mutations and tenant scoping are enforced", async () => {
  const app = await freshApp();

  let r = await request(app, "POST", "/api/progress/tasks", "cashier", { title: "Cashier cannot create" });
  assert.equal(r.status, 403);

  r = await request(app, "POST", "/api/progress/tasks", "manager", { title: "Tenant one task" }, "tnt_one");
  assert.equal(r.status, 201);
  const id = r.json.id;

  r = await request(app, "GET", "/api/progress/tasks", "owner", undefined, "tnt_two");
  assert.equal(r.status, 200);
  assert.equal(r.json.items.length, 0, "other tenant cannot list task");

  r = await request(app, "POST", `/api/progress/tasks/${id}/evidence`, "manager", {
    title: "Wrong tenant evidence",
  }, "tnt_two");
  assert.equal(r.status, 404, "other tenant cannot attach evidence to task");
});

test("progress: hypothesis detail returns the whole loop in one read", async () => {
  const app = await freshApp();

  let r = await request(app, "POST", "/api/progress/hypotheses", "manager", {
    statement: "Slow movers are tying up shelf space we need for best sellers.",
    successCriteria: "Two slow SKUs discounted and cleared.",
  });
  assert.equal(r.status, 201);
  const hypothesisId = r.json.id;

  // A task under the hypothesis, plus one unrelated task that must NOT appear.
  r = await request(app, "POST", "/api/progress/tasks", "manager", {
    hypothesisId,
    title: "Identify slow movers from 30-day sales",
  });
  assert.equal(r.status, 201);
  const taskId = r.json.id;
  assert.equal((await request(app, "POST", "/api/progress/tasks", "manager", { title: "Unrelated task" })).status, 201);

  // Evidence reaches a hypothesis two ways: via its task, and directly.
  assert.equal((await request(app, "POST", `/api/progress/tasks/${taskId}/evidence`, "manager", {
    title: "Sales export for the last 30 days",
  })).status, 201);
  assert.equal((await request(app, "POST", "/api/progress/evidence", "manager", {
    hypothesisId,
    title: "Shelf photo before clearance",
  })).status, 201);

  r = await request(app, "GET", `/api/progress/hypotheses/${hypothesisId}`, "cashier");
  assert.equal(r.status, 200, "detail is a read — any authenticated tenant user may see it");
  assert.equal(r.json.hypothesis.id, hypothesisId);
  assert.equal(r.json.tasks.length, 1, "only tasks belonging to this hypothesis");
  assert.equal(r.json.tasks[0].id, taskId);
  assert.equal(r.json.evidence.length, 2, "task-linked AND directly-linked evidence both count");
  assert.equal(r.json.decisions.length, 0);

  // The decision gate and the evidence read must agree: the detail showed
  // evidence, so recording a decision must succeed.
  r = await request(app, "POST", `/api/progress/hypotheses/${hypothesisId}/decisions`, "manager", {
    decision: "validated",
    reason: "Sales export confirms two SKUs had no movement in 30 days.",
  });
  assert.equal(r.status, 201);

  r = await request(app, "GET", `/api/progress/hypotheses/${hypothesisId}`, "owner");
  assert.equal(r.status, 200);
  assert.equal(r.json.decisions.length, 1);
  assert.equal(r.json.decisions[0].decision, "validated");
  assert.equal(r.json.hypothesis.status, "validated");
  assert.equal(r.json.hypothesis.confidence_score, 100, "validation pins confidence at 100");

  r = await request(app, "GET", `/api/progress/hypotheses/${hypothesisId}/decisions`, "owner");
  assert.equal(r.status, 200);
  assert.equal(r.json.items.length, 1);

  r = await request(app, "GET", `/api/progress/hypotheses/${hypothesisId}`, "owner", undefined, "tnt_other");
  assert.equal(r.status, 404, "hypothesis detail is tenant-scoped");
});

test("progress: evidence listing is filtered, bounded, and tenant-scoped", async () => {
  const app = await freshApp();

  let r = await request(app, "POST", "/api/progress/tasks", "manager", { title: "Count the back room" });
  assert.equal(r.status, 201);
  const taskId = r.json.id;
  assert.equal((await request(app, "POST", `/api/progress/tasks/${taskId}/evidence`, "manager", {
    title: "Count sheet scan", url: "https://example.test/count.pdf",
  })).status, 201);

  r = await request(app, "GET", "/api/progress/evidence", "owner");
  assert.equal(r.status, 400, "an unfiltered evidence list is refused, not served tenant-wide");

  r = await request(app, "GET", `/api/progress/evidence?taskId=${taskId}`, "cashier");
  assert.equal(r.status, 200);
  assert.equal(r.json.items.length, 1);
  assert.equal(r.json.items[0].url, "https://example.test/count.pdf");

  r = await request(app, "GET", `/api/progress/evidence?taskId=${taskId}`, "owner", undefined, "tnt_other");
  assert.equal(r.status, 200);
  assert.equal(r.json.items.length, 0, "another tenant sees no evidence for the same task id");

  // Reads are bounded — an over-large or junk limit never yields an unbounded scan.
  r = await request(app, "GET", `/api/progress/evidence?taskId=${taskId}&limit=9999`, "owner");
  assert.equal(r.status, 200);
  assert.equal(r.json.limit, 200, "limit is clamped to the shared ceiling");
  r = await request(app, "GET", `/api/progress/evidence?taskId=${taskId}&limit=abc`, "owner");
  assert.equal(r.status, 200);
  assert.equal(r.json.limit, 50, "junk limit falls back to the default, it does not 400 a read");
});

test("progress: a hypothesis cannot be decided before evidence exists", async () => {
  const app = await freshApp();

  let r = await request(app, "POST", "/api/progress/hypotheses", "manager", {
    statement: "Card fees are eating the margin on small baskets.",
  });
  assert.equal(r.status, 201);
  const hypothesisId = r.json.id;

  r = await request(app, "POST", `/api/progress/hypotheses/${hypothesisId}/decisions`, "manager", {
    decision: "validated",
  });
  assert.equal(r.status, 400, "no evidence yet — a decision would be an opinion, not a result");

  r = await request(app, "GET", `/api/progress/hypotheses/${hypothesisId}`, "owner");
  assert.equal(r.json.evidence.length, 0, "the read agrees with the gate: nothing counts yet");

  assert.equal((await request(app, "POST", "/api/progress/evidence", "manager", {
    hypothesisId, title: "Fee report for last month",
  })).status, 201);

  r = await request(app, "GET", `/api/progress/hypotheses/${hypothesisId}`, "owner");
  assert.equal(r.json.evidence.length, 1);
  assert.equal(r.json.hypothesis.status, "evidence_attached");

  r = await request(app, "POST", `/api/progress/hypotheses/${hypothesisId}/decisions`, "cashier", { decision: "invalidated" });
  assert.equal(r.status, 403, "recording a decision is a manager+ action");

  r = await request(app, "POST", `/api/progress/hypotheses/${hypothesisId}/decisions`, "manager", {
    decision: "invalidated",
    reason: "Fees were 0.3% of revenue — not the margin problem.",
    nextAction: "Look at supplier cost increases instead.",
  });
  assert.equal(r.status, 201);
  assert.equal(r.json.next_action, "Look at supplier cost increases instead.");
});

test("progress: hypothesis and task lists are bounded and filterable", async () => {
  const app = await freshApp();

  let r = await request(app, "POST", "/api/progress/hypotheses", "manager", { statement: "First hypothesis to test." });
  assert.equal(r.status, 201);
  const hypothesisId = r.json.id;

  assert.equal((await request(app, "POST", "/api/progress/tasks", "manager", { hypothesisId, title: "Linked task" })).status, 201);
  assert.equal((await request(app, "POST", "/api/progress/tasks", "manager", { title: "Standalone task" })).status, 201);

  r = await request(app, "GET", "/api/progress/hypotheses", "cashier");
  assert.equal(r.status, 200);
  assert.equal(r.json.items.length, 1);
  assert.equal(r.json.limit, 50, "the previously unbounded hypothesis list now reports its bound");

  r = await request(app, "GET", "/api/progress/tasks", "owner");
  assert.equal(r.json.items.length, 2);

  r = await request(app, "GET", `/api/progress/tasks?hypothesisId=${hypothesisId}`, "owner");
  assert.equal(r.status, 200);
  assert.equal(r.json.items.length, 1, "tasks filter down to one hypothesis");
  assert.equal(r.json.items[0].title, "Linked task");

  r = await request(app, "GET", "/api/progress/hypotheses/hyp_does_not_exist", "owner");
  assert.equal(r.status, 404);
});
