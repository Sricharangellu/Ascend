/**
 * Vitest global test setup.
 *
 * - Starts the MSW Node server before all tests (works in node + jsdom envs)
 * - Resets handlers after each test to prevent state leakage
 * - Stops the server after all tests
 *
 * @testing-library/jest-dom is only imported for jsdom-environment tests
 * (component tests).  Pure unit tests (node env) don't need it.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as matchers from "@testing-library/jest-dom/matchers";
import { beforeAll, afterEach, afterAll, expect } from "vitest";
import { server } from "@/mocks/server";

/**
 * Node version guard.
 *
 * Three tests in tests/api-client.test.ts read a downloaded Blob through
 * jsdom's FileReader. Before Node 24 the Blob undici returns is not the one
 * jsdom's FileReader accepts, so they fail with
 *
 *   TypeError: Failed to execute 'readAsText' on 'FileReader':
 *   parameter 1 is not of type 'Blob'.
 *
 * — a message that names the symptom and not the cause. CI pins Node through
 * .nvmrc and never sees it, so the cost lands entirely on whoever runs the
 * suite locally on an older Node. Warn once, up front, and say what to do.
 * This deliberately does not fail the run: the other 16 tests in that file,
 * and every other web test, pass fine on Node 22.
 */
function requiredNodeMajor(): number | null {
  try {
    const nvmrc = resolve(dirname(fileURLToPath(import.meta.url)), "../../.nvmrc");
    const major = Number.parseInt(readFileSync(nvmrc, "utf8").trim().replace(/^v/, ""), 10);
    return Number.isFinite(major) ? major : null;
  } catch {
    return null; // no .nvmrc reachable — nothing to assert against
  }
}

const requiredMajor = requiredNodeMajor();
const currentMajor = Number.parseInt(process.versions.node.split(".")[0], 10);
if (requiredMajor !== null && currentMajor < requiredMajor) {
  console.warn(
    `\n⚠  Node ${process.versions.node} is older than .nvmrc (${requiredMajor}).\n` +
      `   Expect 3 failures in tests/api-client.test.ts, all reading:\n` +
      `     "Failed to execute 'readAsText' on 'FileReader': parameter 1 is not of type 'Blob'"\n` +
      `   That is this version gap, not a regression — jsdom's FileReader rejects the\n` +
      `   Blob undici returns before Node ${requiredMajor}. CI runs Node ${requiredMajor} and is unaffected.\n` +
      `   Run \`nvm use\` to match it.\n`,
  );
}

expect.extend(matchers);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
