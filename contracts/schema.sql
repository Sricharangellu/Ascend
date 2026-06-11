-- =============================================================================
-- contracts/schema.sql — Canonical DDL, Finder POS
-- Owner:   DATABASE agent  (sole editor of this file)
-- Readers: Backend agent (codes against this), Frontend agent (type-gen)
--
-- Change protocol (§4.3 of 00_EXECUTION_PROMPT_BOOK.md):
--   1. Database agent proposes change via ADR in db/adr/.
--   2. Orchestrator merges to main; records in contracts/CHANGELOG.md.
--   3. Contracts move forward only — additive first; breaking = new /v2.
--
-- Conventions (cross-cutting, must not be violated):
--   • tenant_id UUID NOT NULL on every business/user table.
--   • RLS REQUIRED on every tenant-scoped table (see db/rls/policies.sql).
--   • Money      → BIGINT cents.
--   • Timestamps → BIGINT epoch ms.
--   • Primary keys → TEXT uuid-v7 with table prefix.
--   • Migrations   → idempotent (CREATE TABLE IF NOT EXISTS).
--   • Indexes      → tenant-leading for every tenant-scoped table.
-- =============================================================================

-- ===========================================================================
-- WAVE 0 — Platform foundation
-- Migration: db/migrations/0001_foundation.sql
-- Published: 2026-06-11
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
-- CREATE EXTENSION IF NOT EXISTS "pgcrypto";
-- CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- ---------------------------------------------------------------------------
-- tenants  [platform]
-- Root aggregate. No tenant_id on this table.
-- RLS: NOT enabled — readable by gateway to resolve tenancy.
-- Prefix: tnt_
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenants (
    id          TEXT        PRIMARY KEY,          -- tnt_<uuidv7>
    name        TEXT        NOT NULL,
    slug        TEXT        NOT NULL UNIQUE,       -- URL-safe, e.g. "acme-cafe"
    tier        TEXT        NOT NULL DEFAULT 'starter',
                            -- 'starter' | 'professional' | 'enterprise'
    status      TEXT        NOT NULL DEFAULT 'active',
                            -- 'active' | 'suspended' | 'cancelled'
    region      TEXT        NOT NULL DEFAULT 'us-east-1',
    settings    JSONB       NOT NULL DEFAULT '{}',
    created_at  BIGINT      NOT NULL,             -- epoch ms
    updated_at  BIGINT      NOT NULL
);
-- Indexes:
--   tenants_slug_idx   ON tenants (slug)
--   tenants_status_idx ON tenants (status)

-- ---------------------------------------------------------------------------
-- roles  [identity]
-- Tenant-scoped. Canonical names: owner | manager | cashier
-- RLS: ENABLED (tenant_isolation policy in db/rls/policies.sql)
-- Prefix: role_
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
    id          TEXT        PRIMARY KEY,          -- role_<uuidv7>
    tenant_id   UUID        NOT NULL,
    name        TEXT        NOT NULL,             -- 'owner'|'manager'|'cashier'
    permissions JSONB       NOT NULL DEFAULT '[]',
    is_system   BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at  BIGINT      NOT NULL,
    updated_at  BIGINT      NOT NULL,

    CONSTRAINT roles_tenant_name_uq UNIQUE (tenant_id, name)
);
-- Tenant-leading index:
--   roles_tenant_id_idx ON roles (tenant_id)

-- ---------------------------------------------------------------------------
-- users  [identity]
-- Tenant-scoped. One user belongs to exactly one tenant.
-- RLS: ENABLED
-- Prefix: usr_
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id              TEXT        PRIMARY KEY,      -- usr_<uuidv7>
    tenant_id       UUID        NOT NULL,
    email           TEXT        NOT NULL,
    name            TEXT        NOT NULL,
    role_id         TEXT        NOT NULL REFERENCES roles(id),
    password_hash   TEXT,                         -- null = SSO-only
    status          TEXT        NOT NULL DEFAULT 'active',
                                -- 'active' | 'invited' | 'disabled'
    last_login_at   BIGINT,                       -- epoch ms, nullable
    created_at      BIGINT      NOT NULL,
    updated_at      BIGINT      NOT NULL,

    CONSTRAINT users_tenant_email_uq UNIQUE (tenant_id, email)
);
-- Tenant-leading indexes:
--   users_tenant_id_idx     ON users (tenant_id)
--   users_tenant_email_idx  ON users (tenant_id, email)
--   users_tenant_status_idx ON users (tenant_id, status)

-- ---------------------------------------------------------------------------
-- audit_log  [platform — written by every module]
-- Tenant-scoped, append-only. Written on every mutating operation.
-- Backend must write one row per mutation: (actor, action, entity, before, after)
-- RLS: ENABLED (SELECT + INSERT only; no UPDATE/DELETE for app role)
-- Prefix: aud_
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
    id              TEXT        PRIMARY KEY,      -- aud_<uuidv7>
    tenant_id       UUID        NOT NULL,
    actor_id        TEXT        NOT NULL,         -- usr_ id or 'system'
    action          TEXT        NOT NULL,         -- e.g. 'order.created'
    entity_type     TEXT        NOT NULL,         -- e.g. 'order'
    entity_id       TEXT        NOT NULL,         -- affected row id
    before_json     JSONB,                        -- null on INSERT
    after_json      JSONB,                        -- null on DELETE
    request_id      TEXT,                         -- HTTP trace correlation
    ip_address      TEXT,
    ts              BIGINT      NOT NULL          -- epoch ms
);
-- Tenant-leading indexes:
--   audit_log_tenant_ts_idx     ON audit_log (tenant_id, ts DESC)
--   audit_log_tenant_entity_idx ON audit_log (tenant_id, entity_type, entity_id)
--   audit_log_tenant_actor_idx  ON audit_log (tenant_id, actor_id, ts DESC)

-- ---------------------------------------------------------------------------
-- feature_flags  [platform]
-- Tenant-scoped + global (sentinel tenant_id = all-zeros UUID).
-- Global flags: tenant_id = '00000000-0000-0000-0000-000000000000'
-- RLS policy: tenant sees own flags AND global flags (read); writes own only.
-- RLS: ENABLED
-- Prefix: ff_
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feature_flags (
    id          TEXT        PRIMARY KEY,          -- ff_<uuidv7>
    tenant_id   UUID        NOT NULL,
    flag_key    TEXT        NOT NULL,             -- e.g. 'offline_checkout'
    enabled     BOOLEAN     NOT NULL DEFAULT FALSE,
    rollout_pct SMALLINT    NOT NULL DEFAULT 0 CHECK (rollout_pct BETWEEN 0 AND 100),
    payload     JSONB       NOT NULL DEFAULT '{}',
    description TEXT,
    created_at  BIGINT      NOT NULL,
    updated_at  BIGINT      NOT NULL,

    CONSTRAINT feature_flags_tenant_key_uq UNIQUE (tenant_id, flag_key)
);
-- Tenant-leading indexes:
--   feature_flags_tenant_id_idx  ON feature_flags (tenant_id)
--   feature_flags_tenant_key_idx ON feature_flags (tenant_id, flag_key)

-- ---------------------------------------------------------------------------
-- idempotency_keys  [platform — used by payments module]
-- Tenant-scoped. Enables safe at-most-once payment retries.
-- Application should purge rows older than 24 hours via a background job.
-- RLS: ENABLED
-- Prefix: idk_
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS idempotency_keys (
    id              TEXT        PRIMARY KEY,      -- idk_<uuidv7>
    tenant_id       UUID        NOT NULL,
    key             TEXT        NOT NULL,         -- caller-supplied key
    request_hash    TEXT        NOT NULL,         -- SHA-256(method+path+body)
    response_json   JSONB,                        -- null while in-flight
    status          TEXT        NOT NULL DEFAULT 'processing',
                                -- 'processing' | 'completed' | 'failed'
    ts              BIGINT      NOT NULL,         -- epoch ms of first request

    CONSTRAINT idempotency_keys_tenant_key_uq UNIQUE (tenant_id, key)
);
-- Tenant-leading indexes:
--   idempotency_keys_tenant_id_idx  ON idempotency_keys (tenant_id)
--   idempotency_keys_tenant_key_idx ON idempotency_keys (tenant_id, key)
--   idempotency_keys_ts_idx         ON idempotency_keys (ts)  -- expiry sweeps

-- ===========================================================================
-- WAVE 1 — Core commerce  (UPCOMING — db/migrations/0002_commerce.sql)
-- Tables below are PLACEHOLDERS showing the planned schema.
-- Do not execute this section against a live database yet.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- products  [catalog]
-- Ported from CONTRACTS.md with tenant_id + BIGINT money + audit columns.
-- RLS: ENABLED
-- Prefix: prod_
-- ---------------------------------------------------------------------------
-- CREATE TABLE IF NOT EXISTS products (
--     id           TEXT    PRIMARY KEY,             -- prod_<uuidv7>
--     tenant_id    UUID    NOT NULL,
--     sku          TEXT    NOT NULL,
--     name         TEXT    NOT NULL,
--     price_cents  BIGINT  NOT NULL,                -- cents
--     category     TEXT    NOT NULL DEFAULT 'general',
--     tax_class    TEXT    NOT NULL DEFAULT 'standard', -- 'standard'|'exempt'
--     barcode      TEXT,
--     status       TEXT    NOT NULL DEFAULT 'active',   -- 'active'|'draft'|'archived'
--     created_at   BIGINT  NOT NULL,
--     updated_at   BIGINT  NOT NULL,
--     CONSTRAINT products_tenant_sku_uq UNIQUE (tenant_id, sku)
-- );

-- ---------------------------------------------------------------------------
-- inventory  [inventory]
-- RLS: ENABLED
-- ---------------------------------------------------------------------------
-- CREATE TABLE IF NOT EXISTS inventory (
--     id          TEXT    PRIMARY KEY,             -- inv_<uuidv7>
--     tenant_id   UUID    NOT NULL,
--     product_id  TEXT    NOT NULL,
--     stock_qty   INTEGER NOT NULL DEFAULT 0,
--     reorder_pt  INTEGER NOT NULL DEFAULT 0,
--     updated_at  BIGINT  NOT NULL,
--     CONSTRAINT inventory_tenant_product_uq UNIQUE (tenant_id, product_id)
-- );

-- ---------------------------------------------------------------------------
-- inventory_movements  [inventory]
-- RLS: ENABLED
-- ---------------------------------------------------------------------------
-- CREATE TABLE IF NOT EXISTS inventory_movements (
--     id          TEXT    PRIMARY KEY,             -- ivm_<uuidv7>
--     tenant_id   UUID    NOT NULL,
--     product_id  TEXT    NOT NULL,
--     delta       INTEGER NOT NULL,               -- +receiving, -sale
--     reason      TEXT    NOT NULL,               -- 'receiving'|'sale'|'adjustment'|'return'
--     ref         TEXT,                           -- order id etc.
--     created_at  BIGINT  NOT NULL
-- );

-- ---------------------------------------------------------------------------
-- orders  [orders]
-- Status enum: 'open' | 'completed' | 'refunded' | 'voided'
-- State codes: CA | NY | TX | FL  (drives tax engine)
-- RLS: ENABLED
-- Prefix: ord_
-- ---------------------------------------------------------------------------
-- CREATE TABLE IF NOT EXISTS orders (
--     id             TEXT    PRIMARY KEY,          -- ord_<uuidv7>
--     tenant_id      UUID    NOT NULL,
--     order_number   TEXT    NOT NULL,
--     state_code     TEXT    NOT NULL,             -- CA|NY|TX|FL
--     status         TEXT    NOT NULL DEFAULT 'open',
--     subtotal_cents BIGINT  NOT NULL,
--     discount_cents BIGINT  NOT NULL DEFAULT 0,
--     tax_cents      BIGINT  NOT NULL,
--     total_cents    BIGINT  NOT NULL,
--     customer_id    TEXT,
--     created_at     BIGINT  NOT NULL,
--     updated_at     BIGINT  NOT NULL
-- );

-- ---------------------------------------------------------------------------
-- order_lines  [orders]
-- RLS: ENABLED
-- Prefix: oln_
-- ---------------------------------------------------------------------------
-- CREATE TABLE IF NOT EXISTS order_lines (
--     id           TEXT    PRIMARY KEY,            -- oln_<uuidv7>
--     tenant_id    UUID    NOT NULL,
--     order_id     TEXT    NOT NULL,
--     product_id   TEXT    NOT NULL,
--     name         TEXT    NOT NULL,
--     quantity     INTEGER NOT NULL,
--     unit_cents   BIGINT  NOT NULL,
--     tax_cents    BIGINT  NOT NULL,
--     line_cents   BIGINT  NOT NULL,              -- (unit*qty) - line discount
--     taxable      BOOLEAN NOT NULL
-- );

-- ---------------------------------------------------------------------------
-- payments  [payments]
-- Method: 'cash' | 'card' | 'split'
-- Status: 'captured' | 'declined'
-- Idempotency: always look up idempotency_keys before inserting.
-- RLS: ENABLED
-- Prefix: pay_
-- ---------------------------------------------------------------------------
-- CREATE TABLE IF NOT EXISTS payments (
--     id            TEXT    PRIMARY KEY,           -- pay_<uuidv7>
--     tenant_id     UUID    NOT NULL,
--     order_id      TEXT    NOT NULL,
--     method        TEXT    NOT NULL,              -- 'cash'|'card'|'split'
--     amount_cents  BIGINT  NOT NULL,
--     cash_cents    BIGINT  NOT NULL DEFAULT 0,
--     card_cents    BIGINT  NOT NULL DEFAULT 0,
--     change_cents  BIGINT  NOT NULL DEFAULT 0,
--     card_last4    TEXT,
--     auth_code     TEXT,
--     status        TEXT    NOT NULL,              -- 'captured'|'declined'
--     created_at    BIGINT  NOT NULL
-- );

-- ---------------------------------------------------------------------------
-- sync_queue  [sync]
-- Outbox table. Events are appended by the EventBus onAny handler.
-- status: 'pending' | 'synced' | 'failed'
-- RLS: ENABLED
-- Prefix: sq_  (id is BIGSERIAL for ordering; queue semantics)
-- ---------------------------------------------------------------------------
-- CREATE TABLE IF NOT EXISTS sync_queue (
--     id                BIGSERIAL PRIMARY KEY,
--     tenant_id         UUID    NOT NULL,
--     event_type        TEXT    NOT NULL,
--     payload           JSONB   NOT NULL,
--     status            TEXT    NOT NULL DEFAULT 'pending',
--     attempts          INTEGER NOT NULL DEFAULT 0,
--     created_at        BIGINT  NOT NULL,
--     last_attempted_at BIGINT
-- );

-- ===========================================================================
-- END OF SCHEMA
-- ===========================================================================
