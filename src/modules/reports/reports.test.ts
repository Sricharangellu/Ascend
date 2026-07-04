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

test("end-of-day report: transactions, sales, tenders, top items, cash drawer", async () => {
  const app = await freshApp();

  // Register with an open session so the drawer section has a float.
  const outlet = (await call(app, "POST", "/api/outlets/", { name: "EOD Store" })).json;
  const reg = (await call(app, "POST", `/api/outlets/${outlet.id}/registers`, { name: "Till Z" })).json;
  const opened = await call(app, "POST", `/api/outlets/registers/${reg.id}/open`, { openingFloatCents: 20000 });
  assert.equal(opened.status, 201);

  // Catalog + stock.
  const p = await call(app, "POST", "/api/catalog/", {
    sku: "EOD-001", name: "Z Widget", price_cents: 1000, category: "general",
  });
  assert.equal(p.status, 201);
  await call(app, "POST", `/api/inventory/${p.json.id}/receive`, { quantity: 10 });

  // Sale 1: 2 units, CA tax, paid cash with change (tendered over total).
  const o1 = (await call(app, "POST", "/api/orders/", {
    stateCode: "CA", lines: [{ productId: p.json.id, quantity: 2 }],
  })).json;
  const pay1 = await call(app, "POST", "/api/payments/", {
    orderId: o1.id, method: "cash", tenderedCents: 3000,
  });
  assert.equal(pay1.status, 201);

  // Sale 2: 1 unit paid cash exactly, then refunded — refund must subtract
  // from net sales and cash refunds must reduce expected drawer cash.
  const o2 = (await call(app, "POST", "/api/orders/", {
    stateCode: "CA", lines: [{ productId: p.json.id, quantity: 1 }],
  })).json;
  await call(app, "POST", "/api/payments/", { orderId: o2.id, method: "cash", tenderedCents: o2.total_cents });
  const refunded = await call(app, "POST", `/api/orders/${o2.id}/refund`);
  assert.equal(refunded.status, 200);

  const r = await call(app, "GET", "/api/reports/end-of-day");
  assert.equal(r.status, 200);
  const eod = r.json;

  // Session state.
  assert.equal(eod.status, "open");
  assert.equal(eod.closedAt, null);

  // Transactions: 2 sold (1 completed + 1 refunded), no voids.
  assert.equal(eod.transactions.count, 2);
  assert.equal(eod.transactions.refundCount, 1);
  assert.equal(eod.transactions.voidCount, 0);

  // Sales: gross = subtotals (2+1 units @ $10 = $30.00); refund subtracts o2 total.
  assert.equal(eod.sales.grossSales_cents, 3000);
  assert.equal(eod.sales.refunds_cents, o2.total_cents);
  assert.equal(eod.sales.netSales_cents, 3000 - o2.total_cents);
  assert.equal(eod.sales.totalCollected_cents, eod.sales.netSales_cents + eod.sales.taxCollected_cents);

  // Tenders: two cash payments; cash total is net of change given on sale 1.
  const cash = eod.tenders.find((t: { method: string }) => t.method === "Cash");
  assert.equal(cash.count, 2);
  assert.equal(cash.total_cents, o1.total_cents + o2.total_cents);

  // Top items: our single product with 3 units.
  assert.equal(eod.topItems.length, 1);
  assert.equal(eod.topItems[0].quantitySold, 3);

  // Drawer while open: expected = float + cash sales − cash refunds; no variance yet.
  assert.equal(eod.cashDrawer.openingFloat_cents, 20000);
  assert.equal(eod.cashDrawer.cashRefunds_cents, o2.total_cents);
  assert.equal(eod.cashDrawer.expectedCash_cents, 20000 + o1.total_cents);
  assert.equal(eod.cashDrawer.actualCash_cents, null);
  assert.equal(eod.cashDrawer.variance_cents, null);

  // Close the register counting a $5.00 overage — variance must surface it.
  const counted = 20000 + o1.total_cents + 500;
  const closed = await call(app, "POST", `/api/outlets/registers/${reg.id}/close`, { countedCashCents: counted });
  assert.equal(closed.status, 200);

  const r2 = await call(app, "GET", "/api/reports/end-of-day");
  assert.equal(r2.json.status, "closed");
  assert.equal(r2.json.cashDrawer.actualCash_cents, counted);
  assert.equal(r2.json.cashDrawer.variance_cents, 500);

  // Bad date is a 400, not a crash.
  const bad = await call(app, "GET", "/api/reports/end-of-day?date=not-a-date");
  assert.equal(bad.status, 400);
});
