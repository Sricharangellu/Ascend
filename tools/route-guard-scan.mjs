#!/usr/bin/env node
/**
 * Route-guard scan — fails CI when a mutating route (POST/PUT/PATCH/DELETE)
 * is registered with no authorization middleware between its path and its
 * handler.
 *
 * Why this exists as a script instead of the shell step it replaces
 * ------------------------------------------------------------------
 * `ci.yml` carried a "No unguarded mutation routes" step from the beginning.
 * It never worked, for two independent reasons, and both had to be fixed to
 * get a check that means anything:
 *
 *   1. It could not fail. The pipeline ended in
 *      `! grep … || echo "All mutation routes have role guards ✓"` — the `!`
 *      inverts a successful match into a non-zero status, and `|| echo` then
 *      swallows that into exit 0. Reproduced locally 2026-08-06: the step
 *      printed 39 matching lines AND the ✓, and exited 0.
 *   2. Even with the laundering removed it was wrong in both directions. It
 *      excluded a line only if the literal text `requireRole` appeared on it,
 *      but 44 route files declare `const mgr = requireRole("manager")` once at
 *      the top and pass `mgr` — so every one of those guarded routes read as a
 *      violation. Meanwhile it only looked one line ahead (`-A1`), so a route
 *      whose middleware sits on a later line read as guarded.
 *
 * A regex over line pairs cannot answer this question. This script parses the
 * actual argument list instead: it walks from `router.<method>(` to the
 * balanced closing paren (string- and comment-aware), splits the top-level
 * arguments, and treats everything between the path (first argument) and the
 * handler (last argument) as the middleware chain. A route is guarded when
 * that chain mentions a guard — either a `gateway/auth.ts` guard called
 * inline, or a local `const x = requireRole(...)` alias resolved per file.
 *
 * Authorization the scanner cannot see (in-handler checks like team's
 * `requireManagement(res)`, or a POS route that is intentionally open to
 * cashiers) lives in tools/route-guard-allowlist.json, keyed by
 * `<file>:<METHOD> <path>` so entries survive surrounding code shifting.
 * Shrink-only: an entry is a documented decision, not a mute button. A stale
 * entry — one that no longer matches an unguarded route — also fails, so the
 * allowlist cannot rot into a list of routes that were fixed years ago.
 *
 * Run: node tools/route-guard-scan.mjs   (aka `npm run route:scan`)
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const SRC_DIR = join(ROOT, "src");
const ALLOWLIST_FILE = join(ROOT, "tools", "route-guard-allowlist.json");

/** Mutating verbs. GET is excluded: reads are gated by the /api/v1 auth prefix. */
const MUTATING_METHODS = ["post", "put", "patch", "delete"];

/** Authorization middleware exported by src/gateway/auth.ts. */
const GUARD_FACTORIES = [
  "requireRole",
  "requirePermission",
  "requireScope",
  "requirePlan",
  "requireCapability",
  "requireModule",
];

// ── File discovery ───────────────────────────────────────────────────────────

/** @returns {string[]} absolute paths of every non-test *routes*.ts under src/ */
function findRouteFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...findRouteFiles(full));
    } else if (/routes.*\.ts$/.test(entry) && !entry.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out.sort();
}

// ── Source parsing ───────────────────────────────────────────────────────────

/**
 * Read the balanced argument list of a call whose opening paren is at
 * `openIdx`. String-, template- and comment-aware so a `)` inside a route path
 * or a regex-looking comment does not close the call early.
 *
 * @returns {{ args: string[], end: number } | null}
 */
function readCallArgs(src, openIdx) {
  let depth = 0;
  let i = openIdx;
  const argStarts = [];
  const argEnds = [];
  let quote = null; // "'" | '"' | "`" | "//" | "/*"

  for (; i < src.length; i++) {
    const c = src[i];
    const next = src[i + 1];

    if (quote === "//") {
      if (c === "\n") quote = null;
      continue;
    }
    if (quote === "/*") {
      if (c === "*" && next === "/") { quote = null; i++; }
      continue;
    }
    if (quote) {
      if (c === "\\") { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === "/" && next === "/") { quote = "//"; i++; continue; }
    if (c === "/" && next === "*") { quote = "/*"; i++; continue; }
    if (c === "'" || c === '"' || c === "`") { quote = c; continue; }

    if (c === "(" || c === "[" || c === "{") {
      depth++;
      if (depth === 1) argStarts.push(i + 1);
      continue;
    }
    if (c === ")" || c === "]" || c === "}") {
      depth--;
      if (depth === 0) { argEnds.push(i); break; }
      continue;
    }
    if (c === "," && depth === 1) {
      argEnds.push(i);
      argStarts.push(i + 1);
    }
  }

  if (depth !== 0 || argEnds.length === 0) return null;
  const args = argStarts.map((s, n) => src.slice(s, argEnds[n]).trim()).filter((a) => a.length > 0);
  return { args, end: i };
}

/** Collect `const <name> = require<Guard>(` aliases declared in a file. */
function collectGuardAliases(src) {
  const aliases = new Set();
  const re = new RegExp(`\\b(?:const|let)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*(?:${GUARD_FACTORIES.join("|")})\\s*\\(`, "g");
  for (const m of src.matchAll(re)) aliases.add(m[1]);
  return aliases;
}

/** True when a file applies a guard to the whole router via `router.use(...)`. */
function hasRouterLevelGuard(src, aliases) {
  for (const m of src.matchAll(/\brouter\.use\s*\(([^)]*)/g)) {
    if (mentionsGuard(m[1], aliases)) return true;
  }
  return false;
}

/** True when `text` references any guard factory or per-file alias. */
function mentionsGuard(text, aliases) {
  for (const g of GUARD_FACTORIES) {
    if (new RegExp(`\\b${g}\\s*\\(`).test(text)) return true;
  }
  for (const a of aliases) {
    if (new RegExp(`\\b${a}\\b`).test(text)) return true;
  }
  return false;
}

/** Strip surrounding quotes from a route-path literal. */
function unquote(arg) {
  const m = /^(['"`])([\s\S]*)\1$/.exec(arg.trim());
  return m ? m[2] : arg.trim();
}

// ── Scan ─────────────────────────────────────────────────────────────────────

/** @type {{key: string, file: string, line: number, method: string, path: string}[]} */
const unguarded = [];
let routesScanned = 0;
let filesScanned = 0;

for (const file of findRouteFiles(SRC_DIR)) {
  const src = readFileSync(file, "utf8");
  const rel = relative(ROOT, file);
  filesScanned++;

  const aliases = collectGuardAliases(src);
  const routerGuarded = hasRouterLevelGuard(src, aliases);

  const callRe = new RegExp(`\\brouter\\.(${MUTATING_METHODS.join("|")})\\s*\\(`, "g");
  for (const m of src.matchAll(callRe)) {
    const openIdx = m.index + m[0].length - 1;
    const parsed = readCallArgs(src, openIdx);
    if (!parsed || parsed.args.length < 2) continue; // not a route registration we understand

    routesScanned++;
    if (routerGuarded) continue;

    // args[0] is the path, the last argument is the handler; everything in
    // between is the middleware chain this check is about.
    const middleware = parsed.args.slice(1, -1).join(", ");
    if (mentionsGuard(middleware, aliases)) continue;

    const line = src.slice(0, m.index).split("\n").length;
    const method = m[1].toUpperCase();
    const path = unquote(parsed.args[0]);
    unguarded.push({ key: `${rel}:${method} ${path}`, file: rel, line, method, path });
  }
}

// ── Allowlist reconciliation ─────────────────────────────────────────────────

/** @type {{_readme?: unknown, routes: Record<string, string>}} */
const allowlist = JSON.parse(readFileSync(ALLOWLIST_FILE, "utf8"));
const allowed = new Set(Object.keys(allowlist.routes ?? {}));

const violations = unguarded.filter((u) => !allowed.has(u.key));
const foundKeys = new Set(unguarded.map((u) => u.key));
const stale = [...allowed].filter((k) => !foundKeys.has(k));

let failed = false;

if (violations.length > 0) {
  failed = true;
  console.error("route-guard-scan: FAILED\n");
  console.error(
    "These mutating routes register no authorization middleware between the\n" +
      "path and the handler. Any authenticated user — including a cashier —\n" +
      "can call them. Add a guard (requireRole/requirePermission/…), or, if the\n" +
      "route is deliberately open or checks authorization inside the handler,\n" +
      "add it to tools/route-guard-allowlist.json WITH the reason:\n",
  );
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  ${v.method} ${v.path}`);
  }
  console.error("");
}

if (stale.length > 0) {
  failed = true;
  console.error(
    "route-guard-scan: STALE ALLOWLIST\n\n" +
      "These entries no longer match an unguarded route — the route was guarded,\n" +
      "renamed, or removed. Delete them so the allowlist keeps meaning something:\n",
  );
  for (const k of stale) console.error(`  ${k}`);
  console.error("");
}

if (failed) process.exit(1);

console.log(
  `route-guard-scan: ${routesScanned} mutating routes across ${filesScanned} route files, ` +
    `${unguarded.length} unguarded (all allowlisted)`,
);
