/**
 * Phase-level profiler for the POS checkout path.
 *
 * The HTTP load test (`load-test.ts`) shows THAT checkout is slow; this shows
 * WHERE the time goes, by timing every domain event the checkout publishes. It
 * exists because the answer was not where any of the usual suspects pointed:
 * during the 20k-user audit, checkout sat near a second under load while no SQL
 * statement exceeded 150 ms, the connection pool was not the limit (pool sizes
 * 10/25/50 measured within noise of each other) and the Node process was under
 * 50% of one core. Timing the event fan-out found it immediately — the
 * `order.created` handler chain was ~90% of the request.
 *
 * It drives the service in-process, so it measures the application without HTTP,
 * auth, or the load generator competing for the same CPU.
 *
 *   psql "$DATABASE_URL" -f scripts/perf/seed-scale.sql
 *   DATABASE_URL=... JWT_SECRET=... TENANT=t_perf_3 \
 *     npx tsx scripts/perf/profile-checkout.ts
 */
import { buildApp } from "../../src/app.js";
import { runWithTenant } from "../../src/shared/tenant-context.js";
import { OrdersService } from "../../src/modules/orders/service.js";
import type { DomainEvent } from "../../src/shared/types.js";

const TENANT = process.env["TENANT"] ?? "t_perf_3";
const PRODUCTS = Number(process.env["PERF_PRODUCTS"] ?? 200);

const app = await buildApp({});
const { db, events } = app;

const phases = new Map<string, { n: number; ms: number }>();
function record(name: string, ms: number): void {
  const e = phases.get(name) ?? { n: 0, ms: 0 };
  e.n++;
  e.ms += ms;
  phases.set(name, e);
}

// Wrap publish so every event type is attributed separately. Nested publishes
// (a handler that publishes its own event) are counted inside their parent as
// well as on their own line, which is what makes a cascade visible.
const origPublish = events.publish.bind(events);
(events as unknown as { publish: typeof origPublish }).publish = async <T,>(
  type: string,
  payload: T,
  aggregateId?: string,
): Promise<DomainEvent<T>> => {
  const t = performance.now();
  try {
    return await origPublish(type, payload, aggregateId);
  } finally {
    record(`publish:${type}`, performance.now() - t);
  }
};

const orders = new OrdersService(db, events);
const productIds = Array.from({ length: PRODUCTS }, (_, i) => `${TENANT}_prd_${i + 1}`);

function basket(): Array<{ productId: string; quantity: number }> {
  const n = 1 + Math.floor(Math.random() * 4);
  return Array.from({ length: n }, () => ({
    productId: productIds[Math.floor(Math.random() * productIds.length)]!,
    quantity: 1,
  }));
}

async function run(concurrency: number, seconds: number): Promise<void> {
  phases.clear();
  const deadline = Date.now() + seconds * 1000;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (Date.now() < deadline) {
        const t = performance.now();
        try {
          await runWithTenant(TENANT, () =>
            orders.create({ lines: basket(), stateCode: "CA" }, TENANT, "usr_perf"),
          );
          record("create:total", performance.now() - t);
        } catch {
          // Out-of-stock and validation rejections are expected against a seeded
          // dataset; they are counted, not timed, so they cannot flatter the average.
          record("create:rejected", 0);
        }
      }
    }),
  );

  const total = phases.get("create:total");
  if (!total) {
    console.log(`\nconcurrency=${concurrency}: every attempt was rejected — check the tenant/product ids`);
    return;
  }
  console.log(
    `\nconcurrency=${String(concurrency).padEnd(3)} throughput=${(total.n / seconds).toFixed(1)}/s  avg=${(total.ms / total.n).toFixed(1)}ms`,
  );
  for (const [name, v] of [...phases].sort((a, b) => b[1].ms - a[1].ms)) {
    const share = name === "create:total" ? "" : ` (${((v.ms / total.ms) * 100).toFixed(0)}% of request)`;
    console.log(`  ${name.padEnd(34)} n=${String(v.n).padStart(5)}  avg=${(v.ms / v.n).toFixed(2).padStart(8)}ms${share}`);
  }
}

for (const concurrency of [1, 8, 32]) await run(concurrency, 8);

await db.close();
await app.cleanup();
process.exit(0);
