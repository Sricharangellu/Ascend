"use client";

import { useEffect, useRef, useState } from "react";

type Phase = "waiting" | "reading" | "processing" | "approved";

interface CardReaderScreenProps {
  onComplete: () => void;
  onCancel: () => void;
}

const PHASE_MS: Record<Phase, number> = {
  waiting: 800,
  reading: 600,
  processing: 900,
  approved: 1000,
};
const TOTAL_MS = 3300;
const PHASES: Phase[] = ["waiting", "reading", "processing", "approved"];

export function CardReaderScreen({ onComplete, onCancel }: CardReaderScreenProps) {
  const [phase, setPhase] = useState<Phase>("waiting");
  const [progress, setProgress] = useState(0);
  const startRef = useRef(Date.now());
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    startRef.current = Date.now();
    const timers: ReturnType<typeof setTimeout>[] = [];

    let offset = 0;
    for (const p of PHASES) {
      const delay = offset;
      timers.push(setTimeout(() => setPhase(p), delay));
      offset += PHASE_MS[p];
    }
    timers.push(setTimeout(onComplete, TOTAL_MS));

    const tick = () => {
      const pct = Math.min(100, ((Date.now() - startRef.current) / TOTAL_MS) * 100);
      setProgress(pct);
      if (pct < 100) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      timers.forEach(clearTimeout);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  // onComplete is stable via useCallback in parent — safe to omit from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && phase !== "approved") onCancel();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [phase, onCancel]);

  const phaseIdx = PHASES.indexOf(phase);

  const ringColor =
    phase === "approved"
      ? "bg-green-100"
      : phase === "processing"
      ? "bg-amber-100 animate-ping"
      : "bg-blue-100 animate-ping";

  const innerBg =
    phase === "approved"
      ? "bg-green-50 border-green-200"
      : phase === "processing"
      ? "bg-amber-50 border-amber-200"
      : "bg-blue-50 border-blue-200";

  const barColor =
    phase === "approved"
      ? "bg-green-500"
      : phase === "processing"
      ? "bg-amber-400"
      : "bg-blue-500";

  const textColor =
    phase === "approved"
      ? "text-green-700"
      : phase === "processing"
      ? "text-amber-700"
      : "text-blue-700";

  const { label, sublabel } = {
    waiting:    { label: "Tap, insert, or swipe card", sublabel: "Waiting for card…" },
    reading:    { label: "Reading card",               sublabel: "Please hold card steady…" },
    processing: { label: "Processing payment",          sublabel: "Please wait…" },
    approved:   { label: "Payment approved",            sublabel: "Transaction complete" },
  }[phase];

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
        onClick={phase !== "approved" ? onCancel : undefined}
      />

      <div className="relative flex w-full max-w-sm flex-col items-center gap-6 rounded-2xl bg-white px-8 py-10 shadow-2xl">
        {phase !== "approved" && (
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel card payment"
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 min-h-[44px] min-w-[44px]"
          >
            <CloseIcon />
          </button>
        )}

        {/* Animated ring */}
        <div className="relative flex items-center justify-center">
          <span
            aria-hidden="true"
            className={`absolute inline-flex h-28 w-28 rounded-full opacity-50 ${ringColor}`}
          />
          <span
            aria-hidden="true"
            className={`relative inline-flex h-20 w-20 items-center justify-center rounded-full border-2 ${innerBg}`}
          >
            {phase === "approved" ? (
              <CheckIcon />
            ) : phase === "processing" ? (
              <SpinnerIcon />
            ) : (
              <CardChipIcon />
            )}
          </span>
        </div>

        {/* Labels */}
        <div className="space-y-1 text-center">
          <p className={`text-lg font-bold ${textColor}`}>{label}</p>
          <p className="text-sm text-gray-400">{sublabel}</p>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
          <div
            className={`h-full rounded-full ${barColor} transition-all duration-100`}
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Step indicators */}
        <div className="flex w-full justify-between px-1" aria-hidden="true">
          {PHASES.map((p, i) => {
            const done = i < phaseIdx;
            const active = i === phaseIdx;
            return (
              <div key={p} className="flex flex-col items-center gap-1">
                <div
                  className={`h-2 w-2 rounded-full transition-colors ${
                    done ? "bg-brand-600" : active ? "bg-blue-500 ring-2 ring-blue-200" : "bg-gray-200"
                  }`}
                />
                <span
                  className={`text-[10px] font-medium transition-colors ${
                    active ? "text-gray-700" : done ? "text-brand-600" : "text-gray-300"
                  }`}
                >
                  {p === "waiting" ? "Wait" : p === "reading" ? "Read" : p === "processing" ? "Process" : "Done"}
                </span>
              </div>
            );
          })}
        </div>
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

function SpinnerIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true" className="animate-spin">
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
