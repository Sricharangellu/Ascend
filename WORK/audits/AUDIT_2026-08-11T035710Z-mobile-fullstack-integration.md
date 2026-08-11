# AUDIT 2026-08-11T035710Z — Is Ascend Mobile integrated end-to-end with the shipping full stack?

**Session:** Claude Code web — `claude/full-stack-integration-check-lnnvew`
**Question asked:** whether the ASCEND Mobile work is integrated and working end-to-end in full stack.
**Scope:** read-only inspection of `artifacts/ascend-mobile` against the canonical backend (`src/`),
the canonical frontend (`web/`), CI, and the deployment topology. **No files under `artifacts/`,
`src/`, or `web/` were modified.**

**Status label: `partial`** — the mobile client is real, tested code; its integration with the
shipping stack is `missing`. Every claim below was read out of the tree in this session and cites the
file it came from. Runtime was NOT exercised (see "What this audit did not check").

**Design reference not available.** The question referenced a Claude Design file (`ASCEND Mobile.dc.html`).
It could not be opened: `DesignSync` requires a design-system authorization that needs an interactive
terminal, `WebFetch` returned HTTP 403, and no `.dc.html` file is present in the workspace. **This audit
therefore says nothing about design conformance** — only about whether the mobile app in this repo is
wired to the stack. To review the design itself, seed it via Claude Design's "Send to Claude Code Web".

---

## Summary

The mobile client's own engineering is genuine — 401 interception, offline detection, session restore,
and unit tests all exist. What is absent is every seam that would connect it to the running system: it
is built by no pipeline, gated by no check, installable by no package manager in this repo, pointed at
no reachable backend origin, and three of the endpoints it calls do not exist in `src/`.

**F-0 is the systemic finding.** The repo already owns a guard (`gap:scan`) whose entire purpose is to
catch "frontend calls a route the backend does not serve." It is structurally blind to this client,
which is why F-3 and F-4 below went unnoticed. Fixing F-0 is what stops this class of drift recurring;
everything else is a symptom.

---

## F-0 — The FE→BE drift guard cannot see the mobile client (root cause)

`tools/api-gap-scan.mjs` (`const FE_DIRS`, line 53 as of the `develop` merge below — it was line 102
when first read, so cite the symbol rather than the line):

```js
const FE_DIRS = ["web/app", "web/api-client", "web/hooks", "web/lib", "web/components", "web/contexts"];
```

`npm run gap:scan` passes in this session — *474 backend paths, 382 frontend paths, 17 allowlisted,
"no unexplained frontend→backend gaps"* — while `artifacts/ascend-mobile` calls three routes that do
not exist. The scan is green and correct about what it scans; the mobile client is simply outside its
field of view. Any mobile route added tomorrow inherits the same blindness.

## F-1 — The app is built, tested and deployed by nothing

| Gate | Covers mobile? | Evidence |
|---|---|---|
| `npm run verify` (root) | No | `package.json` — root + `web` only, no `artifacts` |
| CI (`.github/workflows/ci.yml`) | No | no expo/eas/mobile job exists |
| CodeQL (`security.yml:71`) | No | comment excludes `artifacts/` as not "the shipping application" |
| `gap:scan` / `authz:scan` / `table:scan` | No | backend + `web/` only (F-0) |

`artifacts/` is documented in `tools/README.md` as a ~1,005-file duplicate of the whole app, and
`WORK/LOOP_STATE.md:137` records it as *"built/tested/deployed by nothing"* — 55% of tracked files.

## F-2 — The package cannot be installed in this repo

`artifacts/ascend-mobile/package.json` declares `"name": "@workspace/ascend-mobile"` and depends on
`@workspace/api-client-react: "workspace:*"` plus five `catalog:` versions (`react`, `react-dom`,
`zod`, `@tanstack/react-query`). Both are **pnpm** protocols. This repo has:

- no `pnpm-workspace.yaml` (so no `catalog:` definitions exist to resolve against)
- no `pnpm-lock.yaml`; the root is npm (`package-lock.json`)
- no `artifacts/ascend-mobile/node_modules`

`lib/api-client-react/package.json` — the target of the `workspace:*` dep — is itself `catalog:`-based,
so it fails the same way. **Consequence: `typecheck`, `test`, and `build` for mobile cannot be run at
all today.** This is why no gate result for mobile appears anywhere in this audit.

## F-3 — The API base URL assumes a topology Ascend does not run

`artifacts/ascend-mobile/lib/api.ts:9-13`:

```ts
export function getApiBase(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}`;
  return '';
}
```

`scripts/build.js:68-73` hard-errors unless `REPLIT_INTERNAL_APP_DOMAIN`, `REPLIT_DEV_DOMAIN`, or
`EXPO_PUBLIC_DOMAIN` is set. Both encode a **single-origin Replit assumption**: API served from the
same host as the app bundle.

Ascend production is split-origin. `web/next.config.mjs:28-32` proxies `/api/*` to a separate
`BACKEND_URL`; the frontend is on Vercel and the backend on its own host. **A native binary has no
Next.js rewrite layer**, so there is no configured path from the mobile app to the production backend.
With no domain set, `getApiBase()` returns `''`, producing relative URLs — which React Native's `fetch`
cannot resolve, so every request fails at the network layer.

Related, same origin: `app.json` still declares the `expo-router` plugin with
`"origin": "https://replit.com/"`.

## F-4 — Three called endpoints do not exist in the shipping backend

| Mobile call | Source | In `src/`? |
|---|---|---|
| `POST/DELETE /api/v1/push-tokens` | `lib/api.ts:270,277` | **No** |
| `GET/PUT /api/v1/push-tokens/quiet-hours` | `lib/api.ts:292,296` | **No** |
| `POST /api/v1/orders/:id/complete` | `lib/api.ts:304` | **No** |

- A repo-wide `grep -rniE "push.?token|quiet.?hours" src/` returns **nothing**. The finished
  `push_tokens` module (6 files incl. `batcher`, `quiet_hours`, tests) exists only at
  `artifacts/api-server/src/modules/push_tokens/` — already flagged at `WORK/LOOP_STATE.md:47` as
  *"a finished, tested `push_tokens` module lives only there and ships to nobody."*
- `src/modules/orders/routes.ts` registers exactly ten routes — `POST /`, `GET /`, `GET /:id`,
  `PUT /:id`, `GET /:id/timeline`, `POST /:id/refund`, `POST /:id/void`, `POST /:id/email-receipt`,
  `PATCH /:id/lines/:lineId/course`, `POST /:id/split`. There is no `/:id/complete`, and no route path
  containing "complete" exists anywhere in `src/`.

Push registration, quiet hours, and completing an order therefore 404 against the real backend.

## F-5 — Field casing is mismatched on the endpoints that DO exist (worst failure mode)

The backend serves **snake_case** for products and orders; the mobile types expect **camelCase**.

| Backend | Mobile expects |
|---|---|
| `price_cents` (`src/modules/catalog/service.ts:70,160`) | `priceCents` (`lib/api.ts:183`) |
| `total_cents`, `subtotal_cents`, `order_number` (`src/modules/orders/service.ts:33-39`) | `totalCents`, `subtotalCents`, `orderNumber` (`lib/api.ts:208-215`) |

`catalog.list()` returns `Page<Product>` built straight from SQL rows with no camelCase mapping. The
list *envelope* does match — `src/shared/types.ts:22-27` is `{items, total, limit, offset}`, matching
mobile's `CatalogListResponse`/`OrdersListResponse`.

The canonical web client uses snake_case for the same objects (`web/api-client/types.ts:695`), so
**mobile is the outlier, not the backend.** Consequence: these calls return **HTTP 200** and render
`undefined`/`NaN` prices and totals — it fails while looking wired, which is worse than a 404.

Note the backend is internally inconsistent here: `reports` returns camelCase (F-7), `catalog`/`orders`
snake_case. That inconsistency is the reason mobile got one right and two wrong.

## F-6 — Auth tokens are stored unencrypted (resolves F-4 of the 2026-08-06 audit)

`AUDIT_2026-08-06T050023Z-mobile-store-readiness.md` F-4 left token storage explicitly "not verified."
**Now verified:** `lib/api.ts:20-30` writes both the access token and the refresh token to plain
`AsyncStorage` via `setItem`. Neither `expo-secure-store` nor `expo-local-authentication` is a declared
dependency. For a multi-tenant POS, refresh tokens at rest in unencrypted storage is a real finding,
not a theoretical one.

The store-submission blockers from that audit remain open and were re-confirmed against `app.json`:
no `ios.bundleIdentifier`, no `android.package`, no `ios.buildNumber`/`android.versionCode`, no
`eas.json` anywhere in the repo, no `PrivacyInfo.xcprivacy`.

## F-7 — What is correctly wired (verified, stated so the picture is not one-sided)

| Contract | Verdict | Evidence |
|---|---|---|
| `POST /api/identity/login` | **Matches** | Returns `LoginResult = (TokenPair & { user: AuthUser })` (`src/identity/service.ts:50`); `AuthUser` is `{id, email, name, role, tenantId}` (`:58-64`), populated at `:288-297`. Mobile's `LoginResponse`/`UserProfile` (`lib/api.ts:172-178`) match field-for-field. |
| `GET /api/v1/reports/summary` | **Matches** | Route `src/modules/reports/routes.ts:37`; returns `orders`/`revenue`/`payments`/`kpi`/`sparklines` (`service.ts:36-54`, `:411-426`) — identical to mobile's `SalesSummary` (`lib/api.ts:221-249`). |
| `GET /api/v1/catalog`, `GET /api/v1/orders`, `POST /:id/refund`, `POST /:id/void` | **Exist** | `catalog/routes.ts:108`, `orders/routes.ts` (enumerated in F-4) |
| List envelope | **Matches** | `src/shared/types.ts:22-27` |

**Open gap, not a break:** the backend can answer login with `401 mfa_required` + `pendingToken`
(`src/identity/routes.ts:108-119`). Mobile has no MFA screen — it surfaces the error message and stops.
The 401 interceptor correctly skips session-clearing here because login is sent with `anonymous: true`
(`lib/api.ts:130,159`), so there is no logout loop; an MFA-enabled owner simply cannot sign in on mobile.

---

## Verdict

**Not integrated.** Login and the dashboard summary are the only two contracts that would work as
written, and neither is reachable, because F-2 (cannot install) and F-3 (no backend origin) block the
app before any request is made. `partial` is the honest label; nothing here is `built_verified`.

## Recommended order (none of it started — see "Decision required")

1. **F-0 first** — extend `gap:scan`'s `FE_DIRS` to whatever path the mobile app ends up at. Do this
   before any fix, so the remaining work is measured by a guard instead of by inspection.
2. Promote the app out of `artifacts/` to a canonical path on npm, or extract it to its own repo (F-2).
3. Port `push_tokens` from `artifacts/api-server` into `src/modules/`; add `POST /orders/:id/complete` (F-4).
4. Fix casing at the mobile client — the backend and web agree, so mobile changes (F-5).
5. Replace the Replit domain logic with an explicit `EXPO_PUBLIC_API_BASE_URL` pointing at the real
   backend origin; clear the `replit.com` router origin (F-3).
6. Move tokens to `expo-secure-store` (F-6), then the store config from the 2026-08-06 audit.

## Decision required (blocks all of the above — not an agent's call)

`WORK/LOOP_STATE.md:137` records the disposition of `artifacts/` as **NEEDS-SRI**, and `AGENTS.md`
forbids deleting user work. Until that is settled, every fix above would land in a tree that ships to
nobody, so **no code was changed by this audit.** The recommendation on record stays harvest-then-extract,
never delete.

---

## Delivery standard

- **Architecture impact:** none — read-only; no `src/`, `web/`, or `artifacts/` file modified.
- **Database impact:** none.
- **Security impact:** F-6 is a real one (refresh tokens unencrypted at rest) and now has a verified
  answer rather than the 2026-08-06 "not verified." It ships to no store today, so it is not live exposure.
- **Rollback note:** none — nothing to roll back.
- **Monitoring/alerting needs:** none new. `GAPS.md` C-4 (no alerting between deploys) would be made
  materially worse by a mobile launch, since a store binary cannot be hotfixed.

## Gates run this session

Docs-only change; run against the canonical tree to confirm the baseline is clean:

| Gate | Result |
|---|---|
| `node tools/hygiene-check.mjs` | **PASS** — 2202 files |
| `npm run typecheck` (backend) | **PASS** |
| `npm run gap:scan` | **PASS** — 474 backend / 382 frontend paths, 17 allowlisted |
| `npm run authz:scan` | **PASS** — 49 route files, 6 allowlisted |
| `npm run table:scan` | **PASS** — 166 table names, no collisions |

**Not run, and why** — stated rather than softened:

- `npm test` (894 backend tests) and `npm run smoke` — need a Postgres instance not started in this
  container; no `src/` file changed by this audit.
- `web` typecheck/lint/vitest/build — no `web/` file changed; `web/node_modules` is absent here.
- Playwright e2e — no built-and-served real-stack pair in this container.
- **Mobile typecheck/test/build — impossible, per F-2.** That is itself the finding.
- Node here is v22; the repo pins 24 (`.nvmrc`). The gates above are unaffected by that gap.

## What this audit did not check

Runtime behaviour of any kind — nothing here is a claim that the app was launched, built, or observed
failing; every finding is from source and configuration. Design conformance against the referenced
Claude Design file (inaccessible — see header). Whether mobile is intended to ship at all. The
`GAPS.md` criticals C-1 through C-4 were not re-verified; they are already recorded as open.
