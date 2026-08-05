# npm root contamination — 5th occurrence, definitive restore

**Date:** 2026-08-03T190734Z
**Branch:** `hotfix/restore-npm-root-v3` → PR into `develop`

## Incident

The Replit-migrated workspace copy has been merged into `develop` repeatedly,
each time replacing the Ascend npm root with a pnpm-workspace stub. Timeline of
this class over ~2 days: #171 (tsconfig), #174 (full root), and now this. During
this session alone:

1. #174 merged, restoring the root (`2c916be`).
2. #177/#178/#179 landed legitimate features on top.
3. Merge `7b61407` (14:42 UTC) re-merged the workspace copy — resolved a
   `pnpm-lock.yaml` conflict in favour of pnpm, reverting root `package.json` to
   `{"name":"workspace"}`. (My PR #180 addressed this state.)
4. While #180's CI ran, four more commits landed (`51ed33e`, `4155d95`,
   `61398d6`, `a4dbf2c`), culminating in `a4dbf2c "Remove package-lock.json
   file"` — deleting the real npm lockfile. This left #180 insufficient (it did
   not restore `package-lock.json`), so a fresh restore off the current tip was
   required.

`develop` then held steady at `a4dbf2c` for ~2.5h (source confirmed stopped by
Sri, who issued a no-contamination directive to all agents) before this restore.

## Fix (this PR)

Surgical restore off the current tip (`a4dbf2c`):

- `package.json`, `package-lock.json`, `tsconfig.json` ← restored from `2c916be`
  (#174's known-good root; verified no non-merge commit touched them since).
- Removed `.npmrc`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`.
- `.cursor/environment.json` ← `npm ci ... && npm --prefix web ci ...` (was pnpm).

Supersedes PR #180 (root-only, now stale) and PR #173 (cursor-env only). Only the
six root files change; all `src/` (55 modules) and `web/` feature work landed
since #174 is preserved.

## Verification (local, off `a4dbf2c` + this restore)

- `npm ci` — resolves cleanly (CI's 7 `npm ci` steps unblocked)
- `npm run typecheck` — exits 0
- `node tools/hygiene-check.mjs` — pass (2186 files)
- `npm run smoke` — PASSED, 20 steps, full POS lifecycle on embedded Postgres

## Durable fix (Sri-only — code restores will not hold without this)

Set `enforce_admins: true` on `develop`'s branch protection. The required checks
(Backend/Frontend/Production guard/E2E) already exist, but admins currently
bypass them, which is how every red workspace-merge landed. This is the only
thing that structurally prevents recurrence.
