import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp, type App } from "../../app.js";

let __seq = 0;
const __schema = () => `test_${process.pid}_${Date.now().toString(36)}_${__seq++}`;
async function freshApp(): Promise<App> { return buildApp({ schema: __schema() }); }
async function call(app: App, method: string, path: string, body?: unknown) {
  const { default: request } = await import("./test-request.js");
  return request(app.express, method, path, body);
}

// ─── Chart of Accounts ────────────────────────────────────────────────────────

test("create an account and list it", async () => {
  const app = await freshApp();

  const r = await call(app, "POST", "/api/accounting/accounts", {
    code: "1010",
    name: "Cash on Hand",
    type: "asset",
  });
  assert.equal(r.status, 201);
  assert.ok(r.json.id.startsWith("acct_"));
  assert.equal(r.json.code, "1010");
  assert.equal(r.json.name, "Cash on Hand");
  assert.equal(r.json.type, "asset");
  assert.equal(r.json.is_active, 1);

  const list = await call(app, "GET", "/api/accounting/accounts");
  assert.equal(list.status, 200);
  assert.ok(list.json.items.some((a: { id: string }) => a.id === r.json.id));
});

test("filter accounts by type", async () => {
  const app = await freshApp();
  await call(app, "POST", "/api/accounting/accounts", { code: "2000", name: "Accounts Payable", type: "liability" });
  await call(app, "POST", "/api/accounting/accounts", { code: "4000", name: "Sales Revenue", type: "income" });

  const liabilities = await call(app, "GET", "/api/accounting/accounts?type=liability");
  assert.equal(liabilities.status, 200);
  assert.ok(liabilities.json.items.every((a: { type: string }) => a.type === "liability"));

  const income = await call(app, "GET", "/api/accounting/accounts?type=income");
  assert.equal(income.status, 200);
  assert.ok(income.json.items.every((a: { type: string }) => a.type === "income"));
});

test("create child account and retrieve tree", async () => {
  const app = await freshApp();
  const parent = (await call(app, "POST", "/api/accounting/accounts", { code: "1000", name: "Assets", type: "asset" })).json;
  const child = (await call(app, "POST", "/api/accounting/accounts", {
    code: "1001",
    name: "Petty Cash",
    type: "asset",
    parentId: parent.id,
  })).json;
  assert.equal(child.parent_id, parent.id);

  const tree = await call(app, "GET", "/api/accounting/accounts/tree");
  assert.equal(tree.status, 200);
  const parentNode = tree.json.items.find((n: { id: string }) => n.id === parent.id);
  assert.ok(parentNode, "parent in tree");
  assert.ok(Array.isArray(parentNode.children));
  assert.ok(parentNode.children.some((c: { id: string }) => c.id === child.id));
});

test("update an account name and deactivate it", async () => {
  const app = await freshApp();
  const acc = (await call(app, "POST", "/api/accounting/accounts", { code: "5000", name: "Old Name", type: "expense" })).json;

  const updated = await call(app, "PATCH", `/api/accounting/accounts/${acc.id}`, { name: "Operating Expenses", isActive: false });
  assert.equal(updated.status, 200);
  assert.equal(updated.json.name, "Operating Expenses");
  assert.equal(updated.json.is_active, 0); // stored as integer in SQLite/pg
});

test("seed default chart of accounts", async () => {
  const app = await freshApp();
  const r = await call(app, "POST", "/api/accounting/accounts/seed", {});
  assert.equal(r.status, 200);
  assert.ok(typeof r.json.seeded === "number" && r.json.seeded > 0);

  // Seeded accounts should appear in the list
  const list = await call(app, "GET", "/api/accounting/accounts");
  assert.ok(list.json.items.length >= r.json.seeded);
});

test("account code must be unique per tenant", async () => {
  const app = await freshApp();
  await call(app, "POST", "/api/accounting/accounts", { code: "9999", name: "First", type: "expense" });
  const dupe = await call(app, "POST", "/api/accounting/accounts", { code: "9999", name: "Second", type: "expense" });
  assert.equal(dupe.status, 409);
});

// ─── Manual Deposits ──────────────────────────────────────────────────────────

test("create a manual deposit and approve it", async () => {
  const app = await freshApp();
  // Manual deposit auto-selects first asset account — seed defaults so one exists
  await call(app, "POST", "/api/accounting/accounts/seed", {});

  const dep = await call(app, "POST", "/api/accounting/deposits", {
    totalCents: 75000,
    note: "Daily cash drop",
  });
  assert.equal(dep.status, 201, `deposit creation failed: ${JSON.stringify(dep.json)}`);
  assert.ok(dep.json.id.startsWith("dep_"));
  assert.equal(dep.json.status, "pending_approval");
  assert.equal(dep.json.total_cents, 75000);

  const approved = await call(app, "POST", `/api/accounting/deposits/${dep.json.id}/approve`, {});
  assert.equal(approved.status, 200);
  assert.equal(approved.json.status, "approved");
});

test("create a manual deposit and reject it", async () => {
  const app = await freshApp();
  await call(app, "POST", "/api/accounting/accounts/seed", {});
  const dep = (await call(app, "POST", "/api/accounting/deposits", { totalCents: 5000 })).json;

  const rejected = await call(app, "POST", `/api/accounting/deposits/${dep.id}/reject`, {});
  assert.equal(rejected.status, 200);
  assert.equal(rejected.json.status, "rejected");
});

test("list deposits and get by id", async () => {
  const app = await freshApp();
  await call(app, "POST", "/api/accounting/accounts/seed", {});
  const dep = (await call(app, "POST", "/api/accounting/deposits", { totalCents: 10000, note: "Test" })).json;

  const list = await call(app, "GET", "/api/accounting/deposits");
  assert.equal(list.status, 200);
  assert.ok(list.json.items.some((d: { id: string }) => d.id === dep.id));

  const got = await call(app, "GET", `/api/accounting/deposits/${dep.id}`);
  assert.equal(got.status, 200);
  assert.equal(got.json.id, dep.id);
  assert.equal(got.json.total_cents, 10000);
});

test("list deposits filtered by status", async () => {
  const app = await freshApp();
  await call(app, "POST", "/api/accounting/accounts/seed", {});
  const dep = (await call(app, "POST", "/api/accounting/deposits", { totalCents: 3000 })).json;
  await call(app, "POST", `/api/accounting/deposits/${dep.id}/approve`, {});

  const approved = await call(app, "GET", "/api/accounting/deposits?status=approved");
  assert.equal(approved.status, 200);
  assert.ok(approved.json.items.every((d: { status: string }) => d.status === "approved"));

  const pending = await call(app, "GET", "/api/accounting/deposits?status=pending_approval");
  assert.equal(pending.status, 200);
  assert.ok(pending.json.items.every((d: { status: string }) => d.status === "pending_approval"));
});

// ─── Posting ledger ───────────────────────────────────────────────────────────

async function setupReceivedPO(app: App) {
  const prod = await call(app, "POST", "/api/catalog/", { sku: `LED-${Date.now()}`, name: "Ledger Widget", price_cents: 1500, category: "general" });
  assert.equal(prod.status, 201);
  const sup = await call(app, "POST", "/api/purchasing/suppliers", { name: "Ledger Supply Co" });
  assert.equal(sup.status, 201);
  const po = await call(app, "POST", "/api/purchasing/orders", {
    supplierId: sup.json.id,
    lines: [{ productId: prod.json.id, quantity: 10, unitCostCents: 500 }], // $50 goods
  });
  assert.equal(po.status, 201);
  const recv = await call(app, "POST", `/api/purchasing/orders/${po.json.id}/receive`, {});
  assert.equal(recv.status, 200);
  return { poId: po.json.id as string };
}

test("receiving a PO posts Dr Inventory / Cr GRNI, and the auto-bill posts GRNI -> AP", async () => {
  const app = await freshApp();
  const { poId } = await setupReceivedPO(app);

  // Receipt posting: 5000 into Inventory, 5000 into GRNI.
  const receipt = await call(app, "GET", "/api/accounting/journal?docType=purchase_receipt");
  assert.equal(receipt.status, 200);
  assert.equal(receipt.json.items.length, 2);
  const dr = receipt.json.items.find((e: any) => e.debit_cents > 0);
  const cr = receipt.json.items.find((e: any) => e.credit_cents > 0);
  assert.equal(dr.account_code, "1200"); // Inventory Asset
  assert.equal(dr.debit_cents, 5000);
  assert.equal(cr.account_code, "2050"); // GRNI
  assert.equal(cr.credit_cents, 5000);
  assert.equal(dr.entry_group, cr.entry_group); // one balanced transaction
  assert.ok(String(dr.memo).includes(poId));

  // Auto-drafted bill (billing listens to purchase_order.received) relieves GRNI into AP.
  const billPost = await call(app, "GET", "/api/accounting/journal?docType=bill");
  assert.equal(billPost.json.items.length, 2);
  const billDr = billPost.json.items.find((e: any) => e.debit_cents > 0);
  const billCr = billPost.json.items.find((e: any) => e.credit_cents > 0);
  assert.equal(billDr.account_code, "2050");
  assert.equal(billCr.account_code, "2000"); // Accounts Payable
  assert.equal(billCr.credit_cents, 5000);
});

test("paying a bill posts Dr AP / Cr Bank, and the trial balance stays balanced", async () => {
  const app = await freshApp();
  await setupReceivedPO(app);

  const bills = await call(app, "GET", "/api/billing/bills");
  assert.equal(bills.status, 200);
  const bill = bills.json.items[0];
  const pay = await call(app, "POST", `/api/billing/bills/${bill.id}/pay`, { amountCents: 5000, method: "ach" });
  assert.equal(pay.status, 200);

  const payment = await call(app, "GET", "/api/accounting/journal?docType=bill_payment");
  assert.equal(payment.json.items.length, 2);
  const dr = payment.json.items.find((e: any) => e.debit_cents > 0);
  const cr = payment.json.items.find((e: any) => e.credit_cents > 0);
  assert.equal(dr.account_code, "2000"); // AP relieved
  assert.equal(cr.account_code, "1010"); // Bank Checking down
  assert.equal(cr.credit_cents, 5000);

  // Trial balance: total debits == total credits; GRNI nets to zero
  // (received 5000 credit, relieved 5000 debit); AP nets to zero after payment.
  const tb = await call(app, "GET", "/api/accounting/trial-balance");
  assert.equal(tb.status, 200);
  assert.equal(tb.json.total_debit_cents, tb.json.total_credit_cents);
  const grni = tb.json.accounts.find((a: any) => a.account_code === "2050");
  assert.equal(grni.balance_cents, 0);
  const ap = tb.json.accounts.find((a: any) => a.account_code === "2000");
  assert.equal(ap.balance_cents, 0);
  const inventory = tb.json.accounts.find((a: any) => a.account_code === "1200");
  assert.equal(inventory.balance_cents, 5000); // asset remains on the books
});

test("manual journal transactions must balance and use known accounts", async () => {
  const app = await freshApp();

  const unbalanced = await call(app, "POST", "/api/accounting/journal", {
    legs: [
      { accountCode: "1000", debitCents: 100 },
      { accountCode: "4000", creditCents: 90 },
    ],
  });
  assert.equal(unbalanced.status, 400);

  const unknownAccount = await call(app, "POST", "/api/accounting/journal", {
    legs: [
      { accountCode: "9999", debitCents: 100 },
      { accountCode: "4000", creditCents: 100 },
    ],
  });
  assert.equal(unknownAccount.status, 400);

  const ok = await call(app, "POST", "/api/accounting/journal", {
    memo: "opening cash",
    legs: [
      { accountCode: "1000", debitCents: 100000 },
      { accountCode: "4000", creditCents: 100000 },
    ],
  });
  assert.equal(ok.status, 201);
  assert.equal(ok.json.items.length, 2);
  assert.equal(ok.json.items[0].doc_type, "manual");
});
