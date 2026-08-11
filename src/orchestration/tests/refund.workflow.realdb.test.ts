/**
 * Real-Postgres regression: validate_refund_eligibility must not SELECT
 * orders.refunded_cents (that column does not exist and is not migrated).
 * Fake-DB unit tests hid this forever by ignoring SQL.
 *
 * Also proves the refunds ledger table exists so check_double_refund_guard
 * can insert (the next silent failure after refunded_cents was removed).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp, type App } from "../../app.js";
import { RefundWorkflow } from "../workflows/refund.workflow.js";
import { EventBus } from "../../shared/events.js";

let __seq = 0;
const __schema = () => `test_rf_${process.pid}_${Date.now().toString(36)}_${__seq++}`;

async function freshApp(): Promise<App> {
  return await buildApp({ schema: __schema() });
}

async function call(
  app: App,
  method: string,
  path: string,
  body?: unknown,
  role?: string,
): Promise<{ status: number; json: any }> {
  const { default: request } = await import("../../modules/orders/test-request.js");
  return request(app.express, method, path, body, role);
}

test("refund workflow validate_refund_eligibility runs against real orders schema (no refunded_cents)", async () => {
  const app = await freshApp();

  // Prove the column is absent on the live schema this test boots.
  const cols = await app.db.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'orders'`,
  );
  assert.ok(
    !cols.some((c) => c.column_name === "refunded_cents"),
    "orders.refunded_cents must not exist — this regression is about that absence",
  );

  const { status: pStatus, json: product } = await call(app, "POST", "/api/catalog/", {
    sku: "RF-COL",
    name: "Refund Column Probe",
    price_cents: 2000,
    category: "general",
  });
  assert.equal(pStatus, 201);

  const { status: oStatus, json: order } = await call(app, "POST", "/api/orders/", {
    stateCode: "CA",
    lines: [{ productId: product.id, quantity: 1 }],
  });
  assert.equal(oStatus, 201);

  const events = new EventBus();
  const ctx = RefundWorkflow.buildContext(
    {
      id: order.id,
      tenantId: "tnt_demo",
      refundCents: order.total_cents,
      originalTotalCents: order.total_cents,
      lines: [],
    },
    "tnt_demo",
  );
  const step = RefundWorkflow.steps.find((s) => s.name === "validate_refund_eligibility")!;

  // Before the fix this threw: column "refunded_cents" does not exist
  const updated = await step.execute(ctx, app.db, events);
  assert.equal(updated.taxCents, order.tax_cents);
  assert.equal(updated.subtotalCents, order.total_cents - order.tax_cents);

  await app.db.close();
  await app.cleanup();
});

test("refund workflow check_double_refund_guard inserts into real refunds table", async () => {
  const app = await freshApp();

  const rel = await app.db.one<{ reg: string | null }>(
    "SELECT to_regclass('refunds')::text AS reg",
  );
  assert.equal(rel?.reg, "refunds", "refunds table must be migrated");

  const { json: product } = await call(app, "POST", "/api/catalog/", {
    sku: "RF-LED",
    name: "Refund Ledger Probe",
    price_cents: 1800,
    category: "general",
  });
  const { json: order } = await call(app, "POST", "/api/orders/", {
    stateCode: "CA",
    lines: [{ productId: product.id, quantity: 1 }],
  });

  const events = new EventBus();
  const ctx = {
    ...RefundWorkflow.buildContext(
      { id: order.id, tenantId: "tnt_demo", totalCents: order.total_cents },
      "tnt_demo",
    ),
    taxCents: order.tax_cents,
    subtotalCents: order.total_cents - order.tax_cents,
  };
  const step = RefundWorkflow.steps.find((s) => s.name === "check_double_refund_guard")!;
  // Before the migration this threw: relation "refunds" does not exist
  const updated = await step.execute(ctx, app.db, events);
  assert.ok(updated.refundId?.startsWith("ref_"));

  const row = await app.db.one<{ amount_cents: string; status: string }>(
    "SELECT amount_cents, status FROM refunds WHERE id = @id AND tenant_id = @tenantId",
    { id: updated.refundId, tenantId: "tnt_demo" },
  );
  assert.equal(Number(row?.amount_cents), order.total_cents);
  assert.equal(row?.status, "pending");

  await app.db.close();
  await app.cleanup();
});

test("POST /orders/:id/refund returns 200 even when RefundWorkflow later fails", async () => {
  // Documents the user-visible effect: the HTTP path is independent of the
  // async workflow. Inventory/accounting listen to order.refunded directly.
  const app = await freshApp();
  const { json: product } = await call(app, "POST", "/api/catalog/", {
    sku: "RF-HTTP",
    name: "Refund HTTP Probe",
    price_cents: 1500,
    category: "general",
  });
  const { json: order } = await call(app, "POST", "/api/orders/", {
    stateCode: "CA",
    lines: [{ productId: product.id, quantity: 1 }],
  });

  const { status, json } = await call(app, "POST", `/api/orders/${order.id}/refund`);
  assert.equal(status, 200);
  assert.equal(json.status, "refunded");

  await app.db.close();
  await app.cleanup();
});
