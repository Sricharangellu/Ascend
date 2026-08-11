#!/usr/bin/env node
/**
 * OpenAPI contract scan — fails CI when `contracts/openapi.yaml` documents an
 * operation the backend does not actually serve.
 *
 * This closes finding F-18 (WORK/FORWARD_PLAN.md Phase 9.9): the contract is
 * written *from* the code by hand and has never been checked *against* it.
 *
 * Nothing generates code from this file today — worth stating plainly, because
 * the obvious assumption is wrong in both directions. `lib/api-spec/orval.config.ts`
 * generates `lib/api-client-react`/`lib/api-zod` from a DIFFERENT and much
 * smaller `lib/api-spec/openapi.yaml` (one path), and `web/api-client/types.ts`
 * is hand-maintained despite archived docs calling it generated — its own header
 * says so, and F-21 tracks it.
 *
 * So the blast radius is human, not compile-time: `contracts/openapi.yaml` is the
 * contract of record (see contracts/CHANGELOG.md — "contracts only move forward"),
 * and it is what a person or an agent reads to decide what the API offers. With
 * no generation step to break, drift here is silent by construction, which is
 * precisely how the 9 phantom operations and 11 wrong request bodies this check
 * found on its first run accumulated unnoticed.
 *
 * Two directions, deliberately weighted differently:
 *
 *   PHANTOM      contract documents it, backend does not serve it   → FATAL
 *   UNDOCUMENTED backend serves it, contract omits it               → report-only
 *
 * Phantoms are fatal because the check is exact and the count is already zero —
 * gating a zero costs nobody anything and stops the drift returning. Undocumented
 * routes are merely incomplete: the contract covers the public surface, not the
 * 626-route internal total, and gating that today would block all work and get
 * the check deleted — the failure mode Phase 9.6 warns about. The count is
 * recorded in `tools/openapi-contract-baseline.json` and its direction reported
 * on every run, but it never fails the build; see the note at the check itself
 * for why gating even the *growth* of that number was tried and abandoned.
 *
 * Route extraction mirrors tools/api-gap-scan.mjs (same registration model:
 * module mountPath + app.ts direct routes + identity), extended to keep the HTTP
 * method — a path documented for GET but only served for POST is real drift that
 * a path-only comparison cannot see.
 *
 * Run: npm run contract:scan   (wired into CI's guard job)
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const METHODS = ["get", "post", "put", "patch", "delete"];

/**
 * Normalize a route path so the two sides are comparable:
 * Express `:id` and OpenAPI `{id}` both collapse to `:p`.
 */
function norm(p) {
  return (
    p
      .replace(/\{[^}]*\}/g, ":p")
      .replace(/:[A-Za-z_]+/g, ":p")
      .replace(/\?.*$/, "")
      .trim()
      .replace(/\/+$/, "") || "/"
  );
}

const key = (method, path) => `${method.toUpperCase()} ${norm(path)}`;

// ─── 1. backend routes (method + path) ────────────────────────────────────────

const ROUTE_RE = new RegExp(`\\brouter\\.(${METHODS.join("|")})\\(\\s*[\`"']([^\`"']*)[\`"']`, "g");
const APP_RE = new RegExp(`\\bapp\\.(${METHODS.join("|")})\\(\\s*[\`"']([^\`"']+)[\`"']`, "g");

/** key → source file, for reporting */
const backend = new Map();
const addBackend = (method, path, file) => {
  const k = key(method, path);
  if (!backend.has(k)) backend.set(k, file);
};

const MODULES_DIR = join(ROOT, "src/modules");
for (const mod of readdirSync(MODULES_DIR)) {
  const modDir = join(MODULES_DIR, mod);
  if (!statSync(modDir).isDirectory()) continue;
  const idx = join(modDir, "index.ts");
  if (!existsSync(idx)) continue;
  const idxSrc = readFileSync(idx, "utf8");
  const name = idxSrc.match(/name:\s*"([^"]+)"/)?.[1] ?? mod;
  const mountPath = idxSrc.match(/mountPath:\s*"([^"]+)"/)?.[1] ?? `/api/v1/${name}`;
  for (const file of readdirSync(modDir)) {
    if (!file.endsWith(".ts") || file.includes(".test.")) continue;
    const src = readFileSync(join(modDir, file), "utf8");
    for (const m of src.matchAll(ROUTE_RE)) {
      const sub = m[2] === "/" ? "" : m[2];
      addBackend(m[1], mountPath.replace(/\/$/, "") + sub, `src/modules/${mod}/${file}`);
    }
  }
}

// app.ts direct routes (healthz, readyz, metrics, flags, stream, jobs, …)
const appSrc = readFileSync(join(ROOT, "src/app.ts"), "utf8");
for (const m of appSrc.matchAll(APP_RE)) addBackend(m[1], m[2], "src/app.ts");

// identity routes mount under /api/identity
const IDENTITY_DIR = join(ROOT, "src/identity");
for (const file of readdirSync(IDENTITY_DIR)) {
  if (!file.endsWith(".ts") || file.includes(".test.")) continue;
  const src = readFileSync(join(IDENTITY_DIR, file), "utf8");
  for (const m of src.matchAll(ROUTE_RE)) {
    addBackend(m[1], "/api/identity" + m[2], `src/identity/${file}`);
  }
}

// ─── 2. contract operations ───────────────────────────────────────────────────

/**
 * Minimal, dependency-free reader for the `paths:` block.
 *
 * A YAML library is deliberately not used: every other scanner in tools/ is
 * dependency-free so it can run as a bare `node` call before `npm ci` (that
 * property is what let hygiene-check survive the root-manifest hijack, F-2).
 * The structure this relies on is the narrow part of the format — a path key at
 * two-space indent, method keys at four — which is what the file already uses
 * throughout and what orval itself requires.
 */
function readContractOperations(yamlPath) {
  const lines = readFileSync(yamlPath, "utf8").split("\n");
  const ops = [];
  const pathsSeen = new Set();
  let inPaths = false;
  let sawPathsKey = false;
  let currentPath = null;

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (!line || /^\s*#/.test(line)) continue;

    if (/^paths:\s*$/.test(line)) {
      inPaths = true;
      sawPathsKey = true;
      continue;
    }
    if (!inPaths) continue;
    // Any other top-level key ends the paths block.
    if (/^[A-Za-z]/.test(line)) break;

    const pathMatch = line.match(/^ {2}(\/\S*?):\s*$/);
    if (pathMatch) {
      currentPath = pathMatch[1];
      pathsSeen.add(currentPath);
      continue;
    }
    // A two-space key that is not a path means the block is shaped in a way this
    // reader does not model (flow style, changed indentation, a nested anchor).
    // Bail loudly: a parser that silently sees fewer operations turns this gate
    // into a green light, which is worse than no gate at all.
    const foreignKey = line.match(/^ {2}([^\s#].*?):\s*/);
    if (foreignKey && !foreignKey[1].startsWith("/")) {
      throw new Error(
        `openapi-contract-scan: unexpected key "${foreignKey[1]}" at two-space indent inside paths:.\n` +
          `This reader models path keys at two spaces and method keys at four. If the\n` +
          `contract's formatting changed, update tools/openapi-contract-scan.mjs — do not\n` +
          `leave it silently parsing a subset.`,
      );
    }

    const methodMatch = line.match(/^ {4}([a-z]+):\s*$/);
    if (methodMatch && currentPath && METHODS.includes(methodMatch[1])) {
      ops.push({ method: methodMatch[1], path: currentPath });
    }
  }

  if (!sawPathsKey) throw new Error("openapi-contract-scan: no top-level `paths:` block found in the contract.");
  if (!ops.length) throw new Error("openapi-contract-scan: parsed 0 operations — the reader is not matching this file.");

  return ops;
}

const CONTRACT_PATH = join(ROOT, "contracts", "openapi.yaml");
const operations = readContractOperations(CONTRACT_PATH);

// ─── 3. diff ──────────────────────────────────────────────────────────────────

const BASELINE_PATH = join(ROOT, "tools", "openapi-contract-baseline.json");
const baseline = existsSync(BASELINE_PATH)
  ? JSON.parse(readFileSync(BASELINE_PATH, "utf8"))
  : { undocumented: Number.POSITIVE_INFINITY, phantomAllowlist: [] };
const phantomAllowed = new Set(baseline.phantomAllowlist ?? []);

const contractKeys = new Set(operations.map((o) => key(o.method, o.path)));

const phantom = [];
for (const op of operations) {
  const k = key(op.method, op.path);
  if (backend.has(k)) continue;
  if (phantomAllowed.has(k)) continue;
  // A documented path served only under a different method is still drift, but
  // naming the served methods makes it actionable rather than a bare "missing".
  const served = METHODS.filter((m) => backend.has(key(m, op.path))).map((m) => m.toUpperCase());
  phantom.push({ key: k, served });
}

const undocumented = [...backend.keys()].filter((k) => !contractKeys.has(k)).sort();

// Stale allowlist entries: the backend caught up, so the entry silences nothing.
// Same shrink-only discipline as tools/api-gap-allowlist.json.
const staleAllowed = [...phantomAllowed].filter((k) => backend.has(k));

// ─── report ───────────────────────────────────────────────────────────────────

console.log(
  `openapi-contract-scan: ${operations.length} documented operations, ` +
    `${backend.size} backend routes, ${phantomAllowed.size} phantom-allowlisted`,
);

if (staleAllowed.length) {
  console.warn("\n⚠ stale phantom-allowlist entries (backend now serves these — remove from tools/openapi-contract-baseline.json):");
  for (const k of staleAllowed) console.warn(`  - ${k}`);
}

console.log(
  `\nℹ ${undocumented.length} backend routes are not in the contract ` +
    `(baseline ${baseline.undocumented}) — report-only, see F-18.`,
);

// WARNS, does not fail. Gating growth here was the first design and it was
// wrong: several agents land routes on `develop` in parallel, so a growth gate
// turns every unrelated route-adding PR red until someone edits a JSON file in
// this repo. That is the "blocks all work, so the check gets deleted" failure
// mode Phase 9.6 names, just applied to the derivative instead of the total.
// Caught when merging develop mid-PR bumped the count 475 → 478 on work that
// had nothing to do with the contract.
//
// The signal is still worth carrying: direction is what matters for a backlog
// that is supposed to shrink. Gate it once the gap is small and stable — the
// same "prove it green, then gate it" sequence docker-build and e2e followed.
if (undocumented.length > baseline.undocumented) {
  console.warn(
    `\n⚠ undocumented backend routes grew: ${baseline.undocumented} → ${undocumented.length}.` +
      `\nDocument the new routes in contracts/openapi.yaml, or lower the delta by` +
      `\ndocumenting others. Update tools/openapi-contract-baseline.json when the` +
      `\nnew number is the intended floor. Report-only — this does not fail the build.`,
  );
  for (const k of undocumented.slice(0, 10)) console.warn(`  - ${k}  (${backend.get(k)})`);
} else if (undocumented.length < baseline.undocumented) {
  console.log(
    `\n✓ contract gap shrank: ${baseline.undocumented} → ${undocumented.length}.` +
      `\nLower \`undocumented\` in tools/openapi-contract-baseline.json to lock the gain in.`,
  );
}

if (phantom.length) {
  console.error("\n✗ contract documents operations the backend does not serve (generated clients would 404):");
  for (const p of phantom) {
    const alt = p.served.length ? `  [path served for: ${p.served.join(", ")}]` : "";
    console.error(`  - ${p.key}${alt}`);
  }
  console.error(
    "\nFix: correct contracts/openapi.yaml to match the real route, or implement" +
      "\nthe route. Nothing compiles against this file, so nothing else will catch" +
      "\na phantom — it simply stays in the contract of record telling every reader" +
      "\nthe API offers something it does not.",
  );
  process.exit(1);
}

console.log("\n✓ every documented operation is served by a real backend route");
