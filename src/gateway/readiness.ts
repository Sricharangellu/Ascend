import type { PoolStats } from "../shared/db.js";

/**
 * Readiness verdict for `GET /readyz`.
 *
 * Extracted from the route so the decision is testable without having to
 * manufacture a real connection queue — pool timing tests are flaky by
 * construction, and this decision is too important to leave untested because
 * its integration test was awkward.
 *
 * The rule this encodes was wrong before the 20k-user audit. The probe used to
 * fail on `waiting > 0`, i.e. on the existence of ANY request queued for a
 * database connection. That is the normal state of a healthy instance under
 * load — the audit measured 33–37 waiters while every endpoint stayed inside
 * its latency budget — and, worse, it is a state every replica enters at the
 * same moment. A load balancer obeying that probe removes the entire fleet from
 * rotation exactly when demand peaks, turning a busy system into an outage.
 *
 * Readiness now means "this instance can serve traffic". A queue is a scaling
 * signal, surfaced through the `db_pool_connections{state="waiting"}` gauge and
 * alerted on there. Only a queue far beyond what the pool could ever drain —
 * `PG_READY_MAX_WAITING` times the pool size, generously defaulted — counts as
 * stuck rather than busy.
 */
export interface ReadinessVerdict {
  ready: boolean;
  reason?: string;
  waitingLimit: number;
}

export function readinessVerdict(
  pool: PoolStats | null,
  poolMax: number,
  env: NodeJS.ProcessEnv = process.env,
): ReadinessVerdict {
  const rawMultiple = Number(env["PG_READY_MAX_WAITING"] ?? 10);
  const multiple = Number.isFinite(rawMultiple) && rawMultiple > 0 ? rawMultiple : 10;
  const safePoolMax = Number.isFinite(poolMax) && poolMax > 0 ? poolMax : 10;
  const waitingLimit = Math.max(1, Math.round(safePoolMax * multiple));
  if (pool && pool.waiting > waitingLimit) {
    return { ready: false, reason: "connection pool saturated", waitingLimit };
  }
  return { ready: true, waitingLimit };
}
