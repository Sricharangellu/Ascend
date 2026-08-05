import Link from "next/link";
import { MarketingShell } from "@/components/MarketingShell";

const OPERATING_MODEL = [
  "Buy / receive goods",
  "Manage inventory",
  "Price products",
  "Sell",
  "Collect payment",
  "Fulfill",
  "Report & reconcile",
];

const BUSINESS_PACKS = [
  { icon: "🏪", name: "Retail", description: "Convenience stores, supermarkets, fashion, electronics, pharmacies" },
  { icon: "🍽️", name: "Restaurant & F&B", description: "Restaurants, cafes, bars, food trucks, bakeries" },
  { icon: "📦", name: "B2B / Wholesale", description: "Distributors, wholesalers, B2B suppliers, FMCG distribution" },
  { icon: "✂️", name: "Services", description: "Salons, spas, repair shops, tailoring, beauty studios" },
  { icon: "🏥", name: "Healthcare & Pharmacy", description: "Pharmacies, clinics, medical stores, optical stores" },
  { icon: "🏭", name: "Manufacturing", description: "Factory outlets, manufacturers, direct-to-consumer brands" },
  { icon: "🛒", name: "E-Commerce & Omnichannel", description: "Online stores, marketplace sellers, click-and-collect" },
  { icon: "🏨", name: "Hospitality", description: "Hotels, resorts, guest houses, boutique properties" },
];

const BUILT_ON = [
  {
    title: "An immutable inventory ledger",
    description: "Every stock change — sale, receipt, transfer, adjustment — is a permanent movement record, not a number that just gets overwritten.",
  },
  {
    title: "Offline-first checkout",
    description: "The register keeps ringing up sales through a dropped connection and syncs automatically the moment it's back.",
  },
  {
    title: "One data model per business",
    description: "Retail, wholesale, and restaurant packs configure the same product, inventory, order, and payment engine — not separate apps bolted together.",
  },
];

export default function LandingPage() {
  return (
    <MarketingShell>
      {/* Hero */}
      <section className="mx-auto max-w-5xl px-6 pb-20 pt-20 text-center sm:pt-28">
        <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-500" />
          One platform, configured for how your business actually runs
        </div>
        <h1 className="mb-6 text-4xl font-extrabold leading-tight tracking-tight text-[var(--color-text-primary)] sm:text-6xl">
          The operating platform for
          <br />
          <span className="text-brand-600">product-based businesses</span>
        </h1>
        <p className="mx-auto mb-10 max-w-2xl text-lg text-[var(--color-text-secondary)]">
          Retail, wholesale, restaurants, and more all run on the same shared engine —
          buying, inventory, selling, payments, and reporting — configured per business,
          not rebuilt per business.
        </p>
        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href="/signup"
            className="rounded-xl bg-brand-600 px-7 py-3 text-base font-semibold text-white transition-colors hover:bg-brand-700"
          >
            Start free
          </Link>
          <Link
            href="/login?demo=1"
            className="rounded-xl border border-[var(--color-border)] px-7 py-3 text-base font-semibold text-[var(--color-text-primary)] transition-colors hover:border-brand-300"
          >
            View demo
          </Link>
        </div>
      </section>

      {/* Operating model */}
      <section className="border-y border-[var(--color-table-border)] bg-[var(--color-surface)] py-14">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-center text-sm font-semibold uppercase tracking-[0.08em] text-[var(--color-text-secondary)]">
            One shared operating loop
          </h2>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-2 gap-y-4">
            {OPERATING_MODEL.map((step, i) => (
              <div key={step} className="flex items-center gap-2">
                <span className="whitespace-nowrap rounded-md border border-[var(--color-border)] bg-[var(--color-page-bg)] px-3 py-1.5 text-sm font-medium text-[var(--color-text-primary)]">
                  {step}
                </span>
                {i < OPERATING_MODEL.length - 1 && (
                  <span className="text-[var(--color-text-secondary)]" aria-hidden="true">→</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Business packs */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)] sm:text-3xl">
            Business packs, not separate products
          </h2>
          <p className="mt-3 text-[var(--color-text-secondary)]">
            Choosing a business type installs the right defaults — navigation, required
            fields, workflows — on top of the same core. Retail is the first fully
            complete pack; every business below shares its foundation.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {BUSINESS_PACKS.map((pack) => (
            <div
              key={pack.name}
              className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 transition-colors hover:border-brand-300"
            >
              <div className="text-2xl">{pack.icon}</div>
              <h3 className="mt-3 font-semibold text-[var(--color-text-primary)]">{pack.name}</h3>
              <p className="mt-1 text-sm leading-relaxed text-[var(--color-text-secondary)]">{pack.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Built on */}
      <section className="border-t border-[var(--color-table-border)] bg-[var(--color-surface)] py-20">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-center text-2xl font-bold tracking-tight text-[var(--color-text-primary)] sm:text-3xl">
            Built for correctness, not just features
          </h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-3">
            {BUILT_ON.map((item) => (
              <div key={item.title}>
                <h3 className="font-semibold text-[var(--color-text-primary)]">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-secondary)]">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h2 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)] sm:text-3xl">
          Start with retail. Grow into everything else.
        </h2>
        <p className="mt-3 text-[var(--color-text-secondary)]">
          Set up your first outlet and register in minutes — no separate system to learn
          when your business grows into wholesale, restaurant, or e-commerce.
        </p>
        <div className="mt-8">
          <Link
            href="/signup"
            className="rounded-xl bg-brand-600 px-7 py-3 text-base font-semibold text-white transition-colors hover:bg-brand-700"
          >
            Start free
          </Link>
        </div>
      </section>
    </MarketingShell>
  );
}
