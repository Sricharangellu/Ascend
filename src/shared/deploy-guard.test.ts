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

/**
 * `BACKEND_URL` — the value compiled into the production frontend bundle.
 *
 * `web/next.config.mjs` reads it inside `rewrites()`, which Next evaluates at
 * BUILD time and freezes into `routes-manifest.json`, so whatever this resolves
 * to at deploy time IS the origin the shipped app proxies every `/api/*` call
 * to. It cannot be corrected from the Vercel dashboard afterwards.
 *
 * That made the prod tier's fallback load-bearing in a way the other tiers' are
 * not. It sat at `https://ascendhq-api.vercel.app` — DEPLOYMENT_NOT_FOUND since
 * 2026-07-23 — for two weeks, so every release in that window shipped a
 * frontend nobody could log in to, and reported success doing it. PR #206
 * repointed it at the Sri-confirmed Render origin.
 *
 * ADR-011 deliberately keeps an inline fallback ("setting nothing changes
 * nothing"), so the guard here is NOT "no fallback" — it is "the fallback is
 * not a host this repo has already recorded as dead". That is the specific
 * failure ADR-011's indirection cannot catch by itself.
 */
const KNOWN_DEAD_HOSTS = [
  "ascendhq-api.vercel.app", // prod backend, DEPLOYMENT_NOT_FOUND since 2026-07-23
  "ascendhq-app.vercel.app", // prod frontend it was paired with, also dead
  "ascend-backend-staging.vercel.app", // testing backend, project deleted
  "ascend-frontend-staging.vercel.app", // alias of a deleted project
];

/** Executable lines only — comments cite the dead hostnames as history, correctly. */
function executableLines(src: string): string {
  return src
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("#"))
    .join("\n");
}

test("deploy.sh's production BACKEND_URL fallback is not a host recorded as dead", () => {
  const executable = executableLines(fs.readFileSync(deployScript, "utf8"));
  const fallback = /BACKEND_URL="\$\{BACKEND_URL:-([^}"]+)\}"/.exec(executable);
  assert.ok(fallback, "the prod tier is expected to carry an inline fallback (ADR-011)");
  for (const host of KNOWN_DEAD_HOSTS) {
    assert.doesNotMatch(
      fallback[1] ?? "",
      new RegExp(host.replace(/\./g, "\\.")),
      `the prod fallback resolves to ${host}, which docs/architecture/DEPLOYMENTS.md records as dead. ` +
        "Next bakes this into routes-manifest.json at build time, so a release would ship a frontend " +
        "that can reach no API. Repoint it, or set vars.PROD_BACKEND_URL.",
    );
  }
});

test("no probe or deploy target in the workflows resolves to a host recorded as dead", () => {
  // ADR-011's companion check: the fallbacks live in ci.yml and uptime.yml too,
  // and PR #191 fixing only uptime.yml is precisely how the two production
  // probes came to disagree about where production is.
  //
  // The per-file minimum below is the load-bearing part. Without it this test is
  // a `matchAll` loop whose body never runs if the regex stops matching — it
  // would go green while checking nothing, which is the exact failure this whole
  // audit is about (`backup.yml` reported success 18 times while backing up
  // nothing). Rewriting a fallback into a form this regex misses must fail here
  // and force the regex to be updated, not silently disarm the check.
  const MIN_FALLBACKS: Record<string, number> = { "ci.yml": 3, "uptime.yml": 2 };

  for (const wf of ["ci.yml", "uptime.yml"]) {
    const src = fs.readFileSync(path.join(repoRoot, ".github", "workflows", wf), "utf8");
    let inspected = 0;
    for (const [, fallback] of src.matchAll(/vars\.PROD_(?:BACKEND|FRONTEND)_URL\s*\|\|\s*'([^']+)'/g)) {
      inspected++;
      for (const host of KNOWN_DEAD_HOSTS) {
        assert.ok(
          !fallback.includes(host),
          `.github/workflows/${wf} falls back to ${host}, recorded as dead in DEPLOYMENTS.md`,
        );
      }
    }
    assert.ok(
      inspected >= (MIN_FALLBACKS[wf] ?? 1),
      `expected at least ${MIN_FALLBACKS[wf]} PROD_* fallback(s) in .github/workflows/${wf}, found ` +
        `${inspected}. Either a fallback was removed (update MIN_FALLBACKS) or it was rewritten into ` +
        "a form this regex no longer matches — in which case this test is now checking nothing and " +
        "the regex must be fixed.",
    );
  }
});

test("deploy.sh refuses non-prod tiers without an explicit BACKEND_URL", () => {
  // VERCEL_TOKEN is asserted before BACKEND_URL is resolved, so a dummy is
  // needed to reach the guard. The guard exits before any `vercel` invocation,
  // so this performs no network call and deploys nothing.
  const { status, stdout } = bash(
    `cd ${JSON.stringify(repoRoot)} && VERCEL_TOKEN=dummy-token DEPLOY_ENV=testing bash scripts/deploy.sh both 2>&1`,
  );
  assert.equal(status, 1, "a non-prod deploy must never silently fall back to the prod backend/DB");
  assert.match(stdout, /would fall back to the prod backend\/DB/);
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
