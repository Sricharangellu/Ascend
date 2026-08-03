import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp, type App } from "../../app.js";

// Per-test schema isolation against the shared Postgres instance.
let __seq = 0;
const __schema = () => `test_${process.pid}_${Date.now().toString(36)}_${__seq++}`;

async function freshApp(): Promise<App> {
  return await buildApp({ schema: __schema() });
}

async function call(
  app: App,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: any }> {
  const { default: request } = await import("./test-request.js");
  return request(app.express, method, path, body);
}

/** Create a product through the catalog API; return its id. */
async function makeProduct(
  app: App,
  opts: { sku: string; name: string; price_cents: number; category?: string },
): Promise<string> {
  const { status, json } = await call(app, "POST", "/api/catalog/", opts);
  assert.equal(status, 201, `product create failed: ${JSON.stringify(json)}`);
  return json.id;
}

/** Create an open order with a single line; return the created order JSON. */
async function makeOrder(app: App, productId: string): Promise<any> {
  const { status, json } = await call(app, "POST", "/api/orders/", {
    stateCode: "CA",
    lines: [{ productId, quantity: 1 }],
  });
  assert.equal(status, 201, `order create failed: ${JSON.stringify(json)}`);
  assert.equal(json.status, "open");
  return json;
}

// ─── POST /:id/complete ───────────────────────────────────────────────────────

test("manager completing an open order transitions it to completed", async () => {
  const app = await freshApp();
  const widget = await makeProduct(app, { sku: "MAN-COMPLETE-1", name: "Widget", price_cents: 1000 });
  const order = await makeOrder(app, widget);

  const res = await call(app, "POST", `/api/orders/${order.id}/complete`);
  assert.equal(res.status, 200, `expected 200, got ${res.status}: ${JSON.stringify(res.json)}`);
  assert.equal(res.json.status, "completed");
  assert.equal(res.json.id, order.id);

  // Persisted — verify via GET
  const after = await call(app, "GET", `/api/orders/${order.id}`);
  assert.equal(after.json.status, "completed");
});

test("completing an already-completed order returns 409", async () => {
  const app = await freshApp();
  const widget = await makeProduct(app, { sku: "MAN-COMPLETE-2", name: "Widget", price_cents: 1000 });
  const order = await makeOrder(app, widget);

  // First completion succeeds
  const first = await call(app, "POST", `/api/orders/${order.id}/complete`);
  assert.equal(first.status, 200);

  // Second must conflict
  const second = await call(app, "POST", `/api/orders/${order.id}/complete`);
  assert.equal(second.status, 409, `expected 409, got ${second.status}: ${JSON.stringify(second.json)}`);
});

test("completing a voided order returns 409", async () => {
  const app = await freshApp();
  const widget = await makeProduct(app, { sku: "MAN-COMPLETE-3", name: "Widget", price_cents: 1000 });
  const order = await makeOrder(app, widget);

  const voided = await call(app, "POST", `/api/orders/${order.id}/void`);
  assert.equal(voided.status, 200);

  const res = await call(app, "POST", `/api/orders/${order.id}/complete`);
  assert.equal(res.status, 409, `expected 409, got ${res.status}: ${JSON.stringify(res.json)}`);
});

test("completing a non-existent order returns 404", async () => {
  const app = await freshApp();
  const res = await call(app, "POST", "/api/orders/ord_doesnotexist/complete");
  assert.equal(res.status, 404);
});

test("non-manager role cannot complete an order (403)", async () => {
  const app = await freshApp();
  const { default: request } = await import("./test-request.js");
  const widget = await makeProduct(app, { sku: "MAN-COMPLETE-4", name: "Widget", price_cents: 1000 });
  const order = await makeOrder(app, widget);

  // Cashier role (below manager) should be rejected
  const res = await request(app.express, "POST", `/api/orders/${order.id}/complete`, undefined, "cashier");
  assert.equal(res.status, 403, `expected 403, got ${res.status}: ${JSON.stringify(res.json)}`);
  // Order must be unchanged
  const after = await call(app, "GET", `/api/orders/${order.id}`);
  assert.equal(after.json.status, "open");
});

// ─── Payment lifecycle ────────────────────────────────────────────────────────

test("capturing a payment transitions the order open -> completed", async () => {
  const app = await freshApp();
  const widget = await makeProduct(app, {
    sku: "LC-COMPLETE",
    name: "Widget",
    price_cents: 2000,
  });
  const order = await makeOrder(app, widget);

  // Capture exact cash through the real payments route. This fires
  // payment.captured, which the orders module reacts to via markCompleted().
  const pay = await call(app, "POST", "/api/payments/", {
    orderId: order.id,
    method: "cash",
    tenderedCents: order.total_cents,
  });
  assert.equal(pay.status, 201, `payment failed: ${JSON.stringify(pay.json)}`);
  assert.equal(pay.json.status, "captured");

  // The order it was made against must now be completed.
  const after = await call(app, "GET", `/api/orders/${order.id}`);
  assert.equal(after.status, 200);
  assert.equal(after.json.status, "completed");
});

test("a late payment.captured event does NOT resurrect a refunded order", async () => {
  const app = await freshApp();
  const widget = await makeProduct(app, {
    sku: "LC-REFUND",
    name: "Widget",
    price_cents: 1500,
  });
  const order = await makeOrder(app, widget);

  // Move the order to a terminal state.
  const refunded = await call(app, "POST", `/api/orders/${order.id}/refund`);
  assert.equal(refunded.status, 200);
  assert.equal(refunded.json.status, "refunded");

  // Simulate a redelivered / out-of-order payment.captured for this order
  // (e.g. an event-bus replay). markCompleted must no-op on terminal states.
  await app.events.publish("payment.captured", { orderId: order.id }, order.id);

  const after = await call(app, "GET", `/api/orders/${order.id}`);
  assert.equal(after.status, 200);
  assert.equal(after.json.status, "refunded"); // unchanged, not resurrected
});

test("a replayed payment.captured after refund does not feed NaN into the ledger", async () => {
  const app = await freshApp();
  const widget = await makeProduct(app, {
    sku: "LC-REFUND-LEDGER",
    name: "Widget",
    price_cents: 1500,
  });
  const order = await makeOrder(app, widget);

  const refunded = await call(app, "POST", `/api/orders/${order.id}/refund`);
  assert.equal(refunded.status, 200);

  // Spy on logger.warn: the accounting handler swallows ledger failures and
  // logs "ledger posting failed" — before the fix, a partial replayed payload
  // produced a NaN-balance error on this exact path.
  const { logger } = await import("../../shared/logger.js");
  const warns: string[] = [];
  const origWarn = logger.warn.bind(logger);
  (logger as { warn: unknown }).warn = (...args: unknown[]) => {
    warns.push(JSON.stringify(args));
  };
  try {
    // Redelivered event with the partial payload real replays carry.
    await app.events.publish("payment.captured", { orderId: order.id }, order.id);
  } finally {
    (logger as { warn: unknown }).warn = origWarn;
  }

  const ledgerFailures = warns.filter((w) => w.includes("ledger posting failed"));
  assert.deepEqual(ledgerFailures, [], `ledger posting must not fail on replay: ${ledgerFailures[0] ?? ""}`);

  // Order state stays terminal and untouched.
  const after = await call(app, "GET", `/api/orders/${order.id}`);
  assert.equal(after.json.status, "refunded");
});

test("a replayed payment.captured after void does not feed NaN into the ledger", async () => {
  const app = await freshApp();
  const widget = await makeProduct(app, {
    sku: "LC-VOID-LEDGER",
    name: "Widget",
    price_cents: 1500,
  });
  const order = await makeOrder(app, widget);

  const voided = await call(app, "POST", `/api/orders/${order.id}/void`);
  assert.equal(voided.status, 200);

  const { logger } = await import("../../shared/logger.js");
  const warns: string[] = [];
  const origWarn = logger.warn.bind(logger);
  (logger as { warn: unknown }).warn = (...args: unknown[]) => {
    warns.push(JSON.stringify(args));
  };
  try {
    await app.events.publish("payment.captured", { orderId: order.id }, order.id);
  } finally {
    (logger as { warn: unknown }).warn = origWarn;
  }

  const ledgerFailures = warns.filter((w) => w.includes("ledger posting failed"));
  assert.deepEqual(ledgerFailures, [], `ledger posting must not fail on replay: ${ledgerFailures[0] ?? ""}`);

  const after = await call(app, "GET", `/api/orders/${order.id}`);
  assert.equal(after.json.status, "voided");
});

test("a late payment.captured event does NOT resurrect a voided order", async () => {
  const app = await freshApp();
  const widget = await makeProduct(app, {
    sku: "LC-VOID",
    name: "Widget",
    price_cents: 1500,
  });
  const order = await makeOrder(app, widget);

  const voided = await call(app, "POST", `/api/orders/${order.id}/void`);
  assert.equal(voided.status, 200);
  assert.equal(voided.json.status, "voided");

  await app.events.publish("payment.captured", { orderId: order.id }, order.id);

  const after = await call(app, "GET", `/api/orders/${order.id}`);
  assert.equal(after.status, 200);
  assert.equal(after.json.status, "voided"); // unchanged, not resurrected
});
