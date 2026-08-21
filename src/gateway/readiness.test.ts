import { test } from "node:test";
import assert from "node:assert/strict";
import { readinessVerdict } from "./readiness.js";

const pool = (waiting: number) => ({ total: 10, idle: 0, waiting });

test("a queue for connections does NOT make an instance unready", () => {
  // The regression this pins: /readyz used to 503 on `waiting > 0`. Under the
  // 20k-user audit's baseline load a healthy instance sat at 33–37 waiters
  // while every endpoint met its latency budget — and since replicas saturate
  // together, that probe would have pulled the whole fleet out of rotation at
  // peak.
  for (const waiting of [1, 5, 37, 100]) {
    assert.equal(readinessVerdict(pool(waiting), 10).ready, true, `waiting=${waiting} must stay ready`);
  }
});

test("a queue far beyond the pool's capacity is unready", () => {
  const v = readinessVerdict(pool(101), 10);
  assert.equal(v.ready, false);
  assert.equal(v.reason, "connection pool saturated");
  assert.equal(v.waitingLimit, 100);
});

test("the threshold scales with the pool and is tunable", () => {
  assert.equal(readinessVerdict(pool(0), 25).waitingLimit, 250);
  assert.equal(readinessVerdict(pool(0), 10, { PG_READY_MAX_WAITING: "2" }).waitingLimit, 20);
  assert.equal(readinessVerdict(pool(21), 10, { PG_READY_MAX_WAITING: "2" }).ready, false);
  assert.equal(readinessVerdict(pool(20), 10, { PG_READY_MAX_WAITING: "2" }).ready, true);
});

test("malformed or missing inputs fall back to the documented defaults", () => {
  // A typo'd override must not silently disable the check (NaN comparisons are
  // always false, which would make every queue depth look acceptable) nor make
  // it hair-trigger.
  assert.equal(readinessVerdict(pool(0), 10, { PG_READY_MAX_WAITING: "not-a-number" }).waitingLimit, 100);
  assert.equal(readinessVerdict(pool(0), 10, { PG_READY_MAX_WAITING: "0" }).waitingLimit, 100);
  assert.equal(readinessVerdict(pool(0), 10, { PG_READY_MAX_WAITING: "-5" }).waitingLimit, 100);
  assert.equal(readinessVerdict(pool(0), Number.NaN).waitingLimit, 100);
  // A very small pool still needs a floor of at least one waiter.
  assert.equal(readinessVerdict(pool(0), 1, { PG_READY_MAX_WAITING: "0.1" }).waitingLimit, 1);
});

test("no pool stats (transaction-scoped DB view) is treated as ready", () => {
  assert.equal(readinessVerdict(null, 10).ready, true);
});
