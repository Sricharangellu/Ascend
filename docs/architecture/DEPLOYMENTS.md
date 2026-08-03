# Ascend — Deployment Reality (infrastructure reconciliation, opened 2026-07-30)

**Status: OPEN INCIDENT / RECONCILIATION — this document exists to separate confirmed fact from
documented-but-unverified claim.** Every field below is either cited to a direct check performed
in this repo/session, or explicitly marked UNKNOWN. Do not add a value here without a citation —
this document exists specifically because two prior docs (`PIPELINE.md` 2026-07-20 vs. its own
2026-07-23 re-verification note) already contradicted each other, and a third guess would make
that worse, not better. See `WORK/audits/AUDIT_2026-07-29T*-production-heartbeat-*.md` and commit
`978c154` for the investigation history this builds on.

**Prerequisite correction, merged 2026-07-30 (PR #117):** the 2026-07-23 re-verification (commit
`978c154`) that this document builds on had itself been sitting unmerged for a full week — the
correction existed, but `develop` never had it, so every session reading `ARCHITECTURE.md`/
`ORCHESTRATION.md`/`PIPELINE.md` in that window saw the original unqualified "prod moved to
Render" claim with no caveat attached. PR #117 is now merged; `develop` carries the correction.
This document's baseline is current as of that merge, not before it.

## Executive summary

1. **Is production currently down?** UNKNOWN — pending Sri's manual browser check of
   `https://ascend-prod.onrender.com/healthz`. This is the single fact everything else forks on.
2. **Where does production actually run?** UNCONFIRMED. Docs claim Render; zero deploy automation
   in this repo supports that claim, and the URL doesn't respond from three independent networks
   (this sandbox, a GitHub Actions runner via `workflow_dispatch` — run `30565267888` — and Cursor
   Cloud, all three getting an identical complete-timeout/zero-bytes result).
3. **What deployment path is authoritative?** None, currently. `ci.yml`/`scripts/deploy.sh` deploy
   backend to Vercel project IDs that are either dead (`DEPLOYMENT_NOT_FOUND`) or serving an
   unrelated app. Render is claimed as the real target but has no representation in this repo's
   CI/CD at all — no workflow, no deploy hook, no `render.yaml`.
4. **What database does production use?** UNCONFIRMED. Docs claim an isolated `ca-central-1`
   Supabase project created 2026-07-20, never confirmed to have received a live connection. The
   project that's actually been populated and in use (172 tables, demo login, `us-west-2`) is the
   one documented as *testing*'s.
5. **What's broken?** Confirmed broken: the heartbeat monitor (probing dead URLs) and the CI/CD
   deploy automation (disconnected from whatever's actually real, if anything, in production).
   Possibly broken: production itself — unconfirmed pending item 1.

## Evidence table

| Finding | Evidence | Impact |
|---|---|---|
| `ci.yml`/`scripts/deploy.sh` have zero Render logic | `grep -n "backend" scripts/deploy.sh` — every tier (`prod`/`testing`/`dev`) uses `npx vercel deploy` against hardcoded `BACKEND_PID`/`FRONTEND_PID` | CI/CD cannot be deploying to Render under any circumstance; if Render is real, it shipped entirely outside this repo's automation |
| `ascendhq-api.vercel.app` (heartbeat's current probe target) is dead | `x-vercel-error: DEPLOYMENT_NOT_FOUND` (verified 2026-07-23 per commit `978c154`, re-confirmed this session) | Every heartbeat failure since ~2026-07-22 is noise from a dead URL, not evidence of an outage |
| `ascend-backend-staging.vercel.app` is dead | Same error, same commit; re-confirmed via the PR #116 staging-deploy failure log this session | Staging/dev backend deploy has been broken since at least 2026-07-23 |
| `ascend-backend.vercel.app` resolves but serves a bare, unrelated Express app | Commit `978c154`'s direct check | Contradicts the 2026-07-20 doc's claim that this project was deleted — one of the two is wrong |
| `ascend-prod.onrender.com` DNS resolves to genuine Render→Cloudflare infrastructure | `nslookup` → `gcp-us-west1-1.origin.onrender.com.cdn.cloudflare.net`, real IPs | The hostname/service registration is real, not a typo |
| But the same URL times out completely (0 bytes) from 3 independent networks | This sandbox (60s × 3 retries), a GitHub Actions runner via `workflow_dispatch` (run `30565267888`, job "Probe production endpoints"), and Cursor Cloud (`curl: (28) Operation timed out after 20002 milliseconds with 0 bytes received`) | Rules out "sandbox network restriction" even more strongly with a third, differently-hosted network; consistent with the service never having come up live, or being a private (non-public) Render service |
| `src/server.ts` binds correctly for Render (`process.env.PORT`, no host restriction) | Direct code read | Rules out an obvious app-level binding bug as the cause |
| Frontend "git-connected" (PIPELINE.md, 2026-07-20) contradicts "NOT git-connected, manual CLI" (`scripts/deploy.sh` header comment) | Direct text of both files | One of this repo's own docs is wrong about its own deploy mechanism |
| "Testing" Supabase project (`us-west-2`) has ~172 tables + demo login; "production" project (`ca-central-1`) has no confirmed connection ever | `PIPELINE.md`'s own Supabase section + this session's own backend connection matches `us-west-2` | The database actually in use may not be the one labeled production |
| Two Vercel secrets exist (`VERCEL_TOKEN`, `VERCEL_TOKEN_PROD`); the non-prod one was dead since 2026-07-20 (commit `c8185d9`, never merged/actioned) until rotated this session | `gh secret list` timestamps; git history | A previously-diagnosed fix sat unactioned for 10 days because the finding was made on a branch that never merged |

## Architecture reality map

**Documented (claimed, 2026-07-20):**
```
Users → Vercel (frontend, git-connected to master)
      → Render (backend, git-integration auto-deploy on push to master)
                → Supabase "production" (ca-central-1, isolated)
      → uptime.yml (monitors the above)
```

**Confirmed-working, this repo's own CI/CD (`ci.yml`/`scripts/deploy.sh`):**
```
Users → Vercel (frontend, manual-CLI deploy per scripts/deploy.sh's own header comment)
      → Vercel (backend — but the project this targets is dead or serves the wrong app)
                → Supabase "testing" (us-west-2 — the one actually populated and in use)
      → uptime.yml (monitors neither of the above — probes a third, also-dead Vercel URL)
```

Three different pictures of "where production is" exist simultaneously in this repo right now,
and none of them has a confirmed, responding endpoint behind it. That gap — not the red heartbeat
run — is the actual finding.

## Recommended fix plan

- **P0 — Production availability.** Confirm via Sri's browser check whether `ascend-prod.onrender.com/healthz`
  responds at all. If it's a real outage: restore before anything else below. If it's blocked for
  automated/non-browser requests specifically: that's a Render networking/WAF question, still P0,
  because a monitor that can't reach a healthy service is as broken as a monitor pointed at a dead one.
- **P1 — Deployment ownership correction.** Get Render dashboard/API-confirmed answers to: is this
  the real backend, git-integration or manual, which branch, build/start commands, public or private
  service, currently running or not. Then execute Option A or B (see below) — do not leave both
  paths half-configured, which is the current state.
- **P2 — Documentation reconciliation.** Once P1 answers exist, every doc that mentions hosting
  (`ARCHITECTURE.md`, `ORCHESTRATION.md`, `PIPELINE.md`, this file) must agree with each other and
  with `scripts/deploy.sh`/`ci.yml`. Resolve the two direct contradictions this document lists above.
- **P3 — Monitoring correction.** Only after P1/P2: merge `fix/uptime-heartbeat-stale-endpoints`
  (currently held) with the confirmed-real URL, and fix the frontend probe the same way once its
  real URL is known too.

## Timeline of claims (each contradicts or narrows the last)

| Date | Claim | Source | Status |
|---|---|---|---|
| 2026-07-20 | Prod backend moved off Vercel onto Render; Render's git-integration auto-deploys on push to `master`; new isolated Supabase project (`kplruangtivthgqudjwt`, ca-central-1) created for prod; non-prod Vercel backend project deleted | `PIPELINE.md` "Configuration" section | **Unverified** — written at migration time, never re-checked against a live endpoint |
| 2026-07-22 | Production heartbeat starts failing (`ascendhq-api.vercel.app/healthz`) | GitHub Actions run history | Confirmed — first observed red run |
| 2026-07-23 | Re-verification: `scripts/deploy.sh` has zero Render logic (still targets Vercel for every tier); 3 candidate backend URLs (`ascendhq-api.vercel.app`, `ascend-backend-staging.vercel.app`, `ascend-backend.vercel.app`) checked — first two `DEPLOYMENT_NOT_FOUND`, third resolves but serves a bare unrelated Express app; "the real Render URL, if one exists, is not recorded anywhere in this repository" | Commit `978c154` | Confirmed by direct HTTP checks at the time |
| 2026-07-23 | **Contradicts the 2026-07-20 "project deleted" claim**: `ascend-backend.vercel.app` (the same project `deploy.sh`'s `BACKEND_PID` still targets) resolves and serves *something* — not consistent with "deleted this session" | Commit `978c154` | **Unresolved contradiction** — not adjudicated here |
| 2026-07-30 | Sri supplies `https://ascend-prod.onrender.com` as the current prod backend URL | This conversation | DNS resolves cleanly (real Render→Cloudflare chain: `gcp-us-west1-1.origin.onrender.com.cdn.cloudflare.net`) — but **times out completely** (zero bytes) from three independent networks: this sandbox, a GitHub Actions runner via `workflow_dispatch` (run `30565267888`), and Cursor Cloud |
| 2026-07-30 | Sri manually verifying `/healthz` in a browser | This conversation | **Pending** — result determines whether this is an app-down incident or an automated-request-blocking issue (WAF/private networking/bot protection) |
| 2026-07-30 | PR #117 (the 2026-07-23 correction, commit `978c154`) merged to `develop` | This conversation | Closes the "correction existed but never merged" gap — restores the missing audit signal so this document and `develop` agree |
| 2026-07-30 | Cursor (a third, independent environment/network) curls `/healthz` directly, unprompted for this specific check beyond a general ask | Cursor's own status report, this conversation | `curl: (28) Operation timed out after 20002 milliseconds with 0 bytes received` — identical failure mode to the other two networks. Three-for-three on complete timeout meaningfully weakens the "one network's fluke" explanation |

## What this means (working hypothesis, not confirmed)

The most evidence-consistent explanation right now: **the 2026-07-20 Render cutover may never have
come up as a live, traffic-serving deployment.** Every symptom is consistent with "the service was
provisioned but never successfully started/stayed up" rather than "it was working and later broke":
DNS resolves to genuine Render infrastructure, but nothing behind it ever answers, from any network
tested. This is a hypothesis to disprove or confirm via Render's own dashboard/deploy logs — not a
conclusion, since no one on this investigation has had that access.

## Production

| Field | Value | Confidence |
|---|---|---|
| Backend provider | Claimed: Render. **Not independently confirmed** — no working endpoint found yet. | UNCONFIRMED |
| Backend service name | UNKNOWN | Needs Render dashboard |
| Backend URL | `https://ascend-prod.onrender.com` (supplied 2026-07-30) — unresponsive from 3 independent networks as of this writing | UNCONFIRMED LIVE |
| Deploy trigger | Claimed: Render git-integration, auto-deploy on push to `master` (per 2026-07-20 doc). **Not verified** — could also be manual dashboard deploys; `scripts/deploy.sh`/`ci.yml` have no Render deploy step either way, so the repo's own CI/CD does not drive this regardless of which is true. | UNCONFIRMED |
| Repository / branch | If git-integration: presumably this repo, `master`. UNKNOWN whether Render's dashboard actually has this configured, or to what branch. | UNKNOWN |
| Build command | UNKNOWN | Needs Render dashboard |
| Start command | Presumed `npm start` / `tsx src/server.ts` (repo convention — `package.json`'s `start` script), but not confirmed as what Render actually runs | UNCONFIRMED |
| Public vs. private service | UNKNOWN — a Render *private* service (internal-network-only) would produce exactly the symptom seen (DNS resolves, no external response ever) | UNKNOWN, high relevance |
| Running / suspended / crash-looping | UNKNOWN | Needs Render dashboard deploy/build logs |
| Database (Supabase project) | Claimed: new isolated project, ref `kplruangtivthgqudjwt`, region `ca-central-1`, created 2026-07-20 specifically for prod, "connected only from Render." **Never confirmed as actually receiving a connection** — see Database section below. | UNCONFIRMED |
| Frontend provider | Vercel, project `ascend_hq_web` | Documented (2026-07-20 doc), not independently re-verified this session |
| Frontend deploy trigger | **Contradicted between two of this repo's own docs**: `PIPELINE.md`'s 2026-07-20 section says "git-connected to `master`"; `scripts/deploy.sh`'s own header comment says "These Vercel projects are NOT git-connected, so deploys are manual CLI uploads." Both cannot be true simultaneously. | CONTRADICTION, unresolved |
| Monitoring | `.github/workflows/uptime.yml`, every 15 min — currently probes stale/dead URLs (see `fix/uptime-heartbeat-stale-endpoints`, held unmerged pending this reconciliation) | Confirmed broken, fix pending confirmation of the real URL |

## Testing (develop + staging, shared)

| Field | Value | Confidence |
|---|---|---|
| Backend provider | Vercel (per `scripts/deploy.sh`'s `BACKEND_PID`) — but the 2026-07-20 doc claims this project was deleted that session, while the 2026-07-23 check found it still resolves (serving an unrelated bare app). Contradiction, unresolved. | CONTRADICTION |
| Backend URL | `ascend-backend-staging.vercel.app` (alias) — confirmed dead, `DEPLOYMENT_NOT_FOUND`, both 2026-07-23 and independently re-confirmed this session | Confirmed dead |
| Database (Supabase project) | Pre-existing project, ref `lqaicxibgrlxwkvxsaji`, region `us-west-2`, shared by `develop` + `staging`. Already has ~172 tables + demo login self-provisioned — **this is the database that's actually been in real, active use** (matches this session's own local backend connection). | Confirmed in active use — see note below |
| Frontend | Vercel preview builds (`develop`/`staging` both deploy as Preview, sharing Preview env vars → this same testing database) | Documented, consistent with the DB finding above |
| Monitoring | None dedicated — only the prod heartbeat exists today | Confirmed by reading `.github/workflows/` — only `uptime.yml`, prod-only |

**Note on the database finding**: the region/project that's actually been carrying real schema and
data this whole session (172 tables, demo login) is the one labeled *testing* (`us-west-2`), not
the one labeled *production* (`ca-central-1`). If the Render prod cutover never came up live, the
practical reality may be that **no traffic has ever reached the "production" database** — everything
anyone has verified against in recent sessions (this one included) has been the testing project.
This needs direct confirmation, not inference — but it's the single most important thing to check
before assuming "production" means what the docs say it means.

## Open questions (in priority order, per Sri's 2026-07-30 framing)

1. **Is production actually down right now?** — pending Sri's manual browser check of
   `https://ascend-prod.onrender.com/healthz`. If down: restore service before anything else below.
2. **Is Render the real, intentional production backend** — confirm via Render dashboard, not
   inference. If yes: reconcile `scripts/deploy.sh`/`ci.yml` to actually deploy there (or explicitly
   defer to Render's own git-integration and remove the now-dead Vercel backend prod job). If no
   (Render was an abandoned/incomplete attempt): decide whether to resume it or revert to a working
   Vercel backend deploy — either way, stop leaving both paths half-configured.
3. **Which Supabase project does the real running backend (wherever it is) actually connect to?**
   — check the live service's `DATABASE_URL`, not the docs.
4. **Resolve the two direct contradictions this document surfaces**: (a) frontend git-connected vs.
   manual-CLI, (b) non-prod backend Vercel project deleted vs. still resolving.

## CI/CD reconciliation options (decision needed — not made here)

Both paths are mechanically straightforward; the blocker is factual (question 2 above), not
technical. Do not pick one until that's answered.

**Option A — make Render the real, CI-driven production deploy:**
- Remove the `deploy-production` Vercel-CLI backend deploy from `ci.yml` (frontend stays on Vercel
  either way — Render replaces the *backend* deploy only).
- If Render's own git-integration is the deploy mechanism (per the 2026-07-20 claim): `ci.yml` needs
  no deploy step for backend at all, just a post-deploy smoke check against the real Render URL,
  same shape as today's `Post-deploy smoke test (production)` job. Delete `VERCEL_TOKEN_PROD` once
  nothing references it (`PIPELINE.md` already flags it as "legacy... candidate for removal").
- If Render should instead be CI-driven (not git-integration): add a real Render deploy step
  (Render's CLI or deploy-hook URL) to `ci.yml`/`scripts/deploy.sh`, mirroring the existing Vercel
  pattern.
- Either way: `uptime.yml` and `scripts/deploy.sh`'s `BACKEND_URL` defaults get the real Render
  origin, replacing every dead `*.vercel.app` reference this document lists above.

**Option B — Render was an incomplete/abandoned attempt; keep the backend on Vercel:**
- Recreate/restore a working backend Vercel project (or fix whichever project `BACKEND_PID`
  currently points at — it resolves but serves the wrong app, per the contradiction above).
- Remove every Render reference from `ARCHITECTURE.md`/`ORCHESTRATION.md`/`PIPELINE.md` — currently
  three docs assert it as fact.
- `uptime.yml` reverts to probing a real Vercel backend URL instead of a Render one.
- The "new isolated prod" Supabase project (`kplruangtivthgqudjwt`) either becomes the real target
  for this restored Vercel backend, or gets abandoned in favor of whatever's already proven to work
  — needs its own explicit decision, not an assumption.

**What's not acceptable either way** (Sri's framing, worth restating as the actual bar): three docs
currently assert Render as settled fact while zero lines of deploy automation and zero confirmed
working endpoints support that. Whichever option is chosen, every doc that mentions hosting must
agree with what `scripts/deploy.sh`/`ci.yml` actually do — a doc and its automation describing two
different realities is what let this drift 10 days undetected.

## What NOT to do until the above is answered

- Do not merge `fix/uptime-heartbeat-stale-endpoints` — an unverified URL in the monitor is worse
  than a known-stale one, because it looks fixed.
- Do not delete or "clean up" any of the Vercel projects/aliases referenced above — several may
  still be load-bearing in ways this document hasn't captured.
- Do not assume either Supabase project is safe to ignore or reset.
