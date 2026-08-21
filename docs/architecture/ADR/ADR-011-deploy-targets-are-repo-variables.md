# ADR-011: Every deploy and probe target is a repo variable, never a hardcoded hostname

Date: 2026-08-06 · Status: Accepted
Owner: Claude Code session — ERP infrastructure audit

**Context:** This repository has spent two weeks unable to answer where its own
production is. `docs/architecture/DEPLOYMENTS.md` documents the full incident:
three of this repo's own documents assert production moved to Render on
2026-07-20, zero lines of deploy automation support that, and the claimed URL
answers from no network tested.

The mechanical cause is narrower than the confusion around it. Hostnames were
written into workflow YAML as literals, in more than one place, and those places
drifted apart:

- `uptime.yml` probed `ascendhq-api.vercel.app` every 15 minutes and had failed
  ~30 consecutive runs against a hostname returning `DEPLOYMENT_NOT_FOUND` since
  2026-07-23.
- `ci.yml`'s `smoke-test` — the last gate before a release is declared good —
  probed *the same dead hostname*, hardcoded separately.
- `ci.yml`'s `deploy-production` declared its GitHub environment URL as a third
  hardcoded copy.
- `scripts/deploy.sh` carried its own historical defaults.

PR #191 fixed the first of those by moving `uptime.yml`'s targets to
`vars.PROD_BACKEND_URL` / `vars.PROD_FRONTEND_URL`. That was correct and
incomplete: setting the variable fixed the heartbeat and did nothing for the
release gate, so the two production probes in this repo could disagree about
where production is — and would have, silently, on the next release.

The deeper failure is that a hostname change required a code change, a PR, a
review and a merge. Infrastructure moved faster than that, so the code stopped
describing the infrastructure, and every document downstream of the code
inherited the error.

**Decision:** No deployment target, probe target, or environment URL is a
literal in workflow YAML or a script. All of them read repo variables
(Settings → Secrets and variables → Actions → Variables), with the historical
hostname as an inline fallback so setting nothing changes nothing.

The invariant: **repointing any tier of this platform is a repo-variable edit,
never a code change.** A hostname appearing as a literal in
`.github/workflows/**` or `scripts/deploy.sh` — other than as a documented
fallback default — is a defect.

The variables, and every consumer that must read them:

| Variable | Consumers |
|---|---|
| `PROD_BACKEND_URL` | `uptime.yml` heartbeat, `ci.yml` `smoke-test` |
| `PROD_FRONTEND_URL` | `uptime.yml` heartbeat, `ci.yml` `smoke-test`, `deploy-production` environment URL |
| `STAGING_BACKEND_URL` / `_ALIAS`, `STAGING_FRONTEND_ALIAS` | `deploy-staging` |
| `DEV_BACKEND_URL` / `_ALIAS`, `DEV_FRONTEND_ALIAS` | `deploy-dev` |
| `VERCEL_BACKEND_PROJECT_ID`, `VERCEL_FRONTEND_PROJECT_ID` | `scripts/deploy.sh` |
| `*_DEPLOY_TARGET` (`both`/`frontend`/`backend`) | per-tier deploy job |

A corollary that carried real weight here: `PROD_DEPLOY_TARGET=frontend` is how
this repo expresses "the backend is hosted somewhere Vercel is not" without
deleting the deploy job. That is the mechanism by which a Render backend can
become true in CI the moment it is confirmed — no code change, no ADR
supersession.

**Alternatives considered:**

- *Hardcode the correct hostname once the Render question is settled.* Rejected:
  it repeats the exact mistake with a different string. The last hostname was
  correct when written too. Nothing about writing it a second time makes the
  next migration cheaper.
- *Put hostnames in a committed config file* (`deploy-targets.json`) read by
  every consumer. Better than scattered literals, and still a code change to
  repoint — which is the property that failed. It also cannot express
  per-environment values without reinventing what GitHub environments already
  give for free.
- *Derive the URL from the Vercel/Render API at probe time.* Removes the
  duplication genuinely, and adds an API token and a network dependency to the
  monitoring path. A monitor that can fail because its own discovery call failed
  is worse than one pointed at a stale name: this repo has already seen how
  expensive it is when a red heartbeat means something other than "the service
  is down."
- *Do nothing — the heartbeat is already fixed.* This is what leaves
  `smoke-test` gating releases against a dead hostname.

**Consequences:**

- Repointing production is a two-variable edit, applying to both probes at once.
  They cannot drift apart, because there is one value.
- The fallback defaults are now the only hostnames left in the workflows, and
  each one is annotated at its use site with whether it is live or dead, so
  nobody mistakes a fallback for a fact. **Updated 2026-08-07:** when this ADR
  was written both fallbacks were dead. PR #201 then confirmed the production
  frontend with Sri — `ascendhqweb.vercel.app`, Vercel project `ascend_hq_web` —
  so the frontend fallback is now a *working* default and only the backend one
  (`ascendhq-api.vercel.app`, `DEPLOYMENT_NOT_FOUND` since 2026-07-23) is still
  dead. That asymmetry is the point rather than a wart: this ADR's indirection is
  what let a confirmed hostname land as a one-line default without touching the
  probe logic, and it is what will let the backend do the same the moment
  `DEPLOYMENTS.md` P1 is answered.
- Anyone reading `ci.yml` can no longer learn the production URL from it. That
  is a real loss of local readability, accepted because the thing it previously
  told you was wrong.
- This ADR does **not** decide where production runs. That remains open, gated
  on Render/Vercel/Supabase dashboard facts only Sri can confirm — see
  `DEPLOYMENTS.md`'s P0–P3 plan. **Evidence bar for the follow-up:** once the
  real origin is confirmed and the variables are set, the heartbeat going green
  is the proof; until then, do not merge a "fixed" URL, because an unverified
  URL in a monitor is worse than a known-stale one — it looks fixed.

**Supersedes:** none. Extends PR #191, which introduced the variables for
`uptime.yml` only.

**Related Issues:** none.

**Related PRs:** #191.
