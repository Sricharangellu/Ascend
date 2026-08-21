---
name: Post-merge drizzle push trap
description: Why the post-merge script must never run `pnpm --filter db push` in this project
---

# Post-merge drizzle push trap

**Rule:** The post-merge setup script must never run a drizzle-kit push against the dev database.

**Why:** The drizzle schema in `lib/db` is intentionally empty (a commented example only). The API server owns the real schema and creates/migrates its tables itself at startup. A drizzle push therefore diffs an *empty* schema against the live database and offers to DROP every table (users, job_queue, sync_queue, ...). Interactively it prompts; non-interactively with `--force` it would silently wipe the dev database. This surfaced as a post-merge setup failure (TTY prompt error + timeout) after a task merge in Aug 2026.

**How to apply:** Keep `scripts/post-merge.sh` to dependency install (and other idempotent, non-destructive steps). If someone reintroduces a db push step, verify the drizzle schema actually contains the project's tables first. If the DB schema ever moves into `lib/db` for real, revisit this rule.
