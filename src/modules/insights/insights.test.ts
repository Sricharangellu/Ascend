/**
 * insights.test.ts — S3-INSIGHTS integration tests
 *
 * Tests:
 *   1. Owner can create a scheduled report
 *   2. List returns created scheduled reports
 *   3. Manager cannot create (403)
 *   4. Invalid email rejected (400)
 *   5. Patch updates frequency and advances next_send_at
 *   6. Trigger marks last_sent_at and advances next_send_at
 *   7. Delete removes the scheduled report
 *   8. GET /reorder returns array (empty when no qualifying products)
 *   9. GET /order-recommendations returns array (empty when no sales)
 *  10. Patch enabled=false disables the schedule
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp, type App } from "../../app.js";

let __seq = 0;
const __schema = () => `ins_test_${process.pid}_${Date.now().toString(36)}_${__seq++}`;

async function freshApp(): Promise<App> {
  process.env["JWT_SECRET"] ??= "test-secret-finder-pos";
  return buildApp({ schema: __schema() });
}

async function call(app: App, method: string, path: string, body?: unknown, role = "owner") {
  const { default: request } = await import("./test-request.js");
  return request(app.express, method, path, body, role);
}

async function makeProduct(app: App, sku: string, reorderQuantity: number): Promise<string> {
  const { status, json } = await call(app, "POST", "/api/catalog/", {
    sku, name: `Product ${sku}`, price_cents: 1000, raw_cost_price_cents: 500,
  }, "manager");
  assert.equal(status, 201, `product create failed: ${JSON.stringify(json)}`);
  const patched = await call(app, "PATCH", `/api/catalog/${json.id}`, { reorder_quantity: reorderQuantity }, "manager");
  assert.equal(patched.status, 200, `patch reorder_quantity failed: ${JSON.stringify(patched.json)}`);
  return json.id;
}

async function addPreferredSupplier(app: App, productId: string, name: string, costCents: number): Promise<string> {
  const { status, json } = await call(app, "POST", `/api/catalog/${productId}/suppliers`, {
    vendor_name: name, is_preferred: true, cost_cents: costCents,
  }, "manager");
  assert.equal(status, 201, `supplier link failed: ${JSON.stringify(json)}`);
  return json.vendor_id as string;
}

const TEST_TENANT = "tnt_demo";

/**
 * Directly inserts an order + single line at an arbitrary status/created_at —
 * bypassing the real order-creation flow, which always stamps 'completed' and
 * now(). Needed to reproduce the exact conditions the Phase 7 item 1 velocity
 * bug fix targets: an old sale (outside the lookback window) and a
 * non-completed sale (wrong status), both of which the pre-fix code counted.
 */
async function insertOrder(
  app: App,
  opts: { productId: string; quantity: number; status: string; createdAt: number },
): Promise<void> {
  const orderId = `ord_test_${Math.random().toString(36).slice(2)}`;
  const lineId = `oln_test_${Math.random().toString(36).slice(2)}`;
  const unitCents = 500;
  const lineCents = opts.quantity * unitCents;
  await app.db.withTenant(TEST_TENANT).query(
    `INSERT INTO orders (id, tenant_id, order_number, state_code, status, subtotal_cents, tax_cents, total_cents, created_at, updated_at)
     VALUES (@id, @t, @num, 'CA', @status, @total, 0, @total, @createdAt, @createdAt)`,
    { id: orderId, t: TEST_TENANT, num: orderId, status: opts.status, total: lineCents, createdAt: opts.createdAt },
  );
  await app.db.withTenant(TEST_TENANT).query(
    `INSERT INTO order_lines (id, tenant_id, order_id, product_id, name, quantity, unit_cents, tax_cents, line_cents, taxable)
     VALUES (@id, @t, @orderId, @productId, 'Test Line', @qty, @unitCents, 0, @lineCents, 0)`,
    { id: lineId, t: TEST_TENANT, orderId, productId: opts.productId, qty: opts.quantity, unitCents, lineCents },
  );
}

// ── 1. Create scheduled report ────────────────────────────────────────────────
test("owner can create a scheduled report", async () => {
  const app = await freshApp();
  const { status, json } = await call(app, "POST", "/api/insights/scheduled-reports", {
    name: "Weekly Sales",
    reportType: "sales_summary",
    frequency: "weekly",
    recipientEmails: ["cfo@example.com"],
  });
  assert.equal(status, 201, JSON.stringify(json));
  assert.ok(json.id.startsWith("srp_"));
  assert.equal(json.frequency, "weekly");
  assert.deepEqual(json.recipientEmails, ["cfo@example.com"]);
  assert.ok(json.nextSendAt > Date.now());
  assert.equal(json.enabled, true);
  assert.equal(json.lastSentAt, null);
});

// ── 2. List ───────────────────────────────────────────────────────────────────
test("list returns created scheduled reports", async () => {
  const app = await freshApp();
  await call(app, "POST", "/api/insights/scheduled-reports", {
    name: "Daily P&L",
    reportType: "p_l",
    frequency: "daily",
    recipientEmails: ["owner@example.com"],
  });
  const { status, json } = await call(app, "GET", "/api/insights/scheduled-reports", undefined, "manager");
  assert.equal(status, 200);
  assert.ok(Array.isArray(json.items));
  assert.ok(json.items.some((r: any) => r.name === "Daily P&L"));
});

// ── 3. Manager cannot create (403) ────────────────────────────────────────────
test("manager cannot create a scheduled report (403)", async () => {
  const app = await freshApp();
  const { status } = await call(
    app, "POST", "/api/insights/scheduled-reports",
    { name: "X", reportType: "sales_summary", frequency: "daily", recipientEmails: ["a@b.com"] },
    "manager",
  );
  assert.equal(status, 403);
});

// ── 4. Invalid email rejected ─────────────────────────────────────────────────
test("invalid recipient email is rejected (400)", async () => {
  const app = await freshApp();
  const { status } = await call(app, "POST", "/api/insights/scheduled-reports", {
    name: "Bad",
    reportType: "sales_summary",
    frequency: "daily",
    recipientEmails: ["not-an-email"],
  });
  assert.equal(status, 400);
});

// ── 5. Patch updates frequency ────────────────────────────────────────────────
test("patch updates frequency and advances next_send_at", async () => {
  const app = await freshApp();
  const { json: created } = await call(app, "POST", "/api/insights/scheduled-reports", {
    name: "Monthly Report",
    reportType: "ar_aging",
    frequency: "weekly",
    recipientEmails: ["gm@example.com"],
  });
  const originalNext = created.nextSendAt;
  const { status, json } = await call(app, "PATCH", `/api/insights/scheduled-reports/${created.id}`, {
    frequency: "monthly",
  });
  assert.equal(status, 200);
  assert.equal(json.frequency, "monthly");
  // Monthly adds ~30 days; weekly adds 7 — new nextSendAt should be farther out.
  assert.ok(json.nextSendAt > originalNext, "nextSendAt should advance on frequency change");
});

// ── 6. Trigger marks last_sent_at ─────────────────────────────────────────────
test("trigger marks last_sent_at and advances next_send_at", async () => {
  const app = await freshApp();
  const { json: created } = await call(app, "POST", "/api/insights/scheduled-reports", {
    name: "Trigger Test",
    reportType: "top_products",
    frequency: "daily",
    recipientEmails: ["ops@example.com"],
  });
  const before = Date.now();
  const { status, json } = await call(
    app, "POST", `/api/insights/scheduled-reports/${created.id}/trigger`,
    undefined, "manager",
  );
  assert.equal(status, 200, JSON.stringify(json));
  assert.ok(json.lastSentAt >= before);
  assert.ok(json.nextSendAt > json.lastSentAt);
});

// ── 7. Delete ─────────────────────────────────────────────────────────────────
test("delete removes the scheduled report (204)", async () => {
  const app = await freshApp();
  const { json: created } = await call(app, "POST", "/api/insights/scheduled-reports", {
    name: "To Delete",
    reportType: "ap_aging",
    frequency: "weekly",
    recipientEmails: ["del@example.com"],
  });
  const { status } = await call(app, "DELETE", `/api/insights/scheduled-reports/${created.id}`);
  assert.equal(status, 204);
  const { status: s2 } = await call(app, "GET", `/api/insights/scheduled-reports/${created.id}`, undefined, "manager");
  assert.equal(s2, 404);
});

// ── 8. GET /reorder returns array ─────────────────────────────────────────────
test("GET /reorder returns an array (empty when no qualifying products)", async () => {
  const app = await freshApp();
  const { status, json } = await call(app, "GET", "/api/insights/reorder", undefined, "manager");
  assert.equal(status, 200);
  assert.ok(Array.isArray(json.items));
});

// ── 9. GET /order-recommendations returns array ───────────────────────────────
test("GET /order-recommendations returns an array (empty when no sales)", async () => {
  const app = await freshApp();
  const { status, json } = await call(app, "GET", "/api/insights/order-recommendations", undefined, "manager");
  assert.equal(status, 200);
  assert.ok(Array.isArray(json.items));
});

// ── 10. Patch enabled=false disables the schedule ─────────────────────────────
test("patch enabled=false disables the scheduled report", async () => {
  const app = await freshApp();
  const { json: created } = await call(app, "POST", "/api/insights/scheduled-reports", {
    name: "Pausable Report",
    reportType: "inventory_valuation",
    frequency: "daily",
    recipientEmails: ["pause@example.com"],
  });
  const { status, json } = await call(app, "PATCH", `/api/insights/scheduled-reports/${created.id}`, {
    enabled: false,
  });
  assert.equal(status, 200);
  assert.equal(json.enabled, false);
});

// ── Phase 7 item 1 — shared sales-velocity service (WORK/FORWARD_PLAN.md) ────
//
// reorderRecommendations() previously computed velocity via a LEFT JOIN whose
// date filter lived in the ON clause (never actually excludes on a LEFT
// JOIN — the order_lines row survives regardless), and had no order-status
// filter at all. Both bugs are fixed by routing through the shared
// computeSalesVelocity(). This test reproduces the exact conditions that
// distinguish old (buggy) from new (correct) behavior.

test("GET /reorder: velocityPerDay only counts completed orders within the lookback window (Phase 7 item 1 bug fix)", async () => {
  const app = await freshApp();
  const product = await call(app, "POST", "/api/catalog/", {
    sku: "INS-VELOCITY-1", name: "Velocity Bug Product", price_cents: 1000, raw_cost_price_cents: 500,
  }, "manager");
  assert.equal(product.status, 201, JSON.stringify(product.json));
  const productId = product.json.id;
  // Fresh product: stock=0 <= reorder_point default(0) -> always appears in
  // reorderRecommendations() regardless of velocity, so this isolates
  // velocityPerDay itself rather than the inclusion filter.

  const DAY = 86_400_000;
  const now = Date.now();
  // In-window, completed: the only sale that should count.
  await insertOrder(app, { productId, quantity: 10, status: "completed", createdAt: now - 5 * DAY });
  // Outside the 90-day window, completed: old buggy ON-clause filter counted
  // this anyway (LEFT JOIN never excludes on it); the fix must not.
  await insertOrder(app, { productId, quantity: 50, status: "completed", createdAt: now - 200 * DAY });
  // In-window, but refunded: old code had no status filter at all and would
  // have counted this too; the fix must not.
  await insertOrder(app, { productId, quantity: 30, status: "refunded", createdAt: now - 3 * DAY });

  const { status, json } = await call(app, "GET", "/api/insights/reorder?lookbackDays=90", undefined, "manager");
  assert.equal(status, 200, JSON.stringify(json));
  const row = json.items.find((r: { productId: string }) => r.productId === productId);
  assert.ok(row, "expected the product in reorder recommendations (stock 0 <= reorder_point 0)");
  assert.equal(row.velocityPerDay, 10 / 90, "must count only the 10 in-window completed units, not the 50 stale or 30 refunded units");
});

// ── 11+. createReorderPOs — standalone bug fix (WORK/LOCK.md) ────────────────
//
// Prior behavior: INSERT INTO po_lines (a table that doesn't exist anywhere in
// this schema — the real table is purchase_order_lines) — every call 500'd,
// untested. Fixed to route through purchasing.createOrder() instead of
// hand-rolled INSERTs. These are this endpoint's first-ever tests.

test("create-reorder-pos: creates a real PO via purchasing.createOrder (real doc-number, real cost, no 500)", async () => {
  const app = await freshApp();
  const productId = await makeProduct(app, "INS-POBUG-1", 5);
  const supplierId = await addPreferredSupplier(app, productId, "Insights PO Vendor", 275);

  const result = await call(app, "POST", "/api/insights/create-reorder-pos", {}, "manager");
  assert.equal(result.status, 201, JSON.stringify(result.json));
  assert.equal(result.json.created, 1);
  assert.equal(result.json.skipped.length, 0);
  const created = result.json.pos[0];
  assert.equal(created.supplierId, supplierId);
  assert.equal(created.lineCount, 1);
  assert.ok(created.poNumber.length > 0, "must use the real doc-number sequence, not AUTO-<timestamp>");

  // Confirm it's a real, fetchable PO — not silently lost to a broken INSERT —
  // with the configured supplier cost, not a hardcoded 0.
  const po = await call(app, "GET", `/api/purchasing/orders/${created.id}`, undefined, "manager");
  assert.equal(po.status, 200, JSON.stringify(po.json));
  assert.equal(po.json.supplier_id, supplierId);
  assert.equal(po.json.lines.length, 1);
  assert.equal(po.json.lines[0].product_id, productId);
  assert.equal(po.json.lines[0].quantity, 5);
  assert.equal(po.json.lines[0].unit_cost_cents, 275, "must use the preferred supplier's real cost, not hardcoded 0");
});

test("create-reorder-pos: products with no preferred supplier are skipped, not silently dropped into a fake 'Unassigned' PO", async () => {
  const app = await freshApp();
  // No supplier link at all for this product.
  const productId = await makeProduct(app, "INS-POBUG-2", 3);

  const result = await call(app, "POST", "/api/insights/create-reorder-pos", {}, "manager");
  assert.equal(result.status, 200, JSON.stringify(result.json));
  assert.equal(result.json.created, 0);
  assert.equal(result.json.pos.length, 0);
  const skip = result.json.skipped.find((s: { productId: string }) => s.productId === productId);
  assert.ok(skip, "expected the unlinked product to be reported as skipped");
  assert.equal(skip.reason, "no_preferred_supplier");
});

test("create-reorder-pos: groups multiple below-point products under the same preferred supplier into one PO", async () => {
  const app = await freshApp();
  const supplierName = "Shared Insights Vendor";
  const productA = await makeProduct(app, "INS-POBUG-3A", 4);
  const supplierId = await addPreferredSupplier(app, productA, supplierName, 150);
  const productB = await makeProduct(app, "INS-POBUG-3B", 6);
  await addPreferredSupplier(app, productB, supplierName, 150); // same name -> same supplier (upsertSupplierByName)

  const result = await call(app, "POST", "/api/insights/create-reorder-pos", {}, "manager");
  assert.equal(result.status, 201, JSON.stringify(result.json));
  assert.equal(result.json.created, 1, "both products share one preferred supplier -> one PO, not two");
  assert.equal(result.json.pos[0].supplierId, supplierId);
  assert.equal(result.json.pos[0].lineCount, 2);
});

test("create-reorder-pos: no qualifying products returns created=0 (200, not 201) with empty pos/skipped", async () => {
  const app = await freshApp();
  const result = await call(app, "POST", "/api/insights/create-reorder-pos", {}, "manager");
  assert.equal(result.status, 200);
  assert.equal(result.json.created, 0);
  assert.deepEqual(result.json.pos, []);
  assert.deepEqual(result.json.skipped, []);
});

test("create-reorder-pos: cashier cannot create draft POs (403)", async () => {
  const app = await freshApp();
  const { status } = await call(app, "POST", "/api/insights/create-reorder-pos", {}, "cashier");
  assert.equal(status, 403);
});
