#!/bin/bash
set -e

# Ascend is npm-based (package-lock.json). Do not run pnpm or drizzle push here —
# the API server owns schema apply at startup. See AGENTS.md / WORK/LOOP_STATE.md
# Replit-merge incident notes.
npm ci --no-audit --no-fund
npm --prefix web ci --no-audit --no-fund
