/**
 * Order notification batcher tests.
 *
 * Verifies rush-hour grouping semantics:
 * - a lone order is delivered as a single-order alert after its window
 * - a burst of orders (including the very first) collapses into exactly
 *   one grouped notification with correct count and total
 * - the max-window cap prevents a sustained rush from deferring forever
 * - tenants are batched independently
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { OrderNotificationBatcher, type OrderAlert } from "./batcher.js";
import type { PushNotificationPayload } from "./service.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function harness(windowMs: number, maxWindowMs: number) {
  const sent: Array<{ tenantId: string } & PushNotificationPayload> = [];
  const batcher = new OrderNotificationBatcher(
    async (tenantId, n) => {
      sent.push({ tenantId, ...n });
    },
    windowMs,
    maxWindowMs,
  );
  return { sent, batcher };
}

function order(i: number, totalCents: number | null = 1000): OrderAlert {
  return {
    orderId: `ord_${i}`,
    orderNumber: `${1000 + i}`,
    totalCents,
    receivedAt: Date.now(),
  };
}

test("lone order delivers as a single-order alert after the window", async () => {
  const { sent, batcher } = harness(40, 240);
  batcher.add("t1", order(1, 4750));

  assert.equal(sent.length, 0, "must not deliver before window closes");
  await sleep(100);

  assert.equal(sent.length, 1);
  assert.equal(sent[0]!.title, "New Order");
  assert.match(sent[0]!.body, /#1001 · \$47\.50/);
});

test("two-order burst produces exactly one grouped alert including the first order", async () => {
  const { sent, batcher } = harness(40, 240);
  batcher.add("t1", order(1, 5000));
  await sleep(10);
  batcher.add("t1", order(2, 9250));
  await sleep(120);

  assert.equal(sent.length, 1, "burst must produce exactly one notification");
  assert.equal(sent[0]!.title, "2 New Orders · $142.50 total");
  assert.deepEqual(sent[0]!.data?.orderIds, ["ord_1", "ord_2"]);
});

test("sustained burst groups every order, capped by the max window", async () => {
  const { sent, batcher } = harness(40, 120);
  // Feed orders every 25ms — each re-arms the debounce, so without the
  // cap the flush would be deferred indefinitely.
  for (let i = 1; i <= 8; i++) {
    batcher.add("t1", order(i, 1000));
    await sleep(25);
  }
  await sleep(150);

  assert.ok(sent.length >= 1);
  const totalCount = sent.reduce(
    (n, s) => n + (typeof s.data?.count === "number" ? (s.data.count as number) : 1),
    0,
  );
  assert.equal(totalCount, 8, "every order in the rush must be represented");
  // The cap forces at least one flush before the stream ends.
  assert.ok(sent.length >= 2, "max window cap must force an interim flush");
  for (const s of sent) {
    if (typeof s.data?.count === "number") {
      assert.match(s.title, new RegExp(`^${s.data.count} New Orders`));
    }
  }
});

test("tenants are batched independently", async () => {
  const { sent, batcher } = harness(40, 240);
  batcher.add("tA", order(1, 1000));
  batcher.add("tA", order(2, 1000));
  batcher.add("tB", order(3, 2000));
  await sleep(120);

  const a = sent.filter((s) => s.tenantId === "tA");
  const b = sent.filter((s) => s.tenantId === "tB");
  assert.equal(a.length, 1);
  assert.equal(a[0]!.title, "2 New Orders · $20.00 total");
  assert.equal(b.length, 1);
  assert.equal(b[0]!.title, "New Order");
});

test("flushAll delivers pending batches immediately", async () => {
  const { sent, batcher } = harness(10_000, 60_000);
  batcher.add("t1", order(1, 1000));
  batcher.add("t1", order(2, 1000));
  batcher.flushAll();
  await sleep(10);

  assert.equal(sent.length, 1);
  assert.equal(sent[0]!.title, "2 New Orders · $20.00 total");
});
