/**
 * Post-restore verification — proves a restored database is USABLE, not just present.
 *
 * `db/backup/restore.sh`'s own DR DRILL CHECKLIST asks for exactly this and has
 * always left it to a human:
 *
 *   2. Run migrations (db/migrations/run.sh up).
 *   3. Run smoke tests against the restored database.
 *
 * Step 3 could not be satisfied by `npm run smoke`: smoke provisions its own
 * throwaway `smoke_<ts>` schema and drops it afterwards (scripts/smoke.ts), so
 * it would have exercised a brand-new schema sitting *beside* the restored data
 * and reported success without ever touching it. A green smoke run against a
 * restored database proves nothing about the restore. This script reads the
 * restored rows instead.
 *
 * What it proves, in order of increasing strength:
 *   1. `buildApp` boots against the restored database — which also runs every
 *      module's migrations over it, covering checklist step 2. Migrations are
 *      idempotent, so this is the real recovery sequence, not a simulation.
 *   2. `/readyz` reports the database reachable.
 *   3. The restored TENANT and USER data is queryable through the app's own db
 *      layer, and is non-empty.
 *
 * WHAT THIS DELIBERATELY DOES NOT ASSERT: a successful login.
 * `neutralizeDemoAccountsInProduction()` (src/identity/service.ts) scrambles the
 * password hash of `owner@ascend.dev` and `cashier@ascend.dev` on every
 * production boot, so that a real deployment cannot be entered using the demo
 * credentials committed in this repo. A login assertion here would therefore be
 * permanently red in production mode, and making it pass would mean either
 * weakening that protection or writing a purpose-made account into the source
 * database — unacceptable when the source may be production. Credential
 * integrity is instead proven upstream by db/backup/drill.sh's per-table content
 * checksum, which compares `users.password_hash` byte for byte across the
 * restore. That is strictly stronger than exercising one account.
 *
 * WHY `NODE_ENV=production` IS MANDATORY HERE — this is the whole integrity of
 * the check, not a deployment detail.
 *
 * `IdentityService.seedDemo()` runs on every boot and, when the users table is
 * empty, self-creates tenant `tnt_demo` with `owner@ascend.dev` and a bcrypt
 * hash of the published demo password. It skips that ONLY when
 * `NODE_ENV === "production"` (src/identity/service.ts).
 *
 * So without production mode, the data assertions below are satisfied by data the app just
 * invented, and this script passes against a database that had NOTHING restored
 * into it. That was not hypothetical: it was observed failing exactly that way
 * against an empty database during development of this script, and it is the
 * same shape of defect as `backup.yml` reporting success having backed up
 * nothing. A gate that cannot fail is worse than no gate, because the green tick
 * gets read as evidence. The check below refuses to run rather than produce a
 * meaningless pass.
 *
 * Usage:
 *   NODE_ENV=production DATABASE_URL=<restored-db> JWT_SECRET=<any> \
 *     tsx scripts/verify-restored-db.ts
 *
 * Exits non-zero on the first failed assertion, so it is safe to use as a gate.
 */
import http from "node:http";
import { buildApp } from "../src/app.js";

const url = process.env["DATABASE_URL"];
if (!url) {
  console.error("✗ DATABASE_URL is not set — nothing to verify.");
  process.exit(1);
}

if (process.env["NODE_ENV"] !== "production") {
  console.error(
    "✗ NODE_ENV must be 'production' to run this verification.\n" +
      "\n" +
      "  Outside production mode, IdentityService.seedDemo() self-creates the demo\n" +
      "  tenant and owner user whenever the users table is empty. Every assertion\n" +
      "  below would then be satisfied by invented data, and this script would pass\n" +
      "  against a database that had nothing restored into it.\n" +
      "\n" +
      "  Re-run with NODE_ENV=production — which is also what a real recovery does.",
  );
  process.exit(1);
}

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function request(
  server: http.Server,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: string }> {
  const addr = server.address() as { port: number };
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: addr.port,
        path,
        method,
        headers: payload
          ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) }
          : {},
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: data }));
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const t0 = Date.now();

// ── 1. Boot the app against the restored database ───────────────────────────
// This runs every module's migrations over the restored schema, which is
// checklist step 2 and also the real recovery sequence.
console.log("→ booting the application against the restored database…");
const { express: app, db, cleanup } = await buildApp({ connectionString: url });
const server = http.createServer(app);
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
console.log(`✓ [1] app booted and migrations applied over the restored schema (${Date.now() - t0} ms)`);

let exitCode = 0;
try {
  // ── 2. Readiness — the database is actually reachable ─────────────────────
  const ready = await request(server, "GET", "/readyz");
  if (ready.status !== 200) fail(`/readyz returned ${ready.status}, expected 200 — body: ${ready.body}`);
  if (!ready.body.includes("connected")) {
    fail(`/readyz did not report the database connected — body: ${ready.body}`);
  }
  console.log("✓ [2] /readyz reports the database connected");

  // ── 3. The restored DATA is there ─────────────────────────────────────────
  // Row counts, not just table existence: an empty restore is structurally
  // indistinguishable from a good one if you only count tables, and that is
  // precisely the failure mode that would go unnoticed in a real incident.
  const tenants = await db.one<{ n: number }>("SELECT COUNT(*)::int AS n FROM tenants");
  if (!tenants || Number(tenants.n) === 0) {
    fail("no tenant rows in the restored database — the restore produced an empty schema");
  }
  console.log(`✓ [3] restored tenant data present (${tenants.n} tenant(s))`);

  const users = await db.one<{ n: number }>("SELECT COUNT(*)::int AS n FROM users");
  if (!users || Number(users.n) === 0) fail("no user rows in the restored database");
  console.log(`✓ [4] restored user data present (${users.n} user(s))`);

  // ── 4. The auth boundary still works on the restored data ─────────────────
  // Not a login (see the header — production deliberately neutralises the demo
  // accounts). This asserts the app is genuinely serving authenticated routes
  // off the restored schema rather than erroring its way to a 200: an
  // unauthenticated protected route must come back 401, which exercises the
  // real auth middleware against the restored database.
  const flags = await request(server, "GET", "/api/v1/flags");
  if (flags.status !== 401) {
    fail(
      `/api/v1/flags without auth returned ${flags.status}, expected 401 — the app is not ` +
        `serving its auth boundary correctly off the restored database. Body: ${flags.body}`,
    );
  }
  console.log("✓ [5] auth boundary intact on the restored database (/api/v1/flags → 401)");

  console.log(`\n✅ RESTORE VERIFIED — the restored database is usable, not merely present (${Date.now() - t0} ms).`);
  console.log("   Credential-byte integrity is proven separately by drill.sh's content checksum.");
} catch (err) {
  console.error(`✗ verification threw: ${err instanceof Error ? err.message : String(err)}`);
  exitCode = 1;
} finally {
  server.close();
  await cleanup();
  await db.close();
}

process.exit(exitCode);
