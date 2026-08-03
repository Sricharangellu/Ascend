-- =============================================================================
-- Migration: 0001_foundation
-- Wave:      0 — Platform foundation
-- Owner:     DATABASE agent
-- Purpose:   Create platform tables: tenants, users, roles, audit_log,
--            feature_flags, idempotency_keys.
--
-- Rules enforced:
--   • Every business/user table carries tenant_id UUID NOT NULL (tenants itself
--     is the root — no tenant_id on it).
--   • Money columns: BIGINT cents.
--   • Timestamps:    BIGINT epoch ms.
--   • Primary keys:  TEXT uuid-v7 with table prefix.
--   • Idempotent:    CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.
--   • Every tenant-scoped table gets RLS enabled here; policies live in
--     db/rls/policies.sql (applied after migrations).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid() fallback
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";  -- query analytics

-- ---------------------------------------------------------------------------
-- 1. tenants  (root aggregate — no tenant_id on this table)
--    Prefix: tnt_
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenants (
    id          TEXT        PRIMARY KEY,          -- tnt_<uuidv7>
    name        TEXT        NOT NULL,
    slug        TEXT        NOT NULL UNIQUE,       -- URL-safe handle, e.g. "acme-cafe"
    tier        TEXT        NOT NULL DEFAULT 'starter',
                            -- 'starter' | 'professional' | 'enterprise'
    status      TEXT        NOT NULL DEFAULT 'active',
                            -- 'active' | 'suspended' | 'cancelled'
    region      TEXT        NOT NULL DEFAULT 'us-east-1',
    settings    JSONB       NOT NULL DEFAULT '{}',
    created_at  BIGINT      NOT NULL,             -- epoch ms
    updated_at  BIGINT      NOT NULL
);

CREATE INDEX IF NOT EXISTS tenants_slug_idx    ON tenants (slug);
CREATE INDEX IF NOT EXISTS tenants_status_idx  ON tenants (status);

-- ---------------------------------------------------------------------------
-- 2. roles  (tenant-scoped)
--    Prefix: role_
--    Canonical roles: owner | manager | cashier
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

CREATE INDEX IF NOT EXISTS roles_tenant_id_idx ON roles (tenant_id);

-- ---------------------------------------------------------------------------
-- 3. users  (tenant-scoped)
--    Prefix: usr_
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
    last_login_at   BIGINT,
    created_at      BIGINT      NOT NULL,
    updated_at      BIGINT      NOT NULL,

    CONSTRAINT users_tenant_email_uq UNIQUE (tenant_id, email)
);

CREATE INDEX IF NOT EXISTS users_tenant_id_idx          ON users (tenant_id);
CREATE INDEX IF NOT EXISTS users_tenant_email_idx       ON users (tenant_id, email);
CREATE INDEX IF NOT EXISTS users_tenant_status_idx      ON users (tenant_id, status);

-- ---------------------------------------------------------------------------
-- 4. audit_log  (tenant-scoped, append-only)
--    Prefix: aud_
--    Written on every mutating operation.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
    id              TEXT        PRIMARY KEY,      -- aud_<uuidv7>
    tenant_id       UUID        NOT NULL,
    actor_id        TEXT        NOT NULL,         -- usr_ id or 'system'
    action          TEXT        NOT NULL,         -- e.g. 'order.created', 'user.updated'
    entity_type     TEXT        NOT NULL,         -- e.g. 'order', 'product'
    entity_id       TEXT        NOT NULL,         -- the affected row id
    before_json     JSONB,                        -- null on INSERT
    after_json      JSONB,                        -- null on DELETE
    request_id      TEXT,                         -- correlates with HTTP trace
    ip_address      TEXT,
    ts              BIGINT      NOT NULL          -- epoch ms
);

-- Tenant-leading index is the primary read pattern (per-tenant audit trail).
CREATE INDEX IF NOT EXISTS audit_log_tenant_ts_idx
    ON audit_log (tenant_id, ts DESC);

CREATE INDEX IF NOT EXISTS audit_log_tenant_entity_idx
    ON audit_log (tenant_id, entity_type, entity_id);

CREATE INDEX IF NOT EXISTS audit_log_tenant_actor_idx
    ON audit_log (tenant_id, actor_id, ts DESC);

-- ---------------------------------------------------------------------------
-- 5. feature_flags  (tenant-scoped + global flags via tenant_id sentinel)
--    Prefix: ff_
--    Global flags use a well-known sentinel tenant_id:
--      '00000000-0000-0000-0000-000000000000'
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

CREATE INDEX IF NOT EXISTS feature_flags_tenant_id_idx
    ON feature_flags (tenant_id);

CREATE INDEX IF NOT EXISTS feature_flags_tenant_key_idx
    ON feature_flags (tenant_id, flag_key);

-- ---------------------------------------------------------------------------
-- 6. idempotency_keys  (tenant-scoped)
--    Used for safe payment retries and any at-most-once operation.
--    Expiry: application should purge rows older than 24 h.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS idempotency_keys (
    id              TEXT        PRIMARY KEY,      -- idk_<uuidv7>
    tenant_id       UUID        NOT NULL,
    key             TEXT        NOT NULL,         -- caller-supplied idempotency key
    request_hash    TEXT        NOT NULL,         -- SHA-256 of method+path+body
    response_json   JSONB,                        -- stored response (null while in-flight)
    status          TEXT        NOT NULL DEFAULT 'processing',
                                -- 'processing' | 'completed' | 'failed'
    ts              BIGINT      NOT NULL,         -- epoch ms of first request

    CONSTRAINT idempotency_keys_tenant_key_uq UNIQUE (tenant_id, key)
);

CREATE INDEX IF NOT EXISTS idempotency_keys_tenant_id_idx
    ON idempotency_keys (tenant_id);

CREATE INDEX IF NOT EXISTS idempotency_keys_tenant_key_idx
    ON idempotency_keys (tenant_id, key);

CREATE INDEX IF NOT EXISTS idempotency_keys_ts_idx
    ON idempotency_keys (ts);   -- for expiry sweeps

-- ---------------------------------------------------------------------------
-- 7. Row-Level Security — ENABLE (policies in db/rls/policies.sql)
--    Enabled here so the tables are RLS-active from the moment they exist.
--    A missing app.tenant_id setting will cause current_setting() to raise an
--    error (fail-closed) when error_missing_ok=false (the default).
-- ---------------------------------------------------------------------------
ALTER TABLE roles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log          ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_flags      ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys   ENABLE ROW LEVEL SECURITY;

-- tenants table: no RLS — readable by the gateway/service role to resolve tenancy.
-- Superuser / service accounts bypass RLS; app users go through policies.sql.

-- ---------------------------------------------------------------------------
-- End of migration 0001_foundation
-- ---------------------------------------------------------------------------
