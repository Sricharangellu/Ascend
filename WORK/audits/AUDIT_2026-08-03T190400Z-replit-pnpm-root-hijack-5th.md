# AUDIT — 5th Replit/pnpm root hijack of `develop` (2026-08-03T190400Z)

## Status
`built_verified` for the surgical restore on branch `cursor/hotfix-restore-npm-root-0e3c` (gates below). `develop` tip `a4dbf2c` remains contaminated until this PR merges.

## What happened
After PR #174 restored the Ascend npm root, later Replit/"Git commit prior to merge" commits (`7b61407`…`a4dbf2c`) re-introduced the migrated workspace root:

- `package.json` → `{"name":"workspace"}` + `preinstall` rejecting npm
- `package-lock.json` deleted (`a4dbf2c`)
- `.npmrc`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` present
- `tsconfig.json` → project-references stub (`lib/db`, `lib/api-client-react`, `lib/api-zod`)
- `.env*.example` / `web/.env*.example` / `artifacts/ascend/.env.example` deleted
- `.cursor/environment.json` → `corepack enable && pnpm install --frozen-lockfile` (Cursor Cloud `ERR_PNPM_NO_LOCKFILE`)
- `scripts/post-merge.sh` still invokes pnpm

`src/` and `web/` largely survived (same class as #174, not full-tree wipe like #145).

## Last-good tip used
`dcdf04b` — PR #179 merge; Ascend `package.json` / `package-lock.json` / real `tsconfig.json`, no pnpm root files. Features #177/#178/#179 preserved by restoring only root manifests + env examples + Cursor env + post-merge script.

## Related open PRs (do not merge as-is against current tip)
- #180 `hotfix/restore-npm-root-v2` — correct intent + green CI when opened, but based before `a4dbf2c` deleted `package-lock.json` and does not re-add that file in its three-dot diff; superseded for current tip.
- #173 `chore/cursor-cloud-env-npm-install` — env-only; branched from contaminated workspace tree; superseded.

## Restore applied
Exact directive command in `.cursor/environment.json`:
`npm ci --no-audit --no-fund && npm --prefix web ci --no-audit --no-fund`

## Durable fix (Sri-only)
Branch protection on `develop` with `enforce_admins: true` so admin/Replit bypass cannot land red/workspace merges. Code restores alone will not hold.

## Gates (this branch)
See PR / commit message for results of hygiene + typecheck + npm ci dry-run.
