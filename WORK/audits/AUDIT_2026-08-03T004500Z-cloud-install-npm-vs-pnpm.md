# Cloud environment install failure — npm vs pnpm

**Date:** 2026-08-03T004500Z  
**Run:** `bc-28230959-25b7-472a-853f-620942780c43`  
**Event:** `setup_failed` — "The update script in your configuration failed during VM startup."

## Root cause

The personal Cursor Cloud environment install/update script ran:

```bash
npm install
[ -d web ] && npm --prefix web install
```

(`/tmp/cursor/async-install/install-user.sh`)

Root `package.json` `preinstall` rejects non-pnpm agents:

```text
Use pnpm instead → exit 1
```

Evidence: `/tmp/cursor/async-install/install-user.log` + status `1`.

## Fix applied in-repo

Committed `.cursor/environment.json` with:

```json
{
  "install": "corepack enable && pnpm install --frozen-lockfile"
}
```

Repo-level `environment.json` takes precedence over the personal dashboard
install script for agents that boot from a commit containing this file.

## Still required in the Cursor dashboard (human)

Until the personal environment’s saved install/update command is edited (or
agents always start from a commit that includes `.cursor/environment.json`),
JIT boots against the old personal config can still fail.

Dashboard: https://cursor.com/dashboard/cloud-agents/environments/e/ae16e1f3-8c20-11f1-b532-320a589b8025

Set the install/update command to the same `corepack enable && pnpm install --frozen-lockfile` string and remove any `npm install` / `npm --prefix web install` lines.

## Secondary notes

- This monorepo is a pnpm workspace (`artifacts/*`, `lib/*`); there is no
  `web/package.json` for a separate npm install.
- `.npmrc` uses pnpm-only keys (`auto-install-peers`, `strict-peer-dependencies`).
- Environment builds are not enabled for this personal env (`builds: []`);
  enabling builds after the install fix would cache `node_modules` for faster boots.
