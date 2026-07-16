/**
 * expiry.test.ts — expiry sweep moves expired stock out of active inventory,
 * records it on the expiry sheet, and books the total loss (session D feature).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp, type App } from "../../app.js";
import { InventoryService } from "./service.js";
import { AccountingService } from "../accounting/service.js";

let __seq = 0;
const __schema = () => `expiry_${process.pid}_${Date.now().toString(36)}_${__seq++}`;

const DAY = 86_400_000;

test("sweepExpired pulls expired stock into the pool, reduces active stock, books the loss", async () => {
  const app: App = await buildApp({ schema: __schema() });
  const inv = new InventoryService(app.db, app.events);
  const acct = new AccountingService(app.db);
  const tenant = "tnt_demo";
  const product = "prod_exp";

  await app.db.exec(
    `INSERT INTO products (id, tenant_id, sku, name, price_cents, category, tax_class, status, created_at, updated_at)
     VALUES ('${product}', '${tenant}', 'EXP-1', 'Expiring Widget', 500, 'general', 'standard', 'active', ${Date.now()}, ${Date.now()})`,
  );

  // Seed 10 units of active stock, in a lot that expired yesterday, cost $2.00.
  await inv.adjust(product, 10, "receiving", tenant);
  await inv.createLot({ productId: product, expiryDate: Date.now() - DAY, quantity: 10, unitCostCents: 200 }, tenant);
  assert.equal((await inv.getStock(product, tenant)).stock_qty, 10);

  const result = await inv.sweepExpired(tenant);
  assert.equal(result.swept, 1, "one expired lot swept");
  assert.equal(result.loss_cents, 2000, "loss = 10 × $2.00");

  // Active stock is gone; the lot is emptied.
  assert.equal((await inv.getStock(product, tenant)).stock_qty, 0, "expired stock left active inventory");
  assert.equal((await inv.lots(product, tenant)).length, 0, "no on-hand lots remain");

  // The expiry pool holds the write-off, pending disposition.
  const pool = await inv.listExpiryPool(tenant);
  assert.equal(pool.length, 1);
  assert.equal(pool[0]!.qty, 10);
  assert.equal(pool[0]!.loss_cents, 2000);
  assert.equal(pool[0]!.status, "pending");

  // Accounting booked the loss (Dr 5300 Spoilage / Cr 1200 Inventory) via event.
  await new Promise((r) => setTimeout(r, 80));
  const journal = await acct.listJournal(tenant, { docType: "expiry_writeoff" });
  const dr = journal.items.find((e) => e.account_code === "5300");
  const cr = journal.items.find((e) => e.account_code === "1200");
  assert.ok(dr && Number(dr.debit_cents) === 2000, "Dr Spoilage 2000");
  assert.ok(cr && Number(cr.credit_cents) === 2000, "Cr Inventory 2000");

  // Re-running sweeps nothing new (already emptied).
  const again = await inv.sweepExpired(tenant);
  assert.equal(again.swept, 0, "second sweep finds nothing");

  await app.db.close();
});
