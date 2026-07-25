/**
 * ai-assistant.test.ts — real-backend tests for the AI Assistant module
 * (ADR-005: explain-only, rule-based-first, human-approval-gated).
 *
 * No ANTHROPIC_API_KEY is set anywhere in this test harness (grep confirms
 * this module is the first to use the Anthropic SDK), so `isAnthropicConfigured()`
 * is deterministically false here — every test below exercises the module's
 * own documented honest-failure path for narration, which is the point:
 * the deterministic recommendation must stand on its own regardless of LLM
 * availability, and the assistant must never fabricate an answer when it
 * can't call the model. This keeps the suite hermetic (real Postgres, no
 * network calls), matching repo convention.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp, type App } from "../../app.js";
import { matchIntent } from "./service.js";
import { AiAssistantService } from "./index.js";

let __seq = 0;
const __schema = () => `test_${process.pid}_${Date.now().toString(36)}_${__seq++}`;
async function freshApp(): Promise<App> {
  return await buildApp({ schema: __schema() });
}
async function call(app: App, method: string, path: string, body?: unknown, role?: string) {
  const { default: request } = await import("./test-request.js");
  return request(app.express, method, path, body, role);
}

async function enableAiAssistant(app: App): Promise<void> {
  const r = await call(app, "POST", "/api/v1/settings/business-profile", { businessType: "restaurant" });
  assert.equal(r.status, 200, `business-profile switch to restaurant failed: ${JSON.stringify(r.json)}`);
}

async function seedProduct(app: App, id: string, name: string): Promise<void> {
  const now = Date.now();
  await app.db.query(
    `INSERT INTO products (id, tenant_id, sku, name, price_cents, category, tax_class, status, created_at, updated_at)
     VALUES (@id, 'tnt_demo', @sku, @name, 500, 'general', 'standard', 'active', @now, @now)`,
    { id, sku: id, name, now },
  );
}

async function askAndProcess(app: App, question: string): Promise<{ conversationId: string }> {
  const ask = await call(app, "POST", "/api/v1/ai-assistant/ask", { question });
  assert.equal(ask.status, 202, `ask failed: ${JSON.stringify(ask.json)}`);
  const conversationId = ask.json.conversationId as string;
  // Process synchronously — bypassing the queue, matching this repo's
  // inventory-reconciliation.test.ts precedent of calling the underlying
  // logic directly rather than driving the async job consumer in a test.
  const service = new AiAssistantService(app.db, app.events);
  await service.processQuestion("tnt_demo", conversationId);
  return { conversationId };
}

// ── matchIntent: pure, deterministic classifier (AGENTS.md: "the first
//    recommendation system must be rule-based") ───────────────────────────

test("matchIntent classifies every supported category plus unknown", () => {
  assert.equal(matchIntent("Should I reorder coffee beans?"), "reorder");
  assert.equal(matchIntent("we are running low on cups, order more?"), "reorder");
  assert.equal(matchIntent("what is our stock level for napkins"), "low_stock");
  assert.equal(matchIntent("what's expiring soon"), "expiry");
  assert.equal(matchIntent("anything going bad in the walk-in"), "expiry");
  assert.equal(matchIntent("what are my best sellers this month"), "best_sellers");
  assert.equal(matchIntent("what's popular right now"), "best_sellers");
  assert.equal(matchIntent("any slow movers on the menu"), "slow_movers");
  assert.equal(matchIntent("show me dead stock"), "slow_movers");
  assert.equal(matchIntent("what's the weather like today"), "unknown");
});

// ── Module gating: same isolation boundary every business-pack-gated module
//    uses (see hospitality.test.ts's identical regression pattern) ─────────

test("a retail-default tenant is denied /api/v1/ai-assistant/ask", async () => {
  const app = await freshApp();
  const r = await call(app, "POST", "/api/v1/ai-assistant/ask", { question: "Should I reorder coffee?" });
  assert.equal(r.status, 403);
  assert.equal(r.json.error.code, "module_not_enabled");
});

test("switching business type to restaurant unlocks the single-prefix path (no double mount-path bug)", async () => {
  const app = await freshApp();
  await enableAiAssistant(app);
  const r = await call(app, "GET", "/api/v1/ai-assistant/conversations");
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.items, []);
});

// ── /ask validation ─────────────────────────────────────────────────────────

test("POST /ask rejects an empty question", async () => {
  const app = await freshApp();
  await enableAiAssistant(app);
  const r = await call(app, "POST", "/api/v1/ai-assistant/ask", { question: "" });
  assert.equal(r.status, 400);
});

// ── Reorder signal: the one intent with a real write action behind it ──────

test("reorder question produces a create_po recommendation; missing ANTHROPIC_API_KEY fails narration honestly, never fabricates an answer", async () => {
  const app = await freshApp();
  await enableAiAssistant(app);
  await seedProduct(app, "prod_beans", "Coffee Beans");
  await app.db.query(
    `INSERT INTO inventory (product_id, tenant_id, stock_qty, reorder_pt, updated_at) VALUES ('prod_beans', 'tnt_demo', 2, 10, @now)`,
    { now: Date.now() },
  );

  const { conversationId } = await askAndProcess(app, "Should I reorder coffee beans?");

  const conv = await call(app, "GET", `/api/v1/ai-assistant/conversations/${conversationId}`);
  assert.equal(conv.status, 200);
  assert.equal(conv.json.status, "failed", "no ANTHROPIC_API_KEY in the test env must fail narration honestly");
  assert.match(conv.json.error, /ANTHROPIC_API_KEY/);
  assert.equal(conv.json.answer, null, "must never fabricate an answer when narration is unavailable");

  const recs = await call(app, "GET", "/api/v1/ai-assistant/recommendations");
  assert.equal(recs.status, 200);
  assert.equal(recs.json.items.length, 1, "the deterministic recommendation must exist independent of LLM narration");
  const rec = recs.json.items[0];
  assert.equal(rec.sourceType, "reorder");
  assert.equal(rec.actionType, "create_po");
  assert.equal(rec.requiredApprovalLevel, "manager");
  assert.equal(rec.status, "pending");
  assert.equal(rec.sourceRef, "prod_beans");
  assert.ok(rec.recommendation.includes("Coffee Beans"), rec.recommendation);
  assert.ok(rec.reason.includes("2"), rec.reason);
});

test("reorder signal narrows to a matching product hint and ignores products above their reorder point", async () => {
  const app = await freshApp();
  await enableAiAssistant(app);
  await seedProduct(app, "prod_beans", "Coffee Beans");
  await seedProduct(app, "prod_cups", "Paper Cups");
  const now = Date.now();
  await app.db.query(
    `INSERT INTO inventory (product_id, tenant_id, stock_qty, reorder_pt, updated_at) VALUES ('prod_beans', 'tnt_demo', 2, 10, @now)`,
    { now },
  );
  // Well-stocked — must never surface as a reorder candidate.
  await app.db.query(
    `INSERT INTO inventory (product_id, tenant_id, stock_qty, reorder_pt, updated_at) VALUES ('prod_cups', 'tnt_demo', 500, 10, @now)`,
    { now },
  );

  await askAndProcess(app, "Should I reorder coffee beans?");

  const recs = await call(app, "GET", "/api/v1/ai-assistant/recommendations");
  assert.equal(recs.json.items.length, 1);
  assert.ok(recs.json.items[0].recommendation.includes("Coffee Beans"));
  assert.ok(!recs.json.items[0].recommendation.includes("Paper Cups"));
});

test("an unrelated question produces no recommendation and an honest failure (no fabricated answer)", async () => {
  const app = await freshApp();
  await enableAiAssistant(app);

  const { conversationId } = await askAndProcess(app, "What's the weather like today?");

  const recs = await call(app, "GET", "/api/v1/ai-assistant/recommendations");
  assert.equal(recs.json.items.length, 0, "no signal found -> no invented recommendation");

  const conv = await call(app, "GET", `/api/v1/ai-assistant/conversations/${conversationId}`);
  assert.equal(conv.json.status, "failed");
  assert.equal(conv.json.answer, null);
});

// ── Expiry signal (no write action; approvalLevel none) ─────────────────────

test("expiry question surfaces lots expiring within 30 days, soonest first", async () => {
  const app = await freshApp();
  await enableAiAssistant(app);
  await seedProduct(app, "prod_milk", "Oat Milk");
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  await app.db.query(
    `INSERT INTO inventory_lots (id, tenant_id, product_id, lot_code, expiry_date, qty_on_hand, unit_cost_cents, po_id, received_at)
     VALUES ('lot_soon', 'tnt_demo', 'prod_milk', 'L1', @soon, 12, 100, NULL, @now)`,
    { soon: now + 3 * day, now },
  );
  await app.db.query(
    `INSERT INTO inventory_lots (id, tenant_id, product_id, lot_code, expiry_date, qty_on_hand, unit_cost_cents, po_id, received_at)
     VALUES ('lot_far', 'tnt_demo', 'prod_milk', 'L2', @far, 5, 100, NULL, @now)`,
    { far: now + 60 * day, now },
  );
  // Already zeroed out — must be excluded even though its expiry is soon.
  await app.db.query(
    `INSERT INTO inventory_lots (id, tenant_id, product_id, lot_code, expiry_date, qty_on_hand, unit_cost_cents, po_id, received_at)
     VALUES ('lot_empty', 'tnt_demo', 'prod_milk', 'L3', @soon, 0, 100, NULL, @now)`,
    { soon: now + 1 * day, now },
  );

  await askAndProcess(app, "What's expiring soon?");

  const recs = await call(app, "GET", "/api/v1/ai-assistant/recommendations");
  assert.equal(recs.json.items.length, 1);
  const rec = recs.json.items[0];
  assert.equal(rec.sourceType, "expiry");
  assert.equal(rec.requiredApprovalLevel, "none");
  assert.equal(rec.actionType, "none");
  assert.ok(rec.recommendation.includes("Oat Milk"));
  assert.ok(rec.recommendation.includes("12 units"), rec.recommendation);
});

// ── Best sellers / slow movers (reports-module query pattern) ──────────────

test("best-sellers question ranks by revenue over completed orders in the last 30 days", async () => {
  const app = await freshApp();
  await enableAiAssistant(app);
  await seedProduct(app, "prod_latte", "Latte");
  await seedProduct(app, "prod_tea", "Tea");
  const now = Date.now();
  await app.db.query(
    `INSERT INTO orders (id, tenant_id, order_number, state_code, status, subtotal_cents, total_cents, created_at, updated_at)
     VALUES ('ord_1', 'tnt_demo', 'ORD-1', 'CA', 'completed', 11500, 11500, @now, @now)`,
    { now },
  );
  // Higher quantity, lower revenue — must lose to Latte, which is ranked by
  // revenue not units, per the query's ORDER BY revenue DESC.
  await app.db.query(
    `INSERT INTO order_lines (id, tenant_id, order_id, product_id, name, quantity, unit_cents, tax_cents, line_cents, taxable)
     VALUES ('ol_tea', 'tnt_demo', 'ord_1', 'prod_tea', 'Tea', 30, 50, 0, 1500, 1)`,
  );
  await app.db.query(
    `INSERT INTO order_lines (id, tenant_id, order_id, product_id, name, quantity, unit_cents, tax_cents, line_cents, taxable)
     VALUES ('ol_latte', 'tnt_demo', 'ord_1', 'prod_latte', 'Latte', 20, 500, 0, 10000, 1)`,
  );

  await askAndProcess(app, "What are my best sellers?");

  const recs = await call(app, "GET", "/api/v1/ai-assistant/recommendations");
  assert.equal(recs.json.items.length, 1);
  const rec = recs.json.items[0];
  assert.equal(rec.sourceType, "best_sellers");
  assert.ok(rec.recommendation.includes("Latte"), "higher-revenue line must win over higher-quantity/lower-revenue");
});

test("slow-movers question lists active products with zero completed sales in 30 days", async () => {
  const app = await freshApp();
  await enableAiAssistant(app);
  await seedProduct(app, "prod_stale", "Stale Muffin");

  await askAndProcess(app, "any slow movers?");

  const recs = await call(app, "GET", "/api/v1/ai-assistant/recommendations");
  assert.equal(recs.json.items.length, 1);
  assert.equal(recs.json.items[0].sourceType, "slow_movers");
  assert.ok(recs.json.items[0].recommendation.includes("Stale Muffin"));
});

// ── Human-approval gate (AGENTS.md AI rules + DESIGN_PRINCIPLES.md: every
//    write requires an explicit human decision) ────────────────────────────

test("manager can approve a reorder recommendation; PO-creation failure is reported but the approval decision sticks", async () => {
  const app = await freshApp();
  await enableAiAssistant(app);
  await seedProduct(app, "prod_beans", "Coffee Beans");
  await app.db.query(
    `INSERT INTO inventory (product_id, tenant_id, stock_qty, reorder_pt, updated_at) VALUES ('prod_beans', 'tnt_demo', 2, 10, @now)`,
    { now: Date.now() },
  );
  await askAndProcess(app, "Should I reorder coffee beans?");
  const recs = await call(app, "GET", "/api/v1/ai-assistant/recommendations");
  const recId = recs.json.items[0].id as string;

  const approve = await call(app, "POST", `/api/v1/ai-assistant/recommendations/${recId}/approve`, {});
  assert.equal(approve.status, 200, JSON.stringify(approve.json));
  assert.equal(approve.json.recommendation.status, "approved");
  // Nothing is listening at BACKEND_URL/APP_URL in this test process, so the
  // internal create-po call fails — the approval must still be recorded (a
  // human decision is never rolled back by a downstream failure, per the
  // route's own doc comment).
  assert.ok(approve.json.poError, "expected the internal create-po call to fail in the test environment");

  const again = await call(app, "POST", `/api/v1/ai-assistant/recommendations/${recId}/approve`, {});
  assert.equal(again.status, 409);
  assert.equal(again.json.error.code, "already_decided");
});

test("reject marks a recommendation rejected without attempting PO creation", async () => {
  const app = await freshApp();
  await enableAiAssistant(app);
  await seedProduct(app, "prod_beans", "Coffee Beans");
  await app.db.query(
    `INSERT INTO inventory (product_id, tenant_id, stock_qty, reorder_pt, updated_at) VALUES ('prod_beans', 'tnt_demo', 2, 10, @now)`,
    { now: Date.now() },
  );
  await askAndProcess(app, "Should I reorder coffee beans?");
  const recs = await call(app, "GET", "/api/v1/ai-assistant/recommendations");
  const recId = recs.json.items[0].id as string;

  const r = await call(app, "POST", `/api/v1/ai-assistant/recommendations/${recId}/reject`, {});
  assert.equal(r.status, 200);
  assert.equal(r.json.recommendation.status, "rejected");
  assert.equal(r.json.poResult, undefined);
});

test("a cashier cannot approve or reject a recommendation", async () => {
  const app = await freshApp();
  await enableAiAssistant(app);
  await seedProduct(app, "prod_beans", "Coffee Beans");
  await app.db.query(
    `INSERT INTO inventory (product_id, tenant_id, stock_qty, reorder_pt, updated_at) VALUES ('prod_beans', 'tnt_demo', 2, 10, @now)`,
    { now: Date.now() },
  );
  await askAndProcess(app, "Should I reorder coffee beans?");
  const recs = await call(app, "GET", "/api/v1/ai-assistant/recommendations");
  const recId = recs.json.items[0].id as string;

  const approve = await call(app, "POST", `/api/v1/ai-assistant/recommendations/${recId}/approve`, {}, "cashier");
  assert.equal(approve.status, 403);
  const reject = await call(app, "POST", `/api/v1/ai-assistant/recommendations/${recId}/reject`, {}, "cashier");
  assert.equal(reject.status, 403);
});
