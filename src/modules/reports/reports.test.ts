import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp, type App } from "../../app.js";

let __seq = 0;
const __schema = () => `test_${process.pid}_${Date.now().toString(36)}_${__seq++}`;

async function freshApp(): Promise<App> {
  return await buildApp({ schema: __schema() });
}

async function call(app: App, method: string, path: string, body?: unknown) {
  const { default: request } = await import("./test-request.js");
  return request(app.express, method, path, body);
}

test("sales summary aggregates orders, revenue, and captured payments for the tenant", async () => {
  const app = await freshApp();

  let r = await call(app, "GET", "/api/reports/summary");
  assert.equal(r.status, 200);
  assert.equal(r.json.orders.total, 0);
  assert.equal(r.json.revenue.grossCents, 0);
  assert.equal(r.json.payments.capturedCount, 0);

  const p = await call(app, "POST", "/api/catalog/", {
    sku: "RPT-001", name: "Report Widget", price_cents: 1000, category: "general",
  });
  assert.equal(p.status, 201);
  await call(app, "POST", `/api/inventory/${p.json.id}/receive`, { quantity: 10 });

  // 2 units @ $10 = $20 subtotal, CA tax 8.25% = $1.65, total $21.65.
  const o = await call(app, "POST", "/api/orders/", {
    stateCode: "CA",
    lines: [{ productId: p.json.id, quantity: 2 }],
  });
  assert.equal(o.status, 201);
  assert.equal(o.json.total_cents, 2165);

  // Full cash payment -> order completes, payment captured.
  const pay = await call(app, "POST", "/api/payments/", {
    orderId: o.json.id, method: "cash", tenderedCents: 2165,
  });
  assert.equal(pay.status, 201);

  r = await call(app, "GET", "/api/reports/summary");
  assert.equal(r.status, 200);
  assert.equal(r.json.orders.completed, 1, "one completed order");
  assert.equal(r.json.orders.total, 1);
  assert.equal(r.json.revenue.grossCents, 2165, "gross = completed order total");
  assert.equal(r.json.revenue.taxCents, 165, "tax recognised");
  assert.equal(r.json.revenue.netCents, 2000, "net = gross - tax");
  assert.equal(r.json.payments.capturedCount, 1);
  assert.equal(r.json.payments.capturedCents, 2165);
  assert.equal(r.json.payments.byMethod.cash, 2165);
});

test("reports reflect only the caller's tenant data", async () => {
  const app = await freshApp();
  const p = await call(app, "POST", "/api/catalog/", {
    sku: "RPT-ISO", name: "Iso Widget", price_cents: 500, category: "general",
  });
  await call(app, "POST", `/api/inventory/${p.json.id}/receive`, { quantity: 5 });
  const o = await call(app, "POST", "/api/orders/", {
    stateCode: "TX", lines: [{ productId: p.json.id, quantity: 1 }],
  });
  await call(app, "POST", "/api/payments/", { orderId: o.json.id, method: "cash", tenderedCents: o.json.total_cents });

  const r = await call(app, "GET", "/api/reports/summary");
  assert.equal(r.json.orders.total, 1);
  assert.equal(r.json.payments.capturedCount, 1);
});
