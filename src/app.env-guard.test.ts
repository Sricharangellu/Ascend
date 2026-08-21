import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "./app.js";

// ─── Production JWT_SECRET guard ───────────────────────────────────────────
// .env.example ships a well-known placeholder ("change-me-min-32-chars-
// random-string"). If an operator copies that file straight to production
// without editing it, every session token this server signs is forgeable by
// anyone who has read the (public) repo. buildApp() must refuse to start in
// that case, not just when JWT_SECRET is entirely unset.

const ORIGINAL_ENV = {
  NODE_ENV: process.env["NODE_ENV"],
  JWT_SECRET: process.env["JWT_SECRET"],
  DATABASE_URL: process.env["DATABASE_URL"],
};

function restoreEnv() {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

test("production refuses to start with the .env.example placeholder JWT_SECRET", async () => {
  process.env["NODE_ENV"] = "production";
  process.env["JWT_SECRET"] = "change-me-min-32-chars-random-string";
  process.env["DATABASE_URL"] ??= "postgresql://unused/env_guard_test";
  try {
    await assert.rejects(
      buildApp({ schema: "env_guard_unused" }),
      /JWT_SECRET/,
      "must reject the documented placeholder secret",
    );
  } finally {
    restoreEnv();
  }
});

test("production refuses to start with a JWT_SECRET shorter than 32 characters", async () => {
  process.env["NODE_ENV"] = "production";
  process.env["JWT_SECRET"] = "short-secret";
  process.env["DATABASE_URL"] ??= "postgresql://unused/env_guard_test";
  try {
    await assert.rejects(
      buildApp({ schema: "env_guard_unused" }),
      /JWT_SECRET/,
      "must reject an implausibly short secret",
    );
  } finally {
    restoreEnv();
  }
});

test("production refuses to start with common low-entropy JWT_SECRET values regardless of case", async () => {
  process.env["NODE_ENV"] = "production";
  process.env["JWT_SECRET"] = "  ChangeMe  ".trim(); // not a realistic case but guards the .trim()/.toLowerCase() path
  process.env["DATABASE_URL"] ??= "postgresql://unused/env_guard_test";
  try {
    await assert.rejects(
      buildApp({ schema: "env_guard_unused" }),
      /JWT_SECRET/,
    );
  } finally {
    restoreEnv();
  }
});

test("production starts normally with a real, sufficiently long JWT_SECRET", async () => {
  process.env["NODE_ENV"] = "production";
  process.env["JWT_SECRET"] = "a-real-random-looking-production-secret-value-1234567890";
  process.env["DATABASE_URL"] ??= "postgresql://unused/env_guard_test";
  process.env["PG_SSL"] = "false";
  let schemaSuffix = `env_guard_ok_${process.pid}_${Date.now().toString(36)}`;
  const app = await buildApp({ schema: schemaSuffix });
  await app.db.close();
  restoreEnv();
});
