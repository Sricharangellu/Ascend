---
name: Backup/restore verification lessons
description: Durable pitfalls in pg_dump/restore verification for the backup pipeline.
---

# Backup/restore verification

- **Schema-restricted pg_dump output is unrestorable into a fresh database.** `--schema=...` omits `CREATE EXTENSION` statements (extensions aren't schema members), so extension-dependent objects (e.g. trigram indexes) fail on restore — and a lenient `ON_ERROR_STOP=off` restore hides it silently.
  **Why:** a lenient restore path had been silently skipping those indexes until a strict verification first ran.
  **How to apply:** keep all backup producers on one shared flag list, restore-verify with strict psql, and never restrict dumps to a schema without also dumping required extensions.

- **Restore-verification expectations must come from the dump itself, not live queries.** Comparing a restore against live source counts is racy on an active database (concurrent writes → false failures). Parse the dump's own contents for expected tables/row counts.

- **When strict psql aborts mid-stream, stdin writes raise EPIPE** — swallow it on the pipe (the exit code carries the real error) or the whole process crashes and skips scratch-DB cleanup. Cleanup paths must throw, never `process.exit`, so `finally` blocks run.
