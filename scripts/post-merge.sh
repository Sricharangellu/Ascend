#!/bin/bash
set -e

# Install any dependencies added by the merged task.
pnpm install --frozen-lockfile

# NOTE: Do NOT run `pnpm --filter db push` here. The drizzle schema in
# lib/db/src/schema/index.ts is intentionally empty (the API server owns the
# real schema and applies it itself at startup), so a drizzle push diffs an
# empty schema against the live database and offers to DROP every table.
# Running it non-interactively with --force would wipe the dev database.
