import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";

export interface HelpArticleMeta {
  slug: string;
  title: string;
  category: string;
  summary: string;
}

export interface HelpArticle extends HelpArticleMeta {
  content: string;
}

const CONTENT_DIR = path.join(process.cwd(), "content", "help");

/**
 * Static help content — no backend, no per-tenant storage. Help articles are
 * the same for every tenant (not tenant business data), so they're authored
 * as .mdx files and read from the filesystem at build/request time rather
 * than stored in Postgres. See docs/architecture/ADR/ADR-007 sibling plan
 * notes for why this stays out of the FeatureId/MODULE_REGISTRY entitlement
 * system entirely — it's a public, ungated route like /login or /signup.
 */
async function readAllArticles(): Promise<HelpArticle[]> {
  const files = await readdir(CONTENT_DIR);
  const articles = await Promise.all(
    files
      .filter((f) => f.endsWith(".mdx"))
      .map(async (file) => {
        const raw = await readFile(path.join(CONTENT_DIR, file), "utf-8");
        const { data, content } = matter(raw);
        const slug = file.replace(/\.mdx$/, "");
        return {
          slug,
          title: String(data["title"] ?? slug),
          category: String(data["category"] ?? "General"),
          summary: String(data["summary"] ?? ""),
          content,
        };
      }),
  );
  return articles.sort((a, b) => a.title.localeCompare(b.title));
}

export async function listHelpArticles(): Promise<HelpArticleMeta[]> {
  const articles = await readAllArticles();
  return articles.map(({ content: _content, ...meta }) => meta);
}

export async function getHelpArticle(slug: string): Promise<HelpArticle | null> {
  const articles = await readAllArticles();
  return articles.find((a) => a.slug === slug) ?? null;
}

export async function listHelpCategories(): Promise<string[]> {
  const articles = await listHelpArticles();
  return Array.from(new Set(articles.map((a) => a.category)));
}
