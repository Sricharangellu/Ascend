-- =============================================================================
-- Migration: 0002_commerce
-- Wave:      1 — Core commerce schema
-- Owner:     DATABASE agent
-- Purpose:   Create tenant-scoped commerce tables:
--              products, inventory, inventory_movements,
--              orders, order_lines, payments, sync_queue
--
-- TENANT-ID CONVENTION (reconciled, ratified 2026-06-12)
-- ───────────────────────────────────────────────────────
-- Wave 1 and all future tables use:
--   tenant_id TEXT NOT NULL
-- The live system's demo tenant is 'tnt_demo'.  TEXT avoids a UUID-type
-- mismatch on the tenants.id column (also TEXT with tnt_ prefix).  RLS
-- policies in db/rls/policies.sql compare TEXT ↔ TEXT with NO ::uuid cast.
--   CORRECT:   USING (tenant_id = current_setting('app.tenant_id'))
--   WRONG:     USING (tenant_id = current_setting('app.tenant_id')::uuid)
--
-- Rules enforced:
--   • tenant_id TEXT NOT NULL on every table (Wave 1+ convention).
--   • Money columns: BIGINT cents. Timestamps: BIGINT epoch ms.
--   • Primary keys: TEXT uuid-v7 with table prefix.
--   • Idempotent: CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.
--   • RLS ENABLED here; policies in db/rls/policies.sql.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. products  [catalog]
--    Prefix: prod_
--    Domain rules:
--      • category = 'groceries' → tax_class must be 'exempt'
--        (enforced at application layer and by CHECK constraint below)
--      • UNIQUE (tenant_id, sku)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
    id           TEXT    NOT NULL,
    tenant_id    TEXT    NOT NULL,              -- tnt_<slug>, e.g. 'tnt_demo'
    sku          TEXT    NOT NULL,
    name         TEXT    NOT NULL,
    price_cents  BIGINT  NOT NULL,              -- cents; must be >= 0
    category     TEXT    NOT NULL DEFAULT 'general',
    tax_class    TEXT    NOT NULL DEFAULT 'standard',
                         -- CHECK: 'standard' | 'exempt'
                         -- grocery rule: category='groceries' → tax_class='exempt'
    barcode      TEXT,
    status       TEXT    NOT NULL DEFAULT 'active',
                         -- 'active' | 'draft' | 'archived'
    created_at   BIGINT  NOT NULL,              -- epoch ms
    updated_at   BIGINT  NOT NULL,              -- epoch ms

    CONSTRAINT products_pk PRIMARY KEY (id),
    CONSTRAINT products_tenant_sku_uq UNIQUE (tenant_id, sku),
    CONSTRAINT products_price_nonneg CHECK (price_cents >= 0),
    CONSTRAINT products_tax_class_values CHECK (tax_class IN ('standard', 'exempt')),
    CONSTRAINT products_status_values CHECK (status IN ('active', 'draft', 'archived')),
    -- Grocery rule: groceries must be exempt; non-groceries may be either class.
    CONSTRAINT products_grocery_exempt CHECK (
        category <> 'groceries' OR tax_class = 'exempt'
    )
);

-- Tenant-leading indexes
CREATE INDEX IF NOT EXISTS products_tenant_sku_idx
    ON products (tenant_id, sku);

CREATE INDEX IF NOT EXISTS products_tenant_status_created_idx
    ON products (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS products_tenant_category_idx
    ON products (tenant_id, category);

CREATE INDEX IF NOT EXISTS products_barcode_idx
    ON products (barcode)
    WHERE barcode IS NOT NULL;

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2. inventory  [inventory]
--    One row per (tenant_id, product_id) pair.
--    stock_qty is updated in-place; history is in inventory_movements.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory (
    product_id   TEXT    NOT NULL,
    tenant_id    TEXT    NOT NULL,
    stock_qty    INTEGER NOT NULL DEFAULT 0,
    reorder_pt   INTEGER NOT NULL DEFAULT 0,
    updated_at   BIGINT  NOT NULL,              -- epoch ms

    CONSTRAINT inventory_pk PRIMARY KEY (tenant_id, product_id),
    CONSTRAINT inventory_stock_nonneg CHECK (stock_qty >= 0),
    CONSTRAINT inventory_reorder_nonneg CHECK (reorder_pt >= 0)
);

-- Tenant-leading indexes
CREATE INDEX IF NOT EXISTS inventory_tenant_product_idx
    ON inventory (tenant_id, product_id);

CREATE INDEX IF NOT EXISTS inventory_tenant_reorder_idx
    ON inventory (tenant_id, stock_qty)
    WHERE stock_qty <= reorder_pt;   -- partial index: low-stock alert query

ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3. inventory_movements  [inventory]
--    Append-only ledger. Never updated or deleted.
--    Prefix: ivm_
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_movements (
    id           TEXT    NOT NULL,
    tenant_id    TEXT    NOT NULL,
    product_id   TEXT    NOT NULL,
    delta        INTEGER NOT NULL,
                         -- positive: receiving/return; negative: sale/adjustment
    reason       TEXT    NOT NULL,
                         -- 'receiving' | 'sale' | 'adjustment' | 'return'
    ref          TEXT,   -- order_id for sale/return; PO ref for receiving; etc.
    created_at   BIGINT  NOT NULL,              -- epoch ms

    CONSTRAINT inventory_movements_pk PRIMARY KEY (id),
    CONSTRAINT inventory_movements_reason_values
        CHECK (reason IN ('receiving', 'sale', 'adjustment', 'return'))
);

-- Tenant-leading indexes
CREATE INDEX IF NOT EXISTS ivm_tenant_product_created_idx
    ON inventory_movements (tenant_id, product_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ivm_tenant_created_idx
    ON inventory_movements (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ivm_tenant_ref_idx
    ON inventory_movements (tenant_id, ref)
    WHERE ref IS NOT NULL;

ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 4. orders  [orders]
--    Prefix: ord_
--    State codes: CA | NY | TX | FL  (drives tax engine)
--    Status lifecycle: open → completed → refunded | voided
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
    id             TEXT    NOT NULL,
    tenant_id      TEXT    NOT NULL,
    order_number   TEXT    NOT NULL,
    state_code     TEXT    NOT NULL,
                           -- 'CA' | 'NY' | 'TX' | 'FL'
    status         TEXT    NOT NULL DEFAULT 'open',
                           -- 'open' | 'completed' | 'refunded' | 'voided'
    subtotal_cents BIGINT  NOT NULL,
    discount_cents BIGINT  NOT NULL DEFAULT 0,
    tax_cents      BIGINT  NOT NULL DEFAULT 0,
    total_cents    BIGINT  NOT NULL,
    customer_id    TEXT,                        -- nullable; loyalty hook (Wave 2+)
    created_at     BIGINT  NOT NULL,            -- epoch ms
    updated_at     BIGINT  NOT NULL,            -- epoch ms

    CONSTRAINT orders_pk PRIMARY KEY (id),
    CONSTRAINT orders_tenant_number_uq UNIQUE (tenant_id, order_number),
    CONSTRAINT orders_state_code_values
        CHECK (state_code IN ('CA', 'NY', 'TX', 'FL')),
    CONSTRAINT orders_status_values
        CHECK (status IN ('open', 'completed', 'refunded', 'voided')),
    CONSTRAINT orders_subtotal_nonneg CHECK (subtotal_cents >= 0),
    CONSTRAINT orders_discount_nonneg CHECK (discount_cents >= 0),
    CONSTRAINT orders_tax_nonneg      CHECK (tax_cents >= 0),
    CONSTRAINT orders_total_nonneg    CHECK (total_cents >= 0)
);

-- Tenant-leading indexes
CREATE INDEX IF NOT EXISTS orders_tenant_status_created_idx
    ON orders (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS orders_tenant_created_idx
    ON orders (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS orders_tenant_number_idx
    ON orders (tenant_id, order_number);

CREATE INDEX IF NOT EXISTS orders_tenant_customer_idx
    ON orders (tenant_id, customer_id)
    WHERE customer_id IS NOT NULL;

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 5. order_lines  [orders]
--    Line items belonging to an order.
--    Prefix: oln_
--    qty and unit_price_cents are the source of truth; line_total_cents is
--    stored (denormalized) for performance — must equal qty * unit_price_cents
--    minus any per-line discount (enforced at application layer).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_lines (
    id               TEXT    NOT NULL,
    tenant_id        TEXT    NOT NULL,
    order_id         TEXT    NOT NULL,
    product_id       TEXT    NOT NULL,
    qty              INTEGER NOT NULL,
    unit_price_cents BIGINT  NOT NULL,          -- cents at time of sale
    line_total_cents BIGINT  NOT NULL,          -- (unit_price * qty) − line discount

    CONSTRAINT order_lines_pk PRIMARY KEY (id),
    CONSTRAINT order_lines_qty_pos     CHECK (qty > 0),
    CONSTRAINT order_lines_unit_nonneg CHECK (unit_price_cents >= 0),
    CONSTRAINT order_lines_total_nonneg CHECK (line_total_cents >= 0)
);

-- Tenant-leading indexes
CREATE INDEX IF NOT EXISTS oln_tenant_order_idx
    ON order_lines (tenant_id, order_id);

CREATE INDEX IF NOT EXISTS oln_tenant_product_idx
    ON order_lines (tenant_id, product_id);

ALTER TABLE order_lines ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 6. payments  [payments]
--    Prefix: pay_
--    One payment row per tender action.  Split tender creates one row with
--    method='split'; cash_cents + card_cents = amount_cents in that case.
--    Idempotency: the backend looks up idempotency_keys before inserting.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
    id             TEXT    NOT NULL,
    tenant_id      TEXT    NOT NULL,
    order_id       TEXT    NOT NULL,
    method         TEXT    NOT NULL,
                           -- 'cash' | 'card' | 'split'
    amount_cents   BIGINT  NOT NULL,            -- total tendered toward order
    tendered_cents BIGINT  NOT NULL DEFAULT 0,  -- cash tendered (for change calc)
    change_cents   BIGINT  NOT NULL DEFAULT 0,  -- change given back
    status         TEXT    NOT NULL,
                           -- 'captured' | 'declined' | 'refunded'
    created_at     BIGINT  NOT NULL,            -- epoch ms

    CONSTRAINT payments_pk PRIMARY KEY (id),
    CONSTRAINT payments_method_values
        CHECK (method IN ('cash', 'card', 'split')),
    CONSTRAINT payments_status_values
        CHECK (status IN ('captured', 'declined', 'refunded')),
    CONSTRAINT payments_amount_nonneg   CHECK (amount_cents >= 0),
    CONSTRAINT payments_tendered_nonneg CHECK (tendered_cents >= 0),
    CONSTRAINT payments_change_nonneg   CHECK (change_cents >= 0)
);

-- Tenant-leading indexes
CREATE INDEX IF NOT EXISTS payments_tenant_order_idx
    ON payments (tenant_id, order_id);

CREATE INDEX IF NOT EXISTS payments_tenant_status_created_idx
    ON payments (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS payments_tenant_created_idx
    ON payments (tenant_id, created_at DESC);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 7. sync_queue  [sync]
--    Offline outbox.  The EventBus onAny handler appends every domain event
--    here.  The push worker marks rows 'synced' when connectivity is restored.
--    id is BIGSERIAL so queue ordering is deterministic without a separate
--    sort column.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_queue (
    id                BIGSERIAL PRIMARY KEY,
    tenant_id         TEXT    NOT NULL,
    event_type        TEXT    NOT NULL,
    payload           JSONB   NOT NULL,
    status            TEXT    NOT NULL DEFAULT 'pending',
                              -- 'pending' | 'synced' | 'failed'
    attempts          INTEGER NOT NULL DEFAULT 0,
    created_at        BIGINT  NOT NULL,         -- epoch ms
    last_attempted_at BIGINT,                   -- epoch ms, nullable

    CONSTRAINT sync_queue_status_values
        CHECK (status IN ('pending', 'synced', 'failed')),
    CONSTRAINT sync_queue_attempts_nonneg CHECK (attempts >= 0)
);

-- Tenant-leading indexes
CREATE INDEX IF NOT EXISTS sq_tenant_status_created_idx
    ON sync_queue (tenant_id, status, created_at ASC);
                  -- ASC: push worker processes oldest-first

CREATE INDEX IF NOT EXISTS sq_tenant_event_type_idx
    ON sync_queue (tenant_id, event_type);

ALTER TABLE sync_queue ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- End of migration 0002_commerce
-- ---------------------------------------------------------------------------
