#!/usr/bin/env tsx
/**
 * scripts/db-check.ts — verify DATABASE_URL actually reaches a usable Postgres.
 *
 *   npm run db:check                    # uses .env / the shell environment
 *   npm run db:check -- <url>           # check a specific connection string
 *   npm run db:check -- --force         # connect even if preflight found errors
 *
 * Two phases:
 *   1. Preflight — pure checks on the URL + env (src/shared/connection-info.ts).
 *      Catches the misconfigurations that otherwise surface as an opaque socket
 *      error: TLS off against a managed provider, an un-encoded password, the
 *      wrong Supabase pooler port, a pooler user missing its project ref.
 *   2. Connect — opens the pool through the SAME `openDb()` the server uses, so
 *      the search_path startup option and sslConfig() are exercised for real,
 *      then reports server version, identity, TLS, and whether the schema has
 *      been provisioned yet.
 *
 * Read-only: it runs SELECTs and catalog lookups, never DDL or writes. Exits 0
 * when the database is reachable, 1 otherwise. The connection string is only
 * ever printed redacted.
 */
import process from "node:process";
import { openDb, sslConfig } from "../src/shared/db.js";
import {
  diagnoseConnection,
  redactConnectionString,
  type Finding,
} from "../src/shared/connection-info.js";

const args = process.argv.slice(2);
const force = args.includes("--force");
const urlArg = args.find((a) => !a.startsWith("--"));

const WIDTH = 76;
const ICON = { error: "✗", warn: "!", info: "·", ok: "✓" } as const;

/**
 * Print one result row. A short detail sits inline after the title; long prose
 * (the remediation text on errors and warnings) wraps into an indented block.
 */
function line(severity: keyof typeof ICON, title: string, detail?: string): void {
  if (!detail) {
    console.log(`  ${ICON[severity]} ${title}`);
    return;
  }
  const inline = `  ${ICON[severity]} ${title}  ${detail}`;
  if (!detail.includes("\n") && inline.length <= WIDTH) {
    console.log(inline);
    return;
  }
  console.log(`  ${ICON[severity]} ${title}`);
  for (const l of wrap(detail, WIDTH - 6)) console.log(`      ${l}`);
}

const ok = (title: string, detail?: string): void => line("ok", title, detail);

/** Wrap prose to a width so long remediation text stays readable in a terminal. */
function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/)) {
    if (current && current.length + word.length + 1 > width) {
      out.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) out.push(current);
  return out;
}

/**
 * Turn a driver/network error into something a developer can act on. Supavisor
 * and node-postgres both report these tersely, and the fix is rarely obvious
 * from the message alone.
 */
function explain(err: unknown): string | null {
  const e = err as { code?: string; message?: string };
  const code = e?.code ?? "";
  const msg = e?.message ?? "";

  if (code === "ENOTFOUND") return "DNS could not resolve the host. Check the host spelling in DATABASE_URL.";
  if (code === "ECONNREFUSED") return "Nothing is listening on that host:port. Check the port, and that the database is running.";
  if (code === "ETIMEDOUT" || msg.includes("timeout expired") || msg.includes("connection timeout"))
    return (
      "The TCP connection timed out — the host resolved but never completed a handshake. Usually a " +
      "firewall or egress policy blocking the Postgres port (5432/6543); many CI runners, corporate " +
      "networks and sandboxes allow only outbound HTTPS. Verify from an unrestricted network with " +
      "`psql \"$DATABASE_URL\" -c 'select 1'`."
    );
  if (code === "28P01") return "Password authentication failed. Re-copy the password from the Supabase dashboard (Project Settings → Database), and percent-encode any reserved characters.";
  if (code === "3D000") return "That database does not exist on the server. Supabase projects use the database name `postgres`.";
  if (code === "28000" || msg.includes("Tenant or user not found"))
    return (
      "Supavisor rejected the login. On the Shared Pooler the user must be `postgres.<project-ref>` " +
      "— the plain `postgres` user only works on a direct connection."
    );
  if (msg.includes("self-signed certificate") || msg.includes("self signed certificate") || msg.includes("unable to verify"))
    return (
      "TLS certificate verification failed. Supabase's pooler chain is publicly signed, so this usually " +
      "means a TLS-intercepting proxy. Supply its CA via PG_CA_CERT / PG_CA_CERT_B64 rather than " +
      "reaching for PG_SSL_NO_VERIFY=1."
    );
  if (msg.includes("does not support SSL") || msg.includes("server does not support SSL"))
    return "The server refused TLS. For a local/CI Postgres without SSL, set PG_SSL=false.";
  if (msg.includes("no encryption") || msg.includes("no pg_hba.conf entry"))
    return "The server requires TLS but the client did not offer it. Set PG_SSL=true.";
  if (msg.includes("unsupported startup parameter") || (msg.includes("search_path") && msg.includes("parameter")))
    return (
      "The pooler rejected the `options=-c search_path=…` startup parameter that openDb() sends. " +
      "Use the session-mode pooler port (5432) rather than transaction mode (6543)."
    );
  return null;
}

async function main(): Promise<number> {
  const connectionString = urlArg ?? process.env["DATABASE_URL"];

  console.log("\nAscend — database connection check\n");

  if (!connectionString) {
    line("error", "DATABASE_URL is not set",
      "Put it in .env (loaded automatically by npm run dev / start / db:check) or export it in your " +
      "shell. See .env.example for the template.");
    return 1;
  }

  // ── Phase 1: preflight ────────────────────────────────────────────────────
  console.log("Preflight");
  let findings: Finding[];
  try {
    ({ findings } = diagnoseConnection(connectionString, process.env));
  } catch (err) {
    line("error", "DATABASE_URL could not be parsed", err instanceof Error ? err.message : String(err));
    return 1;
  }

  for (const f of findings) line(f.severity, f.title, f.detail);

  // Resolved configuration, echoed as neutral facts — the findings above are
  // what pass or fail, so these carry no verdict marker.
  const ssl = sslConfig();
  line("info", "TLS", ssl ? (ssl.rejectUnauthorized ? "on, certificate verified" : "on, verification DISABLED") : "off");
  line("info", "Pool", `PG_POOL_MAX=${process.env["PG_POOL_MAX"] ?? 10} (this check opens 1 connection)`);

  const errors = findings.filter((f) => f.severity === "error");
  if (errors.length > 0 && !force) {
    console.log(
      `\n${errors.length} blocking problem(s) found — fix them, or re-run with --force to attempt the ` +
        "connection anyway.\n",
    );
    return 1;
  }

  // ── Phase 2: connect ──────────────────────────────────────────────────────
  // Deliberately goes through openDb() so this exercises the real pool config
  // (sslConfig + the `options=-c search_path=…` startup parameter), not a
  // hand-rolled client that could succeed where the server would not.
  console.log("\nConnection");
  const db = openDb({ connectionString, max: 1 });
  const started = Date.now();
  try {
    const server = await db.one<{
      version: string;
      database: string;
      user: string;
      search_path: string;
    }>(
      `SELECT version() AS version,
              current_database() AS database,
              current_user AS user,
              current_setting('search_path') AS search_path`,
    );
    const elapsed = Date.now() - started;

    ok("Connected", `${elapsed} ms round trip`);
    ok("Server", (server?.version ?? "unknown").split(" on ")[0] ?? "unknown");
    ok("Database", `${server?.database} as ${server?.user}`);
    ok("search_path", server?.search_path ?? "(unset)");

    // ── Schema provisioning state ───────────────────────────────────────────
    // The backend provisions its own schema on boot (src/app.ts), so an empty
    // database is expected on a brand-new project — say so rather than failing.
    const applied = await db.one<{ count: number }>(
      `SELECT count(*)::int AS count FROM information_schema.tables
        WHERE table_schema = current_schema() AND table_name = 'schema_migrations'`,
    );
    if ((applied?.count ?? 0) === 0) {
      line("info", "Schema not provisioned yet",
        "No schema_migrations table. This is normal for a new database — run `npm run dev` once and " +
        "the backend will create the schema under an advisory lock, then optionally seed with " +
        "`ALLOW_DEMO_SEED=1 npm run db:setup`.");
    } else {
      const migrations = await db.one<{ count: number }>("SELECT count(*)::int AS count FROM schema_migrations");
      const tables = await db.one<{ count: number }>(
        `SELECT count(*)::int AS count FROM information_schema.tables
          WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'`,
      );
      ok("Schema", `${tables?.count ?? 0} tables, ${migrations?.count ?? 0} migrations applied`);
    }

    console.log("\nDatabase is reachable.\n");
    return 0;
  } catch (err) {
    const e = err as { code?: string; message?: string };
    line("error", "Could not query the database", `${e?.message ?? String(err)}${e?.code ? ` (code ${e.code})` : ""}`);
    const hint = explain(err);
    if (hint) line("info", "Likely cause", hint);
    console.log(`\n  Target: ${redactConnectionString(connectionString)}\n`);
    return 1;
  } finally {
    await db.close().catch(() => {});
  }
}

process.exit(await main());
