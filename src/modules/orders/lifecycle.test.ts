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
