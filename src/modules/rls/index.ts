import type { PosModule } from "../types.js";

/**
 * Enable Postgres row-level security on every tenant-scoped table as
 * defense-in-depth. The policy is intentionally permissive when
 * `app.tenant_id` is unset (empty / null) so existing code that relies on
 * SQL-level `WHERE tenant_id = @tenantId` filtering continues to work.
 * When `app.tenant_id` IS set (via `db.withTenant(tenantId)`), the policy
 * blocks access to rows belonging to a different tenant — catching any bug
 * that forgets the WHERE clause.
 *
 * Policy logic:
 *   COALESCE(current_setting('app.tenant_id', true), '') IN ('', tenant_id::text)
 *
 *   unset / '' → allow all rows  (backwards-compatible with code not yet using withTenant)
 *   set to X  → allow only rows where tenant_id = X
 *
 * FORCE ROW LEVEL SECURITY applies the policy even to the table owner so the
 * app user (who owns the tables) is subject to the same rules.
 *
 * Idempotent: the DO block checks pg_policies before creating, and
 * ALTER TABLE … ENABLE ROW LEVEL SECURITY is a no-op when already enabled.
 */
const MIGRATION = `
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT DISTINCT table_name
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND column_name = 'tenant_id'
    ORDER BY table_name
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = current_schema()
        AND tablename = tbl
        AND policyname = 'tenant_isolation'
    ) THEN
      EXECUTE format(
        'CREATE POLICY tenant_isolation ON %I USING (
           COALESCE(current_setting(''app.tenant_id'', true), '''') IN ('''', tenant_id::text)
         )',
        tbl
      );
    END IF;
  END LOOP;
END $$;
`;

export const rlsModule: PosModule = {
  name: "rls",
  migrations: [MIGRATION],
  register() {
    // No routes — DB-layer security only.
  },
};
