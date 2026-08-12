# Ascend — Replit Entry Point

Read [`AGENTS.md`](./AGENTS.md) first. It is the ONE agent instruction file for this repo —
operating contract, mandatory read order, git-flow rules, the two-tier work-claim model
(GitHub Issues for durable task ownership, `WORK/LOCK.md` for short-lived file-edit locks),
gates, and PR flow. This file is only a pointer; do not duplicate its content here.

## Replit's role: sandbox / prototyping only (default — see below before changing)

Ascend's real deploy pipeline is `feature/* → develop → staging → master`, hosted on
**Vercel** (frontend) + **Render** (production backend) + **Supabase** (Postgres) — see
`docs/architecture/PIPELINE.md`. Replit is **not** part of that pipeline today, and this file
documents it as **sandbox/prototyping only** until an explicit decision says otherwise:

- Do not add Replit as a production or staging deploy target.
- Do not point a Replit-hosted process at the production or staging Supabase database.
- Secrets entered as Replit Secrets (e.g. a `JWT_SECRET` for a Replit-hosted instance) must be
  **distinct** from whatever the real environments use — never reuse a prod/staging secret in
  a Replit sandbox, and never copy a Replit-generated secret into a prod/staging environment
  without treating it as a fresh rotation.
- If Replit is meant to become a real, reconciled deploy target (not just a sandbox), that is
  an architecture decision for Sri to make explicitly — write it up as an ADR under
  `docs/architecture/ADR/` and update `PIPELINE.md` and this file together. Until that ADR
  exists, treat every Replit environment as disposable and non-authoritative.

Everything else — git-flow, gates, claim model, PR flow — is identical to every other
environment working this repo. Follow `AGENTS.md`.

## Git-safety rule (added 2026-07-30, discovered mid-investigation)

This Replit workspace's local git repo has `origin` configured as the real
`Sricharangellu/Ascend` GitHub remote, works directly on a local branch named `master`
(no feature-branch workflow for Build-mode edits — Replit checkpoints are the undo
mechanism), and merges approved task-agent work (from `subrepl-*` remotes) back into
that local `master` automatically. None of that is a problem by itself — it only
becomes one at the point of pushing to `origin`.

**Hard rule: never push this workspace's `master` (or any branch here) to `origin`
without Sri explicitly asking for that specific push, in that moment.** `master` on
the real repo is the production-deploying branch. This workspace's commits are built
against a different directory layout (`artifacts/ascend` / `artifacts/api-server`
instead of the real repo's `web/` / `src/`) and a self-contained mocked stack (Replit
Postgres + MSW) — even setting aside the sandbox-scope rules above, a push here would
either fail the real repo's CI or, in the worst case, land an incompatible tree on
the one branch nothing should risk. `master`'s branch protection provides a partial
backstop (required status checks, `enforce_admins`, no force-push) but should not be
relied on as the only one.

If a renamed local branch (e.g. `replit-sandbox` instead of `master`) doesn't break
this workspace's own task-agent auto-merge automation, renaming removes the
"push master" muscle-memory risk entirely and is worth doing. If that automation is
hardcoded to a branch literally named `master`, leave it as-is and treat the rule
above as the actual boundary — don't guess on this one.
