#!/usr/bin/env bash
#
# tools/new-worktree.sh — isolate a session in its own git worktree.
#
# Usage:  tools/new-worktree.sh <task-slug>
# Example: tools/new-worktree.sh expenses-mvp
#
# Creates ../finder-wt-<slug> on a fresh branch off the LATEST origin/master,
# so a parallel session (another AI agent, or you) works in an isolated
# checkout that shares one git repo — instead of everyone editing the single
# primary tree, which is the root cause of the duplicate-file / competing-edit /
# blocked-rebase collisions this repo keeps hitting.
#
# A worktree is NOT a second clone. Never `git clone` this repo twice — two
# clones diverge and collide on push. Worktrees share the object store.
#
set -euo pipefail

slug="${1:-}"
if [ -z "$slug" ]; then
  echo "usage: tools/new-worktree.sh <task-slug>   (e.g. expenses-mvp)" >&2
  exit 1
fi

# sanitise slug -> safe branch/dir component
slug="$(printf '%s' "$slug" | tr '[:upper:] ' '[:lower:]-' | tr -cd 'a-z0-9-')"
repo_root="$(git rev-parse --show-toplevel)"
branch="wt/${slug}"
dir="${repo_root}/../finder-wt-${slug}"

if [ -e "$dir" ]; then
  echo "error: $dir already exists — remove it first (git worktree remove \"$dir\")" >&2
  exit 1
fi

git -C "$repo_root" fetch origin master
git -C "$repo_root" worktree add -b "$branch" "$dir" origin/master

cat <<EOF

✓ worktree ready
  dir:    $dir
  branch: $branch  (off origin/master)

Next:
  cd "$dir"
  # ...work, claim WORK/LOCK.md, commit, push the branch, open a PR...
  git push -u origin "$branch"

When merged, clean up:
  git worktree remove "$dir" && git branch -d "$branch"
EOF
