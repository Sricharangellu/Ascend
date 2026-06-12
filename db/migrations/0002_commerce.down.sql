-- =============================================================================
-- Rollback: 0002_commerce
-- Wave:     1 — Core commerce schema
-- Owner:    DATABASE agent
--
-- Drop commerce tables in reverse-dependency order:
--   sync_queue        — no dependents
--   payments          — depends on orders (logically; no FK enforced)
--   order_lines       — depends on orders and products (logical)
--   orders            — no upstream dependents in this migration
--   inventory_movements — depends on products (logical)
--   inventory         — depends on products (logical)
--   products          — root commerce entity
--
-- NOTE: BIGSERIAL sequences created with sync_queue are dropped automatically
-- when the table is dropped (PostgreSQL drops owned sequences with the table).
-- =============================================================================

DROP TABLE IF EXISTS sync_queue;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS order_lines;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS inventory_movements;
DROP TABLE IF EXISTS inventory;
DROP TABLE IF EXISTS products;

-- ---------------------------------------------------------------------------
-- End of rollback 0002_commerce
-- ---------------------------------------------------------------------------
