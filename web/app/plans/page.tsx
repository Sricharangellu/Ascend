import Link from "next/link";
import type { Metadata } from "next";
import { MarketingShell } from "@/components/MarketingShell";

export const metadata: Metadata = { title: "Pricing" };

const TIERS = [
  {
    name: "Starter",
    tagline: "One outlet, one register, everything you need to start selling.",
    features: [
      "Core POS terminal",
      "Inventory with reorder alerts",
      "Sales, returns, and reporting",
      "Single outlet",
    ],
  },
  {
    name: "Growth",
    tagline: "Multiple outlets and the modules that come with growing.",
    features: [
      "Everything in Starter",
      "Multiple outlets and registers",
      "Purchasing and vendor management",
      "Wholesale / B2B modules (quotes, invoicing, credit terms)",
    ],
    highlighted: true,
  },
  {
    name: "Enterprise",
    tagline: "Advanced control for larger or multi-brand operations.",
    features: [
      "Everything in Growth",
      "Custom roles and permissions",
      "Advanced analytics and forecasting",
      "SSO and audit-depth compliance",
    ],
  },
];

export default function PlansPage() {
  return (
    <MarketingShell>
      <section className="mx-auto max-w-4xl px-6 py-16 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-[var(--color-text-primary)] sm:text-4xl">
          Plans that grow with your business
        </h1>
        <p className="mt-3 text-[var(--color-text-secondary)]">
          Every plan runs on the same platform — moving up unlocks more modules and
          scale, not a different product.
        </p>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-20">
        <div className="grid gap-6 sm:grid-cols-3">
          {TIERS.map((tier) => (
            <div
              key={tier.name}
              className={`rounded-2xl border p-6 ${
                tier.highlighted
                  ? "border-brand-300 bg-brand-50/40 ring-1 ring-brand-200"
                  : "border-[var(--color-border)] bg-[var(--color-surface)]"
              }`}
            >
              <h2 className="font-semibold text-[var(--color-text-primary)]">{tier.name}</h2>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{tier.tagline}</p>
              <ul className="mt-5 space-y-2">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-[var(--color-text-primary)]">
                    <span className="mt-1 text-brand-600" aria-hidden="true">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/contact"
                className="mt-6 block rounded-md border border-[var(--color-border)] px-4 py-2 text-center text-sm font-semibold text-[var(--color-text-primary)] transition-colors hover:border-brand-300"
              >
                Talk to us
              </Link>
            </div>
          ))}
        </div>
        <p className="mt-8 text-center text-sm text-[var(--color-text-secondary)]">
          Pricing is tailored to your business size and modules — {" "}
          <Link href="/contact" className="text-brand-600 hover:underline">contact us</Link> for a quote.
        </p>
      </section>
    </MarketingShell>
  );
}
