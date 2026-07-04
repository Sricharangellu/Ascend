import fs from "node:fs";
import path from "node:path";

export interface BuildInfo {
  /** Git commit SHA the running process was built from; "dev" when unknown. */
  sha: string;
  /** ISO timestamp of the deploy build; null for local/dev runs. */
  builtAt: string | null;
}

let cached: BuildInfo | undefined;

/**
 * Resolve which commit this process is running, so /healthz can answer
 * "what is live right now?" without dashboard archaeology.
 *
 * Resolution order:
 *  1. GIT_COMMIT_SHA / VERCEL_GIT_COMMIT_SHA env (set by CI or the platform)
 *  2. version.json at the app root (written by scripts/deploy.sh into the
 *     staging dir — deploys from a temp dir have no .git to ask)
 *  3. "dev" — local checkout without deploy metadata
 */
export function buildInfo(): BuildInfo {
  if (cached) return cached;
  let sha = process.env["GIT_COMMIT_SHA"] ?? process.env["VERCEL_GIT_COMMIT_SHA"] ?? "";
  let builtAt: string | null = null;
  if (!sha) {
    try {
      const raw = fs.readFileSync(path.resolve(process.cwd(), "version.json"), "utf8");
      const parsed = JSON.parse(raw) as { sha?: string; builtAt?: string };
      sha = parsed.sha ?? "";
      builtAt = parsed.builtAt ?? null;
    } catch {
      // No version.json — local dev checkout.
    }
  }
  cached = { sha: sha || "dev", builtAt };
  return cached;
}
