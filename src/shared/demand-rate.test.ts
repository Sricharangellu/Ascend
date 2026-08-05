import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp, type App } from "../app.js";
import { DemandPlanningService } from "../modules/demand_planning/service.js";
import {
  forecastPeriodEndMs,
  forecastUnitsToRatePerDay,
  resolveDemandRates,
} from "./demand-rate.js";

const TEST_TENANT = "tnt_demo";
const DAY = 86_400_000;

let __seq = 0;
const __schema = () => `drtest_${process.pid}_${Date.now().toString(36)}_${__seq++}`;

async function freshApp(): Promise<App> {
  return buildApp({ schema: __schema() });
}

async function call(app: App, method: string, path: string, body?: unknown, role = "manager") {
  const { default: request } = await import("../modules/catalog/test-request.js");
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
  opts: { productId: string; quantity: number; createdAt?: number },
): Promise<void> {
  const orderId = `ord_test_${Math.random().toString(36).slice(2)}`;
  const lineId = `oln_test_${Math.random().toString(36).slice(2)}`;
  const unitCents = 500;
  const lineCents = opts.quantity * unitCents;
  const createdAt = opts.createdAt ?? Date.now();
  await app.db.withTenant(TEST_TENANT).query(
    `INSERT INTO orders (id, tenant_id, order_number, state_code, status, subtotal_cents, tax_cents, total_cents, store_id, created_at, updated_at)
     VALUES (@id, @t, @num, 'CA', 'completed', @total, 0, @total, null, @createdAt, @createdAt)`,
    { id: orderId, t: TEST_TENANT, num: orderId, total: lineCents, createdAt },
  );
  await app.db.withTenant(TEST_TENANT).query(
    `INSERT INTO order_lines (id, tenant_id, order_id, product_id, name, quantity, unit_cents, tax_cents, line_cents, taxable)
     VALUES (@id, @t, @orderId, @productId, 'Test Line', @qty, @unitCents, 0, @lineCents, 0)`,
    { id: lineId, t: TEST_TENANT, orderId, productId: opts.productId, qty: opts.quantity, unitCents, lineCents },
  );
}

test("forecastUnitsToRatePerDay: day/week divide by fixed length; month by calendar days", () => {
  const dayStart = Date.UTC(2026, 7, 1); // Aug 1
  assert.equal(forecastUnitsToRatePerDay("day", dayStart, 10), 10);
  assert.equal(forecastUnitsToRatePerDay("week", dayStart, 70), 10);

  const febStart = Date.UTC(2026, 1, 1); // Feb 2026 — 28 days
  assert.equal(forecastPeriodEndMs("month", febStart) - febStart, 28 * DAY);
  assert.equal(forecastUnitsToRatePerDay("month", febStart, 280), 10);
});

test("resolveDemandRates: falls back to velocity when no covering forecast exists", async () => {
  const app = await freshApp();
  const p = await makeProduct(app, "DR-VEL-1");
  // 30 units over 30 days → 1.0/day
  await insertOrder(app, { productId: p, quantity: 30, createdAt: Date.now() - DAY });

  const rates = await resolveDemandRates(app.db, {
    tenantId: TEST_TENANT,
    productIds: [p],
    lookbackDays: 30,
  });
  const row = rates.get(p);
  assert.ok(row);
  assert.equal(row!.source, "velocity");
  assert.equal(row!.ratePerDay, 1);
});

test("resolveDemandRates: prefers a covering persisted forecast over live velocity", async () => {
  const app = await freshApp();
  const p = await makeProduct(app, "DR-FCST-1");
  // Velocity would be 1.0/day (30 units / 30 days) — forecast should win with 5.0/day.
  await insertOrder(app, { productId: p, quantity: 30, createdAt: Date.now() - DAY });

  const weekStart = Math.floor(Date.now() / (7 * DAY)) * (7 * DAY);
  const svc = new DemandPlanningService(app.db);
  await svc.createForecast({
    tenantId: TEST_TENANT,
    productId: p,
    periodType: "week",
    periodStart: weekStart,
    forecastUnits: 35, // 5/day
    method: "manual",
  });

  const rates = await resolveDemandRates(app.db, {
    tenantId: TEST_TENANT,
    productIds: [p],
    lookbackDays: 30,
    asOfMs: weekStart + DAY, // inside the forecast week
  });
  const row = rates.get(p);
  assert.ok(row);
  assert.equal(row!.source, "forecast");
  assert.equal(row!.method, "manual");
  assert.equal(row!.ratePerDay, 5);
  assert.equal(row!.forecastUnits, 35);
});

test("resolveDemandRates: closed (past) forecasts do not override velocity", async () => {
  const app = await freshApp();
  const p = await makeProduct(app, "DR-CLOSED-1");
  await insertOrder(app, { productId: p, quantity: 30, createdAt: Date.now() - DAY });

  const pastWeekStart = Math.floor(Date.now() / (7 * DAY)) * (7 * DAY) - 7 * DAY;
  const svc = new DemandPlanningService(app.db);
  await svc.createForecast({
    tenantId: TEST_TENANT,
    productId: p,
    periodType: "week",
    periodStart: pastWeekStart,
    forecastUnits: 999,
    method: "manual",
  });

  const rates = await resolveDemandRates(app.db, {
    tenantId: TEST_TENANT,
    productIds: [p],
    lookbackDays: 30,
  });
  const row = rates.get(p);
  assert.ok(row);
  assert.equal(row!.source, "velocity");
  assert.equal(row!.ratePerDay, 1);
});

test("resolveDemandRates: newest covering method wins when several overlap", async () => {
  const app = await freshApp();
  const p = await makeProduct(app, "DR-METHOD-1");
  const dayStart = Math.floor(Date.now() / DAY) * DAY;
  const svc = new DemandPlanningService(app.db);

  await svc.createForecast({
    tenantId: TEST_TENANT,
    productId: p,
    periodType: "day",
    periodStart: dayStart,
    forecastUnits: 2,
    method: "manual_a",
  });
  // Slight delay so created_at differs.
  await new Promise((r) => setTimeout(r, 5));
  await svc.createForecast({
    tenantId: TEST_TENANT,
    productId: p,
    periodType: "day",
    periodStart: dayStart,
    forecastUnits: 8,
    method: "manual_b",
  });

  const rates = await resolveDemandRates(app.db, {
    tenantId: TEST_TENANT,
    productIds: [p],
    asOfMs: dayStart + 1000,
  });
  const row = rates.get(p);
  assert.ok(row);
  assert.equal(row!.source, "forecast");
  assert.equal(row!.method, "manual_b");
  assert.equal(row!.ratePerDay, 8);
});
