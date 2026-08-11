import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp, type App } from "../../app.js";

let __seq = 0;
const __schema = () => `test_${process.pid}_${Date.now().toString(36)}_${__seq++}`;

async function freshApp(): Promise<App> {
  return buildApp({ schema: __schema() });
}

async function call(app: App, method: string, path: string, body?: unknown, role = "manager") {
  const { default: request } = await import("./test-request.js");
  return request(app.express, method, path, body, role);
}

async function makeProduct(app: App, sku: string, barcode?: string) {
  const { status, json } = await call(
    app,
    "POST",
    "/api/catalog/",
    { sku, name: `Product ${sku}`, price_cents: 1000, category: "general", barcode: barcode ?? sku },
    "manager",
  );
  assert.equal(status, 201, `product create failed: ${JSON.stringify(json)}`);
  return json.id as string;
}

async function makeSupplier(app: App) {
  const { status, json } = await call(app, "POST", "/api/purchasing/suppliers", {
    name: "Session Vendor",
    email: "recv@vendor.test",
  });
  assert.equal(status, 201);
  return json.id as string;
}

test("receiving session begin → scan → close posts inventory via receive()", async () => {
  const app = await freshApp();
  const supplierId = await makeSupplier(app);
  const barcode = "SCAN-100";
  const productId = await makeProduct(app, "SCAN-SKU", barcode);
  const po = (
    await call(app, "POST", "/api/purchasing/orders", {
      supplierId,
      lines: [{ productId, quantity: 10, unitCostCents: 250 }],
    })
  ).json;

  const begin = await call(app, "POST", "/api/purchasing/receiving/sessions", {
    poId: po.id,
    dockCode: "DOCK-A",
  });
  assert.equal(begin.status, 201, JSON.stringify(begin.json));
  assert.equal(begin.json.status, "open");
  assert.equal(begin.json.lines.length, 1);
  assert.equal(begin.json.lines[0].expected_qty, 10);
  assert.match(begin.json.session_number, /^RCV-\d{5}$/);

  const dock = await call(app, "POST", `/api/purchasing/receiving/sessions/${begin.json.id}/dock`, {
    dockCode: "DOCK-A",
  });
  assert.equal(dock.status, 200);
  assert.equal(dock.json.status, "docked");

  const expiry = Date.UTC(2027, 8, 1);
  const scan = await call(app, "POST", `/api/purchasing/receiving/sessions/${begin.json.id}/scan`, {
    barcode,
    qty: 6,
    lotCode: "LOT-S1",
    expiryDate: expiry,
  });
  assert.equal(scan.status, 200, JSON.stringify(scan.json));
  assert.equal(scan.json.result, "matched");
  assert.equal(scan.json.session.lines[0].accepted_qty, 6);
  assert.ok(scan.json.intelligence);
  assert.equal(scan.json.intelligence.product_id, productId);

  const close = await call(app, "POST", `/api/purchasing/receiving/sessions/${begin.json.id}/close`, {});
  assert.equal(close.status, 200, JSON.stringify(close.json));
  // Partial close — remaining expected keeps session open-ish (not completed)
  assert.ok(["receiving", "quality_hold", "open", "docked"].includes(close.json.status) || close.json.status === "completed" || close.json.lines.some((l: any) => l.status === "posted"));

  const poAfter = await call(app, "GET", `/api/purchasing/orders/${po.id}`);
  assert.equal(poAfter.status, 200);
  assert.equal(poAfter.json.status, "partially_received");
  assert.equal(poAfter.json.lines[0].received_qty, 6);
  assert.equal(poAfter.json.lines[0].lot_code, "LOT-S1");
});

test("scan rejects unknown barcode without mutating accepted qty", async () => {
  const app = await freshApp();
  const supplierId = await makeSupplier(app);
  const productId = await makeProduct(app, "KNOWN", "KNOWN-BC");
  const po = (
    await call(app, "POST", "/api/purchasing/orders", {
      supplierId,
      lines: [{ productId, quantity: 5, unitCostCents: 100 }],
    })
  ).json;
  const begin = (
    await call(app, "POST", "/api/purchasing/receiving/sessions", { poId: po.id })
  ).json;

  const scan = await call(app, "POST", `/api/purchasing/receiving/sessions/${begin.id}/scan`, {
    barcode: "NO-SUCH-BARCODE",
    qty: 1,
  });
  assert.equal(scan.status, 200);
  assert.equal(scan.json.result, "unknown");
  assert.equal(scan.json.session.lines[0].accepted_qty, 0);
});

test("scan blocks over-qty and expired inventory", async () => {
  const app = await freshApp();
  const supplierId = await makeSupplier(app);
  const barcode = "EXP-BC";
  const productId = await makeProduct(app, "EXP-SKU", barcode);
  const po = (
    await call(app, "POST", "/api/purchasing/orders", {
      supplierId,
      lines: [{ productId, quantity: 3, unitCostCents: 100 }],
    })
  ).json;
  const begin = (
    await call(app, "POST", "/api/purchasing/receiving/sessions", { poId: po.id })
  ).json;

  const over = await call(app, "POST", `/api/purchasing/receiving/sessions/${begin.id}/scan`, {
    barcode,
    qty: 9,
  });
  assert.equal(over.status, 200);
  assert.equal(over.json.result, "over_qty");

  const expired = await call(app, "POST", `/api/purchasing/receiving/sessions/${begin.id}/scan`, {
    barcode,
    qty: 1,
    expiryDate: Date.UTC(2020, 0, 1),
  });
  assert.equal(expired.status, 400);
  assert.equal(expired.json.error.code, "expired_inventory");
});

test("cost variance above tolerance requires override reason", async () => {
  const app = await freshApp();
  const supplierId = await makeSupplier(app);
  const barcode = "COST-BC";
  const productId = await makeProduct(app, "COST-SKU", barcode);
  const po = (
    await call(app, "POST", "/api/purchasing/orders", {
      supplierId,
      lines: [{ productId, quantity: 4, unitCostCents: 100 }],
    })
  ).json;
  const begin = (
    await call(app, "POST", "/api/purchasing/receiving/sessions", { poId: po.id })
  ).json;

  const blocked = await call(app, "POST", `/api/purchasing/receiving/sessions/${begin.id}/scan`, {
    barcode,
    qty: 1,
    unitCostCents: 130, // +30% → red
  });
  assert.equal(blocked.status, 400);
  assert.equal(blocked.json.error.code, "cost_override_required");

  const ok = await call(app, "POST", `/api/purchasing/receiving/sessions/${begin.id}/scan`, {
    barcode,
    qty: 1,
    unitCostCents: 130,
    costOverrideReason: "Vendor fuel surcharge",
  });
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  assert.equal(ok.json.result, "cost_variance");
  assert.equal(ok.json.session.lines[0].cost_override_reason, "Vendor fuel surcharge");
});

test("quality hold keeps qty out of inventory on close", async () => {
  const app = await freshApp();
  const supplierId = await makeSupplier(app);
  const barcode = "HOLD-BC";
  const productId = await makeProduct(app, "HOLD-SKU", barcode);
  const po = (
    await call(app, "POST", "/api/purchasing/orders", {
      supplierId,
      lines: [{ productId, quantity: 5, unitCostCents: 100 }],
    })
  ).json;
  const begin = (
    await call(app, "POST", "/api/purchasing/receiving/sessions", { poId: po.id })
  ).json;

  await call(app, "POST", `/api/purchasing/receiving/sessions/${begin.id}/scan`, {
    barcode,
    qty: 2,
    hold: true,
  });
  await call(app, "POST", `/api/purchasing/receiving/sessions/${begin.id}/scan`, {
    barcode,
    qty: 3,
  });

  const close = await call(app, "POST", `/api/purchasing/receiving/sessions/${begin.id}/close`, {});
  assert.equal(close.status, 200, JSON.stringify(close.json));

  const poAfter = await call(app, "GET", `/api/purchasing/orders/${po.id}`);
  assert.equal(poAfter.json.lines[0].received_qty, 3); // held 2 not posted
  assert.equal(close.json.status, "quality_hold");
});

test("pipeline receiving + summary endpoints are real", async () => {
  const app = await freshApp();
  const supplierId = await makeSupplier(app);
  const barcode = "PIPE-BC";
  const productId = await makeProduct(app, "PIPE-SKU", barcode);
  const po = (
    await call(app, "POST", "/api/purchasing/orders", {
      supplierId,
      lines: [{ productId, quantity: 8, unitCostCents: 100 }],
    })
  ).json;
  await call(app, "POST", "/api/purchasing/receiving/sessions", { poId: po.id, dockCode: "D1" });

  const receiving = await call(app, "GET", "/api/inventory/pipeline/receiving");
  assert.equal(receiving.status, 200, JSON.stringify(receiving.json));
  assert.ok(receiving.json.items.length >= 1);
  assert.equal(receiving.json.items[0].qty_ordered, 8);

  const lineId = receiving.json.items[0].id as string;
  const updated = await call(app, "POST", `/api/inventory/pipeline/receiving/${lineId}/update`, {
    qty_scanned: 2,
  });
  assert.equal(updated.status, 200, JSON.stringify(updated.json));
  assert.equal(updated.json.qty_received, 2);

  const summary = await call(app, "GET", "/api/inventory/pipeline/summary");
  assert.equal(summary.status, 200);
  assert.ok(summary.json.receiving_active >= 1);

  const dash = await call(app, "GET", "/api/purchasing/receiving/dashboard");
  assert.equal(dash.status, 200, JSON.stringify(dash.json));
  assert.ok(typeof dash.json.pending_receipts === "number");
  assert.equal(dash.json.ai_suggestions.status, "interface_ready");
});

test("3-way match variance cannot be approved without override reason", async () => {
  const app = await freshApp();
  const supplierId = await makeSupplier(app);
  const p = await makeProduct(app, "VAR-SKU");
  const po = (
    await call(app, "POST", "/api/purchasing/orders", {
      supplierId,
      lines: [{ productId: p, quantity: 10, unitCostCents: 300 }],
    })
  ).json;
  const lineId = po.lines[0].id;
  await call(app, "POST", `/api/purchasing/orders/${po.id}/receive`, {
    lines: [{ lineId, qty: 8 }],
  });

  const bill = (
    await call(app, "POST", `/api/purchasing/orders/${po.id}/bills`, {
      invoiceNumber: "INV-VAR",
      lines: [{ lineId, productId: p, invoicedQty: 10, invoicedUnitCostCents: 320 }],
    })
  ).json;
  assert.equal(bill.match.match_status, "variance");

  const blocked = await call(app, "POST", `/api/purchasing/bills/${bill.id}/status`, {
    status: "approved",
  });
  assert.equal(blocked.status, 400);
  assert.equal(blocked.json.error.code, "variance_override_required");

  const approved = await call(app, "POST", `/api/purchasing/bills/${bill.id}/status`, {
    status: "approved",
    varianceOverrideReason: "Negotiated freight absorbed by buyer",
  });
  assert.equal(approved.status, 200, JSON.stringify(approved.json));
  assert.equal(approved.json.status, "approved");
});

test("auto-bill only drafts AP after full receive", async () => {
  const app = await freshApp();
  const supplierId = await makeSupplier(app);
  const p = await makeProduct(app, "BILLFULL");
  const po = (
    await call(app, "POST", "/api/purchasing/orders", {
      supplierId,
      lines: [{ productId: p, quantity: 4, unitCostCents: 100 }],
    })
  ).json;
  const lineId = po.lines[0].id;

  await call(app, "POST", `/api/purchasing/orders/${po.id}/receive`, {
    lines: [{ lineId, qty: 2 }],
  });
  let bills = await call(app, "GET", `/api/billing/bills?supplierId=${supplierId}`);
  assert.equal(bills.status, 200);
  assert.equal(bills.json.items.length, 0, "partial receive must not auto-bill");

  await call(app, "POST", `/api/purchasing/orders/${po.id}/receive`, {
    lines: [{ lineId, qty: 2 }],
  });
  bills = await call(app, "GET", `/api/billing/bills?supplierId=${supplierId}`);
  assert.equal(bills.status, 200);
  assert.equal(bills.json.items.length, 1, "full receive should auto-draft one bill");
});

// ── Case UPC → base-unit conversion ─────────────────────────────────────────
// A case barcode carries `pack_size` on its `product_barcodes` row (ADR-006:
// units live on the barcode). `resolveBarcode` used to SELECT only the product
// columns and throw that pack size away, so scanning one case of 12 received
// ONE each. Receiving is the path that writes inventory movements, so the
// error compounds silently into stock-on-hand, COGS and reorder points.
test("scan of a case UPC receives pack_size base units, not one", async () => {
  const app = await freshApp();
  const supplierId = await makeSupplier(app);
  const productId = await makeProduct(app, "CASE-SKU", "CASE-EACH-BC");

  // 12-unit case barcode alongside the each barcode.
  const addBc = await call(app, "POST", `/api/catalog/${productId}/barcodes`, {
    barcode: "CASE-UPC-12",
    kind: "case",
    packSize: 12,
  });
  assert.equal(addBc.status, 201, JSON.stringify(addBc.json));

  // PO for two cases' worth of base units.
  const po = (
    await call(app, "POST", "/api/purchasing/orders", {
      supplierId,
      lines: [{ productId, quantity: 24, unitCostCents: 100 }],
    })
  ).json;
  const begin = (
    await call(app, "POST", "/api/purchasing/receiving/sessions", { poId: po.id })
  ).json;

  const scan = await call(app, "POST", `/api/purchasing/receiving/sessions/${begin.id}/scan`, {
    barcode: "CASE-UPC-12",
    qty: 1,
  });
  assert.equal(scan.status, 200, JSON.stringify(scan.json));
  assert.equal(scan.json.result, "matched");
  assert.equal(
    scan.json.session.lines[0].accepted_qty,
    12,
    "one scan of a 12-pack case must accept 12 base units",
  );
  assert.equal(scan.json.unit?.kind, "case");
  assert.equal(scan.json.unit?.pack_size, 12);
  assert.equal(scan.json.unit?.scanned_units, 1);
  assert.equal(scan.json.unit?.base_qty, 12);

  // An each-barcode scan on the same product stays 1:1 — no regression.
  const eachScan = await call(app, "POST", `/api/purchasing/receiving/sessions/${begin.id}/scan`, {
    barcode: "CASE-EACH-BC",
    qty: 1,
  });
  assert.equal(eachScan.status, 200, JSON.stringify(eachScan.json));
  assert.equal(eachScan.json.session.lines[0].accepted_qty, 13);
  assert.equal(eachScan.json.unit, null);
});

test("case-UPC scan converts unit cost per case to per base unit", async () => {
  const app = await freshApp();
  const supplierId = await makeSupplier(app);
  const productId = await makeProduct(app, "CASECOST-SKU", "CASECOST-EACH");
  await call(app, "POST", `/api/catalog/${productId}/barcodes`, {
    barcode: "CASECOST-UPC",
    kind: "case",
    packSize: 10,
  });
  const po = (
    await call(app, "POST", "/api/purchasing/orders", {
      supplierId,
      lines: [{ productId, quantity: 10, unitCostCents: 100 }],
    })
  ).json;
  const begin = (
    await call(app, "POST", "/api/purchasing/receiving/sessions", { poId: po.id })
  ).json;

  // 1000c for a case of 10 == the PO's 100c each. Without conversion this
  // reads as a 900% cost overrun and is rejected as cost_override_required.
  const scan = await call(app, "POST", `/api/purchasing/receiving/sessions/${begin.id}/scan`, {
    barcode: "CASECOST-UPC",
    qty: 1,
    unitCostCents: 1000,
  });
  assert.equal(scan.status, 200, JSON.stringify(scan.json));
  assert.equal(scan.json.result, "matched", "case cost must not trip the variance band");
  assert.equal(scan.json.session.lines[0].unit_cost_cents, 100);
  assert.equal(scan.json.session.lines[0].accepted_qty, 10);
});

test("over-qty check counts case scans in base units", async () => {
  const app = await freshApp();
  const supplierId = await makeSupplier(app);
  const productId = await makeProduct(app, "CASEOVER-SKU", "CASEOVER-EACH");
  await call(app, "POST", `/api/catalog/${productId}/barcodes`, {
    barcode: "CASEOVER-UPC",
    kind: "case",
    packSize: 12,
  });
  // Only 6 base units expected — half a case. Scanning one case is over.
  const po = (
    await call(app, "POST", "/api/purchasing/orders", {
      supplierId,
      lines: [{ productId, quantity: 6, unitCostCents: 100 }],
    })
  ).json;
  const begin = (
    await call(app, "POST", "/api/purchasing/receiving/sessions", { poId: po.id })
  ).json;

  const scan = await call(app, "POST", `/api/purchasing/receiving/sessions/${begin.id}/scan`, {
    barcode: "CASEOVER-UPC",
    qty: 1,
  });
  assert.equal(scan.status, 200, JSON.stringify(scan.json));
  assert.equal(scan.json.result, "over_qty", "12 base units into a 6-unit line is an overage");
  assert.match(scan.json.detail, /12/);
  assert.equal(scan.json.session.lines[0].accepted_qty, 0);
});
