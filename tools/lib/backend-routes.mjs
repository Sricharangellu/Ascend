/**
 * One enumeration of the backend's registered routes, shared by the scanners
 * that need it.
 *
 * `api-gap-scan.mjs` grew this logic first, for a question that only needed
 * paths: "does the path the frontend calls exist?". `openapi-contract-scan.mjs`
 * asks a different question — "does the operation the contract promises exist?"
 * — which needs the method too. Copying the extraction to add one field is how
 * this repo ended up with 41 identical `test-request.ts` files (backlog F-5), so
 * it lives here once and both import it.
 *
 * Extraction covers the three places a route can be registered:
 *   1. `src/modules/<mod>/*.ts` — `router.<verb>("…")`, resolved against the
 *      module's `mountPath` if it declares one, else `/api/v1/<name>`. Note
 *      `name` is read from the module manifest rather than the directory: they
 *      differ (`audit_log/` mounts as `audit-log`), and that difference is
 *      itself a source of real drift.
 *   2. `src/app.ts` — `app.<verb>("…")` for the routes registered directly
 *      (flags, capabilities, stream, jobs, health probes).
 *   3. `src/identity/*.ts` — mounted under `/api/identity`.
 *
 * This is a static read, not a running server: it cannot see a route added at
 * runtime, and it trusts that a literal passed to `router.get` is the path. Both
 * limits are acceptable for a guard whose job is to catch drift between two
 * checked-in artifacts.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROUTE_RE = /\brouter\.(get|post|put|patch|delete)\(\s*[`"']([^`"']*)[`"']/g;
const APP_RE = /\bapp\.(get|post|put|patch|delete)\(\s*[`"']([^`"']+)[`"']/g;

/**
 * Normalize a path so the three notations for "a parameter here" compare equal:
 * Express `:id`, OpenAPI `{id}`, and a JS template hole `${expr}` all become
 * `:p`. Query strings and trailing slashes are dropped.
 *
 * Without the `{id}` case a contract check reports almost every parameterised
 * operation as missing — measured: 50 false positives against 9 real ones.
 *
 * `api-gap-scan.mjs` imports this for its *frontend* literals too, rather than
 * keeping the private near-copy it used to have. One scanner normalizing its
 * two halves by two slightly different rules is a bug waiting for the input
 * that tells them apart.
 */
export function normalizePath(p) {
  return (
    p
      .replace(/:[A-Za-z_]+/g, ":p")
      .replace(/\$\{[^}]*\}/g, ":p")
      .replace(/\{[^}]*\}/g, ":p")
      .replace(/\$\{.*$/, "") // dangling template hole (multiline literal) — trim
      .replace(/\?.*$/, "")
      .trim()
      .replace(/\/+$/, "") || "/"
  );
}

/**
 * @param {string} root repo root
 * @returns {{ paths: Set<string>, operations: Set<string> }}
 *   `paths`      — normalized paths, e.g. `/api/v1/catalog/:p`
 *   `operations` — `"<METHOD> <path>"`, e.g. `GET /api/v1/catalog/:p`
 */
export function collectBackendRoutes(root) {
  const paths = new Set();
  const operations = new Set();
  const add = (method, path) => {
    const n = normalizePath(path);
    paths.add(n);
    operations.add(`${method.toUpperCase()} ${n}`);
  };

  // 1. domain modules
  const modulesDir = join(root, "src/modules");
  for (const mod of readdirSync(modulesDir)) {
    const modDir = join(modulesDir, mod);
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
        add(m[1], mountPath.replace(/\/$/, "") + sub);
      }
    }
  }

  // 2. routes registered directly on the app
  const appSrc = readFileSync(join(root, "src/app.ts"), "utf8");
  for (const m of appSrc.matchAll(APP_RE)) add(m[1], m[2]);

  // 3. identity (SSO's public routes are registered on the sso module's router,
  //    so they are already collected in step 1)
  const identityDir = join(root, "src/identity");
  for (const file of readdirSync(identityDir)) {
    if (!file.endsWith(".ts") || file.includes(".test.")) continue;
    const src = readFileSync(join(identityDir, file), "utf8");
    for (const m of src.matchAll(ROUTE_RE)) add(m[1], "/api/identity" + m[2]);
  }

  return { paths, operations };
}
