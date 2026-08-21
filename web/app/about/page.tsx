import type { Metadata } from "next";
import { MarketingShell } from "@/components/MarketingShell";

export const metadata: Metadata = { title: "About" };

const PRINCIPLES = [
  {
    title: "Correctness before breadth",
    description:
      "For software that touches inventory, payments, and accounting, being right matters more than having every feature. We'd rather ship one thing that's fully proven than ten things that are only demo-deep.",
  },
  {
    title: "One core, many businesses",
    description:
      "Retail, wholesale, and restaurant operations aren't different products wearing different skins — they're the same product, inventory, order, and payment engine, configured differently.",
  },
  {
    title: "Honest about what's built",
    description:
      "Internally we separate built-and-verified from planned — and we hold ourselves to the same bar externally: we won't tell you a feature is ready before it's actually proven against real data.",
  },
];

export default function AboutPage() {
  return (
    <MarketingShell>
      <section className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-bold tracking-tight text-[var(--color-text-primary)] sm:text-4xl">
          About Ascend
        </h1>
        <p className="mt-4 text-lg text-[var(--color-text-secondary)]">
          Ascend is a business operating platform for product-based companies — retail
          today, with wholesale, restaurant, and other business types built on the same
          foundation rather than as separate systems.
        </p>

        <div className="mt-12 space-y-10">
          {PRINCIPLES.map((p) => (
            <div key={p.title}>
              <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">{p.title}</h2>
              <p className="mt-2 leading-relaxed text-[var(--color-text-secondary)]">{p.description}</p>
            </div>
          ))}
        </div>
      </section>
    </MarketingShell>
  );
}
