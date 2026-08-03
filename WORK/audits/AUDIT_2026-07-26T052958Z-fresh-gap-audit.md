# Fresh gap audit — 2026-07-26

Scope: everything committed since the last full module-by-module audit
(`AUDIT_2026-07-19T062148Z-phase0-verification.md`), i.e. ~90 commits from
2026-07-19T06:21:48Z through the current local HEAD (`fc98907`, un-pushed —
see `WORK/LOCK.md`'s "finish + verify AI Assistant module" claim). Method:
targeted, hypothesis-driven — re-run the automated guards, diff the specific
surfaces the repo's recurring bug classes live in (new modules, new tables,
mount order), and check the live production signals (GitHub Actions) rather
than re-reading all 90 commits' diffs line by line. Not a re-run of the full
51-module status table from the 07-19 audit — that table is still the
current reference for modules untouched since then.

## 1. Automated guards at current HEAD — all clean

- `npm run hygiene` — clean (1071 files, no junk/secrets/broken links).
- `npm run gap:scan` — clean (454 backend paths, 379 frontend paths, 21
  allowlisted — same count as 07-19, no new unexplained gaps).
- `npm run table:scan` — clean (161 table names across all modules, no
  collisions — the guardrail built 2026-07-19 specifically for the
  recurring "two modules declare the same `CREATE TABLE IF NOT EXISTS`
  name" bug class, which had bitten `quotations`, `product_locations`, and
  `time_entries` before this scanner existed).
- Backend `npm run typecheck` — clean.
- `cd web && npm run typecheck` — clean.

## 2. Only one new module registered since 07-19: `ai_assistant`

`git log --since=2026-07-19T06:21:48 -p -- src/modules/index.ts` shows
exactly one new module import: `aiAssistantModule`. Every other change in
this window is a fix/refactor/docs/pagination change to existing modules —
no other new module surface to audit for the mount-order/collision bug
class this pass.

`ai_assistant` was itself finished, design-system-fixed, and given its
first test coverage this session (see the "finish + verify AI Assistant
module" LOCK.md claim, commit `365c282`) — already checked against the
specific failure modes this audit would otherwise be looking for: its two
new tables (`ai_conversations`, `ai_recommendations`) both have `tenant_id`
(RLS-covered by the generic `information_schema` scan, no opt-in needed),
its mount path (`/api/v1/ai-assistant`) doesn't collide with or get shadowed
by any existing catch-all, and `table:scan`/`gap:scan` both stayed clean
after adding it. Not re-auditing it a second time in this pass.

## 3. New tables since 07-19 — all tenant-scoped

`git log --since=2026-07-19T06:21:48 -p` for every module's `index.ts`/
orchestration jobs shows these `CREATE TABLE IF NOT EXISTS` additions:
`ai_conversations`, `ai_recommendations` (ai_assistant, tenant_id ✓, see
above), `po_bills`, `po_bill_lines` (purchasing bill 3-way match, merged via
PR #93 — both have `tenant_id NOT NULL` ✓). `customer_quotations`,
`store_location_products`, etc. are the 07-19-dated collision *fixes*
already covered by that audit and their own dedicated tests (26+61+27 new
tests, iterations 18-20) — not new gaps.

## 4. NEW finding: production heartbeat isn't just failing — it has stopped running entirely

The 2026-07-22 LOCK.md URGENT note found the heartbeat (`.github/workflows/uptime.yml`,
`on: schedule: */15 * * * *`) red on every run checked back to #61. Checking
again now (2026-07-26, unauthenticated GitHub Actions page):

- **Still only 85 total runs exist.** The latest is still **run #85**,
  "Triggered via schedule July 22, 2026 00:08", commit `ed448ed`, **Status:
  Failure**, `Process completed with exit code 1` on "Probe production
  endpoints" — identical to what the 07-22 note found.
- A cron firing every 15 minutes should have produced roughly 380+ more runs
  between 2026-07-22 and now if it were still active. Zero have happened.
- This is not explained by repo inactivity (GitHub only auto-disables
  scheduled workflows after 60 days with no pushes to the repo) — `ci.yml`
  shows continuous push/PR activity through at least 2026-07-22 (CI run
  #508, PR #110 merge) and my own local commits continue past that.

**Working hypothesis, not confirmed** (would need GitHub Settings access to
verify): the workflow was manually disabled — most likely to stop the
failure-notification noise from the already-known-red heartbeat, without
fixing the underlying probe — around the same time the 07-22 note was
written. I can't confirm this from an unauthenticated fetch; it could
instead be a GitHub-side scheduling issue.

**Why this matters more than the original finding:** a *failing* heartbeat
still fires and (per GitHub's default) notifies repo watchers on every red
run — a live, if noisy, signal. A *silent* heartbeat means **there is
currently no automated signal at all** about whether `ascendhq-api.vercel.app`
/ `ascendhq-app.vercel.app` are up. Combined with the pre-existing NEEDS-SRI
item (which of the 4 probed endpoints is actually failing, and why), this
is worth treating as more urgent than "known flaky check" — it's "monitoring
is currently dark."

**NEEDS-SRI** (not code-addressable from here — requires GitHub Settings
login): (a) check whether "Production heartbeat" shows as disabled under
Actions → Production heartbeat → "..." menu, and re-enable if so; (b) sign
in to see the actual failing step's response body/status code (the 07-22
note already narrowed it to a fast non-retryable failure on one of
`/healthz`, `/readyz`, the `/api/v1/flags` 401-check, or the frontend root);
(c) confirm whether `ascendhq-api.vercel.app` is actually degraded right
now, independent of the workflow.

## 5. Production (`master`) is still on `ed448ed` — develop has moved on significantly, as designed

CI's workflow-runs page confirms `master`'s last CI-triggering push was CI
run #493 (PR #105 merge, commit `ed448ed`, 2026-07-20/21). Everything since
— PR #106 (product-module cleanup), #107 (tab-group labels), #108 (transfer
pagination), #109 (retire inventory/expiry), #110 (Product/CatalogProduct
type consolidation), plus the unpushed Phase 4a/3 work and this session's
`ai_assistant` commits — has landed only on `develop`. This matches the
repo's own policy ("master merges are Sri-only," direct-to-master requires
Sri) and isn't itself a bug, but it does mean production has been running
increasingly stale code for ~6 days while `develop` accumulated real fixes
(inventory transfer pagination, the inventory/expiry retirement, etc.) that
customers on prod don't have yet. Flagging as a reminder against the
"keep develop ≥ staging ≥ master in sync" invariant `AGENTS.md` itself
states, not a new discovery — Sri already has PR #120 open (develop) plus
the earlier-noted backlog of unreviewed feature branches.

## 6. Backup cron — unchanged, still the known 07-22 finding

Not re-verified in depth this pass (would require the same GitHub Settings
access as §4); no reason to believe it changed — `PROD_DATABASE_URL` being
unset is a one-time infra setup step, not something that self-resolves.
Still NEEDS-SRI per the 07-22 LOCK.md note.

## 7. No new code bugs found this pass

Unlike the 07-19 continuation (which found 4 real bugs by writing tests for
untested modules) and the Phase 4a wave (reliability gaps), this pass found
zero new code-level bugs. The two real findings above (§4, §5) are
operational/infra visibility gaps, not application defects — consistent
with the codebase being in a genuinely more mature state now than in
mid-July.

## Summary

| Area | Result |
|---|---|
| Automated guards (hygiene/gap:scan/table:scan/typecheck ×2) | Clean |
| New modules since 07-19 | 1 (`ai_assistant`) — already audited this session |
| New tables since 07-19 | All tenant-scoped, RLS-covered |
| Code bugs found | 0 |
| Real findings | 2 — both operational, both NEEDS-SRI (§4 heartbeat gone silent, §5 prod six days stale) |
