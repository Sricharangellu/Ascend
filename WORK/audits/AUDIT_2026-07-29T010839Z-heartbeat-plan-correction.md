# Correction: proposed remediation plan for the heartbeat failure was built on a stale premise

Scope: addendum to `AUDIT_2026-07-28T215857Z-heartbeat-stale-endpoint-root-cause.md`.
That audit already root-caused the failing "Production heartbeat" GitHub Action.
Shortly after, a remediation plan was proposed (via Sri, relaying another
session/tool's output) that assumed a different, incompatible root cause. This
audit records the correction so the wrong plan isn't acted on by any session
that reads `WORK/LOCK.md`/`FORWARD_PLAN.md` without also reading the heartbeat
audit first.

## What the proposed plan assumed

The plan's operating model was: production backend is still served from Vercel
project `ascendhq-api`; the 2026-07-20 deployment to it may not have completed
successfully; PR #82 may not be the commit actually running in production; and
the fix path runs through Vercel's dashboard (deployment status, domains,
build & deployment settings, env vars) and `GET /healthz`/`/readyz` against
`ascendhq-api.vercel.app`.

## Why that doesn't match the confirmed facts

| Plan assumption | Actual, verified state |
|---|---|
| Backend is on Vercel (`ascendhq-api`) | Moved to Render on 2026-07-20, per `docs/architecture/PIPELINE.md`. Every Vercel backend URL in the repo returns `404`/`DEPLOYMENT_NOT_FOUND` (direct curl, logged in the prior audit) — expected, not evidence of a broken deploy. |
| 07-20 deployment may have failed | 07-20 is the migration date recorded in `PIPELINE.md`, not a failed-deploy timestamp. No evidence anywhere of a failed deployment on that date — only that nothing downstream (heartbeat, `.env.example`, `ci.yml`) was updated to reflect the migration. |
| PR #82 may not be what's running in prod | PR #82 merged to master on 2026-07-19/20 (`ed1c02b`, logged in `0a58c22`), *before* the Vercel→Render migration. It predates and is unrelated to the current heartbeat failure. |
| `/healthz` route itself may be broken | Already ruled out in the prior audit — the route is fine in source (`src/app.ts:241`). Zero code bugs found. |
| There is an active production outage to restore from | Not established either way. The prior audit's own conclusion: "This is not evidence that production is actually down... Actual prod health: Unverified." |

## Corrected next step

This collapses to the same single NEEDS-SRI blocker the prior audit already
named — nothing has changed that:

1. The real current Render backend URL (for `/healthz`, `/readyz`, `/api/v1/flags`).
2. The real current live frontend URL.

No sandbox in this project has Vercel/Render CLI or dashboard credentials, so
this cannot be looked up by any agent session — it has to come from Sri
directly from the dashboards. Once supplied, the fix is exactly what the prior
audit scoped: point `.github/workflows/uptime.yml` at the real URLs, fix
`.env.example`'s `ALLOWED_ORIGINS` default, and drop the redundant Vercel
`deploy-production`/`smoke-test` step from `ci.yml` per `PIPELINE.md`'s own
flagged TODO. No app-logic change, no Vercel-dashboard investigation needed.

## Isolated parallel work

Not affected by this correction. The proposed rules for a concurrent session's
isolated commit (own files only, no deployment/health-route/CI/Vercel-config
changes, no stash, no resolving other agents' files) match this repo's
existing `WORK/LOCK.md` "Parallel Non-Overlapping Claim" convention and remain
sound regardless of the heartbeat finding above.
