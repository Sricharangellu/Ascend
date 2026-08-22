-- Scale seed for the Ascend performance audit.
--
-- Generates a production-shaped dataset directly in SQL (fast: ~20s for the
-- default size) so query plans are measured against real table sizes rather
-- than an empty schema. Sizes are chosen to model the 20,000-user target:
-- 40 tenants, 2,000 products each, ~7 order lines per order.
--
--   psql "$DATABASE_URL" -v tenants=40 -v products=2000 -v orders=25000 \
--        -f scripts/perf/seed-scale.sql
--
-- Every row is written under tenant ids of the form `t_perf_<n>` so the seed
-- can be removed with a single DELETE ... WHERE tenant_id LIKE 't_perf_%'.
\set ON_ERROR_STOP on
\if :{?tenants}  \else \set tenants 40    \endif
\if :{?products} \else \set products 2000 \endif
\if :{?orders}   \else \set orders 25000  \endif

BEGIN;

DELETE FROM subscriptions WHERE tenant_id LIKE 't_perf_%';
DELETE FROM order_lines WHERE tenant_id LIKE 't_perf_%';
DELETE FROM payments    WHERE tenant_id LIKE 't_perf_%';
DELETE FROM orders      WHERE tenant_id LIKE 't_perf_%';
DELETE FROM inventory   WHERE tenant_id LIKE 't_perf_%';
DELETE FROM inventory_movements WHERE tenant_id LIKE 't_perf_%';
DELETE FROM products    WHERE tenant_id LIKE 't_perf_%';
DELETE FROM customers   WHERE tenant_id LIKE 't_perf_%';

-- ── Tenants + subscriptions ─────────────────────────────────────────────────
-- The plan matters to what is being measured: the per-tenant rate limiter sizes
-- its bucket from the subscription tier, so a load test against a tenant with
-- no subscription row measures the `standard` ceiling (10 req/s) rather than
-- the application.
INSERT INTO tenants (id, name, slug, created_at, updated_at)
SELECT 't_perf_' || t, 'Perf Tenant ' || t, 'perf-' || t, 1700000000000, 1700000000000
FROM generate_series(1, :tenants) t
ON CONFLICT (id) DO NOTHING;

INSERT INTO subscriptions (id, tenant_id, plan, status, max_users, max_registers, max_outlets, created_at, updated_at)
SELECT 'sub_perf_' || t, 't_perf_' || t,
       CASE WHEN t % 10 = 3 THEN 'enterprise' WHEN t % 5 = 0 THEN 'professional' ELSE 'growth' END,
       'active', 500, 50, 20, 1700000000000, 1700000000000
FROM generate_series(1, :tenants) t;

-- ── Products ────────────────────────────────────────────────────────────────
INSERT INTO products (id, tenant_id, sku, name, price_cents, tax_class,
                      status, category, brand, barcode, created_at, updated_at)
SELECT
  't_perf_' || t || '_prd_' || p,
  't_perf_' || t,
  'SKU-' || t || '-' || p,
  (ARRAY['Cola','Chips','Bread','Milk','Coffee','Tea','Soap','Shampoo','Battery','Notebook'])[1 + (p % 10)]
    || ' ' || (ARRAY['Small','Medium','Large','Family','Travel'])[1 + (p % 5)] || ' #' || p,
  100 + (p * 37) % 9900,
  CASE WHEN p % 11 = 0 THEN 'exempt' ELSE 'standard' END,
  CASE WHEN p % 50 = 0 THEN 'archived' ELSE 'active' END,
  (ARRAY['beverages','snacks','bakery','dairy','household','stationery'])[1 + (p % 6)],
  (ARRAY['Acme','Globex','Initech','Umbrella','Stark'])[1 + (p % 5)],
  lpad(((t * 1000000) + p)::text, 12, '0'),
  1700000000000 + p * 1000,
  1700000000000 + p * 1000
FROM generate_series(1, :tenants) t, generate_series(1, :products) p;

INSERT INTO inventory (product_id, tenant_id, stock_qty, reorder_pt, updated_at, safety_stock)
SELECT id, tenant_id, 500 + (('x' || substr(md5(id), 1, 6))::bit(24)::int % 500), 20, 1700000000000, 5
FROM products WHERE tenant_id LIKE 't_perf_%';

-- ── Customers ───────────────────────────────────────────────────────────────
INSERT INTO customers (id, tenant_id, name, email, phone, created_at, updated_at)
SELECT
  't_perf_' || t || '_cus_' || c,
  't_perf_' || t,
  'Customer ' || c,
  'customer' || c || '@tenant' || t || '.test',
  '555' || lpad(c::text, 7, '0'),
  1700000000000 + c * 1000,
  1700000000000 + c * 1000
FROM generate_series(1, :tenants) t, generate_series(1, 500) c;

-- ── Orders + lines ──────────────────────────────────────────────────────────
INSERT INTO orders (id, tenant_id, order_number, state_code, status, subtotal_cents,
                    discount_cents, tax_cents, total_cents, customer_id, store_id,
                    created_at, updated_at, currency, exchange_rate)
SELECT
  't_perf_' || t || '_ord_' || o,
  't_perf_' || t,
  'FP-' || t || '-' || o,
  'CA',
  CASE WHEN o % 20 = 0 THEN 'open' WHEN o % 97 = 0 THEN 'voided' ELSE 'completed' END,
  1000, 0, 90, 1090,
  't_perf_' || t || '_cus_' || (1 + (o % 500)),
  'store_' || (1 + (o % 4)),
  1700000000000 + o * 60000,
  1700000000000 + o * 60000,
  'USD', 1.0
FROM generate_series(1, :tenants) t, generate_series(1, :orders) o;

INSERT INTO order_lines (id, tenant_id, order_id, product_id, name, quantity,
                         unit_cents, tax_cents, line_cents, taxable)
SELECT
  o.id || '_ln_' || l,
  o.tenant_id,
  o.id,
  o.tenant_id || '_prd_' || (1 + ((('x' || substr(md5(o.id || l::text), 1, 6))::bit(24)::int) % :products)),
  'line ' || l,
  1 + (l % 3),
  199, 18, 217, 1
FROM orders o, generate_series(1, 7) l
WHERE o.tenant_id LIKE 't_perf_%';

-- ── Payments ────────────────────────────────────────────────────────────────
INSERT INTO payments (id, tenant_id, order_id, method, amount_cents, status, created_at)
SELECT o.id || '_pay', o.tenant_id, o.id, 'card', o.total_cents, 'captured', o.created_at
FROM orders o WHERE o.tenant_id LIKE 't_perf_%' AND o.status = 'completed';

-- ── Inventory movements (the highest-growth ledger table) ───────────────────
INSERT INTO inventory_movements (id, tenant_id, product_id, delta, reason, ref, created_at)
SELECT ol.id || '_mv', ol.tenant_id, ol.product_id, -ol.quantity, 'sale', ol.order_id,
       o.created_at
FROM order_lines ol JOIN orders o ON o.id = ol.order_id
WHERE ol.tenant_id LIKE 't_perf_%' AND o.status = 'completed';

COMMIT;

ANALYZE products;
ANALYZE inventory;
ANALYZE orders;
ANALYZE order_lines;
ANALYZE payments;
ANALYZE inventory_movements;
ANALYZE customers;

SELECT 'products' AS table, count(*) FROM products WHERE tenant_id LIKE 't_perf_%'
UNION ALL SELECT 'orders', count(*) FROM orders WHERE tenant_id LIKE 't_perf_%'
UNION ALL SELECT 'order_lines', count(*) FROM order_lines WHERE tenant_id LIKE 't_perf_%'
UNION ALL SELECT 'payments', count(*) FROM payments WHERE tenant_id LIKE 't_perf_%'
UNION ALL SELECT 'inventory_movements', count(*) FROM inventory_movements WHERE tenant_id LIKE 't_perf_%'
UNION ALL SELECT 'customers', count(*) FROM customers WHERE tenant_id LIKE 't_perf_%';
