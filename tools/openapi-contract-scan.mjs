#!/usr/bin/env node
/**
 * OpenAPI contract scan — fails CI when `contracts/openapi.yaml` promises an
 * operation the backend does not serve.
 *
 * WHY (backlog F-18)
 * ──────────────────
 * The contract is written to describe the code, and nothing ever checked that
 * it still does. Two things make a stale entry expensive rather than merely
 * untidy:
 *
 *   1. It is the instruction frontend work is written against. The standing
 *      guidance is literal — "If it's not in the spec, you don't call it"
 *      (orchestration/_archive/AGENT_FRONTEND.md). A path documented here and
 *      served nowhere is a direction to build a call that 404s: the 2026-07-18
 *      incident, where pages shipped green against MSW mocks and the real API
 *      returned 404. `api-gap-scan.mjs` guards that road in the other
 *      direction; nothing guarded this one.
 *   2. `web/package.json` still wires a generator at it —
 *      `generate:client: openapi-typescript ../contracts/openapi.yaml -o
 *      api-client/types.ts`. Anyone who runs it turns every documented path
 *      into a typed client method that compiles and autocompletes.
 *
 * On (2), read `web/api-client/types.ts`'s own header before believing the
 * script name: that file is hand-maintained, 218 files import named types from
 * it, and running the generator would overwrite it with a different shape and
 * break all of them. The script is a live footgun, not a build step — which is
 * an argument for the contract being true, not against it.
 *
 * DIRECTION — deliberately one-way
 * ────────────────────────────────
 * This checks contract → code, not code → contract. The backend serves 626
 * operations and the contract documents 146; requiring every route to be
 * documented would fail on arrival with ~480 findings and be deleted within a
 * week. Undocumented routes are a documentation gap. Documented-but-absent
 * routes are a lie told to whoever reads the spec, and that is the one worth
 * gating.
 *
 * SCOPE — paths and methods, not bodies
 * ─────────────────────────────────────
 * Request and response shapes drift too: `POST /rooms/{id}/charge` takes
 * camelCase `amountCents` and an `orderId`, while the contract says snake_case
 * `amount_cents` and a `category` the handler has never heard of. Reconciling
 * those is backlog F-19 (DB↔API↔FE type consistency) — a systematic sweep with
 * its own verification. Rewriting schemas from a reading of handler code, in a
 * change no test can check, would risk making the contract more wrong while
 * turning this scanner green.
 *
 * NORMALIZATION
 * ─────────────
 * Express `:id` and OpenAPI `{id}` are the same parameter written two ways, so
 * both normalize to `:p` (see tools/lib/backend-routes.mjs). This is not a
 * detail: without it, the first run reported 50 findings of which 41 were
 * purely the brace-vs-colon difference. The 9 that survived are real.
 *
 * WHY A HAND-ROLLED YAML READER
 * ─────────────────────────────
 * Every other scanner in tools/ is dependency-free and runs on the runner's
 * bare node, which is what lets `hygiene-check.mjs` run as CI's first step
 * before `npm ci`. Adding `js-yaml` for one file would break that property. The
 * reader below only needs `paths:` → path → method, which in this document is
 * two fixed indent levels; it asserts it found a plausible number of operations
 * rather than silently passing if the shape ever changes.
 *
 * Run: npm run contract:scan
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { collectBackendRoutes, normalizePath } from "./lib/backend-routes.mjs";

const ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const CONTRACT = join(ROOT, "contracts/openapi.yaml");
const ALLOWLIST_PATH = join(ROOT, "tools/openapi-contract-allowlist.json");

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"];

/**
 * Pull `<METHOD> <path>` operations out of the OpenAPI document.
 * Paths sit at two-space indent under `paths:`; methods at four.
 */
function readContractOperations(yaml) {
  const ops = [];
  let inPaths = false;
  let current = null;

  for (const line of yaml.split("\n")) {
    if (/^paths:\s*$/.test(line)) { inPaths = true; continue; }
    // any other top-level key ends the paths block
    if (inPaths && /^[A-Za-z]/.test(line)) { inPaths = false; }
    if (!inPaths) continue;

    const pathMatch = line.match(/^ {2}(\/\S*):\s*$/);
    if (pathMatch) { current = pathMatch[1]; continue; }

    const methodMatch = line.match(/^ {4}([a-z]+):\s*$/);
    if (current && methodMatch && HTTP_METHODS.includes(methodMatch[1])) {
      ops.push({
        method: methodMatch[1].toUpperCase(),
        rawPath: current,
        key: `${methodMatch[1].toUpperCase()} ${normalizePath(current)}`,
        display: `${methodMatch[1].toUpperCase()} ${current}`,
      });
    }
  }
  return ops;
}

if (!existsSync(CONTRACT)) {
  console.error(`openapi-contract-scan: ${CONTRACT} not found`);
  process.exit(1);
}

const contractOps = readContractOperations(readFileSync(CONTRACT, "utf8"));

// Guard the parser itself. If the document's shape changes and the reader
// silently stops matching, a scan of zero operations would "pass" forever —
// the same never-fires failure this repo has already paid for twice.
if (contractOps.length < 50) {
  console.error(
    `openapi-contract-scan: only ${contractOps.length} operations parsed from\n` +
      `contracts/openapi.yaml — that is implausibly few for this document.\n` +
      `The reader has probably stopped matching its shape. Fix the reader; do\n` +
      `not lower this floor.`,
  );
  process.exit(1);
}

const { operations: backend } = collectBackendRoutes(ROOT);

const allowlist = JSON.parse(readFileSync(ALLOWLIST_PATH, "utf8"));
const allowed = new Set(Object.keys(allowlist.operations ?? {}));

const undocumentedByBackend = contractOps.filter((op) => !backend.has(op.key));
const violations = undocumentedByBackend.filter((op) => !allowed.has(op.display));
const foundKeys = new Set(undocumentedByBackend.map((op) => op.display));
const stale = [...allowed].filter((k) => !foundKeys.has(k));

let failed = false;

if (violations.length > 0) {
  failed = true;
  console.error("openapi-contract-scan: FAILED\n");
  console.error(
    "These operations are documented in contracts/openapi.yaml but no backend\n" +
      "route serves them. Frontend work is written against this file, so each one\n" +
      "is a direction to build a call that 404s. Either implement the route,\n" +
      "correct the contract, or — if it needs a decision first — add it to\n" +
      "tools/openapi-contract-allowlist.json WITH a reason naming the route that\n" +
      "actually serves the capability:\n",
  );
  for (const v of violations) console.error(`  ${v.display}`);
  console.error("");
}

if (stale.length > 0) {
  failed = true;
  console.error(
    "openapi-contract-scan: STALE ALLOWLIST\n\n" +
      "These entries no longer describe a mismatch — the route was implemented,\n" +
      "or the contract was corrected. Delete them so the allowlist keeps meaning\n" +
      "something:\n",
  );
  for (const k of stale) console.error(`  ${k}`);
  console.error("");
}

if (failed) process.exit(1);

console.log(
  `openapi-contract-scan: ${contractOps.length} documented operations vs ` +
    `${backend.size} backend routes — ` +
    (undocumentedByBackend.length
      ? `${undocumentedByBackend.length} mismatch(es), all allowlisted`
      : "every documented operation is served"),
);
