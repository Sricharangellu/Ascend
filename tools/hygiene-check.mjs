#!/usr/bin/env node
/**
 * tools/hygiene-check.mjs — repo hygiene guard (no dependencies).
 *
 * Fails (exit 1) on the file-level patterns that have repeatedly caused
 * multi-session collisions in this repo: duplicate "copy" files, collision
 * backups, merge-conflict leftovers, and more than one AGENTS.md. This is the
 * "machines enforce hygiene, not humans" control — run it locally and wire it
 * into CI / a pre-commit hook so a duplicate can never be committed.
 *
 *   node tools/hygiene-check.mjs
 *
 * Scans git-tracked files plus untracked-but-not-ignored files, so it catches
 * junk before it is ever committed.
 */
import { execSync } from "node:child_process";

function gitList(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8" }).split("\n").map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

const files = [
  ...gitList("git ls-files"),
  ...gitList("git ls-files --others --exclude-standard"),
];

const violations = [];
const base = (f) => f.split("/").pop() ?? f;

// 1. Numeric "copy" files: "AGENTS 2.md", "report 3.txt" — editor/export/merge copies.
//    Git history is the version store; these never belong in the tree.
const copyRe = / \d+\.[A-Za-z0-9]+$/;
for (const f of files) if (copyRe.test(base(f))) violations.push(`duplicate copy file: ${f}`);

// 2. Collision-backup files produced by botched merges/saves.
for (const f of files) if (f.endsWith(".collision-backup.md")) violations.push(`collision backup: ${f}`);

// 3. Merge-conflict leftovers.
for (const f of files) if (f.endsWith(".orig") || f.endsWith(".rej")) violations.push(`merge leftover: ${f}`);

// 4. Exactly one AGENTS.md — the single agent-instruction file (also guarded in CI).
const agents = files.filter((f) => base(f) === "AGENTS.md");
if (agents.length > 1) violations.push(`multiple AGENTS.md (must be exactly one): ${agents.join(", ")}`);

if (violations.length) {
  console.error("✗ repo-hygiene check FAILED:\n" + violations.map((v) => "  - " + v).join("\n"));
  console.error(
    "\nThese patterns cause multi-session collisions (diverged trees, blocked rebases, lost work).\n" +
      "Fix: delete the offending file(s). Use git history/branches for versions — never file copies.",
  );
  process.exit(1);
}

console.log(`✓ repo-hygiene check passed (${files.length} files scanned; no duplicate/backup/conflict junk).`);
