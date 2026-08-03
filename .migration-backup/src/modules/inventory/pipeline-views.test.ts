import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp, type App } from "../../app.js";

let __seq = 0;
const __schema = () => `test_${process.pid}_${Date.now().toString(36)}_${__seq++}`;
async function freshApp(): Promise<App> {
  return await buildApp({ schema: __schema() });
}

async function call(
  app: App,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: any }> {
  const { default: request } = await import("./test-request.js");
  return request(app.express, method, path, body);
}

async function makeProduct(app: App, sku: string): Promise<string> {
  const { status, json } = await call(app, "POST", "/api/catalog/", {
    sku, name: `Product ${sku}`, price_cents: 1000, raw_cost_price_cents: 500,
  });
  assert.equal(status, 201, `product create failed: ${JSON.stringify(json)}`);
  return json.id;
}

async function makeSupplier(app: App, name: string): Promise<string> {
  const { status, json } = await call(app, "POST", "/api/purchasing/suppliers", { name });
  assert.equal(status, 201, `supplier create failed: ${JSON.stringify(json)}`);
  return json.id;
}

test("pipeline/pending: lists open PO lines with ordered/partial status", async () => {
  const app = await freshApp();
  const productId = await makeProduct(app, "PIPE-PEND-1");
  const supplierId = await makeSupplier(app, "Pipeline Supplier 1");

  const po = await call(app, "POST", "/api/purchasing/orders", {
    supplierId, lines: [{ productId, quantity: 10, unitCostCents: 200 }],
  });
  assert.equal(po.status, 201);

  const pending = await call(app, "GET", "/api/inventory/pipeline/pending");
  assert.equal(pending.status, 200, JSON.stringify(pending.json));
  const row = pending.json.items.find((i: { id: string }) => i.id === po.json.lines[0].id);
  assert.ok(row, "expected the new PO line in pending");
  assert.equal(row.qty_ordered, 10);
  assert.equal(row.qty_received, 0);
  assert.equal(row.status, "ordered");
  assert.equal(row.supplier_name, "Pipeline Supplier 1");

  // Partially receive — status flips to 'partial'.
  const receive = await call(app, "POST", `/api/purchasing/orders/${po.json.id}/receive`, {
    lines: [{ lineId: po.json.lines[0].id, qty: 4 }],
  });
  assert.equal(receive.status, 200);

  const pending2 = await call(app, "GET", "/api/inventory/pipeline/pending");
  const row2 = pending2.json.items.find((i: { id: string }) => i.id === po.json.lines[0].id);
  assert.ok(row2, "expected the partially-received line to remain in pending");
  assert.equal(row2.qty_received, 4);
  assert.equal(row2.status, "partial");
});

test("pipeline/pending: expected_date is a real lead-time-derived promise (Phase 6 item 3), not the order date", async () => {
  const app = await freshApp();
  const productId = await makeProduct(app, "PIPE-LEADTIME-1");
  const supplierId = await makeSupplier(app, "Lead Time Supplier");

  // addSupplier() resolves the link by name (upsertSupplierByName does a
  // case-insensitive exact match on suppliers.name), so using the same name
  // here links to the supplier already created via makeSupplier() above —
  // there is no vendor_id field in this endpoint's schema.
  const link = await call(app, "POST", `/api/catalog/${productId}/suppliers`, {
    vendor_name: "Lead Time Supplier", lead_time_days: 10,
  });
  assert.equal(link.status, 201, JSON.stringify(link.json));

  const po = await call(app, "POST", "/api/purchasing/orders", {
    supplierId, lines: [{ productId, quantity: 5, unitCostCents: 200 }],
  });
  assert.equal(po.status, 201);

  const pending = await call(app, "GET", "/api/inventory/pipeline/pending");
  assert.equal(pending.status, 200);
  const row = pending.json.items.find((i: { id: string }) => i.id === po.json.lines[0].id);
  assert.ok(row, "expected the new PO line in pending");
  assert.equal(row.lead_time_days, 10);
  // expected_date must be ordered_at + 10 days, not the bare order date.
  const orderedAt = po.json.created_at as number;
  const tenDaysMs = 10 * 24 * 60 * 60 * 1000;
  assert.equal(row.expected_date, orderedAt + tenDaysMs);
  assert.equal(row.days_overdue, 0, "a line ordered just now, with a 10-day lead time, is not overdue");
});

test("pipeline/history: fully received POs appear with lead_time_days and closed status", async () => {
  const app = await freshApp();
  const productId = await makeProduct(app, "PIPE-HIST-1");
  const supplierId = await makeSupplier(app, "Pipeline Supplier 2");
  const po = await call(app, "POST", "/api/purchasing/orders", {
    supplierId, lines: [{ productId, quantity: 5, unitCostCents: 300 }],
  });
  const receive = await call(app, "POST", `/api/purchasing/orders/${po.json.id}/receive`, {
    lines: [{ lineId: po.json.lines[0].id, qty: 5 }],
  });
  assert.equal(receive.status, 200);
  assert.equal(receive.json.status, "received");

  const history = await call(app, "GET", "/api/inventory/pipeline/history");
  assert.equal(history.status, 200, JSON.stringify(history.json));
  const row = history.json.items.find((i: { id: string }) => i.id === po.json.lines[0].id);
  assert.ok(row, "expected the fully-received line in history");
  assert.equal(row.status, "closed");
  assert.equal(row.qty_received, 5);
  assert.ok(row.lead_time_days >= 0);

  // Should not still show up in pending.
  const pending = await call(app, "GET", "/api/inventory/pipeline/pending");
  assert.equal(pending.json.items.some((i: { id: string }) => i.id === po.json.lines[0].id), false);
});

test("pipeline/reorder-alerts: flags a below-reorder-point product and create-po opens a PO", async () => {
  const app = await freshApp();
  const productId = await makeProduct(app, "PIPE-ALERT-1");

  const supplier = await call(app, "POST", `/api/catalog/${productId}/suppliers`, {
    vendor_name: "Alert Vendor", is_preferred: true, cost_cents: 150,
  });
  assert.equal(supplier.status, 201, JSON.stringify(supplier.json));

  await call(app, "POST", `/api/inventory/${productId}/receive`, { quantity: 2 });
  const setReorder = await call(app, "PUT", `/api/inventory/${productId}/reorder-point`, { reorderPt: 10 });
  assert.equal(setReorder.status, 200);

  const alerts = await call(app, "GET", "/api/inventory/pipeline/reorder-alerts");
  assert.equal(alerts.status, 200, JSON.stringify(alerts.json));
  const row = alerts.json.items.find((a: { product_id: string }) => a.product_id === productId);
  assert.ok(row, "expected the below-reorder-point product in alerts");
  assert.equal(row.current_stock, 2);
  assert.equal(row.reorder_point, 10);
  assert.equal(row.preferred_supplier, "Alert Vendor");
  assert.equal(row.urgency, "warning");

  const createPo = await call(app, "POST", `/api/inventory/pipeline/reorder-alerts/${productId}/create-po`, {});
  assert.equal(createPo.status, 201, JSON.stringify(createPo.json));
  assert.ok(createPo.json.po_number);

  // The new incoming PO should now show up as pending stock for the product.
  const pending = await call(app, "GET", "/api/inventory/pipeline/pending");
  assert.ok(pending.json.items.some((i: { product_name: string }) => i.product_name === "Product PIPE-ALERT-1"));
});

test("pipeline/reorder-alerts: safety_stock (Phase 6 item 2) is additive to suggested_qty and reflects the real configured value", async () => {
  const app = await freshApp();
  const productId = await makeProduct(app, "PIPE-SAFETY-1");

  const supplier = await call(app, "POST", `/api/catalog/${productId}/suppliers`, {
    vendor_name: "Safety Alert Vendor", is_preferred: true, cost_cents: 100,
  });
  assert.equal(supplier.status, 201);

  await call(app, "POST", `/api/inventory/${productId}/receive`, { quantity: 1 });
  await call(app, "PUT", `/api/inventory/${productId}/reorder-point`, { reorderPt: 10 });
  const setSafety = await call(app, "PUT", `/api/inventory/${productId}/safety-stock`, { safetyStock: 6 });
  assert.equal(setSafety.status, 200);

  const alerts = await call(app, "GET", "/api/inventory/pipeline/reorder-alerts");
  assert.equal(alerts.status, 200, JSON.stringify(alerts.json));
  const row = alerts.json.items.find((a: { product_id: string }) => a.product_id === productId);
  assert.ok(row, "expected the below-reorder-point product in alerts");
  assert.equal(row.safety_stock, 6, "must report the real configured value, not a fake mirror of reorder_point");
  assert.equal(row.suggested_qty, 16, "suggested_qty = reorder_pt (10) + safety_stock (6), no MOQ/case_pack here");
});

test("pipeline/reorder-alerts: create-po 400s when the product has no preferred supplier", async () => {
  const app = await freshApp();
  const productId = await makeProduct(app, "PIPE-ALERT-2");
  await call(app, "PUT", `/api/inventory/${productId}/reorder-point`, { reorderPt: 5 });

  const createPo = await call(app, "POST", `/api/inventory/pipeline/reorder-alerts/${productId}/create-po`, {});
  assert.equal(createPo.status, 400);
});

test("pipeline/reorder-alerts: suggested_qty rounds to the preferred supplier's MOQ/case_pack and the created PO orders that exact quantity (Phase 6 item 1)", async () => {
  const app = await freshApp();
  const productId = await makeProduct(app, "PIPE-ALERT-MOQ-1");

  // reorder_pt=10 is the raw target; case_pack=4 with moq=15 must round
  // 10 up to a multiple of 4 that clears 15: ceil(15/4)*4 = 16.
  const supplier = await call(app, "POST", `/api/catalog/${productId}/suppliers`, {
    vendor_name: "MOQ Vendor", is_preferred: true, cost_cents: 150, moq: 15, case_pack: 4,
  });
  assert.equal(supplier.status, 201, JSON.stringify(supplier.json));

  await call(app, "POST", `/api/inventory/${productId}/receive`, { quantity: 2 });
  const setReorder = await call(app, "PUT", `/api/inventory/${productId}/reorder-point`, { reorderPt: 10 });
  assert.equal(setReorder.status, 200);

  const alerts = await call(app, "GET", "/api/inventory/pipeline/reorder-alerts");
  assert.equal(alerts.status, 200, JSON.stringify(alerts.json));
  const row = alerts.json.items.find((a: { product_id: string }) => a.product_id === productId);
  assert.ok(row, "expected the below-reorder-point product in alerts");
  assert.equal(row.suggested_qty, 16);
  assert.equal(row.suggested_qty % 4, 0, "must be a whole number of cases");
  assert.equal(row.preferred_supplier_moq, 15);
  assert.equal(row.preferred_supplier_case_pack, 4);

  const createPo = await call(app, "POST", `/api/inventory/pipeline/reorder-alerts/${productId}/create-po`, {});
  assert.equal(createPo.status, 201, JSON.stringify(createPo.json));
  assert.ok(createPo.json.po_number);

  // Confirm the PO actually ordered the rounded quantity (16), not the raw
  // reorder point (10) — createPoFromAlert passes alert.suggested_qty straight
  // through to createOrder(), so this proves the rounding reaches the PO.
  const pending = await call(app, "GET", "/api/inventory/pipeline/pending");
  const pendingRow = pending.json.items.find((i: { product_name: string }) => i.product_name === "Product PIPE-ALERT-MOQ-1");
  assert.ok(pendingRow, "expected the new PO line in pending");
  assert.equal(pendingRow.qty_ordered, 16);
});
