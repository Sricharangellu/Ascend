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
COPY . .
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
CMD ["node", "dist/src/server.js"]
