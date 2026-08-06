# syntax=docker/dockerfile:1
# Node version must track .nvmrc (source of truth for CI + local dev) — they
# drifted before (20 here vs 24 in .nvmrc), which is exactly the kind of
# "works in CI, differs in the container" gap this pins down.
FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
# Strip embedded-postgres before install: it's a large PG binary devDependency
# used only by local scripts (scripts/pg-harness.ts), never by `npm run build`
# (tsc). scripts/deploy.sh already does this for the same reason.
RUN node -e "const d=require('./package.json'); delete (d.devDependencies||{})['embedded-postgres']; require('fs').writeFileSync('./package.json', JSON.stringify(d,null,2))"
RUN npm install --no-audit --no-fund
# Copy only what `npm run build` (tsc) actually needs — NOT `scripts/`.
# tsconfig.json's `include` covers scripts/**/*.ts too, and scripts/pg-harness.ts
# imports embedded-postgres for its types; since that package was just
# stripped above, a bare `COPY . .` here makes tsc fail with TS2307 (caught by
# this repo's own docker-build CI check on its first-ever run — that's
# exactly the class of drift this check exists to catch). scripts/*.ts are
# dev/ops tooling never invoked inside this container anyway (no CMD calls
# them) — matches how scripts/deploy.sh's staging step never copies scripts/
# into its build context for the same reason.
#
# rootDir is pinned to '.' explicitly (not left to tsc's inference): without
# scripts/ present, tsc would infer rootDir as src/ itself (the only input
# left), collapsing output to dist/server.js instead of dist/src/server.js —
# silently breaking this Dockerfile's own CMD below AND api/index.js's
# `../dist/src/app.js` import. Verified locally: proved this exact regression
# first (emitted dist/server.js, not dist/src/server.js), then fixed it with
# this override — the identical rootDir='.' pattern scripts/deploy.sh already
# uses for the same reason, applied here for consistency.
COPY src ./src
COPY tsconfig.json ./
RUN node -e "const d=require('./tsconfig.json'); d.include=['src/**/*.ts']; d.compilerOptions.rootDir='.'; require('fs').writeFileSync('./tsconfig.json', JSON.stringify(d,null,2))"
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY api ./api
# Run as the non-root `node` user (built into the official image, uid 1000)
# instead of the default root — limits blast radius if the process is ever
# compromised (e.g. via a dependency RCE) to a non-privileged account with no
# write access outside /app.
RUN chown -R node:node /app
USER node
EXPOSE 3001
# Container-level liveness. Without this, any orchestrator that reads Docker
# health (compose `condition: service_healthy`, ECS, Swarm, Render's own
# container checks) sees a crash-looped or wedged process as "running" — the
# app's /healthz endpoint existed but nothing outside GitHub Actions' 15-minute
# heartbeat ever asked it anything.
#
# Uses node's global fetch rather than curl/wget: node:24-alpine ships neither,
# and adding one would grow the runtime image for a probe the runtime already
# has. --start-period covers boot-time migrations, which hold an advisory lock
# and can legitimately take a while on a cold database.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/src/server.js"]
