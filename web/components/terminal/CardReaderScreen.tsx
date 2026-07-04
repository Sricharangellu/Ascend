"use client";

import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/money";
import type { Payment } from "@/api-client/types";

type ReaderState = "waiting" | "reading" | "processing" | "success";

interface CardReaderScreenProps {
  amount_cents: number;
  onSuccess: (payment: Payment) => void;
  onCancel: () => void;
}

export function CardReaderScreen({ amount_cents, onSuccess, onCancel }: CardReaderScreenProps) {
  const [phase, setPhase] = useState<ReaderState>("waiting");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("reading"),     500);
    const t2 = setTimeout(() => setPhase("processing"),  1500);
    const t3 = setTimeout(() => setPhase("success"),     2500);
    const t4 = setTimeout(() => {
      const mockPayment: Payment = {
        id: `pay_mock_${Math.random().toString(36).slice(2, 10)}`,
        orderId: "",
        method: "card",
        amountCents: amount_cents,
        cashCents: 0,
        cardCents: amount_cents,
        changeCents: 0,
        cardLast4: "0000",
        status: "captured",
        createdAt: Date.now(),
      };
      onSuccess(mockPayment);
    }, 3000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [amount_cents, onSuccess]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl text-center">
        {phase !== "success" && (
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel card payment"
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>
        )}

        {phase === "waiting" && <WaitingPhase />}
        {phase === "reading" && <ReadingPhase />}
        {phase === "processing" && <ProcessingPhase amount_cents={amount_cents} />}
        {phase === "success" && <SuccessPhase amount_cents={amount_cents} />}
      </div>
    </div>
  );
}

function WaitingPhase() {
  return (
    <div className="flex flex-col items-center gap-5 py-4">
      <div className="relative flex items-center justify-center">
        <div className="absolute h-24 w-24 animate-ping rounded-full bg-blue-100" />
        <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-blue-50">
          <CreditCardIcon className="h-10 w-10 text-blue-600" />
        </div>
      </div>
      <div>
        <p className="text-lg font-semibold text-slate-900">Tap, insert, or swipe card</p>
        <p className="mt-1 text-sm text-slate-500">Waiting for card…</p>
      </div>
    </div>
  );
}

function ReadingPhase() {
  return (
    <div className="flex flex-col items-center gap-5 py-4">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-blue-50">
        <CreditCardIcon className="h-10 w-10 text-blue-600" />
      </div>
      <div className="w-full space-y-2">
        <p className="text-base font-semibold text-slate-900">Reading card…</p>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full w-2/3 animate-[slide_1s_ease-in-out_infinite] rounded-full bg-blue-500" />
        </div>
      </div>
    </div>
  );
}

function ProcessingPhase({ amount_cents }: { amount_cents: number }) {
  return (
    <div className="flex flex-col items-center gap-5 py-4">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-50">
        <svg aria-hidden="true" className="h-10 w-10 animate-spin text-brand-600" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
      <div>
        <p className="text-base font-semibold text-slate-900">Processing payment…</p>
        <p className="mt-1 text-sm text-slate-500">{formatMoney(amount_cents)}</p>
      </div>
    </div>
  );
}

function SuccessPhase({ amount_cents }: { amount_cents: number }) {
  return (
    <div className="flex flex-col items-center gap-5 py-4">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-50 ring-4 ring-green-100 animate-[scaleIn_0.3s_ease-out]">
        <svg aria-hidden="true" className="h-10 w-10 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <div>
        <p className="text-lg font-bold text-green-700">Payment approved</p>
        <p className="mt-1 text-2xl font-bold text-slate-900">{formatMoney(amount_cents)}</p>
      </div>
    </div>
  );
}

function CreditCardIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  );
}
