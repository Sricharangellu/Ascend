#!/usr/bin/env node
// route-authz-scan — every mutating route (PUT/PATCH/DELETE) must carry an
// authorization guard, or be explicitly allowlisted as a deliberate exception.
//
// WHY THIS EXISTS (and why it is a .mjs tool, not a grep in ci.yml)
// ─────────────────────────────────────────────────────────────────
// ci.yml carried a step called "No unguarded mutation routes" from the day the
// pipeline was written. It was inert twice over:
//
//   1. It ended in `|| echo "All mutation routes have role guards ✓"`, so the
//      whole pipeline's exit status was discarded — the step printed a ✓ and
//      exited 0 unconditionally. It could never fail. (Filed as F-2 in
//      WORK/LOOP_STATE.md alongside the SQL-injection guard's F-1, which had
//      the same never-fires shape and was fixed in c00a485.)
//
//   2. Even with (1) fixed it would have been unusable: it only recognised the
//      literal text `requireRole` on the route's own line. This repo's dominant
//      convention is a hoisted alias — `const mgr = requireRole("manager")` at
//      the top of the file, then `router.patch("/x", mgr, handler(...))` — used
//      in 20+ route files. Every one of those reads as "unguarded" to a
//      line-local grep. Turning the check on as written would have gone red
//      with 39 findings of which the large majority are false, and a check that
//      cries wolf on arrival gets deleted rather than fixed.
//
// So the detection has to understand three things a grep cannot: local
// middleware aliases, router-level `router.use(guard)` applied above a block of
// routes, and guards that are not `requireRole` (requirePermission /
// requireScope / requireCapability / requireModule are all real authorization
// in this codebase). It does that here, in the same dependency-free ESM style
// as the other tools/ scanners, so it is testable by hand and runnable outside
// CI (`npm run authz:scan`).
//
// SCOPE — deliberately narrow, so a green result means something
// ─────────────────────────────────────────────────────────────
// Only PUT/PATCH/DELETE are checked. POST is excluded on purpose: in a POS,
// POST is the *normal cashier action* (ring a sale, take a payment, open a tab,
// clock in), so requiring a manager guard on POST would be wrong for the
// product, not just noisy. PUT/PATCH/DELETE are edits and deletions of existing
// records — the operations where "who is allowed to do this" is a real question
// on every one of them.
//
// Every route reaching these files is already authenticated and tenant-scoped:
// src/app.ts mounts makeAuthMiddleware + tenantResolver on the whole /api/v1
// prefix. This scanner is therefore about *authorization* (which role/capability),
// never authentication — an unguarded route here is reachable by any signed-in
// user of the tenant, not by the public.
//
// ALLOWLIST RULES (shrink-only, same posture as the SQL guard's)
// ─────────────────────────────────────────────────────────────
// An entry means "reviewed, and cashier-level access is correct for this
// route." Every entry carries a reason. Never add one to make CI green — if the
// route should be manager-gated, gate it. The list may only shrink over time.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const SRC = join(ROOT, "src");

/** Functions that constitute an authorization decision in this codebase. */
const GUARD_FNS = [
  "requireRole",
  "requirePermission",
  "requireScope",
  "requireCapability",
  "requireModule",
  "requireManagement", // team module's in-file helper
  "requirePlan",
];

/**
 * Routes reviewed and confirmed correct as cashier-level (authenticated +
 * tenant-scoped, but no role gate). Keyed by "<file>:<method> <path>" so the
 * entry survives surrounding code moving, unlike a line number.
 */
const ALLOWLIST = new Map([
  [
    "src/modules/restaurant/routes.ts:PATCH /tables/:id/status",
    "Floor-service action — a server marks a table occupied/cleaning during normal service. Manager-gating it would break the product.",
  ],
  [
    "src/modules/restaurant/routes.ts:PATCH /kitchen/:lineId/bump",
    "Kitchen-display action — line cooks bump tickets. Same reasoning as table status.",
  ],
  [
    "src/modules/purchasing/routes.ts:PATCH /requisitions/:id",
    "A requisition is a request, editable by its raiser before submission; the approval step that turns it into a PO is separately manager-gated (ADR-004).",
  ],
  [
    "src/modules/customers/routes.ts:PATCH /:id/addresses/:addressId",
    "Deliberate, and documented in that file: 'Addresses/notes/loyalty stay open — those are retail-legitimate (delivery, ecommerce).' A cashier taking a delivery order at the counter has to be able to correct the address. POST /:id/addresses is open for the same reason.",
  ],
  [
    "src/modules/customers/routes.ts:DELETE /:id/addresses/:addressId",
    "Same block, same documented intent as the PATCH above — customer-service level, and consistent with the create/edit pair being open.",
  ],
  [
    "src/modules/quotes/routes.ts:PATCH /:id/status",
    "Quote lifecycle (draft → sent → accepted → rejected → expired) is an ordinary sales-floor action. The irreversible operation in this module, DELETE /:id, IS manager-gated.",
  ],
]);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/routes?\.ts$/.test(entry) && !/\.test\.ts$/.test(entry)) out.push(full);
  }
  return out;
}

/** Collect `const x = requireRole("manager")`-style aliases declared in a file. */
function collectAliases(source) {
  const aliases = new Set();
  const re = new RegExp(
    String.raw`(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:${GUARD_FNS.join("|")})\s*\(`,
    "g",
  );
  let m;
  while ((m = re.exec(source)) !== null) aliases.add(m[1]);
  return aliases;
}

/**
 * Line indexes at or after which a `router.use(<guard>)` applies to every
 * subsequently-registered route in the file (Express applies middleware in
 * registration order).
 */
function routerUseGuardFrom(lines, aliases) {
  const tokens = [...GUARD_FNS, ...aliases];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/router\.use\s*\(/.test(line)) continue;
    if (tokens.some((t) => new RegExp(String.raw`\b${t}\b`).test(line))) return i;
  }
  return Infinity;
}

const MUTATION_RE = /router\.(put|patch|delete)\s*\(\s*(["'`])([^"'`]*)\2\s*,?([\s\S]*?)$/;

function scanFile(file) {
  const source = readFileSync(file, "utf8");
  const rel = relative(ROOT, file);
  const lines = source.split("\n");
  const aliases = collectAliases(source);
  const guardTokens = [...GUARD_FNS, ...aliases];
  const guardedFromLine = routerUseGuardFrom(lines, aliases);

  const findings = [];
  for (let i = 0; i < lines.length; i++) {
    const m = MUTATION_RE.exec(lines[i]);
    if (!m) continue;
    const [, method, , routePath, rest] = m;

    // A route-level guard sits between the path string and the handler. Look at
    // the remainder of this line plus the next one, since long registrations
    // wrap (the guard is always before `handler(`, never after).
    const args = rest + "\n" + (lines[i + 1] ?? "");
    const upToHandler = args.split(/\bhandler\s*\(/)[0];
    const hasRouteGuard = guardTokens.some((t) => new RegExp(String.raw`\b${t}\b`).test(upToHandler));
    if (hasRouteGuard || i > guardedFromLine) continue;

    const key = `${rel}:${method.toUpperCase()} ${routePath}`;
    if (ALLOWLIST.has(key)) continue;
    findings.push({ key, file: rel, line: i + 1, method: method.toUpperCase(), path: routePath });
  }
  return findings;
}

const files = walk(SRC);
const findings = files.flatMap(scanFile);

const checked = files.length;
console.log(
  `route-authz-scan: ${checked} route files, ${ALLOWLIST.size} allowlisted cashier-level mutations`,
);

if (findings.length > 0) {
  console.error(`\n❌ ${findings.length} mutating route(s) with no authorization guard:\n`);
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line}  ${f.method} ${f.path}`);
  }
  console.error(
    `\nEvery PUT/PATCH/DELETE must carry requireRole/requirePermission/requireScope/` +
      `requireCapability/requireModule (directly, via a local alias, or via an earlier ` +
      `router.use). If cashier-level access is genuinely correct for one of these, add it ` +
      `to ALLOWLIST in tools/route-authz-scan.mjs with the reason.\n`,
  );
  process.exit(1);
}

console.log("✓ every mutating route carries an authorization guard");
