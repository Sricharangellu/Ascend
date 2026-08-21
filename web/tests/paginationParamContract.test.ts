import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Page-size parameter contract.
 *
 * `pageSize` is read by exactly ONE backend route family —
 * `GET /api/v1/inventory/levels` (`src/modules/inventory/routes.ts`, which maps
 * it onto its own service). Every other list route reads `limit`. Sending
 * `pageSize` to any of them is not an error: the param is silently ignored and
 * the caller gets the route's default instead of what it asked for.
 *
 * That is how the POS product grid came to show a cashier the first 50 products
 * of the catalog while explicitly requesting 200, with no "load more" and no
 * sign anything was missing — and how the kitchen display asked for 50 open
 * orders and got the default. Five call sites, zero failing checks.
 *
 * This test is the cheap, targeted version of the parameter-level gap scanner
 * filed in `WORK/LOOP_STATE.md`. It does not prove every param is consumed —
 * only that this one, which has already caused live defects, is not sent
 * anywhere it would be dropped.
 */

const WEB_ROOT = path.resolve(__dirname, "..");
const SCAN_DIRS = ["app", "components", "lib", "api-client", "contexts", "hooks"];
const SOURCE_EXT = new Set([".ts", ".tsx"]);

/** The one endpoint family that genuinely reads `pageSize`. */
const PAGE_SIZE_IS_HONOURED = /\/api\/v1\/inventory\/levels/;

function sourceFiles(dir: string): string[] {
  const abs = path.join(WEB_ROOT, dir);
  let entries: string[];
  try { entries = readdirSync(abs); } catch { return []; }
  return entries.flatMap((entry) => {
    const full = path.join(abs, entry);
    if (statSync(full).isDirectory()) return sourceFiles(path.join(dir, entry));
    if (!SOURCE_EXT.has(path.extname(entry))) return [];
    if (entry.includes(".test.")) return [];
    return [path.join(dir, entry)];
  });
}

describe("page-size parameter contract", () => {
  it("never sends ?pageSize= to a route that reads ?limit=", () => {
    const offenders: string[] = [];

    for (const rel of SCAN_DIRS.flatMap(sourceFiles)) {
      const text = readFileSync(path.join(WEB_ROOT, rel), "utf8");
      text.split("\n").forEach((line, i) => {
        // Only query-string usages — `pageSize={…}` as a React prop is a
        // different thing entirely and must not be flagged.
        if (!/[?&]pageSize=/.test(line)) return;
        if (PAGE_SIZE_IS_HONOURED.test(line)) return;
        offenders.push(`${rel}:${i + 1} → ${line.trim()}`);
      });
    }

    expect(offenders,
      `These call sites send ?pageSize= to a backend that reads ?limit=, so they ` +
      `silently receive the route default instead of the size they asked for. ` +
      `Use limit= (or extend the route to read pageSize):\n  ${offenders.join("\n  ")}`,
    ).toEqual([]);
  });

  it("still finds the pattern it is meant to catch", () => {
    // Guards the matcher itself: a test that can never fail proves nothing.
    // These are the exact shapes of the five call sites that were broken.
    const shouldFlag = [
      'apiGet("/api/v1/catalog?pageSize=200")',
      'apiGet("/api/v1/orders?status=open&pageSize=50")',
      'apiGet("/api/v1/customers?pageSize=200")',
    ];
    for (const line of shouldFlag) {
      expect(/[?&]pageSize=/.test(line) && !PAGE_SIZE_IS_HONOURED.test(line)).toBe(true);
    }

    // And must not flag the legitimate uses.
    const shouldPass = [
      'apiGet("/api/v1/inventory/levels?pageSize=200")',           // genuinely read
      '<Pagination pageSize={pageSize} total={total} />',          // a React prop
      'const [pageSize, setPageSize] = usePersistedPageSize(k, 50)',
    ];
    for (const line of shouldPass) {
      expect(/[?&]pageSize=/.test(line) && !PAGE_SIZE_IS_HONOURED.test(line)).toBe(false);
    }
  });
});
