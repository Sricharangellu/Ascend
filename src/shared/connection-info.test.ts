/**
 * connection-info.test.ts — connection-string parsing and preflight diagnostics.
 *
 * Pure-function tests: no database, no sockets. These pin the behaviour
 * `npm run db:check` reports before it ever opens a connection.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifySupabaseHost,
  describeTarget,
  diagnoseConnection,
  isLocalHost,
  parseConnectionInfo,
  redactConnectionString,
  tlsEnabled,
  unencodedPasswordChars,
  type Finding,
  type Severity,
} from "./connection-info.js";

const env = (vars: Record<string, string>): NodeJS.ProcessEnv => vars as NodeJS.ProcessEnv;

const POOLER = "postgresql://postgres.abcdefghijklmnop:s3cret@aws-0-ca-central-1.pooler.supabase.com:5432/postgres";
const LOCAL = "postgresql://finder:finder@localhost:5432/finder_dev";

/** Titles of findings at a given severity — keeps assertions readable. */
const titles = (findings: Finding[], severity: Severity): string[] =>
  findings.filter((f) => f.severity === severity).map((f) => f.title);

// ── redaction ────────────────────────────────────────────────────────────────

test("redactConnectionString removes the password", () => {
  const out = redactConnectionString(POOLER);
  assert.ok(!out.includes("s3cret"), "password must not survive redaction");
  assert.ok(out.includes("postgres.abcdefghijklmnop"), "user is kept");
  assert.ok(out.includes("aws-0-ca-central-1.pooler.supabase.com:5432"), "host is kept");
});

test("redactConnectionString leaves a password-less URL alone", () => {
  const url = "postgresql://finder@localhost:5432/finder_dev";
  assert.equal(redactConnectionString(url), url);
});

test("redactConnectionString still redacts a malformed string", () => {
  // Redaction runs on error paths, where the string may not parse at all.
  const out = redactConnectionString("postgresql://user:hunter2@no port here/db");
  assert.ok(!out.includes("hunter2"));
});

// ── password encoding ────────────────────────────────────────────────────────

test("unencodedPasswordChars flags a raw @ in the password", () => {
  const chars = unencodedPasswordChars("postgresql://postgres.ref:pa@ss@host.pooler.supabase.com:5432/postgres");
  assert.deepEqual(chars, ["@"]);
});

test("unencodedPasswordChars flags a raw / and ?", () => {
  assert.deepEqual(unencodedPasswordChars("postgresql://u:a/b?c@h:5432/db"), ["/", "?"]);
});

test("unencodedPasswordChars accepts a correctly percent-encoded password", () => {
  assert.deepEqual(unencodedPasswordChars("postgresql://u:pa%40ss%2Fword@h:5432/db"), []);
});

test("unencodedPasswordChars ignores an alphanumeric password and a missing one", () => {
  assert.deepEqual(unencodedPasswordChars(POOLER), []);
  assert.deepEqual(unencodedPasswordChars("postgresql://u@h:5432/db"), []);
});

// ── host classification ──────────────────────────────────────────────────────

test("classifySupabaseHost reads region and mode from a pooler host", () => {
  assert.deepEqual(classifySupabaseHost("aws-0-ca-central-1.pooler.supabase.com", 5432), {
    kind: "pooler",
    projectRef: null,
    region: "ca-central-1",
    mode: "session",
  });
  assert.equal(classifySupabaseHost("aws-1-us-east-2.pooler.supabase.com", 6543)?.mode, "transaction");
});

test("classifySupabaseHost recognises a direct db.<ref>.supabase.co host", () => {
  assert.deepEqual(classifySupabaseHost("db.abcdefghijklmnop.supabase.co", 5432), {
    kind: "direct",
    projectRef: "abcdefghijklmnop",
    region: null,
    mode: null,
  });
});

test("classifySupabaseHost returns null for non-Supabase hosts", () => {
  assert.equal(classifySupabaseHost("localhost", 5432), null);
  assert.equal(classifySupabaseHost("ep-cool-name.eu-central-1.aws.neon.tech", 5432), null);
});

// ── parsing ──────────────────────────────────────────────────────────────────

test("parseConnectionInfo extracts every part and the project ref from the user", () => {
  const info = parseConnectionInfo(POOLER);
  assert.equal(info.host, "aws-0-ca-central-1.pooler.supabase.com");
  assert.equal(info.port, 5432);
  assert.equal(info.database, "postgres");
  assert.equal(info.user, "postgres.abcdefghijklmnop");
  assert.equal(info.hasPassword, true);
  assert.equal(info.supabase?.projectRef, "abcdefghijklmnop");
  assert.equal(info.supabase?.mode, "session");
});

test("parseConnectionInfo decodes a percent-encoded user and database", () => {
  const info = parseConnectionInfo("postgresql://my%2Buser:pw@localhost:5432/my%20db");
  assert.equal(info.user, "my+user");
  assert.equal(info.database, "my db");
});

test("parseConnectionInfo defaults the port to 5432 and the database to postgres", () => {
  const info = parseConnectionInfo("postgresql://u:p@example.com");
  assert.equal(info.port, 5432);
  assert.equal(info.database, "postgres");
});

test("parseConnectionInfo rejects a non-postgres scheme without leaking the password", () => {
  assert.throws(
    () => parseConnectionInfo("mysql://u:hunter2@host:3306/db"),
    (err: Error) => err.message.includes("postgresql://") && !err.message.includes("hunter2"),
  );
});

test("parseConnectionInfo rejects an unparseable string without leaking the password", () => {
  assert.throws(
    () => parseConnectionInfo("not a url at all"),
    (err: Error) => err.message.includes("not a valid URL"),
  );
});

test("describeTarget names the pooler, mode, region and project", () => {
  const desc = describeTarget(parseConnectionInfo(POOLER));
  assert.match(desc, /Supabase Shared Pooler/);
  assert.match(desc, /session mode/);
  assert.match(desc, /ca-central-1/);
  assert.match(desc, /project abcdefghijklmnop/);
});

// ── tlsEnabled: must track sslConfig() in db.ts ──────────────────────────────

test("tlsEnabled matches the sslConfig matrix", () => {
  assert.equal(tlsEnabled(env({ NODE_ENV: "production" })), true);
  assert.equal(tlsEnabled(env({ NODE_ENV: "development" })), false);
  assert.equal(tlsEnabled(env({})), false);
  assert.equal(tlsEnabled(env({ PG_SSL: "true" })), true);
  assert.equal(tlsEnabled(env({ PG_SSL: "require" })), true);
  assert.equal(tlsEnabled(env({ NODE_ENV: "production", PG_SSL: "false" })), false);
});

// ── diagnostics ──────────────────────────────────────────────────────────────

test("a correctly configured Supabase pooler URL raises no errors or warnings", () => {
  const { findings } = diagnoseConnection(POOLER, env({ PG_SSL: "true", PG_POOL_MAX: "5", NODE_ENV: "development" }));
  assert.deepEqual(titles(findings, "error"), []);
  assert.deepEqual(titles(findings, "warn"), []);
  assert.deepEqual(titles(findings, "info"), ["Target"]);
});

test("a remote database with TLS off is an error", () => {
  const { findings } = diagnoseConnection(POOLER, env({ NODE_ENV: "development" }));
  assert.deepEqual(titles(findings, "error"), ["TLS disabled for a remote database"]);
});

test("a local database with TLS off is fine — that is the dev default", () => {
  const { findings } = diagnoseConnection(LOCAL, env({ NODE_ENV: "development" }));
  assert.deepEqual(titles(findings, "error"), []);
});

test("isLocalHost covers loopback, compose service names and private networks", () => {
  for (const h of [
    "localhost", "db.localhost", "127.0.0.1", "127.0.0.53", "0.0.0.0", "::1",
    "host.docker.internal", "postgres", "db", "pg.internal", "nas.local",
    "10.0.0.7", "172.16.4.2", "172.31.255.1", "192.168.1.5", "169.254.10.1",
    "fd00::1", "fe80::1",
  ]) {
    assert.equal(isLocalHost(h), true, `${h} should be treated as local`);
  }
  for (const h of [
    "aws-0-ca-central-1.pooler.supabase.com", "db.abcdefghijklmnop.supabase.co",
    "8.8.8.8", "172.32.0.1", "172.15.0.1", "192.169.1.5", "11.0.0.1",
    "ep-cool-name.eu-central-1.aws.neon.tech", "2606:4700::1",
  ]) {
    assert.equal(isLocalHost(h), false, `${h} should NOT be treated as local`);
  }
});

test("a private-network database with TLS off is not flagged", () => {
  // Docker/LAN Postgres over plaintext is a legitimate setup — it must not
  // block db:check the way a managed provider would.
  for (const host of ["192.168.1.50", "10.1.2.3", "172.20.0.4", "db"]) {
    const { findings } = diagnoseConnection(`postgresql://u:p@${host}:5432/app`, env({ NODE_ENV: "development" }));
    assert.deepEqual(titles(findings, "error"), [], `${host} should not error`);
  }
});

test("a public non-Supabase host with TLS off is still an error", () => {
  const { findings } = diagnoseConnection(
    "postgresql://u:p@ep-cool-name.eu-central-1.aws.neon.tech:5432/app",
    env({ NODE_ENV: "development" }),
  );
  assert.deepEqual(titles(findings, "error"), ["TLS disabled for a remote database"]);
});

test("findings are ordered error before warn before info", () => {
  const { findings } = diagnoseConnection(
    "postgresql://postgres:pa@ss@aws-0-ca-central-1.pooler.supabase.com:6543/postgres",
    env({ NODE_ENV: "development" }),
  );
  const order = findings.map((f) => f.severity);
  assert.deepEqual([...order].sort((a, b) => order.indexOf(a) - order.indexOf(b)), order);
  assert.equal(order[0], "error");
  assert.equal(order.at(-1), "info");
});

test("an un-encoded password character is reported as an error", () => {
  const { findings } = diagnoseConnection(
    "postgresql://postgres.ref:pa@ss@aws-0-ca-central-1.pooler.supabase.com:5432/postgres",
    env({ PG_SSL: "true" }),
  );
  assert.ok(titles(findings, "error").includes("Password contains un-encoded reserved characters"));
});

test("transaction mode (6543) warns about the search_path startup option", () => {
  const { findings } = diagnoseConnection(
    "postgresql://postgres.ref:pw@aws-0-ca-central-1.pooler.supabase.com:6543/postgres",
    env({ PG_SSL: "true" }),
  );
  const warn = findings.find((f) => f.title.includes("transaction-mode"));
  assert.ok(warn, "expected a transaction-mode warning");
  assert.match(warn.detail, /search_path/);
});

test("a direct Supabase host warns to prefer the pooler", () => {
  const { findings } = diagnoseConnection(
    "postgresql://postgres:pw@db.abcdefghijklmnop.supabase.co:5432/postgres",
    env({ PG_SSL: "true" }),
  );
  assert.ok(titles(findings, "warn").includes("Direct Supabase connection (not the pooler)"));
});

test("a pooler user without the project ref is an error", () => {
  const { findings } = diagnoseConnection(
    "postgresql://postgres:pw@aws-0-ca-central-1.pooler.supabase.com:5432/postgres",
    env({ PG_SSL: "true" }),
  );
  assert.ok(titles(findings, "error").includes("Pooler user is missing the project ref"));
});

test("an oversized pool warns only for Supabase targets", () => {
  const hot = env({ PG_SSL: "true", PG_POOL_MAX: "40" });
  assert.ok(diagnoseConnection(POOLER, hot).findings.some((f) => f.title.includes("PG_POOL_MAX")));
  assert.ok(!diagnoseConnection(LOCAL, hot).findings.some((f) => f.title.includes("PG_POOL_MAX")));
});

test("PG_SSL_NO_VERIFY=1 warns that verification is off", () => {
  const { findings } = diagnoseConnection(POOLER, env({ PG_SSL: "true", PG_SSL_NO_VERIFY: "1" }));
  assert.ok(titles(findings, "warn").includes("TLS certificate verification disabled"));
});

test("no finding ever contains the password", () => {
  const { findings, info } = diagnoseConnection(
    "postgresql://postgres:hunter2@db.abcdefghijklmnop.supabase.co:6543/postgres",
    env({ PG_POOL_MAX: "40" }),
  );
  for (const f of findings) {
    assert.ok(!f.detail.includes("hunter2"), `password leaked in finding "${f.title}"`);
    assert.ok(!f.title.includes("hunter2"), `password leaked in title "${f.title}"`);
  }
  assert.ok(!info.redacted.includes("hunter2"));
});
