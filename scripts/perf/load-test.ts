/**
 * HTTP load test for Ascend — dependency-free (node:http only), so it runs in
 * CI and in any container without installing k6/artillery.
 *
 * It drives the real API over the real gateway (auth, rate limiting, tenant
 * resolution, RLS) rather than calling services directly, because most of what
 * breaks at scale lives in that middleware chain and in connection handling,
 * not in the SQL.
 *
 *   BASE_URL=http://localhost:3001 \
 *   JWT_SECRET=... \
 *   npx tsx scripts/perf/load-test.ts --profile=target --seconds=30
 *
 * Profiles model the levels the 20k-user target is specified against. They
 * describe CONCURRENT IN-FLIGHT REQUESTS, not registered users: a "concurrently
 * active" user in an ERP issues roughly one request every few seconds, so 5,000
 * active users is modelled by a few hundred in-flight requests. The mapping is
 * stated per profile so the numbers are not silently inflated.
 *
 * Output is one line per scenario with p50/p95/p99 plus an error breakdown, and
 * a machine-readable JSON blob when --json is passed.
 */
import http from "node:http";
import https from "node:https";
import { URL } from "node:url";
import jwt from "jsonwebtoken";

interface Scenario {
  name: string;
  /** Relative share of traffic. */
  weight: number;
  method: "GET" | "POST";
  path: (ctx: Ctx) => string;
  body?: (ctx: Ctx) => unknown;
  /** Latency budget for p95, in ms. */
  p95BudgetMs: number;
}

interface Ctx {
  tenant: string;
  productIds: string[];
  rand: () => number;
}

interface Profile {
  name: string;
  /** Concurrent in-flight requests. */
  concurrency: number;
  /** Modelled active-user count this represents, for the report. */
  models: string;
}

const PROFILES: Record<string, Profile> = {
  smoke: { name: "smoke", concurrency: 8, models: "~100 active users" },
  baseline: { name: "baseline", concurrency: 40, models: "~1,000 active users at 1 req / 25s each" },
  target: { name: "target", concurrency: 200, models: "~5,000 active users at 1 req / 25s each" },
  stress: { name: "stress", concurrency: 400, models: "~10,000 active users at 1 req / 25s each" },
  extreme: { name: "extreme", concurrency: 800, models: "~20,000 active users at 1 req / 25s each" },
};

const SCENARIOS: Scenario[] = [
  {
    name: "catalog.list",
    weight: 25,
    method: "GET",
    path: () => "/api/v1/catalog?limit=25",
    p95BudgetMs: 300,
  },
  {
    name: "catalog.search",
    weight: 15,
    method: "GET",
    path: (c) => `/api/v1/catalog?limit=25&q=${["Cola", "Chips", "Milk", "Soap"][Math.floor(c.rand() * 4)]}`,
    p95BudgetMs: 300,
  },
  {
    name: "inventory.levels",
    weight: 15,
    method: "GET",
    path: () => "/api/v1/inventory/levels?pageSize=50",
    p95BudgetMs: 300,
  },
  {
    name: "orders.list",
    weight: 15,
    method: "GET",
    path: () => "/api/v1/orders?limit=25",
    p95BudgetMs: 300,
  },
  {
    name: "customers.list",
    weight: 10,
    method: "GET",
    path: () => "/api/v1/customers?limit=25",
    p95BudgetMs: 300,
  },
  {
    name: "pos.checkout",
    weight: 20,
    method: "POST",
    path: () => "/api/v1/orders",
    body: (c) => ({
      lines: Array.from({ length: 1 + Math.floor(c.rand() * 4) }, () => ({
        productId: c.productIds[Math.floor(c.rand() * c.productIds.length)],
        quantity: 1,
      })),
      stateCode: "CA",
    }),
    // POS is the mission-critical path and carries the tighter budget.
    p95BudgetMs: 200,
  },
];

interface Sample {
  scenario: string;
  ms: number;
  status: number;
}

function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]!;
}

/** Deterministic PRNG so two runs drive the same traffic mix. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

async function main(): Promise<void> {
  const baseUrl = new URL(process.env["BASE_URL"] ?? "http://127.0.0.1:3001");
  const profileName = arg("profile", "baseline");
  const profile = PROFILES[profileName];
  if (!profile) throw new Error(`unknown profile "${profileName}" (have: ${Object.keys(PROFILES).join(", ")})`);
  const seconds = Number(arg("seconds", "20"));
  const tenant = arg("tenant", process.env["TENANT"] ?? "t_perf_3");
  const productCount = Number(arg("products", "2000"));
  const asJson = process.argv.includes("--json");

  const secret = process.env["JWT_SECRET"];
  if (!secret) throw new Error("JWT_SECRET is required (must match the server's)");
  const token = jwt.sign({ sub: `usr_${tenant}`, tenantId: tenant, role: "owner" }, secret, { expiresIn: "2h" });

  const agentOpts = { keepAlive: true, maxSockets: profile.concurrency + 16 };
  const agent = baseUrl.protocol === "https:" ? new https.Agent(agentOpts) : new http.Agent(agentOpts);
  const transport = baseUrl.protocol === "https:" ? https : http;

  const rand = mulberry32(42);
  const ctx: Ctx = {
    tenant,
    productIds: Array.from({ length: Math.min(productCount, 500) }, (_, i) => `${tenant}_prd_${i + 1}`),
    rand,
  };

  // `--only=a,b` restricts the mix. Worth having: a slow write path occupies
  // most of the in-flight slots and starves the reads sharing them, so a
  // blended run alone cannot tell you whether the reads are also slow or merely
  // queued behind the writes.
  const only = arg("only", "").split(",").map((s) => s.trim()).filter(Boolean);
  const active = only.length > 0 ? SCENARIOS.filter((s) => only.includes(s.name)) : SCENARIOS;
  if (active.length === 0) throw new Error(`--only matched no scenarios (have: ${SCENARIOS.map((s) => s.name).join(", ")})`);

  // Expand scenarios by weight into a pick table.
  const picks: Scenario[] = [];
  for (const s of active) for (let i = 0; i < s.weight; i++) picks.push(s);

  const samples: Sample[] = [];
  const errors = new Map<string, number>();
  const deadline = Date.now() + seconds * 1000;
  let inflight = 0;
  let stop = false;

  function once(): Promise<void> {
    const scenario = picks[Math.floor(rand() * picks.length)]!;
    const payload = scenario.body ? JSON.stringify(scenario.body(ctx)) : undefined;
    const started = process.hrtime.bigint();
    return new Promise<void>((resolve) => {
      const req = transport.request(
        {
          protocol: baseUrl.protocol,
          hostname: baseUrl.hostname,
          port: baseUrl.port,
          path: scenario.path(ctx),
          method: scenario.method,
          agent,
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
            ...(payload ? { "content-length": Buffer.byteLength(payload) } : {}),
          },
        },
        (res) => {
          res.resume();
          res.on("end", () => {
            const ms = Number(process.hrtime.bigint() - started) / 1e6;
            const status = res.statusCode ?? 0;
            samples.push({ scenario: scenario.name, ms, status });
            if (status >= 400) {
              const key = `${scenario.name} ${status}`;
              errors.set(key, (errors.get(key) ?? 0) + 1);
            }
            resolve();
          });
        },
      );
      req.on("error", (err) => {
        const key = `${scenario.name} ${(err as NodeJS.ErrnoException).code ?? "ERR"}`;
        errors.set(key, (errors.get(key) ?? 0) + 1);
        samples.push({ scenario: scenario.name, ms: Number(process.hrtime.bigint() - started) / 1e6, status: 0 });
        resolve();
      });
      if (payload) req.write(payload);
      req.end();
    });
  }

  async function worker(): Promise<void> {
    while (!stop && Date.now() < deadline) {
      inflight++;
      await once();
      inflight--;
    }
  }

  const wallStart = Date.now();
  await Promise.all(Array.from({ length: profile.concurrency }, () => worker()));
  stop = true;
  const wallMs = Date.now() - wallStart;
  void inflight;

  // ── Report ────────────────────────────────────────────────────────────────
  const byScenario = new Map<string, number[]>();
  for (const s of samples) {
    if (s.status >= 200 && s.status < 400) {
      const arr = byScenario.get(s.scenario) ?? [];
      arr.push(s.ms);
      byScenario.set(s.scenario, arr);
    }
  }

  const rows = active.map((sc) => {
    const arr = (byScenario.get(sc.name) ?? []).sort((a, b) => a - b);
    const total = samples.filter((s) => s.scenario === sc.name).length;
    const p95 = percentile(arr, 0.95);
    return {
      scenario: sc.name,
      requests: total,
      ok: arr.length,
      errorRate: total === 0 ? 0 : (total - arr.length) / total,
      p50: percentile(arr, 0.5),
      p95,
      p99: percentile(arr, 0.99),
      budgetMs: sc.p95BudgetMs,
      withinBudget: arr.length > 0 && p95 <= sc.p95BudgetMs,
    };
  });

  const rps = samples.length / (wallMs / 1000);
  const overallErrorRate = samples.filter((s) => s.status >= 400 || s.status === 0).length / (samples.length || 1);

  if (asJson) {
    console.log(JSON.stringify({ profile: profile.name, concurrency: profile.concurrency, seconds, rps, overallErrorRate, rows, errors: [...errors] }, null, 2));
  } else {
    console.log(`\nprofile=${profile.name}  concurrency=${profile.concurrency}  (${profile.models})`);
    console.log(`duration=${(wallMs / 1000).toFixed(1)}s  requests=${samples.length}  throughput=${rps.toFixed(0)} req/s  error-rate=${(overallErrorRate * 100).toFixed(2)}%\n`);
    console.log("scenario              reqs     ok   err%     p50      p95      p99   budget  verdict");
    for (const r of rows) {
      console.log(
        `${r.scenario.padEnd(20)} ${String(r.requests).padStart(5)} ${String(r.ok).padStart(6)} ${(r.errorRate * 100).toFixed(1).padStart(6)} ` +
          `${r.p50.toFixed(1).padStart(7)} ${r.p95.toFixed(1).padStart(8)} ${r.p99.toFixed(1).padStart(8)} ${String(r.budgetMs).padStart(7)}  ${r.withinBudget ? "ok" : "OVER"}`,
      );
    }
    if (errors.size > 0) {
      console.log("\nerrors:");
      for (const [k, v] of [...errors].sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);
    }
  }
}

void main();
