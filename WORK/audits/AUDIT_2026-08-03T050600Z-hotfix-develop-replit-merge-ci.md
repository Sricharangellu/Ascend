# Audit — HOTFIX develop Replit merge CI unblock

UTC: 2026-08-03T050600Z  
Agent: Cursor Cloud `bc-c564feef`  
Branch: `cursor/hotfix-develop-replit-merge-ci-604f`  
Related: PR #145 (prior identical incident), commit `74f7d91`

## Incident

`74f7d91` (authored as Sri via GitHub identity, message: preserve Replit workspace tree after #145 revert) merged the Replit pnpm-monorepo root back onto `develop` while also bringing Ascend tip `0f30096` (#141). Unlike #145, `src/` and `web/` survived. CI still broke:

1. Root `package.json` replaced with `"name":"workspace"` stub whose `preinstall` rejects npm → Backend `npm ci` fails
2. Tracked `.migration-backup/AGENTS.md` → Production guard hygiene fails (multiple AGENTS.md)
3. `.npmrc` from Replit + stub deps (`@replit/connectors-sdk`, `prettier`) without lock sync

## Fix (minimal, forward-only)

- Restore Ascend `package.json` + `tsconfig.json` from `0f30096`
- Delete tracked `.migration-backup/**` (1082 files) — content remains in git history / prior commits
- Remove `.npmrc` (pnpm peer-deps flags)
- Gitignore `.migration-backup/` to prevent re-track
- **Kept** `artifacts/`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, Replit mobile/pitch trees (Sri merge intent to preserve workspace layout)

## Status

`built_verified` pending CI on this hotfix PR. Does not resolve the longer-term NEEDS-SRI question of whether Ascend `develop` should host the Replit monorepo layout at all.

## Honest notes

- This is the second develop-pollution incident in ~24h. `REPLIT.md` git-safety rule needs operational enforcement, not only docs.
- Full `git revert -m 1 74f7d91` would drop Ascend #141 content from first-parent history; restoring root config is safer for a hybrid tip.
