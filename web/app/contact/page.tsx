import Link from "next/link";
import type { Metadata } from "next";
import { MarketingShell } from "@/components/MarketingShell";

export const metadata: Metadata = { title: "Contact" };

export default function ContactPage() {
  return (
    <MarketingShell>
      <section className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-[var(--color-text-primary)] sm:text-4xl">
          Get in touch
        </h1>
        <p className="mt-4 text-[var(--color-text-secondary)]">
          The fastest way to see if Ascend fits your business is to try it directly.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-left">
            <h2 className="font-semibold text-[var(--color-text-primary)]">Explore a live demo</h2>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              See the register, inventory, and reporting with sample data — no setup
              required.
            </p>
            <Link
              href="/login?demo=1"
              className="mt-4 inline-block rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
            >
              View demo
            </Link>
          </div>
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-left">
            <h2 className="font-semibold text-[var(--color-text-primary)]">Set up your account</h2>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              Create your business account and choose the setup that matches how you
              actually sell.
            </p>
            <Link
              href="/signup"
              className="mt-4 inline-block rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] transition-colors hover:border-brand-300"
            >
              Start free
            </Link>
          </div>
        </div>

        <p className="mt-10 text-sm text-[var(--color-text-secondary)]">
          Already have an account? Find setup and usage guides in the{" "}
          <Link href="/help" className="text-brand-600 hover:underline">Help Center</Link>.
        </p>
      </section>
    </MarketingShell>
  );
}
