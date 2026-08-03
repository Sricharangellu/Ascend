# Cursor Cloud install failure — `.cursor/environment.json` pointed at pnpm

**Date:** 2026-08-03T104813Z

## Failure

- Command: `corepack enable && pnpm install --frozen-lockfile`
- Error: `[ERR_PNPM_NO_LOCKFILE] Cannot install with "frozen-lockfile" because pnpm-lock.yaml is absent`
- Exit: `1`

## Root cause

`.cursor/environment.json` (repo-committed, takes precedence over any personal Cursor
dashboard install script) ran `pnpm install --frozen-lockfile`. This is leftover
contamination from the Replit-migrated-copy merges into `develop` documented in
`WORK/LOOP_STATE.md` (2026-08-02 incident, reverted via PR #145; recurred again
2026-08-03 per commit `89a0bf4`). Per `AGENTS.md`'s own "Cursor Cloud specific
instructions" section, the actual, intended install path for this repo is plain
`npm install` at root + in `web/` — there is no `pnpm-lock.yaml`/`pnpm-workspace.yaml`
in the real Ascend tree, and CI (`.github/workflows/ci.yml`) runs `npm ci` at root and
`npm ci` with `working-directory: web`.

This fix is scoped to `.cursor/environment.json` only. It is independent of, and does
not overlap with, the broader in-flight restoration of root workspace manifests
(`package.json`, lockfiles, `.npmrc`, `tsconfig.json`) happening separately on
`hotfix/restore-npm-root-after-replit-merge` — that branch's staged changes do not
touch `.cursor/environment.json`.

## Fix applied

```json
{
  "install": "npm ci --no-audit --no-fund && npm --prefix web ci --no-audit --no-fund"
}
```

Matches CI's install commands (`npm ci` at root, `npm ci` with `working-directory: web`).

## Still open (not addressed by this fix)

- Root `package.json`/`package-lock.json`/`tsconfig.json`/`.npmrc` contamination from the
  Replit merge is a separate, larger fix already in progress elsewhere (see
  `hotfix/restore-npm-root-after-replit-merge`) — until that lands on `develop`, `npm ci`
  at root will still fail its `preinstall` gate (`"Use pnpm instead"`) even with this file
  fixed. Both fixes are required together for Cursor Cloud installs to fully succeed.
- Any personal Cursor dashboard install/update script still set to the old pnpm command
  should be updated to match (human action, not repo-addressable).
