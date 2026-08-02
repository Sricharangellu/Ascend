import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp, type App } from "../app.js";
import { computeSalesVelocity, computeSalesVelocityForProduct } from "./sales-velocity.js";

const TEST_TENANT = "tnt_demo";
const DAY = 86_400_000;

let __seq = 0;
const __schema = () => `svtest_${process.pid}_${Date.now().toString(36)}_${__seq++}`;

async function freshApp(): Promise<App> {
  return buildApp({ schema: __schema() });
}

async function call(app: App, method: string, path: string, body?: unknown, role = "manager") {
  const { default: request } = await import("../modules/catalog/test-request.js");
  return request(app.express, method, path, body, role);
}

async function makeProduct(app: App, sku: string, category = "general"): Promise<string> {
  const { status, json } = await call(app, "POST", "/api/catalog/", {
    sku, name: `Product ${sku}`, price_cents: 1000, raw_cost_price_cents: 500, category,
  });
  assert.equal(status, 201, `product create failed: ${JSON.stringify(json)}`);
  return json.id;
}

async function insertOrder(
  app: App,
  opts: { productId: string; quantity: number; status?: string; createdAt?: number; storeId?: string | null },
): Promise<void> {
  const orderId = `ord_test_${Math.random().toString(36).slice(2)}`;
  const lineId = `oln_test_${Math.random().toString(36).slice(2)}`;
  const unitCents = 500;
  const lineCents = opts.quantity * unitCents;
  const createdAt = opts.createdAt ?? Date.now();
  const status = opts.status ?? "completed";
  await app.db.withTenant(TEST_TENANT).query(
    `INSERT INTO orders (id, tenant_id, order_number, state_code, status, subtotal_cents, tax_cents, total_cents, store_id, created_at, updated_at)
     VALUES (@id, @t, @num, 'CA', @status, @total, 0, @total, @storeId, @createdAt, @createdAt)`,
    { id: orderId, t: TEST_TENANT, num: orderId, status, total: lineCents, storeId: opts.storeId ?? null, createdAt },
  );
  await app.db.withTenant(TEST_TENANT).query(
    `INSERT INTO order_lines (id, tenant_id, order_id, product_id, name, quantity, unit_cents, tax_cents, line_cents, taxable)
     VALUES (@id, @t, @orderId, @productId, 'Test Line', @qty, @unitCents, 0, @lineCents, 0)`,
    { id: lineId, t: TEST_TENANT, orderId, productId: opts.productId, qty: opts.quantity, unitCents, lineCents },
  );
}

test("computeSalesVelocity: batches multiple products in one call, one row each", async () => {
  const app = await freshApp();
  const a = await makeProduct(app, "SV-BATCH-A");
  const b = await makeProduct(app, "SV-BATCH-B");
  await insertOrder(app, { productId: a, quantity: 10 });
  await insertOrder(app, { productId: b, quantity: 4 });

  const result = await computeSalesVelocity(app.db, { tenantId: TEST_TENANT, lookbackDays: 30 });
  assert.equal(result.get(a)?.unitsSold, 10);
  assert.equal(result.get(b)?.unitsSold, 4);
  assert.equal(result.get(a)?.velocityPerDay, 10 / 30);
});

test("computeSalesVelocity: productIds filter restricts to the requested products only", async () => {
  const app = await freshApp();
  const a = await makeProduct(app, "SV-FILTER-A");
  const b = await makeProduct(app, "SV-FILTER-B");
  await insertOrder(app, { productId: a, quantity: 7 });
  await insertOrder(app, { productId: b, quantity: 9 });

  const result = await computeSalesVelocity(app.db, { tenantId: TEST_TENANT, lookbackDays: 30, productIds: [a] });
  assert.equal(result.get(a)?.unitsSold, 7);
  assert.equal(result.has(b), false, "unrequested product must not appear");
});

test("computeSalesVelocity: excludes non-completed orders and out-of-window sales", async () => {
  const app = await freshApp();
  const p = await makeProduct(app, "SV-CORRECT-1");
  await insertOrder(app, { productId: p, quantity: 5, status: "completed", createdAt: Date.now() - 2 * DAY });
  await insertOrder(app, { productId: p, quantity: 40, status: "refunded", createdAt: Date.now() - 2 * DAY });
  await insertOrder(app, { productId: p, quantity: 60, status: "completed", createdAt: Date.now() - 200 * DAY });

  const result = await computeSalesVelocity(app.db, { tenantId: TEST_TENANT, lookbackDays: 30, productIds: [p] });
  assert.equal(result.get(p)?.unitsSold, 5, "only the in-window completed sale should count");
});

test("computeSalesVelocity: storeId filters to a single outlet's sales", async () => {
  const app = await freshApp();
  const p = await makeProduct(app, "SV-STORE-1");
  await insertOrder(app, { productId: p, quantity: 6, storeId: "loc_a" });
  await insertOrder(app, { productId: p, quantity: 15, storeId: "loc_b" });

  const result = await computeSalesVelocity(app.db, { tenantId: TEST_TENANT, lookbackDays: 30, productIds: [p], storeId: "loc_a" });
  assert.equal(result.get(p)?.unitsSold, 6, "must only count loc_a's sale, not loc_b's");
});

test("computeSalesVelocity: category filters to products in that category", async () => {
  const app = await freshApp();
  const widget = await makeProduct(app, "SV-CAT-WIDGET", "widgets");
  const gadget = await makeProduct(app, "SV-CAT-GADGET", "gadgets");
  await insertOrder(app, { productId: widget, quantity: 3 });
  await insertOrder(app, { productId: gadget, quantity: 8 });

  const result = await computeSalesVelocity(app.db, { tenantId: TEST_TENANT, lookbackDays: 30, category: "widgets" });
  assert.equal(result.get(widget)?.unitsSold, 3);
  assert.equal(result.has(gadget), false, "a different category's product must not appear");
});

test("computeSalesVelocity: bucket='day' breaks the window into daily rows summing to the same total", async () => {
  const app = await freshApp();
  const p = await makeProduct(app, "SV-BUCKET-DAY-1");
  const now = Date.now();
  await insertOrder(app, { productId: p, quantity: 3, createdAt: now });
  await insertOrder(app, { productId: p, quantity: 5, createdAt: now - 1 * DAY });

  const result = await computeSalesVelocity(app.db, { tenantId: TEST_TENANT, lookbackDays: 7, productIds: [p], bucket: "day" });
  const row = result.get(p);
  assert.ok(row, "expected a velocity row");
  assert.equal(row!.unitsSold, 8, "whole-window total must still be correct");
  assert.ok(row!.buckets && row!.buckets.length >= 2, "expected at least 2 daily buckets");
  const bucketSum = row!.buckets!.reduce((s, b) => s + b.units, 0);
  assert.equal(bucketSum, 8, "bucket units must sum to the same whole-window total");
});

test("computeSalesVelocity: bucket='month' groups sales by calendar month", async () => {
  const app = await freshApp();
  const p = await makeProduct(app, "SV-BUCKET-MONTH-1");
  const now = Date.now();
  await insertOrder(app, { productId: p, quantity: 2, createdAt: now });
  // A sale ~65 days back almost certainly falls in a different calendar month.
  await insertOrder(app, { productId: p, quantity: 9, createdAt: now - 65 * DAY });

  const result = await computeSalesVelocity(app.db, { tenantId: TEST_TENANT, lookbackDays: 90, productIds: [p], bucket: "month" });
  const row = result.get(p);
  assert.ok(row);
  assert.equal(row!.unitsSold, 11);
  assert.ok(row!.buckets && row!.buckets.length >= 2, "expected sales in at least 2 distinct calendar-month buckets");
});

test("computeSalesVelocityForProduct: convenience wrapper matches the batch result for a single product", async () => {
  const app = await freshApp();
  const p = await makeProduct(app, "SV-SINGLE-1");
  await insertOrder(app, { productId: p, quantity: 12 });

  const single = await computeSalesVelocityForProduct(app.db, { tenantId: TEST_TENANT, productId: p, lookbackDays: 30 });
  assert.equal(single.unitsSold, 12);
  assert.equal(single.productId, p);
});

test("computeSalesVelocityForProduct: returns a real zero-object (not undefined) for a product with no sales", async () => {
  const app = await freshApp();
  const p = await makeProduct(app, "SV-NOSALES-1");
  const result = await computeSalesVelocityForProduct(app.db, { tenantId: TEST_TENANT, productId: p, lookbackDays: 30 });
  assert.equal(result.unitsSold, 0);
  assert.equal(result.velocityPerDay, 0);
  assert.equal(result.productId, p);
});
