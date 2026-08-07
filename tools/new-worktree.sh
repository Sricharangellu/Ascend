#!/usr/bin/env bash
#
# tools/new-worktree.sh — isolate a session in its own git worktree.
#
# Usage:  tools/new-worktree.sh <task-slug> [base-branch]
# Example: tools/new-worktree.sh expenses-mvp            -> branch wt/expenses-mvp off develop
#          tools/new-worktree.sh fix/expenses-cents      -> branch fix/expenses-cents off develop
#          tools/new-worktree.sh hotfix/500-readyz master -> the sanctioned master exception
#
# Creates ../ascend-wt-<slug> on a fresh branch off the LATEST origin/<base>, so a parallel
# session (another AI agent, or you) works in an isolated checkout that shares one git repo —
# instead of everyone editing the single primary tree, which is the root cause of the
# duplicate-file / competing-edit / blocked-rebase collisions this repo keeps hitting.
#
# The base defaults to `develop` and that is binding, not a preference: promotion is
# forward-only (feature/* -> develop -> staging -> master) and `master` is a release target,
# not a starting point. Passing `master` is supported only for a real hotfix, and warns.
#
# A worktree is NOT a second clone. Never `git clone` this repo twice — two clones diverge
# and collide on push. Worktrees share the object store.
#
set -euo pipefail

slug="${1:-}"
base="${2:-develop}"
if [ -z "$slug" ]; then
  echo "usage: tools/new-worktree.sh <task-slug> [base-branch]   (e.g. expenses-mvp)" >&2
  exit 1
fi

# sanitise slug -> safe branch/dir component ('/' kept so `fix/thing` is usable as-is)
slug="$(printf '%s' "$slug" | tr '[:upper:] ' '[:lower:]-' | tr -cd 'a-z0-9/-')"
if [ -z "$slug" ]; then
  echo "error: slug is empty after sanitising — use letters, digits, '-' or '/'" >&2
  exit 1
fi

# a slug that already names a type (fix/…, feat/…) is the branch; a bare one gets wt/
case "$slug" in
  */*) branch="$slug" ;;
  *)   branch="wt/${slug}" ;;
esac

repo_root="$(git rev-parse --show-toplevel)"
dir="${repo_root}/../ascend-wt-$(printf '%s' "$slug" | tr '/' '-')"

if [ "$base" = "master" ]; then
  echo "WARNING: basing on master. Only a hotfix may do this — everything else branches from" >&2
  echo "         develop. After the hotfix lands, back-merge master -> staging -> develop." >&2
fi

if [ -e "$dir" ]; then
  echo "error: $dir already exists — remove it first (git worktree remove \"$dir\")" >&2
  exit 1
fi

git -C "$repo_root" fetch origin "$base"
git -C "$repo_root" worktree add -b "$branch" "$dir" "origin/${base}"

cat <<EOF

✓ worktree ready
  dir:    $dir
  branch: $branch  (off origin/$base)

Next:
  cd "$dir"
  # ...work, claim WORK/LOCK.md, run the gates, commit only files you authored...
  git push -u origin "$branch"
  # open a PR into develop (never merge to master — that is Sri's call, every time)

When merged, clean up:
  git worktree remove "$dir" && git branch -d "$branch"
EOF
