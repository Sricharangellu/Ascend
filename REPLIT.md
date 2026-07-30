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
