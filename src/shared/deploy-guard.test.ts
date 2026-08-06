import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Regression tests for the `scripts/deploy.sh` false-success defect.
 *
 * Observed 2026-08-05 on the `staging` push for PR #187 (CI run 30977630220,
 * job "Deploy → Testing"): `vercel deploy` failed with `Project not found`, the
 * alias step then failed with `argument "" is not a valid ID or URL`, and the
 * script still printed `✓ frontend deployed (testing)` and reported
 * `frontend exit=0`. The job only went red because the *backend* half failed.
 *
 * Two bash behaviours combine to cause it:
 *   1. `deploy_frontend || frontend_status=$?` suspends `set -e` for everything
 *      inside the function, so inner failures do not abort it.
 *   2. The function's last command was an unconditional `echo "✓ frontend
 *      deployed"`, so its exit status was always 0.
 *
 * The same code path runs for `DEPLOY_ENV=prod`, so a production release could
 * report success while shipping nothing. The fix is an explicit empty-URL guard
 * that `return 1`s. These tests fail if that guard is removed.
 */

const repoRoot = path.resolve(import.meta.dirname, "../..");
const deployScript = path.join(repoRoot, "scripts", "deploy.sh");

function bash(script: string): { status: number; stdout: string } {
  try {
    const stdout = execFileSync("bash", ["-c", script], { encoding: "utf8" });
    return { status: 0, stdout };
  } catch (err) {
    const e = err as { status?: number; stdout?: string };
    return { status: e.status ?? 1, stdout: e.stdout ?? "" };
  }
}

test("deploy.sh guards both deploy functions against an empty deployment URL", () => {
  const src = fs.readFileSync(deployScript, "utf8");

  // Each `url=$( … vercel deploy … )` extraction must be followed by an
  // emptiness check that returns non-zero, before the URL is used or announced.
  const extractions = src.match(/url=\$\([\s\S]*?\)\n/g) ?? [];
  assert.equal(
    extractions.length,
    2,
    "expected exactly two deployment-URL extractions (backend + frontend)",
  );

  for (const half of ["backend", "frontend"] as const) {
    const guard = new RegExp(
      `if \\[\\[ -z "\\$url" \\]\\]; then[\\s\\S]{0,240}?${half} deploy failed[\\s\\S]{0,120}?return 1`,
    );
    assert.match(
      src,
      guard,
      `scripts/deploy.sh must fail explicitly when the ${half} deploy produces no URL`,
    );
  }
});

test("a function ending in echo returns 0 despite inner failure — the defect being guarded", () => {
  // Faithful reproduction of the pre-fix control flow. This documents *why* the
  // guard is required: `set -e` does not protect a function invoked as the left
  // operand of `||`, and the trailing echo masks the failure.
  const { status, stdout } = bash(`
    set -euo pipefail
    deploy_frontend() {
      url=$(false | grep -oE 'https://x' | tail -1)   # deploy failed, no URL
      echo "→ Frontend deployed: $url"
      echo "✓ frontend deployed (prod)"
    }
    frontend_status=0
    deploy_frontend || frontend_status=$?
    echo "frontend exit=$frontend_status"
  `);
  assert.equal(status, 0, "the unguarded form exits 0 — this is the defect");
  assert.match(stdout, /frontend exit=0/);
  assert.match(stdout, /✓ frontend deployed/);
});

test("the empty-URL guard makes the same flow report failure", () => {
  const { stdout } = bash(`
    set -euo pipefail
    deploy_frontend() {
      url=$(false | grep -oE 'https://x' | tail -1)
      if [[ -z "$url" ]]; then
        echo "✗ frontend deploy failed (prod): vercel produced no deployment URL" >&2
        return 1
      fi
      echo "✓ frontend deployed (prod)"
    }
    frontend_status=0
    deploy_frontend || frontend_status=$?
    echo "frontend exit=$frontend_status"
  `);
  assert.match(stdout, /frontend exit=1/, "guarded form must surface the failure");
  assert.doesNotMatch(stdout, /✓ frontend deployed/);
});
