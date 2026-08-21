/**
 * Reliability Phase 4a #4 (WORK/audits/AUDIT_2026-07-22T013025Z-reliability-gap-scan.md,
 * FORWARD_PLAN.md Phase 4a): the payment-gateway seam.
 *
 * Today Stripe is the only payment gateway, and that's fine — building a
 * second live integration (Adyen, Authorize.net) with no product need for it
 * yet would be speculative work nobody asked for. What *is* worth doing now
 * is making the boundary between "payments module" and "the specific
 * gateway" explicit, so that if a second processor is ever needed (as a true
 * fallback, or a merchant-specific requirement), it's a contained addition —
 * write one new file implementing this interface — rather than a rewrite of
 * `service.ts`'s checkout logic.
 *
 * Contract rules for any adapter:
 * - Wrap every outbound call in its own named circuit breaker (see
 *   `shared/circuit-breaker.ts`) so one gateway's outage can't be masked as
 *   "payments are down" if a second adapter is ever added — each gateway
 *   fails independently and fast.
 * - Never throw the gateway's native SDK errors past the adapter boundary;
 *   translate to `HttpError` (see `stripe.ts`'s `withStripeBreaker` for the
 *   pattern) so `service.ts` never needs to know which SDK is in play.
 * - `retrieveIntent`'s `status` field is intentionally a plain string, not a
 *   union of Stripe's specific status literals — different gateways won't
 *   share a status vocabulary, and `service.ts` only ever compares it against
 *   `"succeeded"`.
 */
export interface PaymentGatewayAdapter {
  /** Short, stable identifier — used in breaker names and error messages ("stripe", "adyen", ...). */
  readonly name: string;

  /** Whether this gateway has the credentials/config it needs to be used at all. */
  isConfigured(): boolean;

  /**
   * Create a payment intent for the given amount and present it to a
   * physical Terminal reader. Returns immediately — the caller polls
   * `retrieveIntent` until the customer completes payment on the device.
   */
  createTerminalIntent(
    amountCents: number,
    readerId: string,
  ): Promise<{ intentId: string; status: string; readerId: string }>;

  /**
   * Fetch the current state of a previously-created intent, including card
   * details once it has succeeded. `last4`/`authCode` are null until then.
   */
  retrieveIntent(intentId: string): Promise<{
    status: string;
    last4: string | null;
    authCode: string | null;
  }>;

  /** Best-effort cancel of an intent that was presented but not completed. Never throws. */
  cancelIntent(intentId: string): Promise<void>;
}
