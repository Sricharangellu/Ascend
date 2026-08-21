/**
 * connection-info.ts — parse, redact, and sanity-check a Postgres connection URL.
 *
 * Everything here is a pure function of (connection string, env). No sockets, no
 * pool — so it runs before a connection is attempted and is unit-testable
 * without a database. `scripts/db-check.ts` runs these first, then connects.
 *
 * The checks encode the failure modes that actually cost time when pointing this
 * backend at a managed Postgres (Supabase in particular):
 *   • TLS off — the dev default in `sslConfig()` is no-TLS, but managed
 *     providers refuse plaintext, so the URL alone is not enough.
 *   • A password with reserved characters pasted in raw instead of
 *     percent-encoded, which silently reparses into the wrong host/password.
 *   • Supabase's transaction-mode pooler port, which drops the `options`
 *     startup parameter `openDb()` uses to pin `search_path`.
 *   • A pool size larger than the provider's per-project client limit.
 */

/** Ports Supabase's Supavisor pooler listens on, and what each mode means. */
const SUPAVISOR_SESSION_PORT = 5432;
const SUPAVISOR_TRANSACTION_PORT = 6543;

export type PoolerMode = "session" | "transaction";

export interface SupabaseTarget {
  /** `pooler` = *.pooler.supabase.com (Supavisor); `direct` = db.<ref>.supabase.co. */
  kind: "pooler" | "direct";
  /** Project ref parsed from the pooler user or direct host. Null when absent. */
  projectRef: string | null;
  /** AWS region slug parsed from the pooler host, e.g. `ca-central-1`. */
  region: string | null;
  /** Session vs transaction pooling. Null for direct connections. */
  mode: PoolerMode | null;
}

export interface ConnectionInfo {
  host: string;
  port: number;
  database: string;
  user: string;
  hasPassword: boolean;
  /** The connection string with the password replaced. Safe to print or log. */
  redacted: string;
  /** Supabase classification, or null when the host is not a Supabase endpoint. */
  supabase: SupabaseTarget | null;
}

export type Severity = "error" | "warn" | "info";

export interface Finding {
  severity: Severity;
  /** Short label, e.g. "TLS disabled". */
  title: string;
  /** What is wrong and the concrete fix. */
  detail: string;
}

/**
 * Replace the password in a Postgres URL with `********`.
 *
 * Operates on the raw string rather than a parsed URL so that a malformed
 * string — the case where redaction matters most, because it is about to be
 * quoted in an error message — is still redacted.
 */
export function redactConnectionString(connectionString: string): string {
  // Match scheme://user:password@ and keep everything except the password.
  return connectionString.replace(
    /^([A-Za-z][A-Za-z0-9+.-]*:\/\/[^:/?#@]*:)[^@]*@/,
    (_m, prefix: string) => `${prefix}********@`,
  );
}

/**
 * Characters that are legal inside a password but MUST be percent-encoded in a
 * URL. `@` and `/` are the dangerous ones: libpq splits the authority on the
 * *first* `@`, so a raw `@` in a password makes psql, `db/migrations/run.sh`,
 * and most non-Node clients connect to the wrong host — while Node's WHATWG URL
 * parser splits on the *last* `@` and appears to work. That split-brain is
 * exactly the bug this catches.
 */
const RESERVED_IN_PASSWORD = ["@", "/", "?", "#", "[", "]"] as const;

/**
 * Returns the raw reserved characters found in the password portion, or an empty
 * array when the password is absent or correctly encoded.
 *
 * Reads the raw string between the first `:` after the scheme and the last `@`,
 * which is what a strict parser would treat as the password.
 */
export function unencodedPasswordChars(connectionString: string): string[] {
  const afterScheme = connectionString.replace(/^[A-Za-z][A-Za-z0-9+.-]*:\/\//, "");
  const lastAt = afterScheme.lastIndexOf("@");
  if (lastAt === -1) return [];
  const userinfo = afterScheme.slice(0, lastAt);
  const colon = userinfo.indexOf(":");
  if (colon === -1) return [];
  const password = userinfo.slice(colon + 1);
  return RESERVED_IN_PASSWORD.filter((ch) => password.includes(ch));
}

/** Classify a host as a Supabase pooler / direct endpoint, or null if neither. */
export function classifySupabaseHost(host: string, port: number): SupabaseTarget | null {
  const lower = host.toLowerCase();

  if (lower.endsWith(".pooler.supabase.com")) {
    // Hosts look like `aws-0-ca-central-1.pooler.supabase.com` or, on newer
    // projects, `aws-1-us-east-2.pooler.supabase.com`.
    const region = /^aws-\d+-([a-z]+-[a-z]+-\d+)\./.exec(lower)?.[1] ?? null;
    let mode: PoolerMode | null = null;
    if (port === SUPAVISOR_SESSION_PORT) mode = "session";
    else if (port === SUPAVISOR_TRANSACTION_PORT) mode = "transaction";
    return { kind: "pooler", projectRef: null, region, mode };
  }

  // Direct connections: db.<project-ref>.supabase.co
  const direct = /^db\.([a-z0-9]+)\.supabase\.(co|com)$/.exec(lower);
  if (direct) return { kind: "direct", projectRef: direct[1] ?? null, region: null, mode: null };

  return null;
}

/**
 * Parse a Postgres connection string into its parts. Throws a message safe to
 * show the user (never containing the password) when the string is unusable.
 */
export function parseConnectionInfo(connectionString: string): ConnectionInfo {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error(
      `DATABASE_URL is not a valid URL: ${redactConnectionString(connectionString)}\n` +
        "Expected postgresql://USER:PASSWORD@HOST:PORT/DATABASE",
    );
  }

  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error(
      `DATABASE_URL must use the postgresql:// scheme, got "${url.protocol}" ` +
        `in ${redactConnectionString(connectionString)}`,
    );
  }

  const user = decodeURIComponent(url.username);
  const port = url.port ? Number(url.port) : SUPAVISOR_SESSION_PORT;
  const database = decodeURIComponent(url.pathname.replace(/^\//, "")) || "postgres";
  const supabase = classifySupabaseHost(url.hostname, port);

  // The pooler username carries the project ref: `postgres.<project-ref>`.
  if (supabase?.kind === "pooler") {
    supabase.projectRef = /^[^.]+\.([a-z0-9]+)$/.exec(user)?.[1] ?? null;
  }

  return {
    host: url.hostname,
    port,
    database,
    user,
    hasPassword: url.password !== "",
    redacted: redactConnectionString(connectionString),
    supabase,
  };
}

/**
 * Mirrors `sslConfig()` in db.ts closely enough to answer "will this connection
 * negotiate TLS?" without opening one. Kept as a separate predicate rather than
 * importing sslConfig so a change there surfaces as a failing test here instead
 * of silently changing what db:check reports.
 */
export function tlsEnabled(env: NodeJS.ProcessEnv): boolean {
  const raw = env.PG_SSL?.trim().toLowerCase();
  if (raw && ["0", "false", "no", "off", "disable", "disabled"].includes(raw)) return false;
  if (raw && ["1", "true", "yes", "on", "require", "required"].includes(raw)) return true;
  return !raw && env.NODE_ENV === "production";
}

/**
 * Static checks against a parsed connection + the environment that will be used
 * to open it. Returns findings ordered error → warn → info.
 */
export function diagnoseConnection(
  connectionString: string,
  env: NodeJS.ProcessEnv = process.env,
): { info: ConnectionInfo; findings: Finding[] } {
  const info = parseConnectionInfo(connectionString);
  const findings: Finding[] = [];
  const managed = info.supabase !== null || !isLocalHost(info.host);

  const rawReserved = unencodedPasswordChars(connectionString);
  if (rawReserved.length > 0) {
    findings.push({
      severity: "error",
      title: "Password contains un-encoded reserved characters",
      detail:
        `The password contains ${rawReserved.map((c) => `"${c}"`).join(", ")} un-encoded. ` +
        "libpq (psql, db/migrations/run.sh) splits the URL at the FIRST \"@\" and on the first " +
        '"/", so it will connect to the wrong host or reject the string, even if Node appears ' +
        "to work. Percent-encode them: @ → %40, / → %2F, ? → %3F, # → %23, [ → %5B, ] → %5D.",
    });
  }

  if (!info.hasPassword) {
    findings.push({
      severity: "warn",
      title: "No password in the connection string",
      detail:
        "DATABASE_URL has no password component. This only works if the server allows trust/peer " +
        "auth or a password is supplied out-of-band via PGPASSWORD.",
    });
  }

  if (managed && !tlsEnabled(env)) {
    findings.push({
      severity: "error",
      title: "TLS disabled for a remote database",
      detail:
        `${info.host} is not local, but TLS is off: PG_SSL is ` +
        `${env.PG_SSL ? `"${env.PG_SSL}"` : "unset"} and NODE_ENV is ` +
        `${env.NODE_ENV ? `"${env.NODE_ENV}"` : "unset"} (sslConfig() only defaults TLS on in ` +
        "production). Supabase refuses plaintext connections. Set PG_SSL=true.",
    });
  }

  if (tlsEnabled(env) && env.PG_SSL_NO_VERIFY === "1") {
    findings.push({
      severity: "warn",
      title: "TLS certificate verification disabled",
      detail:
        "PG_SSL_NO_VERIFY=1 turns off certificate verification, leaving the connection open to " +
        "interception. Supabase's pooler presents a publicly-signed certificate that Node's " +
        "bundled CAs already trust — unset PG_SSL_NO_VERIFY.",
    });
  }

  if (info.supabase?.kind === "pooler" && info.supabase.mode === "transaction") {
    findings.push({
      severity: "warn",
      title: "Supabase transaction-mode pooler (port 6543)",
      detail:
        "openDb() pins the schema with the `options=-c search_path=…` startup parameter and this " +
        "backend relies on session-scoped behaviour; transaction mode does not guarantee either " +
        `(it also disallows prepared statements). Use session mode — port ${SUPAVISOR_SESSION_PORT} ` +
        "— unless you have verified this backend against 6543.",
    });
  }

  if (info.supabase?.kind === "direct") {
    findings.push({
      severity: "warn",
      title: "Direct Supabase connection (not the pooler)",
      detail:
        "Direct connections bypass Supavisor and consume the project's Postgres max_connections " +
        "budget; they are also IPv6-only on projects without the IPv4 add-on. Prefer the Shared " +
        "Pooler host (*.pooler.supabase.com) for anything that runs more than one process.",
    });
  }

  const poolMax = Number(env.PG_POOL_MAX ?? 10);
  if (info.supabase !== null && Number.isFinite(poolMax) && poolMax > 15) {
    findings.push({
      severity: "warn",
      title: `PG_POOL_MAX=${poolMax} is high for a Supabase project`,
      detail:
        "Each process opens up to this many pooler client connections, and the per-project client " +
        "limit is shared across every process and tool. Free/small plans should sit at 5–10.",
    });
  }

  if (info.supabase?.kind === "pooler" && !info.user.includes(".")) {
    findings.push({
      severity: "error",
      title: "Pooler user is missing the project ref",
      detail:
        `The Shared Pooler authenticates as "postgres.<project-ref>", but the URL uses ` +
        `"${info.user}". Supavisor cannot route the connection without the ref and will reject it.`,
    });
  }

  findings.push({
    severity: "info",
    title: "Target",
    detail: describeTarget(info),
  });

  const rank: Record<Severity, number> = { error: 0, warn: 1, info: 2 };
  findings.sort((a, b) => rank[a.severity] - rank[b.severity]);
  return { info, findings };
}

/** One-line human description of what we are about to connect to. */
export function describeTarget(info: ConnectionInfo): string {
  const base = `${info.user}@${info.host}:${info.port}/${info.database}`;
  if (!info.supabase) return base;
  const bits = [
    info.supabase.kind === "pooler" ? "Supabase Shared Pooler" : "Supabase direct",
    info.supabase.mode ? `${info.supabase.mode} mode` : null,
    info.supabase.region,
    info.supabase.projectRef ? `project ${info.supabase.projectRef}` : null,
  ].filter((b): b is string => b !== null);
  return `${base} — ${bits.join(", ")}`;
}

/**
 * Hosts for which plaintext Postgres is a legitimate setup, so "TLS is off"
 * should not be reported as a problem: loopback, Docker/compose service names,
 * and private (RFC 1918 / RFC 4193) networks. Everything else — a managed
 * provider or any public host — is expected to require TLS.
 */
export function isLocalHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");

  if (["localhost", "0.0.0.0", "::1", "::", "host.docker.internal", "postgres", "db"].includes(h)) return true;
  if (h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;

  // IPv4 loopback and RFC 1918 private ranges: 10/8, 172.16/12, 192.168/16,
  // plus link-local 169.254/16.
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 127 || a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    return false;
  }

  // IPv6 unique-local (fc00::/7) and link-local (fe80::/10).
  if (/^f[cd][0-9a-f]{2}:/.test(h) || /^fe[89ab][0-9a-f]:/.test(h)) return true;

  return false;
}
