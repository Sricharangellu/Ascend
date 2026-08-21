import Link from "next/link";
import type { Metadata } from "next";
import { listHelpArticles, listHelpCategories } from "@/lib/helpArticles";

export const metadata: Metadata = {
  title: "Help Center",
  description: "Guides for getting the most out of Ascend.",
};

export default async function HelpIndexPage() {
  const [articles, categories] = await Promise.all([listHelpArticles(), listHelpCategories()]);

  return (
    <div className="min-h-screen bg-[var(--color-page-bg)]">
      <header className="border-b border-[var(--color-table-border)] bg-[var(--color-surface)]">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-bold tracking-tight text-[var(--color-text-primary)]">
            Asc<span className="text-brand-600">end</span>
          </Link>
          <Link href="/login" className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="text-3xl font-bold tracking-tight text-[var(--color-text-primary)]">Help Center</h1>
        <p className="mt-2 text-[var(--color-text-secondary)]">
          Guides for setting up and running your business on Ascend.
        </p>

        <div className="mt-10 space-y-10">
          {categories.map((category) => (
            <section key={category}>
              <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-text-secondary)]">
                {category}
              </h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {articles
                  .filter((a) => a.category === category)
                  .map((article) => (
                    <Link
                      key={article.slug}
                      href={`/help/${article.slug}`}
                      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 transition-colors hover:border-brand-300 hover:bg-brand-50/30"
                    >
                      <h3 className="font-semibold text-[var(--color-text-primary)]">{article.title}</h3>
                      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{article.summary}</p>
                    </Link>
                  ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
