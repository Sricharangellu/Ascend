-- =============================================================================
-- Row-Level Security Policies — Finder POS
-- Wave:  0 — Platform foundation
-- Owner: DATABASE agent
--
-- DESIGN INTENT
-- ─────────────
-- Every tenant-scoped table has exactly one isolation policy. The policy
-- expression reads the current session variable app.tenant_id (set by the
-- backend per request/transaction from the verified JWT).
--
-- FAIL-CLOSED GUARANTEE
-- ─────────────────────
-- current_setting('app.tenant_id') with no second argument raises an ERROR
-- when the variable is unset. That means a request that forgets to set the
-- tenant context gets an error, not a data leak. Never use the two-argument
-- form current_setting('app.tenant_id', true) here (that returns NULL on
-- missing, which compares FALSE to any UUID → 0 rows, which is safe but
-- silent; the error form is better because it surfaces the bug immediately).
--
-- SERVICE ACCOUNT BYPASS
-- ──────────────────────
-- The migration runner and backup roles are granted BYPASSRLS (superuser or
-- explicit BYPASSRLS privilege). Application roles must NOT have BYPASSRLS.
-- Example DDL (run once during provisioning, outside this file):
--   CREATE ROLE app_user NOINHERIT LOGIN;
--   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
--       TO app_user;
--   -- app_user does NOT have BYPASSRLS, so all policies apply.
--
-- READ + WRITE POLICIES
-- ─────────────────────
-- Each table gets two policies:
--   tenant_isolation_select  — SELECT (USING clause only)
--   tenant_isolation_write   — INSERT / UPDATE / DELETE
--       INSERT uses WITH CHECK; UPDATE/DELETE use USING + WITH CHECK.
-- This matches the recommended PostgreSQL pattern for separating read/write
-- enforcement.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper: human-readable note about the sentinel for feature_flags
-- ---------------------------------------------------------------------------
-- Global flags use tenant_id = '00000000-0000-0000-0000-000000000000'.
-- The policy below lets any tenant see global flags AND their own flags.
-- ---------------------------------------------------------------------------

-- ============================================================
-- TABLE: roles
-- ============================================================
DROP POLICY IF EXISTS tenant_isolation_select ON roles;
CREATE POLICY tenant_isolation_select ON roles
    FOR SELECT
    USING (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_write ON roles;
CREATE POLICY tenant_isolation_write ON roles
    FOR ALL
    USING  (tenant_id = current_setting('app.tenant_id')::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

-- ============================================================
-- TABLE: users
-- ============================================================
DROP POLICY IF EXISTS tenant_isolation_select ON users;
CREATE POLICY tenant_isolation_select ON users
    FOR SELECT
    USING (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_write ON users;
CREATE POLICY tenant_isolation_write ON users
    FOR ALL
    USING  (tenant_id = current_setting('app.tenant_id')::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

-- ============================================================
-- TABLE: audit_log  (append-only — no UPDATE/DELETE for app role)
-- ============================================================
DROP POLICY IF EXISTS tenant_isolation_select ON audit_log;
CREATE POLICY tenant_isolation_select ON audit_log
    FOR SELECT
    USING (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_insert ON audit_log;
CREATE POLICY tenant_isolation_insert ON audit_log
    FOR INSERT
    WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

-- Deliberately NO UPDATE or DELETE policy for audit_log — app role cannot
-- modify or delete audit entries. The migration/service role (BYPASSRLS) can
-- for retention/archival purposes only.

-- ============================================================
-- TABLE: feature_flags
-- A flag is visible if it belongs to this tenant OR is a global flag
-- (sentinel tenant_id '00000000-0000-0000-0000-000000000000').
-- Writes are only allowed to the tenant's own flags (not globals).
-- ============================================================
DROP POLICY IF EXISTS tenant_isolation_select ON feature_flags;
CREATE POLICY tenant_isolation_select ON feature_flags
    FOR SELECT
    USING (
        tenant_id = current_setting('app.tenant_id')::uuid
        OR tenant_id = '00000000-0000-0000-0000-000000000000'::uuid
    );

DROP POLICY IF EXISTS tenant_isolation_write ON feature_flags;
CREATE POLICY tenant_isolation_write ON feature_flags
    FOR ALL
    USING  (tenant_id = current_setting('app.tenant_id')::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

-- ============================================================
-- TABLE: idempotency_keys
-- ============================================================
DROP POLICY IF EXISTS tenant_isolation_select ON idempotency_keys;
CREATE POLICY tenant_isolation_select ON idempotency_keys
    FOR SELECT
    USING (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_write ON idempotency_keys;
CREATE POLICY tenant_isolation_write ON idempotency_keys
    FOR ALL
    USING  (tenant_id = current_setting('app.tenant_id')::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

-- =============================================================================
-- WAVE 1 PLACEHOLDER
-- When Wave 1 commerce tables are added (products, inventory, orders, etc.),
-- append policies here following the same pattern. Each table needs:
--   ALTER TABLE <name> ENABLE ROW LEVEL SECURITY;  -- in the migration file
--   DROP POLICY IF EXISTS tenant_isolation_select ON <name>;
--   CREATE POLICY tenant_isolation_select ON <name> FOR SELECT
--       USING (tenant_id = current_setting('app.tenant_id')::uuid);
--   DROP POLICY IF EXISTS tenant_isolation_write ON <name>;
--   CREATE POLICY tenant_isolation_write ON <name> FOR ALL
--       USING  (tenant_id = current_setting('app.tenant_id')::uuid)
--       WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Verification query (run to confirm no tenant-scoped table lacks a policy)
-- ---------------------------------------------------------------------------
-- SELECT tablename, rowsecurity, forceroWsecurity
-- FROM   pg_tables
-- WHERE  schemaname = 'public'
-- ORDER BY tablename;
--
-- Every table except tenants itself should show rowsecurity = true.
-- ---------------------------------------------------------------------------
