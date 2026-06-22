"use client";

import { Suspense, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { Button } from "@/components/Button";
import { apiPost, ApiResponseError } from "@/api-client/client";

function scorePassword(password: string): number {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  return Math.min(score, 4);
}

const STRENGTH_LABELS = ["Very weak", "Weak", "Fair", "Good", "Strong"];
const STRENGTH_COLORS = ["bg-danger-500", "bg-danger-500", "bg-warning-500", "bg-brand-500", "bg-success-500"];

const TOKEN_ERROR_MESSAGES: Record<string, string> = {
  invalid_token: "This reset link is invalid.",
  token_used: "This reset link has already been used.",
  token_expired: "This reset link has expired.",
};

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const strength = useMemo(() => scorePassword(password), [password]);

  const passwordError = useMemo(() => {
    if (!touched) return null;
    if (!password) return "Password is required.";
    if (password.length < 8) return "Password must be at least 8 characters.";
    return null;
  }, [password, touched]);

  const confirmError = useMemo(() => {
    if (!touched) return null;
    if (!confirmPassword) return "Confirm your new password.";
    if (confirmPassword !== password) return "Passwords don't match.";
    return null;
  }, [password, confirmPassword, touched]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setTouched(true);
    if (!password || password.length < 8 || confirmPassword !== password) return;

    setSubmitting(true);
    setApiError(null);
    try {
      await apiPost<{ ok: boolean }>(
        "/api/identity/reset-password",
        { token, password },
        { anonymous: true }
      );
      setDone(true);
      setTimeout(() => router.replace("/login"), 3000);
    } catch (err) {
      if (err instanceof ApiResponseError) {
        setApiError(TOKEN_ERROR_MESSAGES[err.code] ?? err.message);
      } else {
        setApiError("An unexpected error occurred. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <AuthShell>
        <div className="rounded-2xl border border-white/40 bg-white/80 p-6 text-center shadow-2xl shadow-slate-900/10 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/70 sm:p-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-danger-100 text-danger-700 dark:bg-danger-700/20 dark:text-danger-400 mx-auto">
            <AlertIcon />
          </div>
          <h2 className="mt-4 text-2xl font-bold text-slate-900 dark:text-white">Invalid reset link</h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            This password reset link is missing or has expired. Request a new one to continue.
          </p>
          <Link
            href="/login/forgot-password"
            className="mt-6 inline-block text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
          >
            Request a new link
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="rounded-2xl border border-white/40 bg-white/80 p-6 shadow-2xl shadow-slate-900/10 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/70 sm:p-8">
        {done ? (
          <div className="flex flex-col items-center text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success-100 text-success-700 dark:bg-success-700/20 dark:text-success-400">
              <CheckIcon />
            </div>
            <h2 className="mt-4 text-2xl font-bold text-slate-900 dark:text-white">Password updated</h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Your password has been changed. Redirecting you to sign in…
            </p>
            <Link href="/login" className="mt-6 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
              &larr; Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Set a new password</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Choose a strong password you haven&apos;t used before.
              </p>
            </div>

            {apiError && (
              <div
                role="alert"
                aria-live="assertive"
                className="mb-5 rounded-lg border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700 dark:border-danger-700/40 dark:bg-danger-700/10 dark:text-danger-300"
              >
                {apiError}{" "}
                <Link href="/login/forgot-password" className="font-medium underline">
                  Request a new link
                </Link>
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate aria-label="Reset password form" className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label htmlFor="password" className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  New password
                  <span className="ml-1 text-danger-600" aria-hidden="true">*</span>
                  <span className="sr-only">(required)</span>
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  autoFocus
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => setTouched(true)}
                  disabled={submitting}
                  placeholder="At least 8 characters"
                  aria-invalid={!!passwordError}
                  aria-describedby="password-strength"
                  className={`min-h-[44px] w-full rounded-lg border bg-white/90 px-3 text-base text-slate-900 outline-none transition-colors placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-800/80 dark:text-white dark:placeholder:text-slate-500 ${
                    passwordError
                      ? "border-danger-500 focus:border-danger-500 focus:ring-2 focus:ring-danger-500"
                      : "border-slate-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-500 dark:border-slate-600"
                  }`}
                />
                {passwordError && <p className="text-sm text-danger-600 dark:text-danger-400">{passwordError}</p>}

                {password && (
                  <div id="password-strength" className="mt-1">
                    <div className="flex gap-1">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <span
                          key={i}
                          className={`h-1.5 flex-1 rounded-full ${
                            i < strength ? STRENGTH_COLORS[strength] : "bg-slate-200 dark:bg-slate-700"
                          }`}
                        />
                      ))}
                    </div>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{STRENGTH_LABELS[strength]}</p>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="confirmPassword" className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  Confirm new password
                  <span className="ml-1 text-danger-600" aria-hidden="true">*</span>
                  <span className="sr-only">(required)</span>
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onBlur={() => setTouched(true)}
                  disabled={submitting}
                  aria-invalid={!!confirmError}
                  aria-describedby={confirmError ? "confirm-error" : undefined}
                  className={`min-h-[44px] w-full rounded-lg border bg-white/90 px-3 text-base text-slate-900 outline-none transition-colors placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-800/80 dark:text-white dark:placeholder:text-slate-500 ${
                    confirmError
                      ? "border-danger-500 focus:border-danger-500 focus:ring-2 focus:ring-danger-500"
                      : "border-slate-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-500 dark:border-slate-600"
                  }`}
                />
                {confirmError && (
                  <p id="confirm-error" className="text-sm text-danger-600 dark:text-danger-400">
                    {confirmError}
                  </p>
                )}
              </div>

              <Button type="submit" fullWidth loading={submitting} disabled={submitting} size="lg">
                {submitting ? "Updating…" : "Update password"}
              </Button>
            </form>

            <Link href="/login" className="mt-6 block text-center text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
              &larr; Back to sign in
            </Link>
          </>
        )}
      </div>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
    </svg>
  );
}
