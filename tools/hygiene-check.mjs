#!/usr/bin/env node
/**
 * tools/hygiene-check.mjs — repo hygiene guard (no dependencies).
 *
 * Fails (exit 1) on the patterns that have caused multi-session collisions or
 * would leak configuration/secrets in this repo: duplicate "copy" files,
 * collision backups, merge-conflict leftovers/markers, a missing or duplicated
 * AGENTS.md, tracked .env files, and high-confidence secret tokens. This is the
 * "machines enforce hygiene, not humans" control — run it locally and wire it
 * into CI / a pre-commit hook so junk or a secret can never be committed.
 *
 *   node tools/hygiene-check.mjs   (aka `npm run hygiene`)
 *
 * Scans git-tracked files plus untracked-but-not-ignored files, so it catches
 * problems before they are ever committed.
 */
import { execSync } from "node:child_process";
import { readFileSync, statSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

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
if (agents.length === 0) violations.push("missing AGENTS.md (the single agent-instruction file is required)");
if (agents.length > 1) violations.push(`multiple AGENTS.md (must be exactly one): ${agents.join(", ")}`);

// 5. Tracked .env files. Real env files hold config/secrets and must be gitignored;
//    only the committed template (.env.example / *.env.example) is allowed.
const envRe = /(^|\/)\.env(\.[A-Za-z0-9_-]+)?$/;
for (const f of files) {
  if (envRe.test(f) && !f.endsWith(".example")) violations.push(`tracked env file (should be gitignored): ${f}`);
}

// 6. Content scan — merge-conflict markers and high-confidence secret tokens.
//    Read each tracked/untracked text file once; skip binaries, large files, and
//    this checker itself (it contains the marker/secret patterns as literals).
const SELF = "tools/hygiene-check.mjs";
const BINARY_EXT = /\.(png|jpe?g|gif|webp|ico|svg|pdf|woff2?|ttf|eot|otf|mp[34]|zip|gz|tgz|wasm|node|lock)$/i;
const SECRET_PATTERNS = [
  [/vcp_[A-Za-z0-9]{20,}/, "Vercel token"],
  [/sk_live_[A-Za-z0-9]{16,}/, "Stripe live secret key"],
  [/rk_live_[A-Za-z0-9]{16,}/, "Stripe live restricted key"],
  [/AKIA[0-9A-Z]{16}/, "AWS access key id"],
  [/gh[posru]_[A-Za-z0-9]{36,}/, "GitHub token"],
  [/xox[baprs]-[A-Za-z0-9-]{10,}/, "Slack token"],
  [/-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/, "private key"],
];
const CONFLICT_START = /^<{7}( |$)/m;
const CONFLICT_END = /^>{7}( |$)/m;

for (const f of files) {
  if (f === SELF || BINARY_EXT.test(f)) continue;
  let content;
  try {
    if (statSync(f).size > 512 * 1024) continue; // skip large files (unlikely to hold hand-written secrets)
    content = readFileSync(f, "utf8");
  } catch {
    continue; // unreadable / deleted-in-tree — not our concern here
  }
  if (CONFLICT_START.test(content) && CONFLICT_END.test(content)) {
    violations.push(`merge-conflict markers in file: ${f}`);
  }
  if (!f.endsWith(".example")) {
    for (const [re, label] of SECRET_PATTERNS) {
      if (re.test(content)) { violations.push(`possible secret (${label}) in: ${f}`); break; }
    }
  }

  // 7. Stale references — broken relative Markdown links. Skips external URLs,
  //    anchors, and mailto/tel; strips #fragments and ?queries before resolving
  //    the target from the file's own directory.
  if (f.endsWith(".md")) {
    const linkRe = /\[[^\]]*\]\(([^)]+)\)/g;
    let m;
    while ((m = linkRe.exec(content))) {
      let target = m[1].trim();
      if (/^([a-z]+:|#|\/\/)/i.test(target)) continue; // url scheme, anchor, or protocol-relative
      target = target.split("#")[0].split("?")[0].trim();
      if (!target) continue;
      if (!existsSync(resolve(dirname(f), target))) {
        violations.push(`broken markdown link in ${f}: ${m[1]}`);
      }
    }
  }
}

// 8. Root-manifest integrity — the npm surface CI actually invokes.
//
//    FIVE times over ~2 days (PR #145, #171 tsconfig, #174 full root, the
//    2026-08-03T110000Z incident, and the a4dbf2c/#182 pair) a merge from a
//    separately-scaffolded workspace replaced
//    this repo's root with a foreign one: `package.json` became a `name: workspace`
//    pnpm stub whose `preinstall` hook deletes `package-lock.json` and hard-fails
//    every npm invocation, `package-lock.json` was deleted, and `tsconfig.json`
//    became a project-references stub with no `compilerOptions`. CI runs `npm ci`
//    in seven places and builds `dist/src/server.js` from that tsconfig, so all of
//    it goes red — but only *after* checkout+install, which reads as an
//    infrastructure flake rather than a swapped manifest.
//
//    The first two incidents were each hand-diagnosed after the fact; the second
//    audit recommended exactly this guard and did not build it. Asserting the
//    behaviour CI depends on (rather than the absence of specific foreign files,
//    which would also forbid a legitimately coexisting pnpm workspace) catches the
//    whole class in seconds, locally and in CI, before anything installs.
//
//    This check must stay reachable WITHOUT npm — CI invokes it as a bare
//    `node tools/hygiene-check.mjs`, since `npm run hygiene` is itself unusable
//    once the root manifest is the thing that broke.
const ROOT_PKG_NAME = "ascend";
// Every root script CI or the deploy path calls by name. Sources:
// .github/workflows/ci.yml (prevent:drift, gap:scan, typecheck, test, smoke),
// Dockerfile (build), AGENTS.md Command Gates (hygiene, table:scan, verify).
const REQUIRED_ROOT_SCRIPTS = [
  "build", "typecheck", "test", "smoke",
  "hygiene", "prevent:drift", "gap:scan", "table:scan", "verify",
];
try {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  if (pkg.name !== ROOT_PKG_NAME) {
    violations.push(
      `root package.json name is "${pkg.name}", expected "${ROOT_PKG_NAME}" — ` +
        "the root manifest has been replaced by a foreign one (see check 8 above)",
    );
  }
  const scripts = pkg.scripts ?? {};
  const missing = REQUIRED_ROOT_SCRIPTS.filter((s) => !scripts[s]);
  if (missing.length) {
    violations.push(`root package.json is missing scripts CI invokes: ${missing.join(", ")}`);
  }
  // A `preinstall` that rejects npm (the pnpm stub's `case "$npm_config_user_agent"`
  // guard) blocks all seven of CI's `npm ci` steps AND deletes the lockfile.
  if (typeof scripts.preinstall === "string" && /npm_config_user_agent|Use pnpm/.test(scripts.preinstall)) {
    violations.push("root package.json has a preinstall hook that rejects npm — CI installs with npm ci");
  }
} catch (err) {
  violations.push(`root package.json unreadable or not valid JSON: ${err.message}`);
}

// `npm ci` (7 CI steps) fails outright without a lockfile; `web` has its own job.
for (const lock of ["package-lock.json", "web/package-lock.json"]) {
  if (!existsSync(lock)) violations.push(`missing ${lock} — every \`npm ci\` step fails without it`);
}

// The root tsconfig must be the one that compiles the backend: the Dockerfile and
// CI's e2e job both run `tsc -p tsconfig.json` and then execute `dist/src/server.js`.
// A `files: []` + `references: []` project-references stub typechecks nothing and
// emits nothing, so the build "succeeds" and the server file is simply absent.
try {
  const tsconfig = JSON.parse(readFileSync("tsconfig.json", "utf8").replace(/^\s*\/\/.*$/gm, ""));
  if (!tsconfig.compilerOptions) {
    violations.push("root tsconfig.json has no compilerOptions — it is a project-references stub, not the backend build config");
  } else if (!tsconfig.compilerOptions.outDir) {
    violations.push("root tsconfig.json has no compilerOptions.outDir — the Dockerfile and CI e2e run `node dist/src/server.js`");
  }
  const include = tsconfig.include ?? [];
  if (!include.some((p) => p.startsWith("src/"))) {
    violations.push(`root tsconfig.json does not include src/ (include: ${JSON.stringify(include)}) — the backend would not be compiled`);
  }
} catch (err) {
  violations.push(`root tsconfig.json unreadable or not valid JSON: ${err.message}`);
}

if (violations.length) {
  console.error("✗ repo-hygiene check FAILED:\n" + violations.map((v) => "  - " + v).join("\n"));
  console.error(
    "\nThese patterns cause multi-session collisions (diverged trees, blocked rebases, lost work)\n" +
      "or leak config/secrets. Fix: delete junk / gitignore env files / rotate + remove the secret.\n" +
      "Use git history and branches for versions — never file copies.",
  );
  process.exit(1);
}

console.log(`✓ repo-hygiene check passed (${files.length} files scanned; no junk, tracked env, conflict markers, secrets, or broken doc links).`);
