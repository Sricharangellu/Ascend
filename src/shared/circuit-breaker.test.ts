import { test } from "node:test";
import assert from "node:assert/strict";
import { CircuitBreaker, CircuitOpenError } from "./circuit-breaker.js";

function failing(): Promise<never> {
  return Promise.reject(new Error("boom"));
}

function succeeding(): Promise<string> {
  return Promise.resolve("ok");
}

test("stays closed and passes calls through while healthy", async () => {
  const b = new CircuitBreaker("t1", { failureThreshold: 3, cooldownMs: 1000 });
  assert.equal(await b.execute(succeeding), "ok");
  assert.equal(await b.execute(succeeding), "ok");
  assert.equal(b.getState(), "closed");
});

test("opens after N consecutive failures and rejects fast without calling fn", async () => {
  const b = new CircuitBreaker("t2", { failureThreshold: 3, cooldownMs: 10_000 });
  let calls = 0;
  const trackedFailing = () => {
    calls += 1;
    return failing();
  };

  for (let i = 0; i < 3; i++) {
    await assert.rejects(() => b.execute(trackedFailing));
  }
  assert.equal(b.getState(), "open");
  assert.equal(calls, 3);

  // Next call must be rejected WITHOUT invoking fn — that's the "fail fast" contract.
  await assert.rejects(() => b.execute(trackedFailing), CircuitOpenError);
  assert.equal(calls, 3, "fn must not be called while circuit is open");
});

test("a single success does not reset the failure counter below threshold", async () => {
  const b = new CircuitBreaker("t3", { failureThreshold: 3, cooldownMs: 10_000 });
  await assert.rejects(() => b.execute(failing));
  await assert.rejects(() => b.execute(failing));
  assert.equal(b.getState(), "closed");
  await assert.rejects(() => b.execute(failing));
  assert.equal(b.getState(), "open", "3rd consecutive failure opens the circuit");
});

test("half-open trial call after cooldown: success closes the circuit", async () => {
  const b = new CircuitBreaker("t4", { failureThreshold: 1, cooldownMs: 10 });
  await assert.rejects(() => b.execute(failing));
  assert.equal(b.getState(), "open");

  await new Promise((r) => setTimeout(r, 20));
  assert.equal(b.getState(), "half-open");

  assert.equal(await b.execute(succeeding), "ok");
  assert.equal(b.getState(), "closed");
});

test("half-open trial call after cooldown: failure re-opens and restarts cooldown", async () => {
  const b = new CircuitBreaker("t5", { failureThreshold: 1, cooldownMs: 10 });
  await assert.rejects(() => b.execute(failing));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(b.getState(), "half-open");

  await assert.rejects(() => b.execute(failing));
  assert.equal(b.getState(), "open");

  // Immediately after re-opening, cooldown has restarted — still open, not half-open.
  assert.equal(b.getState(), "open");
});

test("isFailure classifier can exclude expected errors from tripping the breaker", async () => {
  class ClientError extends Error {}
  const b = new CircuitBreaker("t6", {
    failureThreshold: 2,
    cooldownMs: 10_000,
    isFailure: (err) => !(err instanceof ClientError),
  });

  const clientFailing = () => Promise.reject(new ClientError("declined"));
  await assert.rejects(() => b.execute(clientFailing));
  await assert.rejects(() => b.execute(clientFailing));
  await assert.rejects(() => b.execute(clientFailing));
  // Repeated "expected" client errors never open the circuit.
  assert.equal(b.getState(), "closed");
});

test("reset() forces the circuit back to closed", async () => {
  const b = new CircuitBreaker("t7", { failureThreshold: 1, cooldownMs: 10_000 });
  await assert.rejects(() => b.execute(failing));
  assert.equal(b.getState(), "open");
  b.reset();
  assert.equal(b.getState(), "closed");
  assert.equal(await b.execute(succeeding), "ok");
});
