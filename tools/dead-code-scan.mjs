#!/usr/bin/env node
/**
 * tools/dead-code-scan.mjs — unreferenced-export detector (no dependencies).
 *
 * Backlog item F-17, and the thing that unblocks Phase 9.4 (the hallucination
 * sweep). The 2026-08-04 audit verified module registration, table collisions
 * and route alignment as clean, but could NOT check for unused
 * services/components/utilities: doing that by hand across 977 `.ts` + 836
 * `.tsx` files is not a repeatable operation, so it was recorded as "not
 * checked" rather than ticked. This makes it repeatable.
 *
 *   node tools/dead-code-scan.mjs             (aka `npm run dead:scan`)
 *   node tools/dead-code-scan.mjs --verbose   (group by file)
 *   node tools/dead-code-scan.mjs --max 40    (exit 1 above a threshold)
 *
 * REPORT-ONLY by default (exit 0), same staged rollout as docker-build, e2e,
 * and F-15/F-16 before it.
 *
 * ── How it decides, and what it deliberately gets wrong ──────────────────────
 *
 * An export is reported when its name appears NOWHERE outside the file that
 * declares it. The reference check is a word-boundary text match across every
 * source file, not an import graph.
 *
 * That is crude, and the crudeness is chosen: a text match can only ever
 * UNDER-report. Any symbol mentioned anywhere — a real import, a re-export, a
 * string in a test, a dynamic `import()` — is treated as live. So this tool
 * missing dead code is routine; this tool calling something dead that is
 * actually used requires the name to appear literally nowhere else, which for
 * a genuinely-used symbol essentially cannot happen.
 *
 * For a **deletion** guard that is the right bias. Over-reporting would mean
 * proposing deletion of live code, which is the one outcome that must not
 * happen — this repo has already had three production-breaking incidents from
 * confident-looking changes. Under-reporting just means a smaller true list.
 *
 * Consequence worth stating plainly: a clean run does NOT mean there is no
 * dead code. It means there is none this method can prove. Treat every hit as
 * a candidate to investigate, never as an instruction to delete.
 *
 * Framework entry points are excluded because nothing imports them by design:
 * Next.js App Router files (page/layout/route/loading/error/not-found/template,
 * plus `middleware.ts`) are invoked by the framework, as are its contract
 * exports (`metadata`, `generateMetadata`, `dynamic`, `revalidate`, …), and
 * `src/server.ts` is the process entry.
 */
import { readdirSync, statSync, readFileSync, existsSync } from "node:fs";
import { join, relative, basename } from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["src", "web/app", "web/components", "web/contexts", "web/hooks", "web/lib", "web/api-client"];
const SKIP_DIR = /(^|\/)(node_modules|\.next|dist|coverage|\.git)(\/|$)/;
const SRC_EXT = /\.(ts|tsx)$/;

const args = process.argv.slice(2);
const verbose = args.includes("--verbose");
const maxIdx = args.indexOf("--max");
const maxHits = maxIdx >= 0 ? Number(args[maxIdx + 1]) : null;

/** Next.js App Router files the framework calls; nothing imports them. */
const FRAMEWORK_FILES = new Set([
  "page.tsx", "page.ts", "layout.tsx", "layout.ts", "route.ts", "route.tsx",
  "loading.tsx", "error.tsx", "not-found.tsx", "template.tsx", "default.tsx",
  "global-error.tsx", "middleware.ts", "instrumentation.ts",
]);
/** Named exports that are framework/tooling contracts, not call sites. */
const FRAMEWORK_EXPORTS = new Set([
  "metadata", "generateMetadata", "generateStaticParams", "viewport",
  "generateViewport", "dynamic", "revalidate", "fetchCache", "runtime",
  "preferredRegion", "dynamicParams", "maxDuration", "config", "default",
]);
/** Process entry points. */
const ENTRY_FILES = new Set(["src/server.ts", "src/app.ts"]);

function walk(dir) {
  const out = [];
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e);
    if (SKIP_DIR.test(p)) continue;
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) out.push(...walk(p));
    else if (SRC_EXT.test(p)) out.push(p);
  }
  return out;
}

const files = [];
for (const d of SCAN_DIRS) {
  const abs = join(ROOT, d);
  if (existsSync(abs)) files.push(...walk(abs));
}

const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// name → declaring file
const exportsByName = new Map();
const contents = new Map();

const DECL_RE =
  /^export\s+(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:function|const|let|var|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm;
const LIST_RE = /^export\s*\{([^}]*)\}/gm;

for (const f of files) {
  let raw;
  try { raw = readFileSync(f, "utf8"); } catch { continue; }
  const rel = relative(ROOT, f);
  const src = stripComments(raw);
  contents.set(rel, src);

  if (FRAMEWORK_FILES.has(basename(rel)) || ENTRY_FILES.has(rel)) continue;
  if (/\.test\.tsx?$/.test(rel)) continue; // test-local exports are fixtures

  for (const m of src.matchAll(DECL_RE)) {
    const name = m[1];
    if (FRAMEWORK_EXPORTS.has(name)) continue;
    const kind = /\b(interface|type)\s+$/.test(m[0].slice(0, m[0].lastIndexOf(name))) ? "type" : "value";
    if (!exportsByName.has(name)) exportsByName.set(name, { file: rel, kind });
  }
  for (const m of src.matchAll(LIST_RE)) {
    // `export { a, b as c }` — the exported name is what callers reference.
    for (const part of m[1].split(",")) {
      const raw = part.trim();
      if (!raw) continue;
      // `export { type Foo }` / `export type { Foo }` are type-only re-exports.
      const isType = /^type\s+/.test(raw) || /^export\s+type\s*\{/.test(m[0]);
      const name = raw.replace(/^type\s+/, "").split(/\s+as\s+/).pop()?.trim();
      if (!name || FRAMEWORK_EXPORTS.has(name)) continue;
      if (!exportsByName.has(name)) {
        exportsByName.set(name, { file: rel, kind: isType ? "type" : "value" });
      }
    }
  }
}

const unused = [];
for (const [name, { file: declFile, kind }] of exportsByName) {
  const re = new RegExp(`\\b${name.replace(/\$/g, "\\$")}\\b`);
  let seen = false;
  for (const [f, src] of contents) {
    if (f === declFile) continue;
    if (re.test(src)) { seen = true; break; }
  }
  if (!seen) unused.push({ name, file: declFile, kind });
}

unused.sort((a, b) => a.file.localeCompare(b.file) || a.name.localeCompare(b.name));

// Split by kind. An unused `type`/`interface` is over-exposed surface — real,
// but it ships nothing and breaks nothing. An unused function/class/const is a
// candidate for genuinely dead runtime code. Reporting them as one number
// buries the ~90 findings that matter under ~280 that mostly do not.
const values = unused.filter((u) => u.kind === "value");
const types = unused.filter((u) => u.kind === "type");

console.log(
  `dead-code-scan: ${files.length} files · ${exportsByName.size} exported symbols · ` +
    `${unused.length} referenced nowhere else (${values.length} value, ${types.length} type-only)`,
);

function report(list, heading) {
  if (!list.length) return;
  console.log(`\n${heading}`);
  const byFile = new Map();
  for (const u of list) {
    if (!byFile.has(u.file)) byFile.set(u.file, []);
    byFile.get(u.file).push(u.name);
  }
  const rows = [...byFile.entries()];
  for (const [f, names] of rows.slice(0, verbose ? Infinity : 20)) {
    console.log(`  ${f}`);
    console.log(`      ${names.join(", ")}`);
  }
  if (!verbose && rows.length > 20) {
    console.log(`  … ${rows.length - 20} more files (--verbose to list)`);
  }
}

report(values, "VALUE exports never referenced elsewhere (functions/classes/consts — the actionable list):");
report(types, "TYPE-only exports never referenced elsewhere (over-exported surface; low priority):");

if (!unused.length) {
  console.log("✓ every export is referenced somewhere else");
} else {
  console.log(
    "\nThis method can only under-report, never over-report (see the header).\n" +
      "A hit means 'no reference found', not 'safe to delete' — check for dynamic\n" +
      "imports, string-keyed registries, and framework conventions first.",
  );
}

// Gate on VALUE exports only if asked: the type list is noise for this purpose.
if (maxHits !== null && Number.isFinite(maxHits) && values.length > maxHits) {
  console.error(`\n✗ ${values.length} unreferenced value exports exceeds --max ${maxHits}`);
  process.exit(1);
}
