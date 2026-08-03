# Heartbeat failure — root cause found (follow-up to AUDIT_2026-07-26T052958Z §4)

Scope: root-cause the "Production heartbeat" workflow failures. Prompted by the new
VISION skill's first real report (2026-07-28), which flagged the heartbeat as HIGH risk.
The 07-26 audit had already found the heartbeat had gone silent (zero runs 07-22→07-26,
cause unexplained, NEEDS-SRI). It has since resumed running (first new run
2026-07-27T19:54Z) and is now failing on every run — this audit explains why. Method:
read the actual GitHub Actions failure logs (`gh run view --log-failed`), cross-checked
against live curl probes and the repo's own docs.

## Finding: the heartbeat is checking decommissioned URLs, not current production

`.github/workflows/uptime.yml` was written 2026-07-15 and hardcodes four URLs:

- `https://ascendhq-api.vercel.app/healthz`
- `https://ascendhq-api.vercel.app/readyz`
- `https://ascendhq-api.vercel.app/api/v1/flags`
- `https://ascendhq-app.vercel.app/`

`docs/architecture/PIPELINE.md` (dated 2026-07-20, five days after the heartbeat was
written) documents an infrastructure migration that makes these stale: **production
backend moved off Vercel serverless onto Render**, and the frontend has been through
multiple rebrand renames (`finder-pos` → `finder-pos-web` → `finder-pos-frontend` →
`ascend-pos-frontend` → `ascendhq-app`, per the CORS allowlist history in
`src/app.ts:155-164` / `.env.example:99`). PIPELINE.md itself flags this exact gap: "CI's
`deploy-production`/`smoke-test` still deploy/probe a Vercel backend — that path is now
redundant... needs reconciling." The heartbeat was never updated to match.

**Verified live** (direct curl, 2026-07-28, not just reading the failing CI log):

| URL | Result |
|---|---|
| `ascendhq-api.vercel.app/healthz` | `404` |
| `ascendhq-api.vercel.app/readyz` | Vercel `DEPLOYMENT_NOT_FOUND` (project/alias doesn't exist) |
| `ascendhq-app.vercel.app/` | `404` |
| `finder-pos-frontend.vercel.app/` (PIPELINE.md's own documented PROD frontend URL) | `404` |
| `finder-pos.vercel.app/`, `finder-pos-web.vercel.app/`, `ascend-pos-frontend.vercel.app/` (older CORS-allowlist rebrand aliases) | `404`, all five |

Every URL this repo currently documents anywhere — the heartbeat, `.env.example`'s CORS
default, and PIPELINE.md's own pipeline table — is dead. None resolve to a live
deployment.

## What this means (and doesn't mean)

This is **not evidence that production is actually down**. It's evidence that **nothing in
the repo currently records where production actually lives** post-migration. The real
Render backend URL and the real current frontend domain exist only in the Vercel/Render
dashboards, not in git. The heartbeat, the CORS allowlist default, and PIPELINE.md's
pipeline table have all drifted out of sync with the 07-20 migration in the same way.

I stopped here deliberately: guessing at a replacement URL and hardcoding it would be
worse than the current honest-red state (it could go green while monitoring nothing, or
stay red for a new wrong reason). No `vercel`/`render` CLI is available in this
environment to look it up directly.

## NEEDS-SRI

Provide (from the Vercel/Render dashboards):
1. The current Render backend URL (for `/healthz`, `/readyz`, `/api/v1/flags`).
2. The current live frontend URL (whichever of the rebrand aliases — or a new one — is
   actually aliased to the `ascend_hq_web` / current frontend project today).

Once known, three fixes land together (small, mechanical, no app-logic change):
- `.github/workflows/uptime.yml` — point at the real URLs.
- `.env.example`'s `ALLOWED_ORIGINS` default and PIPELINE.md's pipeline table — same.
- Reconcile `ci.yml`'s `deploy-production`/`smoke-test` Vercel-backend step per
  PIPELINE.md's own already-flagged TODO (redundant since the Render migration).

## Summary

| Area | Result |
|---|---|
| Code bug found | 0 — `/healthz` route itself is fine (`src/app.ts:241`) |
| Root cause | Monitoring config drift: heartbeat + docs never updated after the 2026-07-20 Vercel→Render backend migration + frontend rebrand |
| Actual prod health | Unverified — NEEDS-SRI, no live URL known to check from this environment |
| Fix complexity | Low once the real URLs are known; blocked purely on that input |
