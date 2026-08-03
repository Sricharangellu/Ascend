"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { Button } from "@/components/Button";
import { apiPost } from "@/api-client/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [devToken, setDevToken] = useState<string | null>(null);

  const emailError = useMemo(() => {
    if (!touched) return null;
    if (!email.trim()) return "Email is required.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email address.";
    return null;
  }, [email, touched]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setTouched(true);
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;

    setSubmitting(true);
    try {
      const result = await apiPost<{ ok: boolean; token?: string }>(
        "/api/identity/forgot-password",
        { email: email.trim() },
        { anonymous: true }
      );
      if (result.token) setDevToken(result.token);
    } catch {
      // Always show success to prevent email enumeration — errors are swallowed.
    } finally {
      setSubmitting(false);
      setSent(true);
    }
  }

  return (
    <AuthShell>
      <div className="rounded-2xl border border-white/40 bg-white/80 p-6 shadow-2xl shadow-slate-900/10 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/70 sm:p-8">
        {sent ? (
          <div className="flex flex-col items-center text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success-100 text-success-700 dark:bg-success-700/20 dark:text-success-400">
              <CheckIcon />
            </div>
            <h2 className="mt-4 text-2xl font-bold text-slate-900 dark:text-white">Check your email</h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              If an account exists for <span className="font-medium text-slate-700 dark:text-slate-200">{email}</span>, we&apos;ve
              sent a link to reset your password. The link expires in 1 hour.
            </p>
            <Link href="/login" className="mt-6 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
              &larr; Back to sign in
            </Link>
            {devToken && (
              <Link
                href={`/login/reset-password?token=${encodeURIComponent(devToken)}`}
                className="mt-3 text-xs text-slate-400 hover:underline dark:text-slate-500"
              >
                Dev mode: open reset link
              </Link>
            )}
          </div>
        ) : (
          <>
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Reset your password</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Enter the email associated with your account and we&apos;ll send a link to reset your password.
              </p>
            </div>

            <form onSubmit={handleSubmit} noValidate aria-label="Reset password form" className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label htmlFor="email" className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  Email address
                  <span className="ml-1 text-danger-600" aria-hidden="true">*</span>
                  <span className="sr-only">(required)</span>
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => setTouched(true)}
                  disabled={submitting}
                  placeholder="you@company.com"
                  aria-invalid={!!emailError}
                  aria-describedby={emailError ? "email-error" : undefined}
                  className={`min-h-[44px] w-full rounded-lg border bg-white/90 px-3 text-base text-slate-900 outline-none transition-colors placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-800/80 dark:text-white dark:placeholder:text-slate-500 ${
                    emailError
                      ? "border-danger-500 focus:border-danger-500 focus:ring-2 focus:ring-danger-500"
                      : "border-slate-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-500 dark:border-slate-600"
                  }`}
                />
                {emailError && (
                  <p id="email-error" className="text-sm text-danger-600 dark:text-danger-400">
                    {emailError}
                  </p>
                )}
              </div>

              <Button type="submit" fullWidth loading={submitting} disabled={submitting} size="lg">
                {submitting ? "Sending…" : "Send reset link"}
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

function CheckIcon() {
  return (
    <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
