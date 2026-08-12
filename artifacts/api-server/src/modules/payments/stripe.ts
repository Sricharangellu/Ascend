import Stripe from "stripe";

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
