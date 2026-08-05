# Audit — HOTFIX restore Ascend tsconfig.json

UTC: 2026-08-03T061100Z
Agent: Cursor Cloud `bc-c564feef`
Branch: `cursor/hotfix-restore-ascend-tsconfig-604f`

## What

After Replit merge + package.json restores, `develop` still had the pnpm-workspace `tsconfig.json` (extends `tsconfig.base.json`, empty `files`, project references, **no** `compilerOptions`).

- Docker CI: `d.compilerOptions.rootDir = ...` → `TypeError: Cannot set properties of undefined`
- Backend `npm run typecheck` was a near-no-op against the solution stub

Restored Ascend `tsconfig.json` from `0f30096` (pre-incident tip).

## Status

`built_verified` — `npm run typecheck` exercises `src/**/*.ts` again; Docker builder step should pass.

