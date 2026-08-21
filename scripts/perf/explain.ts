/**
 * EXPLAIN (ANALYZE) harness for the queries on Ascend's latency-critical paths.
 *
 * Every entry here is a query that was measured against a production-shaped
 * dataset (see `seed-scale.sql`) during the 20k-user scalability audit. Keeping
 * them in one runnable file means a future change that reintroduces a
 * sequential scan on a hot path is one command away from being caught, instead
 * of being found again in production.
 *
 *   psql "$DATABASE_URL" -f scripts/perf/seed-scale.sql
 *   DATABASE_URL=... TENANT=t_perf_3 npx tsx scripts/perf/explain.ts
 *
 * Exit code is non-zero when a query exceeds its budget or its plan contains a
 * sequential scan of a table listed in `noSeqScan`, so this can gate CI.
 */
import pg from "pg";

const TENANT = process.env["TENANT"] ?? "t_perf_3";

interface Case {
  name: string;
  /** What breaks if this regresses. */
  why: string;
  sql: string;
  params: unknown[];
  /** Fail if execution time exceeds this (ms). */
  budgetMs: number;
  /** Fail if the plan sequentially scans any of these tables. */
  noSeqScan: string[];
}

const PRODUCTS = [`${TENANT}_prd_11`, `${TENANT}_prd_12`, `${TENANT}_prd_13`];

const CASES: Case[] = [
  {
    name: "pos.checkout/stock-check",
    why: "Runs on every POS order creation. Was a per-product sequential scan of order_lines.",
    budgetMs: 50,
    noSeqScan: ["order_lines", "orders"],
    sql: `SELECT i.product_id, i.stock_qty, COALESCE(c.committed, 0) AS committed
            FROM inventory i
            LEFT JOIN (
              SELECT ol.product_id, SUM(ol.quantity) AS committed
                FROM order_lines ol
                JOIN orders o ON o.tenant_id = ol.tenant_id AND o.id = ol.order_id
               WHERE ol.tenant_id = $1 AND ol.product_id = ANY($2)
                 AND o.status NOT IN ('completed','voided','refunded')
               GROUP BY ol.product_id
            ) c ON c.product_id = i.product_id
           WHERE i.tenant_id = $3 AND i.product_id = ANY($4)`,
    params: [TENANT, PRODUCTS, TENANT, PRODUCTS],
  },
  {
    name: "inventory.levels/page",
    why: "Default inventory screen. Was aggregating every order line in the tenant per page.",
    budgetMs: 150,
    noSeqScan: ["order_lines"],
    sql: `SELECT p.id, p.sku, p.name, COALESCE(i.stock_qty,0) AS stock_qty,
                 COALESCE(res.committed,0) AS committed
            FROM products p
            LEFT JOIN inventory i ON i.product_id = p.id AND i.tenant_id = p.tenant_id
            LEFT JOIN (
              SELECT ol.product_id, SUM(ol.quantity) AS committed
                FROM orders o
                JOIN order_lines ol ON ol.tenant_id = o.tenant_id AND ol.order_id = o.id
               WHERE o.tenant_id = $1 AND o.status NOT IN ('completed','voided','refunded')
               GROUP BY ol.product_id
            ) res ON res.product_id = p.id
           WHERE p.tenant_id = $2 AND p.status = 'active'
           ORDER BY p.name ASC, p.id ASC LIMIT 100`,
    params: [TENANT, TENANT],
  },
  {
    name: "orders.list/page",
    why: "Order history list, ordered by recency — must seek the index, not sort the table.",
    budgetMs: 50,
    noSeqScan: ["orders"],
    sql: `SELECT id, order_number, status, total_cents, created_at
            FROM orders WHERE tenant_id = $1
           ORDER BY created_at DESC, id DESC LIMIT 50`,
    params: [TENANT],
  },
  {
    name: "catalog.list/page",
    why: "Product catalog list — the most-hit read in the app.",
    budgetMs: 50,
    noSeqScan: ["products"],
    sql: `SELECT id, sku, name, price_cents, status FROM products
           WHERE tenant_id = $1 AND status = 'active'
           ORDER BY created_at DESC, id DESC LIMIT 50`,
    params: [TENANT],
  },
  {
    name: "order.detail/lines",
    why: "Receipt + order detail. One index seek per order, never a scan.",
    budgetMs: 25,
    noSeqScan: ["order_lines"],
    sql: `SELECT * FROM order_lines WHERE tenant_id = $1 AND order_id = $2 ORDER BY id ASC`,
    params: [TENANT, `${TENANT}_ord_42`],
  },
  {
    name: "inventory.movements/product-history",
    why: "The highest-growth ledger table; product history must stay index-driven.",
    budgetMs: 25,
    noSeqScan: ["inventory_movements"],
    sql: `SELECT id, delta, reason, created_at FROM inventory_movements
           WHERE tenant_id = $1 AND product_id = $2
           ORDER BY created_at DESC LIMIT 50`,
    params: [TENANT, `${TENANT}_prd_11`],
  },
];

interface PlanNode {
  "Node Type": string;
  "Relation Name"?: string;
  Plans?: PlanNode[];
}

function seqScannedTables(node: PlanNode, out: Set<string> = new Set()): Set<string> {
  if (node["Node Type"]?.includes("Seq Scan") && node["Relation Name"]) out.add(node["Relation Name"]);
  for (const child of node.Plans ?? []) seqScannedTables(child, out);
  return out;
}

async function main(): Promise<void> {
  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const client = new pg.Client({ connectionString });
  await client.connect();

  let failures = 0;
  for (const c of CASES) {
    // Run once to warm the cache, then measure — a cold buffer pool measures
    // the disk, not the plan.
    await client.query(c.sql, c.params as never[]);
    const res = await client.query(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${c.sql}`,
      c.params as never[],
    );
    const plan = (res.rows[0] as Record<string, [{ Plan: PlanNode; "Execution Time": number }]>)["QUERY PLAN"]![0]!;
    const ms = plan["Execution Time"];
    const scanned = [...seqScannedTables(plan.Plan)].filter((t) => c.noSeqScan.includes(t));

    const slow = ms > c.budgetMs;
    const bad = scanned.length > 0;
    if (slow || bad) failures++;
    const verdict = slow || bad ? "FAIL" : "ok  ";
    console.log(`${verdict} ${c.name.padEnd(36)} ${ms.toFixed(2).padStart(9)} ms  (budget ${c.budgetMs} ms)`);
    if (bad) console.log(`       sequential scan on: ${scanned.join(", ")} — ${c.why}`);
    if (slow) console.log(`       over budget — ${c.why}`);
  }

  await client.end();
  if (failures > 0) {
    console.error(`\n${failures} of ${CASES.length} critical queries failed their plan/latency budget.`);
    process.exit(1);
  }
  console.log(`\nAll ${CASES.length} critical queries within budget.`);
}

void main();
