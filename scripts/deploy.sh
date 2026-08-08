#!/usr/bin/env bash
# One-command Vercel deploy for Ascend (backend + frontend) from the current
# working tree. These Vercel projects are NOT git-connected, so deploys are
# manual CLI uploads — this script codifies the full, finicky recipe so the live
# site never drifts behind the repo again. Driven by ci.yml's 3-tier pipeline
# (develop → staging → master); also runnable by hand.
#
#   VERCEL_TOKEN=xxx DEPLOY_ENV=prod ./scripts/deploy.sh [backend|frontend|both]
#
# Environment tiers (DEPLOY_ENV):
#   prod     → Vercel Production (--prod). Uses the Production env vars in Vercel
#              (prod Supabase). BACKEND_URL defaults to the prod backend domain.
#   testing  → Vercel Preview. Points at the TESTING backend/DB (Supabase B, the
#              project's stored Preview env vars); aliased to stable staging
#              domains when *_ALIAS set.
#   dev      → Vercel Preview. Own dedicated backend/DB when DATABASE_URL is
#              supplied (overrides the project's stored Preview value for just
#              this deployment via `vercel deploy --env`); falls back to the
#              stored value (same DB as testing) if DATABASE_URL is unset.
#
# Env inputs:
#   VERCEL_TOKEN      (required) Vercel token with team-scope access.
#   DEPLOY_ENV        prod | testing | dev            (default: prod)
#   BACKEND_URL       backend origin the frontend proxies to. Defaults to the
#                     prod domain for prod; REQUIRED for testing/dev so a non-prod
#                     frontend can never silently talk to the prod backend/DB.
#   BACKEND_ALIAS     (optional) stable domain to alias the non-prod backend deploy
#                     to (e.g. ascend-api-staging.vercel.app).
#   FRONTEND_ALIAS    (optional) stable domain to alias the non-prod frontend deploy.
#   NEXT_PUBLIC_MOCK  (optional) frontend mock switch. Defaults to "false" on every
#                     tier now (all tiers run against a real backend). Prod refuses
#                     any value other than "false".
#   DATABASE_URL      (optional, non-prod only) overrides the backend deploy's
#                     database connection for just this deployment, instead of
#                     using the Vercel project's stored Preview value. Lets a
#                     tier (e.g. dev) run against its own database without a
#                     separate Vercel project. Requires PG_SSL=require and
#                     PG_CA_CERT_B64 to also be set if the target DB needs
#                     verified TLS (see src/shared/db.ts sslConfig()).
#   PG_SSL            (optional) passed through alongside DATABASE_URL.
#   PG_CA_CERT_B64    (optional) passed through alongside DATABASE_URL.
#
# Project/team IDs below are not secrets.
set -euo pipefail

TARGET="${1:-both}"
DEPLOY_ENV="${DEPLOY_ENV:-prod}"                  # prod | testing | dev
case "$DEPLOY_ENV" in
  prod)            PROD_FLAG="--prod" ;;          # production alias
  testing|dev)     PROD_FLAG="" ;;                # preview deployment (unique URL)
  *) echo "DEPLOY_ENV must be prod|testing|dev"; exit 1 ;;
esac
TEAM="team_WNp8vBq1RmWTEH8WSnenP7jM"             # gellusricharan-4715s-projects
# Vercel project IDs. Overridable via env so a deleted/renamed/replaced project
# can be repointed from repo variables WITHOUT editing this script — set
# VERCEL_BACKEND_PROJECT_ID / VERCEL_FRONTEND_PROJECT_ID under
# Settings → Secrets and variables → Actions → Variables (ci.yml passes them).
#
# FRONTEND: the historical default `prj_TiPX9UY…` (ascend-frontend) no longer
# exists — every deploy since 2026-08-05 died with
# `Error: Project not found ({"VERCEL_PROJECT_ID":"prj_TiPX9UY…"})`, which is
# what kept the testing tier from ever producing a deployment. Sri confirmed on
# 2026-08-07 that the live production frontend is https://ascendhqweb.vercel.app,
# i.e. Vercel project `ascend_hq_web` (root dir `web`), so the default now points
# there and every tier deploys from that one project (preview for dev/testing,
# --prod for master), differentiated by the *_ALIAS vars rather than by project.
#
# BACKEND: default left unchanged and still NOT verified — `prj_krZ34CI…` is
# recorded in docs/architecture/DEPLOYMENTS.md as serving a bare, unrelated
# Express app, and the prod backend host `ascendhq-api.vercel.app` returns
# DEPLOYMENT_NOT_FOUND. That half of the P0 is still open.
BACKEND_PID="${VERCEL_BACKEND_PROJECT_ID:-prj_krZ34CIFjzQrMvZ08PWqqbxzBf7d}"    # ascend-backend (rebrand Phase 3; formerly finder-pos-backend — project ID is immutable, never changed) — UNVERIFIED, see above
FRONTEND_PID="${VERCEL_FRONTEND_PROJECT_ID:-prj_MvvmpNkRQbKUAEOmh9ZvmRJa7ETN}"  # ascend_hq_web → https://ascendhqweb.vercel.app (confirmed by Sri 2026-08-07; replaces the deleted ascend-frontend prj_TiPX9UY…)
REPO="$(cd "$(dirname "$0")/.." && pwd)"
: "${VERCEL_TOKEN:?Set VERCEL_TOKEN (a Vercel token with access to the team scope)}"

# Resolve the backend origin the frontend will proxy to.
#   prod           → the stable production backend domain (default).
#   testing / dev  → MUST be supplied (fail closed): a non-prod frontend pointing
#                    at the prod backend would write to the prod database.
if [[ "$DEPLOY_ENV" == "prod" ]]; then
  BACKEND_URL="${BACKEND_URL:-https://ascendhq-api.vercel.app}"
else
  if [[ -z "${BACKEND_URL:-}" ]]; then
    echo "✗ DEPLOY_ENV=$DEPLOY_ENV requires BACKEND_URL (the TESTING backend origin)."
    echo "  Refusing to deploy a non-prod frontend that would fall back to the prod backend/DB."
    exit 1
  fi
fi

deploy_backend() {
  echo "→ Backend ($DEPLOY_ENV): staging + building…"
  local S; S="$(mktemp -d)"
  cp -R "$REPO/src" "$S/src"; cp -R "$REPO/api" "$S/api"; cp "$REPO/vercel.json" "$S/vercel.json"
  # Trim embedded-postgres (avoids the large PG binary download on Vercel)
  node -e "const d=require('$REPO/package.json'); delete (d.devDependencies||{})['embedded-postgres']; require('fs').writeFileSync('$S/package.json', JSON.stringify(d,null,2))"
  # tsconfig: rootDir '.' + include src/** so output stays dist/src/app.js (api/index.js imports it)
  node -e "const d=require('$REPO/tsconfig.json'); d.include=['src/**/*.ts']; d.compilerOptions.rootDir='.'; require('fs').writeFileSync('$S/tsconfig.json', JSON.stringify(d,null,2))"
  # Deploy metadata: the staged bundle has no .git, so record the commit here;
  # /healthz reports it (src/shared/version.ts) to answer "what is live?"
  printf '{"sha":"%s","builtAt":"%s"}' \
    "$(git -C "$REPO" rev-parse HEAD)" "$(date -u +%FT%TZ)" > "$S/version.json"
  ( cd "$S" && npm install --no-audit --no-fund --loglevel=error && npm run build && test -f dist/src/app.js )
  echo "→ Backend: deploying…"
  local url
  # Non-prod tiers may override the DB for just this deployment (e.g. dev
  # running against its own database instead of the project's stored Preview
  # value, which testing also uses) via `vercel deploy --env`, which takes
  # precedence over the project's stored env vars for this deployment only.
  local -a DB_ENV_ARGS=()
  if [[ "$DEPLOY_ENV" != "prod" && -n "${DATABASE_URL:-}" ]]; then
    echo "→ Backend: overriding DATABASE_URL for this deployment (dedicated DB)"
    DB_ENV_ARGS+=(--env "DATABASE_URL=$DATABASE_URL")
    [[ -n "${PG_SSL:-}" ]] && DB_ENV_ARGS+=(--env "PG_SSL=$PG_SSL")
    [[ -n "${PG_CA_CERT_B64:-}" ]] && DB_ENV_ARGS+=(--env "PG_CA_CERT_B64=$PG_CA_CERT_B64")
  fi
  # Newer Vercel CLI versions print a JSON summary to stdout instead of a
  # plain URL line (progress text goes to stderr either way) — extract the
  # URL by pattern instead of assuming a fixed "last line" shape, so this
  # keeps working across CLI output format changes.
  url=$( cd "$S" && VERCEL_ORG_ID="$TEAM" VERCEL_PROJECT_ID="$BACKEND_PID" \
      npx --yes vercel deploy $PROD_FLAG --archive=tgz --yes --token "$VERCEL_TOKEN" "${DB_ENV_ARGS[@]}" \
      | grep -oE 'https://[a-zA-Z0-9.-]+\.vercel\.app' | tail -1 )
  # An empty url means `vercel deploy` failed (e.g. "Project not found") — its
  # non-zero status cannot propagate here, because `set -e` is suspended inside
  # the `deploy_backend || backend_status=$?` call below. Fail explicitly.
  if [[ -z "$url" ]]; then
    echo "✗ backend deploy failed ($DEPLOY_ENV): vercel produced no deployment URL" >&2
    return 1
  fi
  echo "→ Backend deployed: $url"
  # Non-prod: pin the unique preview URL to a stable alias so the frontend can be
  # built against a durable backend origin (prod uses --prod's own alias).
  if [[ "$DEPLOY_ENV" != "prod" && -n "${BACKEND_ALIAS:-}" ]]; then
    echo "→ Backend: aliasing $url → $BACKEND_ALIAS"
    ( cd "$S" && npx --yes vercel alias set "$url" "$BACKEND_ALIAS" --token "$VERCEL_TOKEN" --scope "$TEAM" )
  fi
  ( cd "$REPO" && BACKEND_URL="$BACKEND_URL" npx tsx scripts/ops-check.ts "$BACKEND_URL" )
}

deploy_frontend() {
  echo "→ Frontend ($DEPLOY_ENV): staging + building…"
  local S; S="$(mktemp -d)"
  # All tiers run against a real backend now → default mock OFF everywhere.
  local FRONTEND_MOCK_MODE="${NEXT_PUBLIC_MOCK:-false}"
  if [[ "$DEPLOY_ENV" == "prod" && "$FRONTEND_MOCK_MODE" != "false" ]]; then
    echo "✗ Refusing production frontend deploy with NEXT_PUBLIC_MOCK=$FRONTEND_MOCK_MODE"
    echo "  Production must run against the real backend. Use ?demo=1 on the live site for a mock demo."
    exit 1
  fi

  # Stage the app under `web/`, NOT at the root of the upload.
  #
  # The Vercel project `ascend_hq_web` has its Root Directory set to `web` —
  # it has to, because the same project is git-connected to this repo and its
  # PR previews build from the repo root, where the app genuinely lives at
  # `web/`. This script used to unpack the CONTENTS of `web/` at the top of the
  # temp dir and upload that, so Vercel resolved its root directory against the
  # upload and looked for `<tmp>/web`, which did not exist:
  #
  #   Error: The provided path “/tmp/tmp.upl5y1upwa/web” does not exist.
  #
  # That is the failure the testing tier hit on 2026-08-08 once the deleted
  # project ID was corrected (staging run 31268669760) — a second, independent
  # break sitting behind the first. deploy_frontend is shared, so DEPLOY_ENV=prod
  # fails identically; the release deploy could not have worked either.
  #
  # Mirroring the repo layout inside the upload satisfies the project setting
  # without touching the dashboard, which would break the git-connected
  # previews that currently work.
  local APP="$S/web"
  mkdir -p "$APP"
  ( cd "$REPO/web" && tar --exclude=node_modules --exclude=.next --exclude=.vercel -cf - . ) | ( cd "$APP" && tar -xf - )
  # .vercelignore sits at the upload root; bare patterns match at any depth.
  printf 'node_modules\n.next\n' > "$S/.vercelignore"
  # Build locally first to catch errors before uploading (the mounted FS can segfault next build;
  # mktemp is on the local FS so this is safe).
  echo "→ Frontend: NEXT_PUBLIC_MOCK=$FRONTEND_MOCK_MODE BACKEND_URL=$BACKEND_URL"
  ( cd "$APP" && npm install --no-audit --no-fund --loglevel=error && BACKEND_URL="$BACKEND_URL" NEXT_PUBLIC_MOCK="$FRONTEND_MOCK_MODE" npm run build )
  echo "→ Frontend: deploying…"
  local url
  # See the matching comment in deploy_backend: extract the URL by pattern,
  # not by assuming a fixed "last line" shape (newer Vercel CLI versions
  # print a JSON summary to stdout instead of a plain URL line).
  # Upload from $S (the repo-shaped root), not $APP — Vercel appends the
  # project's Root Directory to whatever is uploaded.
  url=$( cd "$S" && VERCEL_ORG_ID="$TEAM" VERCEL_PROJECT_ID="$FRONTEND_PID" \
      npx --yes vercel deploy $PROD_FLAG --archive=tgz --yes --token "$VERCEL_TOKEN" \
      | grep -oE 'https://[a-zA-Z0-9.-]+\.vercel\.app' | tail -1 )
  # Same failure mode as deploy_backend: without this guard a failed deploy
  # ("Project not found") fell through to the alias step, which errored with
  # `argument "" is not a valid ID or URL`, and the function still returned 0
  # because its last command was the unconditional "✓ frontend deployed" echo.
  # That reported a green deploy while shipping nothing — including for prod.
  if [[ -z "$url" ]]; then
    echo "✗ frontend deploy failed ($DEPLOY_ENV): vercel produced no deployment URL" >&2
    return 1
  fi
  echo "→ Frontend deployed: $url"
  if [[ "$DEPLOY_ENV" != "prod" && -n "${FRONTEND_ALIAS:-}" ]]; then
    echo "→ Frontend: aliasing $url → $FRONTEND_ALIAS"
    ( cd "$S" && npx --yes vercel alias set "$url" "$FRONTEND_ALIAS" --token "$VERCEL_TOKEN" --scope "$TEAM" )
  fi
  echo "✓ frontend deployed ($DEPLOY_ENV)"
}

case "$TARGET" in
  backend)  deploy_backend ;;
  frontend) deploy_frontend ;;
  both)
    # Run both independently — a backend failure (e.g. a bad DB/TLS config)
    # must not silently skip the frontend deploy (and its alias update), and
    # vice versa. Report both outcomes, then fail if either failed.
    backend_status=0; frontend_status=0
    deploy_backend || backend_status=$?
    deploy_frontend || frontend_status=$?
    if [[ $backend_status -ne 0 || $frontend_status -ne 0 ]]; then
      echo "✗ backend exit=$backend_status frontend exit=$frontend_status"
      exit 1
    fi
    ;;
  *) echo "usage: VERCEL_TOKEN=xxx DEPLOY_ENV=prod|testing|dev $0 [backend|frontend|both]"; exit 1 ;;
esac
echo "Done ($TARGET @ $DEPLOY_ENV)."
