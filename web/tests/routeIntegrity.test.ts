/**
 * @vitest-environment node
 *
 * Every in-app link must point at a route that actually exists.
 *
 * The Ponytail Wave 3 consolidation deleted 29 page routes. Nothing in a
 * typecheck catches a dead string href, so surviving links to deleted pages
 * only surface as a 404 (or a silent 308 through next.config's redirect table)
 * at runtime. Three of them reached the primary dashboard — an audit that
 * claimed to have grepped for them still missed all three.
 *
 * This walks web/app for the real route set and asserts every literal href in
 * the app resolves to one of: a real page, a declared redirect source, or an
 * explicitly-allowlisted external/non-page path.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const APP_DIR = path.resolve(__dirname, "../app");
const WEB_DIR = path.resolve(__dirname, "..");

/** Recursively collect files under `dir` matching `pred`. */
function walk(dir: string, pred: (p: string) => boolean, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, pred, out);
    else if (pred(full)) out.push(full);
  }
  return out;
}

/**
 * Convert an app-router page path to its URL route.
 * Strips route groups `(protected)` and normalizes dynamic segments `[id]`.
 */
function pageToRoute(file: string): string {
  const rel = path.relative(APP_DIR, path.dirname(file));
  const segments = rel
    .split(path.sep)
    .filter((s) => s !== "" && !(s.startsWith("(") && s.endsWith(")")));
  return "/" + segments.join("/");
}

/** Routes backed by a real page.tsx. */
const realRoutes = new Set(
  walk(APP_DIR, (p) => /(^|[\\/])page\.tsx$/.test(p)).map(pageToRoute),
);

/**
 * Redirect sources declared in next.config.mjs, mapped to their destination.
 *
 * A redirect is NOT an acceptable target for an in-app link. The redirect table
 * exists for external/bookmarked legacy URLs; an internal link that relies on it
 * costs a 308 round-trip and a hard reload instead of a client-side transition,
 * and breaks outright the moment the entry is pruned. This is the team's stated
 * policy (see cd118a4: "the palette fallback still pointed at it and only worked
 * via the 308. Link the real hub."). So these are reported as violations, with
 * the destination named to make the fix obvious.
 */
const redirectMap = (() => {
  const config = readFileSync(path.join(WEB_DIR, "next.config.mjs"), "utf8");
  const map = new Map<string, string>();
  const re = /source:\s*["'`]([^"'`]+)["'`][\s\S]{0,160}?destination:\s*["'`]([^"'`]+)["'`]/g;
  for (const m of config.matchAll(re)) {
    // `/reporting/:path*` → key on `/reporting`.
    map.set(m[1].replace(/\/:[^/]*$/, ""), m[2]);
  }
  return map;
})();

/**
 * Paths that are legitimately not app-router pages. Keep this list short and
 * justified — every entry is a link that will not resolve to a page.tsx.
 */
const ALLOWED_NON_PAGE = new Set([
  "/", // root redirect handled by app/page.tsx logic
  "/api", // API namespace
  "/healthz",
  "/readyz",
]);

/** Returns null when the href is fine, or a human-readable reason when it is not. */
function violation(href: string): string | null {
  // Strip query and hash — routing only cares about the pathname.
  const pathname = href.split("?")[0].split("#")[0].replace(/\/$/, "") || "/";

  if (ALLOWED_NON_PAGE.has(pathname)) return null;
  if (pathname.startsWith("/api/")) return null;
  if (realRoutes.has(pathname)) return null;

  // A dynamic route matches if some real route has the same shape, e.g.
  // `/catalog/abc-123` matches the `/catalog/[id]` page.
  const parts = pathname.split("/").filter(Boolean);
  for (const route of realRoutes) {
    const rp = route.split("/").filter(Boolean);
    if (rp.length !== parts.length) continue;
    if (rp.every((seg, i) => seg.startsWith("[") || seg === parts[i])) return null;
  }

  const dest = redirectMap.get(pathname);
  if (dest) return `no such page; only resolves via a 308 to ${dest} — link ${dest} directly`;
  return `no such page and no redirect — this is a 404`;
}

describe("route integrity — every in-app link resolves", () => {
  it("finds a non-trivial number of routes (guards against a broken walker)", () => {
    expect(realRoutes.size).toBeGreaterThan(50);
  });

  it("has no href pointing at a deleted or non-existent page", () => {
    const sourceFiles = walk(
      APP_DIR,
      (p) => p.endsWith(".tsx") && !p.endsWith(".test.tsx"),
    ).concat(
      walk(path.join(WEB_DIR, "components"), (p) => p.endsWith(".tsx") && !p.endsWith(".test.tsx")),
    );

    const dead: string[] = [];

    for (const file of sourceFiles) {
      const src = readFileSync(file, "utf8");
      // `href="/..."` and `href: "/..."` — string literals only. Template
      // literals and computed hrefs are out of scope (not statically checkable).
      for (const m of src.matchAll(/href[=:]\s*["'](\/[^"']*)["']/g)) {
        const href = m[1];
        const reason = violation(href);
        if (reason) {
          const line = src.slice(0, m.index).split("\n").length;
          dead.push(`${path.relative(WEB_DIR, file)}:${line} → ${href} — ${reason}`);
        }
      }
    }

    expect(dead, `Dead in-app links:\n${dead.join("\n")}`).toEqual([]);
  });
});
