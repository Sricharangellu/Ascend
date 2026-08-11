# ADR-013: Schema changes are forward-only; recovery is by restore, not by down-migration

Date: 2026-08-11 · Status: Proposed
Owner: Claude Code session — `claude/status-master-staging-develop-en9r8k` (C-1 restore-drill work)

**Context:** This repo has two documented rollback mechanisms and neither one
covers a schema change.

`PIPELINE.md`'s Rollback section offers three moves: re-run the last known-good
`master` deploy, `git revert` the release merge, or promote a previous Vercel
deployment. All three roll back *code*. None touches the database. The section
opens with "Every change here is a branch/CI/protection edit — no data
migrations", which was true of the pipeline work it was written for and is not
true of a release.

Underneath that, `GAPS.md` records the real state: `db/migrations/*.down.sql`
exists for the 3 foundation files only, and the **186 module-owned tables have
none**. Module migrations run automatically at boot — `buildApp` executes every
module's migration set — so a release that alters a table applies the moment the
new backend starts, with nothing that walks it back.

The two facts compose badly. A reader of `PIPELINE.md` reasonably concludes that
reverting the release merge restores the prior state. It restores the prior
*code* against a database that has already moved. That gap is more dangerous
than an absent rollback story, because it reads as solved.

What forced the ADR now rather than earlier: C-1's mechanism half has just been
closed (`db/backup/drill.sh` + `.github/workflows/restore-drill.yml` prove
backup→restore end to end on every change to that path and weekly). Restore is
now a mechanism this repo can point at with evidence, which makes "recovery is
by restore" a policy that can actually be relied on rather than an aspiration.

**Decision:** Schema changes in Ascend are **forward-only**. There is no
expectation that a module migration can be reversed, and down-migrations will
not be written for module-owned tables.

The invariant every future caller can rely on: **the recovery mechanism for a
data-affecting mistake is a point-in-time restore, not a schema reversal.**

Two obligations follow, and they are the substance of the decision:

1. **A migration that destroys data — dropping a column or table, narrowing a
   type, deleting rows — requires an explicit pre-migration backup checkpoint**,
   taken and verified before the release that carries it. "We have daily
   backups" is not a checkpoint; the checkpoint is a specific artifact taken
   against a specific pre-migration state.

2. **`PIPELINE.md` must not describe rollback in terms that imply schema
   reversal.** Its Rollback section is corrected by the same change that carries
   this ADR.

**Alternatives considered:**

*Write down-migrations for the 186 module-owned tables.* Rejected on two
grounds, the second of which is the decisive one. First, it is a large amount of
work across 53 migration sets, most of it for tables nobody will ever roll back.
Second — and this is why it is not merely expensive but wrong — **a
down-migration does not recover data.** Reversing a migration that dropped a
column recreates an empty column; the values are gone either way. Down-migrations
solve schema *shape* drift, which is not the failure this repo is exposed to.
Buying them at that price while still needing restore for the actual risk would
be the worst of both.

*Do nothing and leave the current state.* Rejected: the current state is not
"no policy", it is a documented policy that is false. `PIPELINE.md` actively
tells a reader that reverting the merge is a rollback.

*Adopt forward-only but skip the checkpoint obligation.* Rejected: without it
the policy reduces to "hope the nightly backup is recent enough", and the
acceptable data-loss window for a destructive migration is zero, not one night.

**Consequences:**

Easier: migrations stay simple and reviewable; nobody writes or maintains
reversal code that would not have worked anyway; the recovery story is one
mechanism instead of two half-mechanisms.

Harder: destructive migrations now carry a real procedural obligation. That is
intended — it puts the cost at the point where the risk is created.

**Deliberately deferred, with the evidence bar for revisiting:** this ADR does
not add automation for the pre-migration checkpoint. Revisit when a destructive
migration is actually proposed — that is the first moment the shape of the
automation is knowable, and building it ahead of one would be guessing.

**This policy is not yet safe to rely on in production, and saying so is part of
the decision.** It rests on backups existing, and `PROD_DATABASE_URL` is unset,
so `.github/workflows/backup.yml` currently reports success in ~5 seconds having
backed up nothing — the production RPO is unbounded, not ≤24h. Until that secret
is set (`WORK/LOOP_STATE.md`, NEEDS-SRI), forward-only is the policy and restore
is the mechanism, but production has nothing to restore *from*. The drill proves
the path works; it cannot conjure an artifact that was never taken.

**Status is Proposed, not Accepted**, because the choice between forward-only
and down-migrations is a standing architectural commitment rather than a fix,
and `AGENTS.md` reserves that class of call. Everything mechanical it depends on
is implemented and verified; what remains is the decision itself.

**Supersedes:** none.

**Related Issues:** none.

**Related PRs:** #211.
