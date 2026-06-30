/**
 * E2E seed script — provisions a demo tenant + owner user for Playwright tests.
 *
 * Run after the backend has started (migrations are applied on startup).
 * Bypasses the NODE_ENV=production guard in identityModule.seedDemo() because
 * the CI E2E job deliberately runs in production mode to test the real build.
 *
 * Idempotent: ON CONFLICT DO NOTHING everywhere, safe to run multiple times.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... tsx scripts/seed-e2e.ts
 */

import { openDb } from "../src/shared/db.js";
import bcrypt from "bcryptjs";

const DEMO_TENANT_ID = "tnt_demo";
const DEMO_EMAIL = "owner@finder-pos.dev";
const DEMO_PASSWORD = "FinderDemo!2026";

async function main() {
  const db = openDb();
  try {
    const now = Date.now();

    // Tenant
    await db.query(
      `INSERT INTO tenants (id, name, slug, created_at, updated_at)
       VALUES (@id, @name, @slug, @c, @u)
       ON CONFLICT (id) DO NOTHING`,
      { id: DEMO_TENANT_ID, name: "Demo Store", slug: "demo", c: now, u: now },
    );

    // Owner user
    const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
    await db.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, role, created_at, updated_at)
       VALUES (@id, @t, @e, @h, @r, @c, @u)
       ON CONFLICT (tenant_id, email) DO NOTHING`,
      {
        id: "usr_demo_owner",
        t: DEMO_TENANT_ID,
        e: DEMO_EMAIL,
        h: hash,
        r: "owner",
        c: now,
        u: now,
      },
    );

    // Demo products (searchable in checkout E2E test — at least one with "coffee")
    const products = [
      { id: "prd_demo_001", sku: "GRO-COFFEE-001", name: "Organic Dark Roast Coffee Beans", price_cents: 1499, category: "groceries", barcode: "0123456789012" },
      { id: "prd_demo_002", sku: "GRO-HONEY-001",  name: "Wildflower Honey",                 price_cents:  899, category: "groceries", barcode: "0123456789029" },
      { id: "prd_demo_003", sku: "APP-SHIRT-001",  name: "Finder Logo T-Shirt",              price_cents: 2200, category: "apparel",   barcode: "0123456789036" },
      { id: "prd_demo_004", sku: "HOME-MUG-001",   name: "Ceramic Coffee Mug",               price_cents: 1200, category: "home",      barcode: "0123456789043" },
    ];
    for (const p of products) {
      await db.query(
        `INSERT INTO products (id, tenant_id, sku, name, price_cents, category, tax_class, barcode, status, created_at, updated_at)
         VALUES (@id, @t, @sku, @name, @price, @cat, 'standard', @barcode, 'active', @c, @u)
         ON CONFLICT (tenant_id, sku) DO NOTHING`,
        { id: p.id, t: DEMO_TENANT_ID, sku: p.sku, name: p.name, price: p.price_cents, cat: p.category, barcode: p.barcode, c: now, u: now },
      );
    }

    console.log("E2E seed complete — demo tenant, owner user, and 4 products ready.");
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error("seed-e2e failed:", err);
  process.exit(1);
});
