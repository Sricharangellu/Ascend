-- =============================================================================
-- Rollback: 0001_foundation
-- Wave:     0 — Platform foundation
-- =============================================================================
-- Drop in reverse dependency order.
-- idempotency_keys and feature_flags have no dependents.
-- users references roles, so drop users before roles.
-- audit_log is standalone.

DROP TABLE IF EXISTS idempotency_keys;
DROP TABLE IF EXISTS feature_flags;
DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS roles;
DROP TABLE IF EXISTS tenants;

-- Extensions: leave installed — they may be used by other migrations.
-- DROP EXTENSION IF EXISTS "pgcrypto";
-- DROP EXTENSION IF EXISTS "pg_stat_statements";

-- ---------------------------------------------------------------------------
-- End of rollback 0001_foundation
-- ---------------------------------------------------------------------------
