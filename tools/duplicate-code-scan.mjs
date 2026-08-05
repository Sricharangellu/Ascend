#!/usr/bin/env node
/**
 * tools/duplicate-code-scan.mjs — copy-paste detector (no dependencies).
 *
 * Backlog item F-15. The 2026-08-04 AI-slop audit found two duplication
 * defects by hand that a machine should have found for free:
 *
 *   - `test-request.ts` copy-pasted into 48 modules in 8 divergent variants
 *     (~4,000 lines), where `workflows` had silently drifted to a default
 *     role of `manager` while the other 47 used `owner`;
 *   - a private `apiFetch` in `web/contexts/StoreAuthContext.tsx` sitting
 *     beside the canonical one in `web/api-client/client.ts`, diverged far
 *     enough that failed storefront sign-in rendered "[object Object]".
 *
 * Neither tripped a single existing guard, because nothing was *missing* and
 * nothing *collided* — the repo's other scanners look for absence and for
 * conflict, and duplication is neither. This closes that gap.
 *
 *   node tools/duplicate-code-scan.mjs            (aka `npm run dupe:scan`)
 *   node tools/duplicate-code-scan.mjs --verbose  (list every offending file)
 *   node tools/duplicate-code-scan.mjs --max 12   (fail if groups exceed 12)
 *
 * REPORT-ONLY BY DEFAULT (exit 0). Gating merges on a brand-new detector over
 * a 2,195-file repo blocks all work until the backlog is burned down, and a
 * check that blocks all work gets deleted — the same reasoning that landed
 * `docker-build` and `e2e` as non-blocking first. Add `--max <n>` in CI once
 * F-5 and friends have landed and the number is small and stable.
 *
 * Scope is `src/` + `web/`: the canonical tree, matching what api-gap-scan and
 * table-collision-scan already cover. `artifacts/` is deliberately excluded —
 * it is a known 1,004-file duplicate of the whole application (audit finding
 * H-1, tracked as F-3, blocked on a human decision). Including it would report
 * ~857 duplicate files and drown every actionable finding in one already-known
 * one. Re-scope this once F-3 is resolved.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["src", "web/app", "web/components", "web/contexts", "web/hooks", "web/lib", "web/api-client"];
const SKIP_DIR = /(^|\/)(node_modules|\.next|dist|coverage|\.git)(\/|$)/;
const SRC_EXT = /\.(ts|tsx)$/;

/** Consecutive normalized lines that must match before a block is a duplicate. */
const BLOCK_LINES = 25;
/** Ignore files too small for the block scan to say anything meaningful. */
const MIN_FILE_LINES = 12;

const args = process.argv.slice(2);
const verbose = args.includes("--verbose");
const maxIdx = args.indexOf("--max");
const maxGroups = maxIdx >= 0 ? Number(args[maxIdx + 1]) : null;

function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e);
    if (SKIP_DIR.test(p)) continue;
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) out.push(...walk(p));
    else if (SRC_EXT.test(p)) out.push(p);
  }
  return out;
}

/**
 * Strip what shouldn't count as duplication: comments, blank lines, and
 * indentation. Two files that differ only in a doc-comment ARE the same code —
 * that is exactly how the 34 byte-identical `test-request.ts` copies coexisted
 * with 7 near-identical ones that had only reworded headers.
 */
function normalize(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")      // block comments
    .replace(/(^|[^:])\/\/.*$/gm, "$1")     // line comments, sparing `https://`
    .split("\n")
    .map((l) => l.trim().replace(/\s+/g, " "))
    .filter(Boolean);
}

const sha = (s) => createHash("sha1").update(s).digest("hex");

const files = [];
for (const d of SCAN_DIRS) {
  const abs = join(ROOT, d);
  if (existsSync(abs)) files.push(...walk(abs));
}

/** hash → files (whole normalized file identical) */
const byFileHash = new Map();
/** hash → Set<file> (a BLOCK_LINES window identical) */
const byBlockHash = new Map();

for (const f of files) {
  let lines;
  try {
    lines = normalize(readFileSync(f, "utf8"));
  } catch {
    continue;
  }
  if (lines.length < MIN_FILE_LINES) continue;
  const rel = relative(ROOT, f);

  const fh = sha(lines.join("\n"));
  if (!byFileHash.has(fh)) byFileHash.set(fh, []);
  byFileHash.get(fh).push(rel);

  for (let i = 0; i + BLOCK_LINES <= lines.length; i++) {
    const bh = sha(lines.slice(i, i + BLOCK_LINES).join("\n"));
    if (!byBlockHash.has(bh)) byBlockHash.set(bh, new Set());
    byBlockHash.get(bh).add(rel);
  }
}

const identicalGroups = [...byFileHash.values()]
  .filter((g) => g.length > 1)
  .sort((a, b) => b.length - a.length);

// A block spanning several files is one finding, not one per window: collapse
// windows that cover the same set of files so a long shared region reports once.
const blockByFileset = new Map();
for (const fileSet of byBlockHash.values()) {
  if (fileSet.size < 2) continue;
  const key = [...fileSet].sort().join("|");
  blockByFileset.set(key, fileSet);
}
// Drop block findings already explained by a whole-file duplicate group.
const identicalFiles = new Set(identicalGroups.flat());
const blockGroups = [...blockByFileset.values()]
  .filter((s) => ![...s].every((f) => identicalFiles.has(f)))
  .sort((a, b) => b.size - a.size);

const dupFileCount = identicalGroups.reduce((n, g) => n + g.length, 0);

console.log(
  `duplicate-code-scan: ${files.length} files scanned · ` +
    `${identicalGroups.length} identical-file groups (${dupFileCount} files) · ` +
    `${blockGroups.length} duplicated blocks (≥${BLOCK_LINES} lines)`,
);

if (identicalGroups.length) {
  console.log("\nIdentical files (same code after stripping comments/whitespace):");
  for (const g of identicalGroups.slice(0, verbose ? Infinity : 10)) {
    console.log(`  ${g.length}× ${g[0]}`);
    if (verbose) for (const f of g.slice(1)) console.log(`      ${f}`);
  }
  if (!verbose && identicalGroups.length > 10) {
    console.log(`  … ${identicalGroups.length - 10} more (--verbose to list)`);
  }
}

if (blockGroups.length) {
  console.log(`\nDuplicated blocks (≥${BLOCK_LINES} identical lines across files):`);
  for (const s of blockGroups.slice(0, verbose ? Infinity : 10)) {
    // A 46-file group printed on one line is unreadable and buries the
    // two-file findings that are usually the actionable ones.
    const list = [...s].sort();
    const shown = verbose ? list : list.slice(0, 3);
    console.log(`  ${list.length} files:`);
    for (const f of shown) console.log(`      ${f}`);
    if (shown.length < list.length) {
      console.log(`      … +${list.length - shown.length} more (--verbose to list)`);
    }
  }
  if (!verbose && blockGroups.length > 10) {
    console.log(`  … ${blockGroups.length - 10} more groups (--verbose to list)`);
  }
}

if (!identicalGroups.length && !blockGroups.length) {
  console.log("✓ no duplicated files or blocks found");
}

if (maxGroups !== null && Number.isFinite(maxGroups)) {
  const total = identicalGroups.length + blockGroups.length;
  if (total > maxGroups) {
    console.error(`\n✗ ${total} duplicate groups exceeds --max ${maxGroups}`);
    console.error(
      "Fix: move the shared code to its owning module (see the domain table in\n" +
        "docs/architecture/ARCHITECTURE.md) and import it, rather than copying it.",
    );
    process.exit(1);
  }
}
