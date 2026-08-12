# AUDIT — INCIDENT: second Replit workspace merge broke the npm root on `develop`

Date: 2026-08-03T11:00:00Z
Branch: `hotfix/restore-npm-root-after-replit-merge` (off `origin/develop` @ `186de92`)
Severity: **High** — `develop` CI could not pass; every `npm ci` step was blocked.
Data loss: none (all restored from history).

## What happened

This is the **second** occurrence of the incident class recorded on 2026-08-02 in
`WORK/LOOP_STATE.md` and `WORK/FORWARD_PLAN.md`'s Phase 8 rule 4 (PR #145: a Replit
session merged its separately-migrated copy of this repo into `origin/develop`). The
first one deleted `src/`/`web/` outright and was caught immediately. This one is
subtler and got further: `src/` and `web/` survived intact, but the **repository root
was converted from the real npm project to a pnpm workspace stub**, which silently
breaks CI rather than obviously breaking the tree.

Commit trail (last known-good is `ca7ec4b`, PR #172):

| Commit | Author | What it did |
|---|---|---|
| `757eb8e` | gellusricharan | "Git commit prior to merge" |
| `725b426` | gellusricharan | Demo-banner/MSW work (legitimate, in `artifacts/`) |
| `667a5b8` | **Replit Agent** | **Removed `package-lock.json`** (2340 lines) |
| `ec45333` | **Replit Agent** | Accounting exports + orders lifecycle tests (in `artifacts/`) |
| `1125079` | gellusricharan | Register API-server typecheck validation step |
| `2290133` | Sricharan Gellu | `Merge remote-tracking branch 'origin/develop' into develop` |
| `186de92` | Sricharan Gellu | "Restore workspace root manifests … after merging origin/develop" |

`186de92` was an attempted fix, but it restored the **workspace's** root manifests, not
Ascend's — i.e. it re-asserted the pnpm stub over the real project rather than undoing it.

## Concrete damage found

Root `package.json` was replaced with a bare pnpm workspace stub:

```json
{ "name": "workspace", "version": "0.0.0",
  "scripts": { "preinstall": "sh -c 'rm -f package-lock.json yarn.lock; case \"$npm_config_user_agent\" in pnpm/*) ;; *) echo \"Use pnpm instead\" >&2; exit 1 ;; esac'" },
  "dependencies": { "@replit/connectors-sdk": "^0.4.1" } }
```

That `preinstall` hook **actively deletes `package-lock.json` and hard-fails any npm
invocation**. `.github/workflows/ci.yml` runs `npm ci` in **7 places** (lines 160, 183,
263, 301, 404, 444, 482) — every one of them would have failed. The real Ascend
manifest (name `ascend`, v2.0.0, all 20+ scripts including `hygiene`/`gap:scan`/
`table:scan`/`test`/`smoke`) was gone.

Deleted files (all restored):
`package-lock.json`, `.env.example` (99 lines — the env template the 2026-08-03
security audit's `JWT_SECRET` finding depends on), `.env.staging.example`,
`web/.env.example`, `web/.env.local.example`, `artifacts/ascend/.env.example`.

Added files that hijacked the root (all removed): `.npmrc`, `pnpm-lock.yaml`
(15,828 lines), `pnpm-workspace.yaml`. Root `tsconfig.json` was also replaced with a
project-references stub pointing at `lib/db`, `lib/api-client-react`, `lib/api-zod`
— paths belonging to the Replit workspace, not this repo.

## Fix applied

Deliberately **surgical, not a blanket revert** — the range contains genuine work that
should not be thrown away (`artifacts/**` changes from the Replit side, `.agents/memory/`
additions, the `.replit` workflow additions). Restored only the root/npm surface:

```
git checkout ca7ec4b -- package.json package-lock.json tsconfig.json \
  .env.example .env.staging.example \
  web/.env.example web/.env.local.example artifacts/ascend/.env.example
git rm --cached .npmrc pnpm-lock.yaml pnpm-workspace.yaml   # + delete from disk
```

**Explicitly preserved** (not reverted): `artifacts/api-server/src/modules/accounting/
index.ts`, `artifacts/api-server/src/modules/orders/lifecycle.test.ts`,
`artifacts/ascend/src/mocks/MockWorkerInit.tsx`, `artifacts/ascend/src/pages/login/
page.tsx`, `.agents/memory/*` (3 files), `.replit`. None of those touch the npm root,
so keeping them costs nothing and preserving another session's work is the right call.

Also left untouched: an in-flight uncommitted rewrite of `REPLIT.md` (204 insertions)
that another session is actively making in this shared working tree **right now** —
not mine, not staged, deliberately excluded from this commit.

## Verification

- `npm run hygiene`: ✓ 2174 files, no junk/secrets/tracked-env/broken links.
- `npm run gap:scan`: ✓ no unexplained FE→BE gaps.
- `npm run table:scan`: ✓ 166 table names, no collisions.
- `npx tsc --noEmit -p .` (backend): ✓ exit 0 — this is the direct proof the
  `tsconfig.json` restore worked; against the broken stub it could not resolve.
- `npm ci --dry-run`: ✓ resolves cleanly, 30 packages, no errors — direct proof CI's
  `npm ci` steps are unblocked. `package.json` and `package-lock.json` are inherently
  in sync because both were restored from the same commit.
- `web/package-lock.json`: confirmed present (8906 lines) — CI's frontend job also OK.

## Recommendation (NEEDS-SRI — this is the third strike)

The immediate breakage is fixed, but the *cause* isn't. Phase 8 rule 4 already says a
Replit session must never push to real `origin` without explicit per-push approval; that
rule was written after PR #145 and this happened anyway, twice in two days. Options,
in rough order of strength:

1. **Branch protection on `develop`** requiring a passing CI check before merge. Both
   incidents would have been blocked automatically — the merges were red on arrival.
   This is the single highest-value control and needs no agent cooperation.
2. A root-manifest guardrail in CI (assert `package.json`'s `name` is `ascend` and that
   `pnpm-workspace.yaml` does not exist at root) — cheap, catches this exact class fast.
   Not built here; would be a normal scoped task if wanted.
3. Disconnect the Replit workspace's `origin` remote, or point it at a fork, so its
   merges cannot reach this repo at all.

## Branch status

`hotfix/restore-npm-root-after-replit-merge`, single commit on top of current
`origin/develop` (`186de92`) — clean fast-forward, no rebase needed. **Merge this
before any other pending branch**, since everything else has to build on a working root.
