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

async function makeProduct(app: App, sku: string, priceCents = 1000) {
  const { status, json } = await call(app, "POST", "/api/catalog/", { sku, name: `Product ${sku}`, price_cents: priceCents, category: "general" }, "manager");
  assert.equal(status, 201, `product create failed: ${JSON.stringify(json)}`);
  return json.id as string;
}

async function makeSupplier(app: App, name = "ACME Supplies") {
  const { status, json } = await call(app, "POST", "/api/purchasing/suppliers", { name, email: "orders@acme.com" });
  assert.equal(status, 201, `supplier create failed: ${JSON.stringify(json)}`);
  return json.id as string;
}

// ── Tests ────────────────────────────────────────────────────────────────────

test("create supplier and list it", async () => {
  const app = await freshApp();
  const supplierId = await makeSupplier(app, "Globex Corp");

  const { status, json } = await call(app, "GET", "/api/purchasing/suppliers");
  assert.equal(status, 200);
  assert.ok(Array.isArray(json.items));
  assert.ok(json.items.some((s: any) => s.id === supplierId));
  assert.ok(json.items[0].id.startsWith("sup_"));
});

test("create PO and list it as 'ordered'", async () => {
  const app = await freshApp();
  const supplierId = await makeSupplier(app);
  const productId = await makeProduct(app, "WIDGET-A", 500);

  const { status, json } = await call(app, "POST", "/api/purchasing/orders", {
    supplierId,
    lines: [{ productId, quantity: 10, unitCostCents: 300, lotCode: "LOT-001" }],
  });
  assert.equal(status, 201, `PO create failed: ${JSON.stringify(json)}`);
  assert.ok(json.id.startsWith("po_"));
  assert.equal(json.status, "ordered");
  assert.equal(json.total_cost_cents, 3000); // 10 × 300
  assert.equal(json.lines.length, 1);
  assert.equal(json.lines[0].quantity, 10);
  assert.equal(json.lines[0].received_qty, 0);

  const list = await call(app, "GET", "/api/purchasing/orders");
  assert.equal(list.status, 200);
  assert.ok(list.json.items.some((o: any) => o.id === json.id));
});

test("partial receive transitions PO to partially_received", async () => {
  const app = await freshApp();
  const supplierId = await makeSupplier(app);
  const productId = await makeProduct(app, "ITEM-B", 800);

  const po = (await call(app, "POST", "/api/purchasing/orders", {
    supplierId,
    lines: [{ productId, quantity: 5, unitCostCents: 200 }],
  })).json;

  const lineId = po.lines[0].id;

  // Receive 3 of 5
  const { status: rStatus, json: rJson } = await call(app, "POST", `/api/purchasing/orders/${po.id}/receive`, {
    lines: [{ lineId, qty: 3 }],
  });
  assert.equal(rStatus, 200, `partial receive failed: ${JSON.stringify(rJson)}`);
  assert.equal(rJson.status, "partially_received");
  assert.equal(rJson.lines[0].received_qty, 3);
});

test("receive captures desk-entered expiry and lot onto the line (FEFO source)", async () => {
  const app = await freshApp();
  const supplierId = await makeSupplier(app);
  const productId = await makeProduct(app, "PERISH-A", 400);

  const po = (await call(app, "POST", "/api/purchasing/orders", {
    supplierId,
    lines: [{ productId, quantity: 6, unitCostCents: 250 }],
  })).json;
  const lineId = po.lines[0].id;
  // Expiry is unknown at PO time — only captured when the goods physically arrive.
  assert.equal(po.lines[0].expiry_date ?? null, null);

  const expiry = Date.UTC(2027, 5, 30);
  const r = await call(app, "POST", `/api/purchasing/orders/${po.id}/receive`, {
    lines: [{ lineId, qty: 6, expiryDate: expiry, lotCode: "LOT-RCV-9" }],
  });
  assert.equal(r.status, 200, `receive failed: ${JSON.stringify(r.json)}`);
  assert.equal(r.json.status, "received");
  assert.equal(r.json.lines[0].expiry_date, expiry, "receive-time expiry persisted onto the line");
  assert.equal(r.json.lines[0].lot_code, "LOT-RCV-9", "receive-time lot persisted onto the line");
});

test("full receive transitions PO to received", async () => {
  const app = await freshApp();
  const supplierId = await makeSupplier(app);
  const productA = await makeProduct(app, "ITEM-C1", 600);
  const productB = await makeProduct(app, "ITEM-C2", 400);

  const po = (await call(app, "POST", "/api/purchasing/orders", {
    supplierId,
    lines: [
      { productId: productA, quantity: 4, unitCostCents: 150 },
      { productId: productB, quantity: 2, unitCostCents: 250 },
    ],
  })).json;

  const lines = po.lines.map((l: any) => ({ lineId: l.id, qty: l.quantity }));

  const { status, json } = await call(app, "POST", `/api/purchasing/orders/${po.id}/receive`, { lines });
  assert.equal(status, 200, `full receive failed: ${JSON.stringify(json)}`);
  assert.equal(json.status, "received");
  assert.ok(json.received_at !== null);
  for (const l of json.lines) {
    assert.equal(l.received_qty, l.quantity, `line ${l.id} not fully received`);
  }
});

test("two-step partial receive completes the PO", async () => {
  const app = await freshApp();
  const supplierId = await makeSupplier(app);
  const productId = await makeProduct(app, "ITEM-D", 1000);

  const po = (await call(app, "POST", "/api/purchasing/orders", {
    supplierId,
    lines: [{ productId, quantity: 6, unitCostCents: 500 }],
  })).json;
  const lineId = po.lines[0].id;

  // Step 1: receive 4
  const step1 = await call(app, "POST", `/api/purchasing/orders/${po.id}/receive`, {
    lines: [{ lineId, qty: 4 }],
  });
  assert.equal(step1.json.status, "partially_received");

  // Step 2: receive remaining 2
  const step2 = await call(app, "POST", `/api/purchasing/orders/${po.id}/receive`, {
    lines: [{ lineId, qty: 2 }],
  });
  assert.equal(step2.json.status, "received");
  assert.equal(step2.json.lines[0].received_qty, 6);
});

test("receive rejects qty exceeding remaining", async () => {
  const app = await freshApp();
  const supplierId = await makeSupplier(app);
  const productId = await makeProduct(app, "ITEM-E", 300);

  const po = (await call(app, "POST", "/api/purchasing/orders", {
    supplierId,
    lines: [{ productId, quantity: 3, unitCostCents: 100 }],
  })).json;

  const { status } = await call(app, "POST", `/api/purchasing/orders/${po.id}/receive`, {
    lines: [{ lineId: po.lines[0].id, qty: 10 }], // exceeds remaining 3
  });
  assert.equal(status, 400);
});

test("receive already-received PO returns 409", async () => {
  const app = await freshApp();
  const supplierId = await makeSupplier(app);
  const productId = await makeProduct(app, "ITEM-F", 200);

  const po = (await call(app, "POST", "/api/purchasing/orders", {
    supplierId,
    lines: [{ productId, quantity: 2, unitCostCents: 100 }],
  })).json;

  await call(app, "POST", `/api/purchasing/orders/${po.id}/receive`, {
    lines: [{ lineId: po.lines[0].id, qty: 2 }],
  });

  // Try to receive again
  const { status } = await call(app, "POST", `/api/purchasing/orders/${po.id}/receive`, {
    lines: [{ lineId: po.lines[0].id, qty: 1 }],
  });
  assert.equal(status, 409);
});

test("cashier cannot create PO (requires manager)", async () => {
  const app = await freshApp();
  const supplierId = await makeSupplier(app, "Test Supplier");

  const { status } = await call(app, "POST", "/api/purchasing/orders", {
    supplierId,
    lines: [{ productId: "any", quantity: 1, unitCostCents: 100 }],
  }, "cashier");
  assert.equal(status, 403);
});

test("GET /purchasing/orders/:id returns PO with lines", async () => {
  const app = await freshApp();
  const supplierId = await makeSupplier(app);
  const productId = await makeProduct(app, "ITEM-G", 750);

  const created = (await call(app, "POST", "/api/purchasing/orders", {
    supplierId,
    lines: [{ productId, quantity: 8, unitCostCents: 400 }],
  })).json;

  const { status, json } = await call(app, "GET", `/api/purchasing/orders/${created.id}`);
  assert.equal(status, 200);
  assert.equal(json.id, created.id);
  assert.equal(json.supplier_id, supplierId);
  assert.ok(Array.isArray(json.lines));
  assert.equal(json.lines[0].product_id, productId);
});

// ── Vendor bills · 3-way match (#42) ──────────────────────────────────────────

/** Create a PO, receive `receiveQty` of its single line, return { po, lineId }. */
async function makePoAndReceive(app: App, supplierId: string, productId: string, orderedQty: number, unitCostCents: number, receiveQty: number) {
  const po = (await call(app, "POST", "/api/purchasing/orders", {
    supplierId, lines: [{ productId, quantity: orderedQty, unitCostCents }],
  })).json;
  const lineId = po.lines[0].id as string;
  if (receiveQty > 0) {
    const r = await call(app, "POST", `/api/purchasing/orders/${po.id}/receive`, { lines: [{ lineId, qty: receiveQty }] });
    assert.equal(r.status, 200, `receive failed: ${JSON.stringify(r.json)}`);
  }
  return { po, lineId };
}

test("3-way match flags short-received, qty and price variances", async () => {
  const app = await freshApp();
  const supplierId = await makeSupplier(app);
  const p = await makeProduct(app, "BILL-A", 1000);
  const { po, lineId } = await makePoAndReceive(app, supplierId, p, 10, 300, 8); // ordered 10, received 8

  const bill = (await call(app, "POST", `/api/purchasing/orders/${po.id}/bills`, {
    invoiceNumber: "INV-1", lines: [{ lineId, productId: p, invoicedQty: 10, invoicedUnitCostCents: 320 }],
  })).json;

  assert.equal(bill.status, "draft");
  assert.equal(bill.match.match_status, "variance");
  const line = bill.match.lines[0];
  assert.deepEqual([...line.flags].sort(), ["price_variance", "qty_variance", "short_received"]);
  assert.equal(line.expected_cents, 8 * 300);   // received × PO price
  assert.equal(line.invoiced_cents, 10 * 320);
  assert.equal(line.variance_cents, 10 * 320 - 8 * 300);
});

test("3-way match reports matched when invoiced equals received at PO price", async () => {
  const app = await freshApp();
  const supplierId = await makeSupplier(app);
  const p = await makeProduct(app, "BILL-B", 1000);
  const { po, lineId } = await makePoAndReceive(app, supplierId, p, 10, 300, 10);

  const bill = (await call(app, "POST", `/api/purchasing/orders/${po.id}/bills`, {
    invoiceNumber: "INV-2", lines: [{ lineId, productId: p, invoicedQty: 10, invoicedUnitCostCents: 300 }],
  })).json;

  assert.equal(bill.match.match_status, "matched");
  assert.equal(bill.match.lines[0].matched, true);
  assert.equal(bill.match.lines[0].flags.length, 0);
  assert.equal(bill.match.total_variance_cents, 0);
});

test("bill cannot post until approved, and is immutable once posted", async () => {
  const app = await freshApp();
  const supplierId = await makeSupplier(app);
  const p = await makeProduct(app, "BILL-C", 1000);
  const { po, lineId } = await makePoAndReceive(app, supplierId, p, 5, 200, 5);

  const bill = (await call(app, "POST", `/api/purchasing/orders/${po.id}/bills`, {
    invoiceNumber: "INV-3", lines: [{ lineId, productId: p, invoicedQty: 5, invoicedUnitCostCents: 200 }],
  })).json;

  // draft → cannot post
  const early = await call(app, "POST", `/api/purchasing/bills/${bill.id}/post`, {});
  assert.equal(early.status, 409);
  assert.equal(early.json.error.code, "not_approved");

  // approve → post
  const approved = await call(app, "POST", `/api/purchasing/bills/${bill.id}/status`, { status: "approved" });
  assert.equal(approved.status, 200);
  assert.equal(approved.json.status, "approved");

  const posted = await call(app, "POST", `/api/purchasing/bills/${bill.id}/post`, {});
  assert.equal(posted.status, 200);
  assert.equal(posted.json.status, "posted");

  // posted is immutable
  const rechange = await call(app, "POST", `/api/purchasing/bills/${bill.id}/status`, { status: "held" });
  assert.equal(rechange.status, 409);
  assert.equal(rechange.json.error.code, "already_posted");
});

test("invoice line with no matching PO line is flagged unexpected", async () => {
  const app = await freshApp();
  const supplierId = await makeSupplier(app);
  const pA = await makeProduct(app, "BILL-D", 1000);
  const pB = await makeProduct(app, "BILL-E", 1000);
  const { po, lineId } = await makePoAndReceive(app, supplierId, pA, 4, 250, 4);

  const bill = (await call(app, "POST", `/api/purchasing/orders/${po.id}/bills`, {
    invoiceNumber: "INV-4",
    lines: [
      { lineId, productId: pA, invoicedQty: 4, invoicedUnitCostCents: 250 },
      { lineId: null, productId: pB, invoicedQty: 1, invoicedUnitCostCents: 999 }, // not on PO
    ],
  })).json;

  assert.equal(bill.match.match_status, "variance");
  const unexpected = bill.match.lines.find((l: any) => l.flags.includes("unexpected"));
  assert.ok(unexpected, "expected an unexpected line");
  assert.equal(unexpected.product_id, pB);
  assert.equal(unexpected.invoiced_cents, 999);
});
