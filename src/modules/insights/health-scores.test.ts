/**
 * health-scores.test.ts — GET /api/v1/insights/health-scores
 *
 * Deterministic, rule-based segmented health from real tenant data. `tnt_demo`
 * is pre-seeded with demo products (no cost/stock/sales/expenses), so tests
 * assert internal consistency + deltas rather than an empty tenant:
 *   1. Shape + the deterministic zero/neutral segments (no sales/revenue/expenses).
 *   2. Adding a product with a cost raises the priced-product signal and does not
 *      lower the catalog score.
 *   3. Non-manager is denied.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp, type App } from "../../app.js";

let __seq = 0;
const __schema = () => `hs_test_${process.pid}_${Date.now().toString(36)}_${__seq++}`;

async function freshApp(): Promise<App> {
  process.env["JWT_SECRET"] ??= "test-secret-finder-pos";
  return buildApp({ schema: __schema() });
}

async function call(app: App, method: string, path: string, body?: unknown, role = "owner") {
  const { default: request } = await import("./test-request.js");
  return request(app.express, method, path, body, role);
}

const seg = (json: { segments: Array<{ key: string }> }) =>
  Object.fromEntries(json.segments.map((s) => [s.key, s])) as Record<string, any>;

async function scores(app: App) {
  const { status, json } = await call(app, "GET", "/api/insights/health-scores", undefined, "manager");
  return { status, json };
}

// ── 1. Shape + deterministic segments ───────────────────────────────────────────
test("returns consistent segmented health scores from real data", async () => {
  const app = await freshApp();
  const { status, json } = await scores(app);
  assert.equal(status, 200, JSON.stringify(json));

  assert.deepEqual(
    json.segments.map((s: any) => s.key),
    ["catalog", "inventory", "sales", "margin", "expenses"],
  );
  for (const s of json.segments) {
    assert.ok(s.score >= 0 && s.score <= 100, `${s.key} score out of range: ${s.score}`);
  }
  assert.ok(json.overall >= 0 && json.overall <= 100);

  const s = seg(json);
  // No orders / revenue / expenses seeded → these are deterministic.
  assert.equal(s["sales"].score, 0);
  assert.equal(s["margin"].score, 0);
  assert.equal(s["expenses"].score, 30);
  assert.equal(json.signals.orders30d, 0);
  assert.equal(json.signals.revenueCents, 0);

  // overall is the rounded average of the five segment scores.
  const avg = Math.round(json.segments.reduce((a: number, x: any) => a + x.score, 0) / json.segments.length);
  assert.equal(json.overall, avg);
});

// ── 2. Adding a priced product improves the catalog signal ──────────────────────
test("a product with a cost raises the priced-product signal", async () => {
  const app = await freshApp();
  const before = (await scores(app)).json;

  const created = await call(app, "POST", "/api/catalog", {
    sku: "HS-1",
    name: "Priced",
    price_cents: 500,
    raw_cost_price_cents: 300,
  });
  assert.equal(created.status, 201, JSON.stringify(created.json));

  const after = (await scores(app)).json;
  assert.equal(after.signals.productsWithCost, before.signals.productsWithCost + 1);
  assert.equal(after.signals.productCount, before.signals.productCount + 1);
  // More priced products must not lower catalog health.
  assert.ok(seg(after)["catalog"].score >= seg(before)["catalog"].score);
});

// ── 3. RBAC ─────────────────────────────────────────────────────────────────────
test("non-manager is denied", async () => {
  const app = await freshApp();
  const { status } = await call(app, "GET", "/api/insights/health-scores", undefined, "cashier");
  assert.ok(status === 401 || status === 403, `expected 401/403, got ${status}`);
});
