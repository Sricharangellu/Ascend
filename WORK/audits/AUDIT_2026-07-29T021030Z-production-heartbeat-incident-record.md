# Incident record: Production heartbeat red, root cause unconfirmed against real production

Status: OPEN. This is a record, not a resolution — written before root cause against
actual production is confirmed, per Sri's request to document while investigation is
still blocked. Supersedes nothing; consolidates `AUDIT_2026-07-28T215857Z-heartbeat-
stale-endpoint-root-cause.md` and `AUDIT_2026-07-29T010839Z-heartbeat-plan-
correction.md` into one timeline.

## Timeline

| When (UTC) | Event |
|---|---|
| 2026-07-19T23:58Z | Earliest confirmed red heartbeat run (run #61, commit `29a27d7`) — first observed failure, not necessarily first actual failure (nobody was watching before this). |
| ~2026-07-20 | `docs/architecture/PIPELINE.md` records the backend moving off Vercel serverless onto Render, plus a frontend project rename. Exact time of day not recorded; may predate or coincide with the first observed failure above — not pinned down. |
| 2026-07-22T00:08Z | Run #85, commit `ed448ed` — last of the initially-observed continuous-failure runs. |
| 2026-07-22 | **First detection**: a session notices the red runs and writes an URGENT note in `WORK/LOCK.md`, ~3 days after the first observed failure. Could not identify which of the 4 probed endpoints was failing (GitHub hides step logs from signed-out viewers at the time). |
| 2026-07-22 → 2026-07-26 | Heartbeat goes **completely silent** — zero runs over ~4 days despite a `*/15 * * * *` schedule and continuous repo activity in the same window (ruling out GitHub's 60-day-inactivity auto-disable). Cause of the silence itself: **unresolved**. |
| 2026-07-26T05:29Z | **Second detection**: a fresh gap audit re-confirms the silence, still can't identify the failing endpoint, flags NEEDS-SRI (`AUDIT_2026-07-26T052958Z-fresh-gap-audit.md`). |
| 2026-07-27T19:54Z | Heartbeat **resumes** running. Mechanism unknown — no corresponding commit or repo event explains the resumption. |
| 2026-07-27T19:54Z → 2026-07-28T20:45Z+ | Continuous failures resume, ~90 min cadence, 10+ consecutive red runs. |
| 2026-07-28T21:58Z | This session root-causes it: every URL the repo documents anywhere (heartbeat targets, `.env.example` CORS default, `PIPELINE.md`'s own table, 5 historical rebrand aliases) returns `404`/`DEPLOYMENT_NOT_FOUND` on direct curl. Conclusion: monitoring config drift from the 07-20 migration, not confirmed evidence of a live outage. |
| 2026-07-29T01:08Z | A concurrent session independently reaches the same conclusion, corrects a differently-scoped remediation plan that had assumed the backend was still on Vercel. |
| Now | Blocked on Sri supplying the real Render backend URL + current frontend domain from the dashboards — no sandbox in this project has that access. |

## Symptoms observed

- GitHub Actions "Production heartbeat" red on essentially every run across the whole
  window above, with one ~4-day gap of no runs at all.
- Direct probes (this session, 2026-07-28) of every URL this repo documents anywhere
  for backend or frontend all return `404` or Vercel's literal `DEPLOYMENT_NOT_FOUND`.
- No code-level bug found anywhere in this chain — `/healthz` itself is fine in source
  (`src/app.ts:241`); confirmed by two independent passes.

## Impact

**Unverified, not "none" and not "confirmed outage."** This is the central open
question. Every signal available from inside this repo points at the monitor checking
a dead address, not at a live customer-facing failure — but nothing in this repo can
confirm actual production health one way or the other, because the real production
URL isn't recorded anywhere in git. No customer reports, support tickets, or other
independent health signal have surfaced in the repo to corroborate either reading.

## Hypotheses, ranked by evidence

1. **(Leading)** Monitoring config drift: the heartbeat, CORS defaults, and pipeline
   docs were never updated after the 2026-07-20 Vercel→Render migration + frontend
   rebrand. The endpoints being checked simply don't exist anymore; production itself
   may be entirely healthy on Render at a URL nobody wrote down.
2. **(Open)** Why did the heartbeat go fully silent for ~4 days (07-22→07-26)? Not
   explained by any repo-visible mechanism. Possibilities: manual disable/re-enable via
   the GitHub Actions UI, a platform-side scheduling hiccup, or something not yet
   considered. Lower priority than the main finding — doesn't block the fix — but
   should not be forgotten.
3. **(Not ruled out)** An actual, coincidental production degradation. Cannot be
   excluded without checking the real Render dashboard directly.

## Next investigation steps (in order)

1. Sri checks the Render dashboard for the actual backend service: deployment status,
   latest deploy timestamp/commit, runtime logs, current external URL.
2. Sri checks the Vercel dashboard for the actual current frontend project/domain
   (project name per `PIPELINE.md` is `ascend_hq_web`, but its live domain isn't
   recorded in the repo).
3. Direct `curl /healthz` and `/readyz` against the real URLs once known.
4. If healthy: update `.github/workflows/uptime.yml`, `.env.example`'s
   `ALLOWED_ORIGINS` default, and `PIPELINE.md`'s pipeline table to the real values;
   drop `ci.yml`'s redundant Vercel-backend `deploy-production`/`smoke-test` step per
   `PIPELINE.md`'s own already-flagged TODO. No app-logic change.
5. If unhealthy: this becomes a real incident response, separate from the monitoring
   config fix.
6. Separately, lower priority: investigate the unexplained 07-22→07-26 silent gap.

## Process gap this incident exposed (recommendation, not implemented)

The heartbeat did its job — it correctly went red. What's missing is what happens
after a red run: no owner, no escalation, no severity classification, no required
acknowledgment, no notification beyond a GitHub Actions status (visible only to
someone who goes looking). Concretely, for Sri to decide, not built here:

- **Ownership**: who is paged/notified when the heartbeat goes red — today, no one.
- **Escalation**: how long red is tolerated before it becomes a "drop everything"
  event (this one sat red for days across two separate windows).
- **Severity classification**: a red heartbeat on `master` is not automatically
  equivalent to a red heartbeat on a stale branch — needs an explicit rule.
- **Acknowledgment**: some record that a human has seen and is handling a red run,
  distinct from it just being visible in the Actions tab.
- **Notification channel**: GitHub's own UI is not sufficient, per this exact
  incident sitting unactioned for 2+ days the first time. Slack/PagerDuty/Sentry cron
  monitors were already flagged as a deferred follow-up when the heartbeat was first
  built (`.github/workflows/uptime.yml`'s own header comment) — still deferred, still
  Sri's call on which channel and how much to invest.

This is a recommendation for Sri to prioritize, not something implemented in this
audit — matches this repo's own standing rule that new alerting infrastructure is a
deliberate decision, not a default.
