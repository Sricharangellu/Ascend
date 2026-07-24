import Stripe from "stripe";
import { getCircuitBreaker, CircuitOpenError } from "../../shared/circuit-breaker.js";
import { HttpError } from "../../shared/http.js";
import type { PaymentGatewayAdapter } from "./gateway.js";

let _stripe: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return !!process.env["STRIPE_SECRET_KEY"];
}

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env["STRIPE_SECRET_KEY"];
    if (!key) {
      throw new Error("STRIPE_SECRET_KEY is not set — card payments are unavailable.");
    }
    _stripe = new Stripe(key, { apiVersion: "2026-05-27.dahlia" });
  }
  return _stripe;
}

/**
 * Circuit breaker guarding every Stripe API call. Five consecutive failures
 * (network errors, 5xx from Stripe, timeouts — see `isBreakerFailure` below)
 * opens the circuit for 30s: further calls fail fast with a clear 503
 * instead of each paying Stripe's full request/timeout cost during an
 * outage. A single trial call after cooldown decides whether to close again.
 *
 * Deliberately does NOT count client errors (4xx — declined card, bad
 * request) as breaker failures: those mean Stripe is up and correctly
 * rejecting a specific request, not that Stripe is down.
 */
const stripeBreaker = getCircuitBreaker("stripe", {
  failureThreshold: 5,
  cooldownMs: 30_000,
  isFailure: isBreakerFailure,
});

function isBreakerFailure(err: unknown): boolean {
  if (err instanceof Stripe.errors.StripeError) {
    // StripeAPIError/StripeConnectionError/StripeRateLimitError indicate the
    // gateway itself is unhealthy or unreachable. StripeCardError,
    // StripeInvalidRequestError, StripeAuthenticationError mean Stripe
    // answered normally and rejected this specific call — not a breaker event.
    return (
      err instanceof Stripe.errors.StripeAPIError ||
      err instanceof Stripe.errors.StripeConnectionError ||
      err instanceof Stripe.errors.StripeRateLimitError
    );
  }
  // Unknown/network-level errors (fetch failures, timeouts) — treat as breaker failures.
  return true;
}

/**
 * Run a Stripe call through the shared breaker. Throws a 503 HttpError
 * (`payment_gateway_unavailable`) immediately if the circuit is open,
 * instead of letting the caller wait out another failing request.
 */
export async function withStripeBreaker<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await stripeBreaker.execute(fn);
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      throw new HttpError(
        503,
        "payment_gateway_unavailable",
        "Card payments are temporarily unavailable (payment gateway is not responding). Try again shortly, or accept cash.",
      );
    }
    throw err;
  }
}

/**
 * Resolve the card details (last4, auth code) from a captured PaymentIntent.
 * Works for both `card_present` (Terminal) and regular `card` charges.
 */
export function resolveChargeDetails(intent: Stripe.PaymentIntent): {
  last4: string | null;
  authCode: string | null;
} {
  const charge =
    typeof intent.latest_charge === "object" && intent.latest_charge !== null
      ? (intent.latest_charge as Stripe.Charge)
      : null;

  const details =
    charge?.payment_method_details?.card_present ??
    charge?.payment_method_details?.card ??
    null;

  return {
    last4: (details as { last4?: string } | null)?.last4 ?? null,
    authCode:
      (charge?.payment_method_details?.card_present as { receipt?: { authorization_code?: string } } | null)
        ?.receipt?.authorization_code ?? null,
  };
}

/**
 * Stripe's implementation of the payment-gateway seam (see `gateway.ts`).
 * `service.ts` calls through this object for the operations that are
 * genuinely gateway-specific; a second adapter would be a new file exporting
 * the same shape, wired in wherever `stripeGatewayAdapter` is imported today.
 */
export const stripeGatewayAdapter: PaymentGatewayAdapter = {
  name: "stripe",

  isConfigured: isStripeConfigured,

  async createTerminalIntent(amountCents, readerId) {
    const stripe = getStripe();
    const intent = await withStripeBreaker(() =>
      stripe.paymentIntents.create({
        amount: amountCents,
        currency: "usd",
        payment_method_types: ["card_present"],
        capture_method: "automatic",
      }),
    );
    await withStripeBreaker(() =>
      stripe.terminal.readers.processPaymentIntent(readerId, { payment_intent: intent.id }),
    );
    return { intentId: intent.id, status: intent.status, readerId };
  },

  async retrieveIntent(intentId) {
    const stripe = getStripe();
    const intent = await withStripeBreaker(() =>
      stripe.paymentIntents.retrieve(intentId, { expand: ["latest_charge"] }),
    );
    const { last4, authCode } = resolveChargeDetails(intent);
    return { status: intent.status, last4, authCode };
  },

  async cancelIntent(intentId) {
    const stripe = getStripe();
    try {
      await withStripeBreaker(() => stripe.paymentIntents.cancel(intentId));
    } catch {
      // If already succeeded/cancelled (or the gateway is down), ignore —
      // this is a best-effort cleanup call.
    }
  },
};
