import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MDXRemote } from "next-mdx-remote/rsc";
import { getHelpArticle, listHelpArticles } from "@/lib/helpArticles";

export async function generateStaticParams() {
  const articles = await listHelpArticles();
  return articles.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const article = await getHelpArticle(slug);
  if (!article) return {};
  return { title: article.title, description: article.summary };
}

export default async function HelpArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await getHelpArticle(slug);
  if (!article) notFound();

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

      <main className="mx-auto max-w-2xl px-6 py-12">
        <Link href="/help" className="text-sm text-brand-600 hover:underline">
          ← Help Center
        </Link>
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-text-secondary)]">
          {article.category}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--color-text-primary)]">{article.title}</h1>

        <article className="help-article mt-6 text-[var(--color-text-primary)]">
          <MDXRemote source={article.content} />
        </article>
      </main>
    </div>
  );
}
