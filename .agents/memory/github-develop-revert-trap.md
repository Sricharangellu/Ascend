---
name: GitHub develop revert trap
description: Merging origin/develop can silently delete the entire workspace tree; how to merge safely.
---

# GitHub `develop` contains a revert of the workspace merge

The GitHub repo's `develop` branch once merged the Replit workspace tree, then **reverted that merge** ("Revert 'Merge local workspace work into develop'"). That reverted merge commit IS in local history.

**Why this is dangerous:** any plain `git pull` / `git merge origin/develop` replays the revert's deletions — ~1,000 files under `artifacts/`, plus `.replit`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `replit.md`, `lib/`, `.agents/` — mostly **silently** (only locally-modified files conflict; unmodified ones are just deleted). When `.replit`/`artifact.toml` files vanish, the platform deregisters ALL artifacts and workflows.

**Also:** the two branches are different layouts sharing history. Remote owns `web/`, `src/`, `WORK/`, `docs/`, `api/`, root Docker/Vercel config; workspace owns `artifacts/`, `lib/`, Replit config, root pnpm manifests.

**How to merge safely (pattern that worked):**
1. `git branch -f backup-develop-local HEAD` first.
2. `git merge origin/develop`, then resolve every conflict by path rule: `web/ src/ WORK/ docs/` → theirs; everything else → ours.
3. Before committing: `git checkout backup-develop-local -- artifacts lib .agents attached_assets .replit .replitignore .npmrc replit.md pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json package.json tsconfig.json scripts` to restore silent deletions.
4. Verify `git diff backup-develop-local HEAD -- artifacts .replit pnpm-workspace.yaml package.json` is empty, then commit and push.
5. If artifacts/workflows got deregistered mid-merge, re-register by round-tripping each `artifact.toml` through `verifyAndReplaceArtifactToml`.

**Never** force-push over remote `develop` (it has real PR-merged work) and never `git pull` there without this procedure. Exclude `artifacts/backups/*.sql` dumps from commits (now gitignored).
