import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../../app.js";
import { findInventoryDrift } from "./inventory-reconciliation.job.js";

let __seq = 0;
const __schema = () => `test_${process.pid}_${Date.now().toString(36)}_${__seq++}`;

async function call(
  app: Awaited<ReturnType<typeof buildApp>>,
  method: string,
  path: string,
  body?: unknown,
  role?: string,
): Promise<{ status: number; json: any }> {
  const { default: request } = await import("../../modules/inventory/test-request.js");
  return request(app.express, method, path, body, role);
}

test("findInventoryDrift: no drift when stock_qty and the movement ledger agree", async () => {
  const app = await buildApp({ schema: __schema() });

  const receive = await call(app, "POST", "/api/inventory/prod_clean/receive", { quantity: 25 });
  assert.equal(receive.status, 201, `receive failed: ${JSON.stringify(receive.json)}`);

  const drift = await findInventoryDrift(app.db);
  assert.deepEqual(
    drift.filter((d) => d.product_id === "prod_clean"),
    [],
    "a normal receive through adjustTx must never show up as drift",
  );
});

test("findInventoryDrift: catches stock_qty diverging from SUM(inventory_movements.delta)", async () => {
  const app = await buildApp({ schema: __schema() });

  const receive = await call(app, "POST", "/api/inventory/prod_drift/receive", { quantity: 10 });
  assert.equal(receive.status, 201, `receive failed: ${JSON.stringify(receive.json)}`);

  // Simulate the exact failure class this detector exists for: something
  // outside adjustTx's paired (stock_qty, movement) transaction corrupts the
  // cache — e.g. a hand-run UPDATE, a bug in a code path that forgot to
  // record the movement. This tenant/product must show up as drifted.
  await app.db.query(
    "UPDATE inventory SET stock_qty = stock_qty + 999 WHERE tenant_id = @t AND product_id = @p",
    { t: "tnt_demo", p: "prod_drift" },
  );

  const drift = await findInventoryDrift(app.db);
  const row = drift.find((d) => d.product_id === "prod_drift");
  assert.ok(row, "corrupted stock_qty must be reported as drift");
  assert.equal(row!.stock_qty, 1009);
  assert.equal(row!.ledger_sum, 10);
  assert.equal(row!.diff, 999);
});

test("findInventoryDrift: unrelated products with matching ledgers are not false positives", async () => {
  const app = await buildApp({ schema: __schema() });

  await call(app, "POST", "/api/inventory/prod_a/receive", { quantity: 5 });
  await call(app, "POST", "/api/inventory/prod_b/receive", { quantity: 7 });

  const drift = await findInventoryDrift(app.db);
  assert.deepEqual(
    drift.filter((d) => d.product_id === "prod_a" || d.product_id === "prod_b"),
    [],
  );
});
