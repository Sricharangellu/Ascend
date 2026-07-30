import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp, type App } from "../../app.js";
import { DemandPlanningService } from "./service.js";

const TEST_TENANT = "tnt_demo";
const DAY_MS = 86_400_000;

let __seq = 0;
const __schema = () => `dptest_${process.pid}_${Date.now().toString(36)}_${__seq++}`;

async function freshApp(): Promise<App> {
  return buildApp({ schema: __schema() });
}

async function call(app: App, method: string, path: string, body?: unknown, role = "manager") {
  const { default: request } = await import("../catalog/test-request.js");
  return request(app.express, method, path, body, role);
}

async function makeProduct(app: App, sku: string): Promise<string> {
  const { status, json } = await call(app, "POST", "/api/catalog/", {
    sku, name: `Product ${sku}`, price_cents: 1000, raw_cost_price_cents: 500,
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

test("snapshotDay: aggregates only completed orders inside the target UTC day", async () => {
  const app = await freshApp();
  const p = await makeProduct(app, "DP-DAY-1");
  const dayStart = Math.floor(Date.now() / DAY_MS) * DAY_MS;

  await insertOrder(app, { productId: p, quantity: 5, status: "completed", createdAt: dayStart + 1000 });
  await insertOrder(app, { productId: p, quantity: 40, status: "refunded", createdAt: dayStart + 2000 });
  await insertOrder(app, { productId: p, quantity: 60, status: "completed", createdAt: dayStart - 5000 }); // previous day
  await insertOrder(app, { productId: p, quantity: 70, status: "completed", createdAt: dayStart + DAY_MS + 1000 }); // next day

  const service = new DemandPlanningService(app.db);
  const result = await service.snapshotDay(dayStart + 500);
  assert.equal(result.dayStart, dayStart);
  assert.equal(result.rowsWritten, 1, "exactly one (tenant,product,store) row for this day");

  const points = await service.getDemandHistory({
    tenantId: TEST_TENANT, productId: p, periodType: "day", fromMs: dayStart, toMs: dayStart + DAY_MS,
  });
  assert.equal(points.length, 1);
  assert.equal(points[0]!.unitsSold, 5, "only the in-window completed sale should count");
});

test("snapshotDay: idempotent — re-running the same day upserts instead of double-counting", async () => {
  const app = await freshApp();
  const p = await makeProduct(app, "DP-IDEMPOTENT-1");
  const dayStart = Math.floor(Date.now() / DAY_MS) * DAY_MS;
  await insertOrder(app, { productId: p, quantity: 8, createdAt: dayStart + 1000 });

  const service = new DemandPlanningService(app.db);
  await service.snapshotDay(dayStart + 500);
  await service.snapshotDay(dayStart + 500); // re-run, e.g. a retried job

  const points = await service.getDemandHistory({
    tenantId: TEST_TENANT, productId: p, periodType: "day", fromMs: dayStart, toMs: dayStart + DAY_MS,
  });
  assert.equal(points.length, 1);
  assert.equal(points[0]!.unitsSold, 8, "second run must upsert, not add a duplicate row");
});

test("snapshotDay: separates units by store_id", async () => {
  const app = await freshApp();
  const p = await makeProduct(app, "DP-STORE-1");
  const dayStart = Math.floor(Date.now() / DAY_MS) * DAY_MS;
  await insertOrder(app, { productId: p, quantity: 3, createdAt: dayStart + 1000, storeId: "loc_a" });
  await insertOrder(app, { productId: p, quantity: 9, createdAt: dayStart + 2000, storeId: "loc_b" });

  const service = new DemandPlanningService(app.db);
  const result = await service.snapshotDay(dayStart + 500);
  assert.equal(result.rowsWritten, 2, "one row per distinct store_id");

  const locAOnly = await service.getDemandHistory({
    tenantId: TEST_TENANT, productId: p, periodType: "day", fromMs: dayStart, toMs: dayStart + DAY_MS, storeId: "loc_a",
  });
  assert.equal(locAOnly[0]?.unitsSold, 3);
});

test("getDemandHistory: week/month aggregation sums daily snapshots correctly", async () => {
  const app = await freshApp();
  const p = await makeProduct(app, "DP-WEEK-1");
  const service = new DemandPlanningService(app.db);
  const today = Math.floor(Date.now() / DAY_MS) * DAY_MS;

  await insertOrder(app, { productId: p, quantity: 4, createdAt: today + 1000 });
  await insertOrder(app, { productId: p, quantity: 6, createdAt: today - DAY_MS + 1000 });
  await service.snapshotDay(today);
  await service.snapshotDay(today - DAY_MS);

  const weekPoints = await service.getDemandHistory({
    tenantId: TEST_TENANT, productId: p, periodType: "week", fromMs: today - 7 * DAY_MS, toMs: today + DAY_MS,
  });
  const totalUnits = weekPoints.reduce((sum, pt) => sum + pt.unitsSold, 0);
  assert.equal(totalUnits, 10, "week aggregation must sum both days' snapshots");
});

test("POST /demand-planning/snapshot is manager-gated", async () => {
  const app = await freshApp();
  const { status } = await call(app, "POST", "/api/demand-planning/snapshot", {}, "cashier");
  assert.equal(status, 403);
});

test("POST /demand-planning/snapshot then GET /history returns the persisted points", async () => {
  const app = await freshApp();
  const p = await makeProduct(app, "DP-ROUTE-1");
  const dayStart = Math.floor(Date.now() / DAY_MS) * DAY_MS;
  await insertOrder(app, { productId: p, quantity: 11, createdAt: dayStart + 1000 });

  const snap = await call(app, "POST", "/api/demand-planning/snapshot", { date: dayStart + 500 }, "manager");
  assert.equal(snap.status, 200);
  assert.equal(snap.json.rowsWritten, 1);

  const hist = await call(
    app,
    "GET",
    `/api/demand-planning/history/${p}?periodType=day&from=${dayStart}&to=${dayStart + DAY_MS}`,
    undefined,
    "manager",
  );
  assert.equal(hist.status, 200);
  assert.equal(hist.json.points.length, 1);
  assert.equal(hist.json.points[0].unitsSold, 11);
});
