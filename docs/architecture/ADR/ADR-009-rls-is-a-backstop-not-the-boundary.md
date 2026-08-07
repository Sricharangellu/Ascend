# ADR-009: Row-level security is a backstop for a forgotten WHERE clause, not the tenant boundary

Date: 2026-08-06 · Status: Accepted
Owner: Claude Code session — enterprise platform audit (`claude/ascend-erp-platform-audit-a80478`)

**Context:** This repo contains two row-level-security stories, and only one of them runs.

`src/modules/rls/index.ts` is the one that runs. It is a migration that loops every table in
the current schema carrying a `tenant_id` column, enables and forces RLS on it, and creates
a single policy:

```sql
USING (
  tenant_id IS NULL
  OR tenant_id::text = 'system'
  OR COALESCE(current_setting('app.tenant_id', true), '') IN ('', tenant_id::text)
)
```

`db/rls/policies.sql` is the one that does not. It holds 24 hand-written `CREATE POLICY`
statements and zero `ENABLE ROW LEVEL SECURITY`, and is never executed by any migration
path. It is a design document in SQL clothing.

The behavioural point: `current_setting('app.tenant_id', true)` returns `NULL` when the
setting is absent, `COALESCE` turns that into `''`, and `''` matches the first branch of the
`IN` list. **An unset tenant context therefore sees every row in every table.** The policy is
permissive by default.

That is deliberate, and the module's own doc comment says so — it was written to stay
backwards-compatible with code that predates `withTenant`/`tenantResolver`. It is also
directly contrary to what this repo's other RLS file instructs, in capitals:

> Never use the two-argument form `current_setting('app.tenant_id', true)` here (that
> returns NULL on missing, which compares FALSE to any tenant_id → 0 rows, which is safe but
> silent; the error form is better because it surfaces the bug).

Two documents, opposite advice, one of them shipping. Nothing recorded which had won or why.
The 2026-08-06 platform audit had to re-derive the actual behaviour from the migration
string to score tenant isolation, which is exactly the archaeology an ADR exists to prevent.

Flipping the policy to fail closed today would break login. The pre-auth tenant/user lookup
runs *before* a `tenantId` is known, so a strict policy would return zero rows and no one
could sign in. `db/rls/policies.sql` already sketches the correct fix — a privileged
`BYPASSRLS` role for that lookup only — but nobody has built it.

**Decision:** State the real position plainly and design against it, rather than leaving the
contradiction for the next reader to trip over.

**Application-layer tenant filtering is the tenant boundary. RLS is a second line of defence
for a forgotten `WHERE tenant_id` clause inside an already-authenticated request.**

The invariant every caller may rely on: for any request that reaches a `/api/v1/*` handler,
`tenantResolver` has entered an `AsyncLocalStorage` scope and `shared/db.ts` sets
`app.tenant_id` on the transaction wrapping every query in that scope — so within an
authenticated request, RLS *will* block a cross-tenant row even if the SQL forgets its
predicate.

The equally important negative: **outside that scope, RLS provides no protection at all.**
That covers background jobs, the outbox reconciler, migrations, `scripts/*`, the seed
scripts, and the operator gauges on `/metrics` added by the same audit. Code in those paths
must filter by tenant explicitly; it cannot lean on the database. Two further consequences
of the current policy are part of the accepted position: rows with `tenant_id = 'system'`
are visible to every tenant by design (the jobs and outbox surfaces read them), and
`tenant_id IS NULL` rows are platform-global (global feature flags).

`db/rls/policies.sql` is hereby **documentation of the target state, not of current
behaviour**. Do not read it as describing what the database does.

**Migration path to a real boundary**, in order — this is a project, not a follow-up commit:

1. Create an `app_auth` Postgres role with `BYPASSRLS` limited to the pre-auth lookup, and
   route only the login/token-issue path through it.
2. Move every other query to a role without `BYPASSRLS`.
3. Change the policy to the strict form (`tenant_id::text = current_setting('app.tenant_id')`,
   error-on-missing), behind a feature flag, one environment at a time.
4. Gate the rollout on the tenancy test suite plus `gateway/tenant-isolation.test.ts`.

**Evidence bar for doing it:** a confirmed cross-tenant read that application-layer
filtering missed, or an enterprise/SOC 2 requirement that names database-enforced isolation.
Not before — the change can lock every user out of the product if it is wrong, and the
application layer has been swept for this exact defect (2026-07-16, verified clean:
verify-then-mutate on every literal `WHERE id = @id`, dynamic where-builders all carry
`tenant_id`).

**Alternatives considered:**

- *Flip the policy to fail-closed now.* Rejected: breaks the pre-auth lookup, so nobody can
  log in. The `BYPASSRLS` role has to exist first.
- *Keep the permissive policy and say nothing.* Rejected — this is precisely how the
  contradiction survived. An accepted risk that is not written down is an unknown risk.
- *Delete `db/rls/policies.sql` since it never runs.* Rejected: it contains the correct
  design and the reasoning for the auth-role split. It is relabelled here, not removed.
- *Drop RLS entirely and rely on the application layer alone.* Rejected: the backstop has
  real value inside authenticated requests, which is where nearly all queries run, and it
  costs essentially nothing.

**Consequences:**

What becomes easier: anyone reading `src/modules/rls/index.ts` or `db/rls/policies.sql` now
has a single statement of which is real and what it actually guarantees. New code in
background jobs and scripts has an explicit rule — filter by tenant yourself.

What becomes harder: nothing, immediately. This ADR changes no behaviour. It records
behaviour that was already shipping and was previously discoverable only by reading a
migration string.

What is deferred: the strict-RLS migration, with the evidence bar above. The accepted risk
is also recorded in `SECURITY.md` under "Known accepted risks" and as **R-6** in the
2026-08-06 audit's risk register, so it stays visible to anyone assessing this system from
outside the code.

**Supersedes:** none. Clarifies the relationship between `src/modules/rls/index.ts` and
`db/rls/policies.sql`, which previously contradicted each other with no adjudication.

**Related Issues:** none.

**Related PRs:** the enterprise platform audit PR.
