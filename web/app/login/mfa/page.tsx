"use client";

/**
 * /login/mfa — multi-factor authentication verification screen.
 *
 * Finder POS's auth backend does not issue an MFA challenge yet (login
 * succeeds directly from email/password). This screen is built ahead of
 * that backend work so the UI is ready: it renders the verification UI
 * against a mocked 6-digit code ("123456" always succeeds) and is not yet
 * linked to from the live login flow.
 */

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { Button } from "@/components/Button";

const CODE_LENGTH = 6;
const MOCK_VALID_CODE = "123456";
const RESEND_SECONDS = 30;

export default function MfaPage() {
  const router = useRouter();
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resendIn, setResendIn] = useState(RESEND_SECONDS);
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    inputsRef.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const code = digits.join("");

  function setDigit(index: number, value: string) {
    const char = value.replace(/\D/g, "").slice(-1);
    setDigits((current) => {
      const next = [...current];
      next[index] = char;
      return next;
    });
    if (char && index < CODE_LENGTH - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, CODE_LENGTH);
    if (!pasted) return;
    e.preventDefault();
    setDigits((current) => {
      const next = [...current];
      for (let i = 0; i < CODE_LENGTH; i++) next[i] = pasted[i] ?? "";
      return next;
    });
    inputsRef.current[Math.min(pasted.length, CODE_LENGTH - 1)]?.focus();
  }

  async function handleVerify() {
    if (code.length !== CODE_LENGTH) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setVerifying(true);
    setError(null);
    // Mocked: no backend MFA-verify endpoint exists yet.
    await new Promise((resolve) => setTimeout(resolve, 500));
    setVerifying(false);
    if (code === MOCK_VALID_CODE) {
      router.replace("/terminal");
    } else {
      setError("That code didn't work. Check the app and try again.");
      setDigits(Array(CODE_LENGTH).fill(""));
      inputsRef.current[0]?.focus();
    }
  }

  return (
    <AuthShell>
      <div className="rounded-2xl border border-white/40 bg-white/80 p-6 shadow-2xl shadow-slate-900/10 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/70 sm:p-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Two-factor verification</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Enter the 6-digit code from your authenticator app to continue.
          </p>
        </div>

        {error && (
          <div role="alert" aria-live="assertive" className="mb-5 rounded-lg border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700 dark:border-danger-700/40 dark:bg-danger-700/10 dark:text-danger-300">
            {error}
          </div>
        )}

        <fieldset>
          <legend className="text-sm font-medium text-slate-700 dark:text-slate-200">Verification code</legend>
          <div className="mt-2 flex justify-between gap-2">
            {digits.map((digit, index) => (
              <input
                key={index}
                ref={(el) => {
                  inputsRef.current[index] = el;
                }}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                value={digit}
                onChange={(e) => setDigit(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                onPaste={handlePaste}
                disabled={verifying}
                aria-label={`Digit ${index + 1} of ${CODE_LENGTH}`}
                className="h-12 w-12 rounded-lg border border-slate-300 bg-white/90 text-center text-lg font-semibold text-slate-900 outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800/80 dark:text-white sm:h-14 sm:w-14"
              />
            ))}
          </div>
        </fieldset>

        <Button type="button" fullWidth loading={verifying} disabled={verifying} size="lg" className="mt-6" onClick={() => void handleVerify()}>
          {verifying ? "Verifying…" : "Verify and continue"}
        </Button>

        <div className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">
          {resendIn > 0 ? (
            <span>Resend code in {resendIn}s</span>
          ) : (
            <button
              type="button"
              onClick={() => setResendIn(RESEND_SECONDS)}
              className="font-medium text-brand-600 hover:underline dark:text-brand-400"
            >
              Resend code
            </button>
          )}
        </div>

        {process.env.NODE_ENV === "development" && (
          <p className="mt-4 text-center text-xs text-slate-400 dark:text-slate-500">
            Dev mode: use code <span className="font-mono">123456</span>.
          </p>
        )}

        <Link href="/login" className="mt-6 block text-center text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
          &larr; Back to sign in
        </Link>
      </div>
    </AuthShell>
  );
}
