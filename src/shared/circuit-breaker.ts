import { moduleLogger } from "./logger.js";

const log = moduleLogger("circuit-breaker");

/**
 * Circuit breaker for external calls (payment gateways, webhooks, future
 * tax/accounting integrations). Complements `orchestration/policies/retry.policy.ts`:
 * retry handles a single call's transient failure; the breaker handles a
 * *sustained* outage by failing fast instead of paying full retry/timeout
 * cost on every request while the dependency is down.
 *
 * States:
 *   closed    — calls pass through normally; failures increment a counter.
 *   open      — calls are rejected immediately with CircuitOpenError until
 *               `cooldownMs` elapses since the circuit opened.
 *   half-open — after cooldown, exactly one trial call is allowed through;
 *               success closes the circuit (counter resets), failure re-opens
 *               it and restarts the cooldown.
 *
 * Deliberately in-process, not Redis-backed: this protects a single
 * process's call pattern to one dependency; it does not need to be shared
 * across instances to be useful (each instance independently stops hammering
 * a dead dependency), and adding a shared-state dependency to the thing that
 * protects against dependency failures is the wrong trade.
 */

export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerOptions {
  /** Consecutive failures (in "closed" state) before the circuit opens. */
  failureThreshold: number;
  /** How long the circuit stays open before allowing one half-open trial. */
  cooldownMs: number;
  /** Optional: classify which errors count as breaker failures. Defaults to "all errors count". */
  isFailure?: (err: unknown) => boolean;
}

export class CircuitOpenError extends Error {
  constructor(public readonly breakerName: string) {
    super(`circuit '${breakerName}' is open — dependency assumed down, call rejected fast`);
  }
}

export class CircuitBreaker {
  private state: CircuitState = "closed";
  private consecutiveFailures = 0;
  private openedAt = 0;

  constructor(
    private readonly name: string,
    private readonly opts: CircuitBreakerOptions,
  ) {}

  getState(): CircuitState {
    if (this.state === "open" && Date.now() - this.openedAt >= this.opts.cooldownMs) {
      return "half-open";
    }
    return this.state;
  }

  /** Execute fn through the breaker. Throws CircuitOpenError without calling fn if open. */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const current = this.getState();

    if (current === "open") {
      throw new CircuitOpenError(this.name);
    }

    try {
      const result = await fn();
      this.onSuccess(current);
      return result;
    } catch (err) {
      this.onFailure(err, current);
      throw err;
    }
  }

  private onSuccess(fromState: CircuitState): void {
    if (fromState === "half-open") {
      log.info({ breaker: this.name }, "circuit trial call succeeded — closing");
    }
    this.state = "closed";
    this.consecutiveFailures = 0;
    this.openedAt = 0;
  }

  private onFailure(err: unknown, fromState: CircuitState): void {
    const counts = this.opts.isFailure ? this.opts.isFailure(err) : true;
    if (!counts) return;

    if (fromState === "half-open") {
      // Trial failed — re-open immediately, restart cooldown.
      this.state = "open";
      this.openedAt = Date.now();
      log.warn({ breaker: this.name }, "circuit trial call failed — re-opening");
      return;
    }

    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.opts.failureThreshold) {
      this.state = "open";
      this.openedAt = Date.now();
      log.warn(
        { breaker: this.name, consecutiveFailures: this.consecutiveFailures },
        "circuit opening after consecutive failures",
      );
    }
  }

  /** Test/ops escape hatch — force back to closed (e.g. after a confirmed manual fix). */
  reset(): void {
    this.state = "closed";
    this.consecutiveFailures = 0;
    this.openedAt = 0;
  }
}

const registry = new Map<string, CircuitBreaker>();

/**
 * Get or create a named, process-wide breaker. Reuse the same name across
 * call sites that share a dependency (e.g. all Stripe calls use "stripe")
 * so failures in one call site count toward the same breaker.
 */
export function getCircuitBreaker(name: string, opts: CircuitBreakerOptions): CircuitBreaker {
  let breaker = registry.get(name);
  if (!breaker) {
    breaker = new CircuitBreaker(name, opts);
    registry.set(name, breaker);
  }
  return breaker;
}

/** Test-only: clear all registered breakers between test files. */
export function _resetRegistryForTests(): void {
  registry.clear();
}
