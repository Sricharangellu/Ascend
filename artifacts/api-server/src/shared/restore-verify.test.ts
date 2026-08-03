/**
 * restore-verify.test.ts — dump inventory parsing and comparison logic.
 *
 * Covers the snapshot-consistency design: expectations come from the dump
 * file itself, so concurrent writes on the live database can never skew the
 * verification. Also covers strict-psql error propagation (integration test
 * gated on DATABASE_URL).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseDumpInventory, compareInventory } from "./restore-verify.js";

async function dumpFileWith(content: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "rv-test-"));
  const file = join(dir, "dump.sql");
  await writeFile(file, content);
  return file;
}

const SAMPLE_DUMP = `--
-- PostgreSQL database dump
--
SET statement_timeout = 0;

CREATE TABLE public.tenants (
    id uuid NOT NULL,
    name text
);

CREATE TABLE public.users (
    id uuid NOT NULL
);

CREATE TABLE public."Quoted Table" (
    id integer
);

CREATE TABLE public.orders (
    id uuid NOT NULL
);

COPY public.tenants (id, name) FROM stdin;
11111111-1111-1111-1111-111111111111\tAcme
\\.

COPY public.users (id) FROM stdin;
22222222-2222-2222-2222-222222222222
33333333-3333-3333-3333-333333333333
\\.

COPY public."Quoted Table" (id) FROM stdin;
1
\\.

COPY public.orders (id) FROM stdin;
\\.
`;

// ── parseDumpInventory ───────────────────────────────────────────────────────

test("parses tables and COPY row counts, including quoted names and empty tables", async () => {
  const inv = await parseDumpInventory(await dumpFileWith(SAMPLE_DUMP));
  assert.deepEqual(
    [...inv.tables].sort(),
    ["Quoted Table", "orders", "tenants", "users"],
  );
  assert.equal(inv.counts.get("tenants"), 1);
  assert.equal(inv.counts.get("users"), 2);
  assert.equal(inv.counts.get("Quoted Table"), 1);
  assert.equal(inv.counts.get("orders"), 0); // empty COPY block → 0 rows, not missing
});

test("rejects a truncated dump (COPY block without terminator)", async () => {
  const truncated = SAMPLE_DUMP.replace(/COPY public\.orders[\s\S]*$/, "COPY public.orders (id) FROM stdin;\n");
  await assert.rejects(parseDumpInventory(await dumpFileWith(truncated)), /truncated/);
});

test("ignores non-table statements (indexes, sequences, comments)", async () => {
  const inv = await parseDumpInventory(
    await dumpFileWith(
      `CREATE SEQUENCE public.seq_x;\nCREATE INDEX idx ON public.tenants (id);\nCREATE TABLE public.tenants (\n  id uuid\n);\n`,
    ),
  );
  assert.deepEqual([...inv.tables], ["tenants"]);
});

// ── compareInventory ─────────────────────────────────────────────────────────

const inv = {
  tables: new Set(["tenants", "users", "orders", "products"]),
  counts: new Map([
    ["tenants", 1],
    ["users", 2],
    ["orders", 0],
    ["products", 4],
  ]),
};
const CRITICAL = ["tenants", "users", "orders", "products"];

test("passes when restore matches the dump exactly", () => {
  const problems = compareInventory(
    inv,
    ["tenants", "users", "orders", "products"],
    new Map([
      ["tenants", 1],
      ["users", 2],
      ["orders", 0],
      ["products", 4],
    ]),
    CRITICAL,
  );
  assert.deepEqual(problems, []);
});

test("flags missing and extra tables in the restore", () => {
  const problems = compareInventory(
    inv,
    ["tenants", "users", "products", "stray"],
    new Map(),
    CRITICAL,
  );
  const kinds = problems.map((p) => p.kind).sort();
  assert.deepEqual(kinds, ["extra_table", "missing_table"]);
  assert.match(problems.find((p) => p.kind === "missing_table")!.detail, /"orders"/);
  assert.match(problems.find((p) => p.kind === "extra_table")!.detail, /"stray"/);
});

test("flags row-count mismatches against dump counts (not live source)", () => {
  const problems = compareInventory(
    inv,
    ["tenants", "users", "orders", "products"],
    new Map([["users", 1]]), // dump says 2
    CRITICAL,
  );
  assert.equal(problems.length, 1);
  assert.equal(problems[0].kind, "count_mismatch");
  assert.match(problems[0].detail, /restored 1 rows, dump contains 2/);
});

test("concurrent-write scenario: live source drift does not affect comparison", () => {
  // Simulates a write landing on the LIVE db after pg_dump: the dump says
  // users=2 and the restore faithfully has 2 — even though the live table now
  // has 3, the comparison sees only dump vs restore and passes.
  const problems = compareInventory(
    inv,
    ["tenants", "users", "orders", "products"],
    new Map([["users", 2]]),
    CRITICAL,
  );
  assert.deepEqual(problems, []);
});

test("flags critical tables absent from the dump itself", () => {
  const problems = compareInventory(
    { tables: new Set(["users"]), counts: new Map([["users", 2]]) },
    ["users"],
    new Map([["users", 2]]),
    ["users", "tenants"],
  );
  assert.equal(problems.length, 1);
  assert.equal(problems[0].kind, "missing_critical");
  assert.match(problems[0].detail, /"tenants"/);
});

// ── pg_dump flag drift guard ─────────────────────────────────────────────────

test("scripts/backup.sh uses the same pg_dump flags as the backup job", async () => {
  const { PG_DUMP_FLAGS } = await import("../orchestration/jobs/db-backup.job.js");
  const { readFile } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const shPath = join(fileURLToPath(import.meta.url), "../../../scripts/backup.sh");
  const sh = await readFile(shPath, "utf8");

  // Extract the pg_dump invocation (multi-line, backslash-continued).
  const match = /^pg_dump \\\n((?:\s+--?[^\s\\]+ \\\n)+)/m.exec(sh);
  assert.ok(match, "could not find pg_dump invocation in scripts/backup.sh");
  const shFlags = match![1]!
    .split("\n")
    .map((l) => l.trim().replace(/ \\$/, ""))
    .filter((l) => l.startsWith("--"));

  assert.deepEqual(shFlags, [...PG_DUMP_FLAGS]);
  assert.ok(
    !shFlags.some((f) => f.startsWith("--schema")),
    "backup.sh must not restrict dumps to a schema",
  );
});

// ── strict psql restore (integration, needs a live database) ────────────────

test("strict psql restore fails on SQL errors and succeeds on valid SQL", { skip: !process.env["DATABASE_URL"] }, async () => {
  const { runStrictPsqlRestore } = await import("../scripts/verify-restore.js");
  const dbUrl = process.env["DATABASE_URL"]!;

  // Read-only failing statement — ON_ERROR_STOP=on must propagate the error.
  const bad = await dumpFileWith("SELECT 1/0;\n");
  await assert.rejects(runStrictPsqlRestore(dbUrl, bad), /psql exited/);

  // Valid read-only statement — must resolve.
  const good = await dumpFileWith("SELECT 1;\n");
  await runStrictPsqlRestore(dbUrl, good);
});
