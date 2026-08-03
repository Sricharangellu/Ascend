"use client";

/**
 * CardReaderScreen — Stripe Terminal server-driven payment collection.
 *
 * Flow:
 *  1. POST /api/v1/payments/terminal/start  → backend creates PaymentIntent
 *     and presents it to the registered reader (STRIPE_TERMINAL_READER_ID).
 *  2. Poll GET /api/v1/payments/terminal/status/:intentId every 2 s until
 *     status = "succeeded" or a terminal error state.
 *  3. On success, call onComplete(intentId) so TenderScreen can pass it to
 *     the final POST /api/v1/payments capture call.
 *  4. On cancel: POST /api/v1/payments/terminal/cancel/:intentId.
 *
 * Dev without STRIPE_SECRET_KEY: the backend returns 503 and this component
 * shows a clear error rather than silently simulating.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { apiPost, apiGet, ApiResponseError } from "@/api-client/client";
import type { TerminalStartResponse, TerminalStatusResponse } from "@/api-client/types";

type Phase = "starting" | "waiting" | "processing" | "approved" | "error";

interface CardReaderScreenProps {
  orderId: string;
  amountCents: number;
  onComplete: (stripePaymentIntentId: string) => void;
  onCancel: () => void;
}

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 120_000; // 2 minutes

// Stripe statuses that mean "payment is done"
const SUCCEEDED_STATUSES = new Set(["succeeded"]);
// Statuses that mean "something went wrong"
const FAILED_STATUSES = new Set(["canceled", "requires_payment_method"]);

export function CardReaderScreen({
  orderId,
  amountCents: _amountCents,
  onComplete,
  onCancel,
}: CardReaderScreenProps) {
  const [phase, setPhase] = useState<Phase>("starting");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const intentIdRef = useRef<string | null>(null);
  const cancelledRef = useRef(false);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAtRef = useRef(Date.now());

  const abort = useCallback(
    async (reason: string) => {
      cancelledRef.current = true;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      if (intentIdRef.current) {
        // Best-effort cancel — ignore errors
        void apiPost(`/api/v1/payments/terminal/cancel/${intentIdRef.current}`, {}).catch(() => {});
      }
      setPhase("error");
      setErrorMsg(reason);
    },
    [],
  );

  const poll = useCallback(async () => {
    if (cancelledRef.current) return;
    const intentId = intentIdRef.current;
    if (!intentId) return;

    if (Date.now() - startedAtRef.current > POLL_TIMEOUT_MS) {
      await abort("Payment timed out. Please try again.");
      return;
    }

    try {
      const result = await apiGet<TerminalStatusResponse>(
        `/api/v1/payments/terminal/status/${intentId}`,
      );

      if (cancelledRef.current) return;

      if (SUCCEEDED_STATUSES.has(result.status)) {
        setPhase("approved");
        setTimeout(() => {
          if (!cancelledRef.current) onComplete(intentId);
        }, 900);
        return;
      }

      if (FAILED_STATUSES.has(result.status)) {
        await abort(`Payment ${result.status}. Please try again.`);
        return;
      }

      // Still in-progress — keep polling
      if (result.status === "processing") setPhase("processing");
      pollTimerRef.current = setTimeout(() => void poll(), POLL_INTERVAL_MS);
    } catch (err) {
      if (cancelledRef.current) return;
      await abort(err instanceof ApiResponseError ? err.message : "Could not reach payment service.");
    }
  }, [abort, onComplete]);

  useEffect(() => {
    cancelledRef.current = false;
    startedAtRef.current = Date.now();

    async function start() {
      try {
        const res = await apiPost<TerminalStartResponse>("/api/v1/payments/terminal/start", {
          orderId,
        });
        if (cancelledRef.current) return;
        intentIdRef.current = res.intentId;
        setPhase("waiting");
        pollTimerRef.current = setTimeout(() => void poll(), POLL_INTERVAL_MS);
      } catch (err) {
        if (cancelledRef.current) return;
        const msg =
          err instanceof ApiResponseError
            ? err.message
            : "Could not start card payment. Check your card reader setup.";
        setPhase("error");
        setErrorMsg(msg);
      }
    }

    void start();

    return () => {
      cancelledRef.current = true;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [orderId, poll]);

  const handleCancel = useCallback(() => {
    if (phase === "approved") return;
    cancelledRef.current = true;
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    if (intentIdRef.current) {
      void apiPost(`/api/v1/payments/terminal/cancel/${intentIdRef.current}`, {}).catch(() => {});
    }
    onCancel();
  }, [phase, onCancel]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && phase !== "approved") handleCancel();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [phase, handleCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Card reader"
      aria-live="polite"
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        aria-hidden="true"
        onClick={phase !== "approved" ? handleCancel : undefined}
      />

      <div className="relative flex w-full max-w-sm flex-col items-center gap-6 rounded-2xl bg-white px-8 py-10 shadow-2xl">
        {phase !== "approved" && phase !== "error" && (
          <button
            type="button"
            onClick={handleCancel}
            aria-label="Cancel card payment"
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 min-h-[44px] min-w-[44px]"
          >
            <CloseIcon />
          </button>
        )}

        <div className="relative flex items-center justify-center">
          <span
            aria-hidden="true"
            className={`absolute inline-flex h-28 w-28 rounded-full opacity-50 ${
              phase === "approved"
                ? "bg-green-100"
                : phase === "error"
                ? "bg-red-100"
                : "bg-blue-100 animate-ping"
            }`}
          />
          <span
            aria-hidden="true"
            className={`relative inline-flex h-20 w-20 items-center justify-center rounded-full border-2 ${
              phase === "approved"
                ? "bg-green-50 border-green-200"
                : phase === "error"
                ? "bg-red-50 border-red-200"
                : "bg-blue-50 border-blue-200"
            }`}
          >
            {phase === "approved" ? (
              <CheckIcon />
            ) : phase === "error" ? (
              <ErrorIcon />
            ) : phase === "processing" ? (
              <SpinnerIcon />
            ) : (
              <CardChipIcon />
            )}
          </span>
        </div>

        <div className="space-y-1 text-center">
          <p
            className={`text-lg font-bold ${
              phase === "approved"
                ? "text-green-700"
                : phase === "error"
                ? "text-red-700"
                : "text-blue-700"
            }`}
          >
            {phase === "starting" && "Connecting to reader…"}
            {phase === "waiting" && "Tap, insert, or swipe card"}
            {phase === "processing" && "Processing payment"}
            {phase === "approved" && "Payment approved"}
            {phase === "error" && "Payment failed"}
          </p>
          <p className="text-sm text-gray-400">
            {phase === "starting" && "Setting up card reader…"}
            {phase === "waiting" && "Present card to the card reader"}
            {phase === "processing" && "Please wait…"}
            {phase === "approved" && "Transaction complete"}
            {phase === "error" && (errorMsg ?? "An error occurred")}
          </p>
        </div>

        {phase === "error" && (
          <div className="flex w-full gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
            >
              Cancel
            </button>
          </div>
        )}

        {(phase === "waiting" || phase === "processing") && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
            <div
              className={`h-full rounded-full bg-blue-500 transition-all duration-300 ${
                phase === "processing" ? "w-3/4 animate-pulse" : "w-1/4"
              }`}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" aria-hidden="true">
      <path d="M18 6 6 18" /><path d="m6 6 12 12" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true" className="animate-spin">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function CardChipIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
      <path d="M6 14h4" />
      <rect x="8" y="7" width="8" height="6" rx="1" />
    </svg>
  );
}
