import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp, type App } from "../../app.js";

let __seq = 0;
const __schema = () => `test_${process.pid}_${Date.now().toString(36)}_${__seq++}`;
async function freshApp(): Promise<App> { return buildApp({ schema: __schema() }); }
async function call(app: App, method: string, path: string, body?: unknown) {
  const { default: request } = await import("./test-request.js");
  return request(app.express, method, path, body);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function mkProduct(app: App, sku: string, priceCents: number) {
  const prod = (await call(app, "POST", "/api/catalog/", { sku, name: `Product ${sku}`, price_cents: priceCents, category: "general" })).json;
  await call(app, "POST", `/api/inventory/${prod.id}/receive`, { quantity: 100 });
  return prod as { id: string; name: string };
}

async function mkCustomer(app: App, name = "Wholesale Corp") {
  const r = await call(app, "POST", "/api/customers/", { name });
  assert.equal(r.status, 201);
  return r.json as { id: string };
}

// ─── Quotations ───────────────────────────────────────────────────────────────

test("create a quotation with lines and list it", async () => {
  const app = await freshApp();
  const customer = await mkCustomer(app);
  const prod = await mkProduct(app, "QT-A", 2500);

  const r = await call(app, "POST", "/api/sales/quotations", {
    customerId: customer.id,
    lines: [{ productId: prod.id, quantity: 3 }],
  });
  assert.equal(r.status, 201);
  assert.ok(r.json.id.startsWith("qot_"));
  assert.match(r.json.quote_number, /^QT-/);
  assert.equal(r.json.status, "draft");
  assert.equal(r.json.customer_id, customer.id);
  assert.ok(Array.isArray(r.json.lines) && r.json.lines.length === 1);
  assert.equal(r.json.lines[0].quantity, 3);
  assert.equal(r.json.lines[0].line_cents, 7500); // 3 × 2500

  const list = await call(app, "GET", "/api/sales/quotations");
  assert.equal(list.status, 200);
  assert.ok(list.json.items.some((q: { id: string }) => q.id === r.json.id));
});

test("quotation lifecycle: draft → sent → accepted", async () => {
  const app = await freshApp();
  const customer = await mkCustomer(app);
  const prod = await mkProduct(app, "QT-B", 1000);

  const qt = (await call(app, "POST", "/api/sales/quotations", { customerId: customer.id, lines: [{ productId: prod.id, quantity: 1 }] })).json;
  assert.equal(qt.status, "draft");

  const sent = (await call(app, "POST", `/api/sales/quotations/${qt.id}/send`, {})).json;
  assert.equal(sent.status, "sent");

  const accepted = (await call(app, "POST", `/api/sales/quotations/${qt.id}/accept`, {})).json;
  assert.equal(accepted.status, "accepted");
});

test("convert accepted quotation to sales order", async () => {
  const app = await freshApp();
  const customer = await mkCustomer(app);
  const prod = await mkProduct(app, "QT-C", 3000);

  const qt = (await call(app, "POST", "/api/sales/quotations", { customerId: customer.id, lines: [{ productId: prod.id, quantity: 2 }] })).json;
  await call(app, "POST", `/api/sales/quotations/${qt.id}/send`, {});
  await call(app, "POST", `/api/sales/quotations/${qt.id}/accept`, {});

  const so = await call(app, "POST", `/api/sales/quotations/${qt.id}/convert`, {});
  assert.equal(so.status, 201);
  assert.ok(so.json.id.startsWith("sso_"));
  assert.match(so.json.so_number, /^SO-/);
  assert.equal(so.json.status, "pending_approve");
  assert.equal(so.json.customer_id, customer.id);
});

// ─── Sales Orders ─────────────────────────────────────────────────────────────

test("create sales order directly and approve it", async () => {
  const app = await freshApp();
  const customer = await mkCustomer(app);
  const prod = await mkProduct(app, "SO-A", 5000);

  const so = await call(app, "POST", "/api/sales/sales-orders", {
    customerId: customer.id,
    lines: [{ productId: prod.id, quantity: 1 }],
  });
  assert.equal(so.status, 201);
  assert.equal(so.json.status, "pending_approve");

  const approved = (await call(app, "POST", `/api/sales/sales-orders/${so.json.id}/approve`, {}));
  assert.equal(approved.status, 200);
  assert.equal(approved.json.status, "approved");
});

test("sales order list and get by id", async () => {
  const app = await freshApp();
  const customer = await mkCustomer(app);
  const prod = await mkProduct(app, "SO-B", 1500);

  const so = (await call(app, "POST", "/api/sales/sales-orders", { customerId: customer.id, lines: [{ productId: prod.id, quantity: 4 }] })).json;

  const list = await call(app, "GET", "/api/sales/sales-orders");
  assert.equal(list.status, 200);
  assert.ok(list.json.items.some((s: { id: string }) => s.id === so.id));

  const got = await call(app, "GET", `/api/sales/sales-orders/${so.id}`);
  assert.equal(got.status, 200);
  assert.equal(got.json.id, so.id);
  assert.equal(got.json.total_cents, 6000); // 4 × 1500
});

test("quotation requires at least one line", async () => {
  const app = await freshApp();
  const customer = await mkCustomer(app);
  const r = await call(app, "POST", "/api/sales/quotations", { customerId: customer.id, lines: [] });
  assert.equal(r.status, 400);
});

test("cannot convert a cancelled quotation", async () => {
  const app = await freshApp();
  const customer = await mkCustomer(app);
  const prod = await mkProduct(app, "QT-D", 500);
  const qt = (await call(app, "POST", "/api/sales/quotations", { customerId: customer.id, lines: [{ productId: prod.id, quantity: 1 }] })).json;

  // Cancel the quotation first
  const cancelled = await call(app, "POST", `/api/sales/quotations/${qt.id}/cancel`, {});
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.json.status, "cancelled");

  // Cancelled → convert should be rejected with 409
  const r = await call(app, "POST", `/api/sales/quotations/${qt.id}/convert`, {});
  assert.equal(r.status, 409);
});

// ─── POS sales history (GET /history) ──────────────────────────────────────
// Real customer/sold-by/outlet/lines/payments + keyset pagination — before
// this pass /history hardcoded sold_by="Staff"/outlet="Main Outlet", returned
// no lines/payments at all (the frontend fabricated them), and had zero test
// coverage of any kind.

async function mkLocation(app: App, code: string, name: string) {
  const r = await call(app, "POST", "/api/inventory/locations", { code, name });
  assert.equal(r.status, 201, `location create failed: ${JSON.stringify(r.json)}`);
  return r.json as { id: string; name: string };
}

async function mkOrder(app: App, productId: string, opts: { customerId?: string; storeId?: string } = {}) {
  const r = await call(app, "POST", "/api/orders/", {
    stateCode: "CA",
    lines: [{ productId, quantity: 1 }],
    ...opts,
  });
  assert.equal(r.status, 201, `order create failed: ${JSON.stringify(r.json)}`);
  return r.json as { id: string; total_cents: number };
}

test("/history: real customer name, real outlet, no fabricated sold_by, real lines/payments", async () => {
  const app = await freshApp();
  const customer = await mkCustomer(app, "Jane Smith");
  const location = await mkLocation(app, "HIST-1", "Downtown Outlet");
  const prod = await mkProduct(app, "HIST-A", 4200);

  const order = await mkOrder(app, prod.id, { customerId: customer.id, storeId: location.id });
  const pay = await call(app, "POST", "/api/payments/", {
    orderId: order.id, method: "cash", tenderedCents: order.total_cents,
  });
  assert.equal(pay.status, 201);

  const history = await call(app, "GET", "/api/sales/history");
  assert.equal(history.status, 200);
  const item = history.json.items.find((i: { id: string }) => i.id === order.id);
  assert.ok(item, "created order should appear in sales history");

  // Real customer name via LEFT JOIN customers — not the raw customer_id.
  assert.equal(item.customer_name, "Jane Smith");

  // Real outlet via LEFT JOIN inventory_locations — not the hardcoded "Main Outlet".
  assert.equal(item.outlet, "Downtown Outlet");

  // sold_by must no longer be the hardcoded literal "Staff".
  assert.notEqual(item.sold_by, "Staff");

  // Real line items — not the fabricated "Item (demo)" fallback.
  assert.equal(item.lines.length, 1);
  assert.equal(item.lines[0].name, "Product HIST-A"); // mkProduct's real name, not a placeholder
  // line_cents is pre-tax; order.total_cents includes CA sales tax on top of it.
  assert.equal(item.lines[0].total_cents + item.lines[0].tax_cents, order.total_cents);

  // Real payment — not the fabricated "Cash" fallback for the full total by coincidence;
  // assert the actual method/amount came from the real payment row.
  assert.equal(item.payments.length, 1);
  assert.equal(item.payments[0].method, "cash");
  assert.equal(item.payments[0].amount_cents, order.total_cents);
  assert.equal(item.status, "completed");
});

test("/history: order with no customer/store shows null/fallback, not fabricated values", async () => {
  const app = await freshApp();
  const prod = await mkProduct(app, "HIST-B", 1000);
  const order = await mkOrder(app, prod.id);

  const history = await call(app, "GET", "/api/sales/history");
  const item = history.json.items.find((i: { id: string }) => i.id === order.id);
  assert.ok(item);
  assert.equal(item.customer_name, null);
  assert.equal(item.outlet, "Unassigned");
});

test("/history: status filter narrows results server-side", async () => {
  const app = await freshApp();
  const prod = await mkProduct(app, "HIST-C", 500);
  const order = await mkOrder(app, prod.id);
  // Order stays "open" (no payment captured).

  const completedOnly = await call(app, "GET", "/api/sales/history?status=completed");
  assert.ok(!completedOnly.json.items.some((i: { id: string }) => i.id === order.id));

  const openOnly = await call(app, "GET", "/api/sales/history?status=open");
  assert.ok(openOnly.json.items.some((i: { id: string }) => i.id === order.id));
});

test("/history: q searches both receipt number and customer name", async () => {
  const app = await freshApp();
  const customer = await mkCustomer(app, "Unique Customer Zzz");
  const prod = await mkProduct(app, "HIST-D", 700);
  const order = await mkOrder(app, prod.id, { customerId: customer.id });

  const byCustomer = await call(app, "GET", "/api/sales/history?q=unique%20customer%20zzz");
  assert.ok(byCustomer.json.items.some((i: { id: string }) => i.id === order.id));

  const noMatch = await call(app, "GET", "/api/sales/history?q=definitely-not-a-match-xyz");
  assert.ok(!noMatch.json.items.some((i: { id: string }) => i.id === order.id));
});

test("/history: keyset pagination returns a nextCursor and the next page via it", async () => {
  const app = await freshApp();
  const prod = await mkProduct(app, "HIST-E", 300);
  const orderIds: string[] = [];
  for (let i = 0; i < 3; i++) {
    const order = await mkOrder(app, prod.id);
    orderIds.push(order.id);
  }

  const page1 = await call(app, "GET", "/api/sales/history?limit=2");
  assert.equal(page1.json.items.length, 2);
  assert.ok(page1.json.nextCursor, "first page should carry a cursor when more rows exist");

  const page2 = await call(app, "GET", `/api/sales/history?limit=2&cursor=${encodeURIComponent(page1.json.nextCursor)}`);
  assert.ok(page2.json.items.length >= 1);
  // No overlap between pages.
  const page1Ids = page1.json.items.map((i: { id: string }) => i.id);
  const page2Ids = page2.json.items.map((i: { id: string }) => i.id);
  assert.ok(page1Ids.every((id: string) => !page2Ids.includes(id)));
});
