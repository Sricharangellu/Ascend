# Ascend — Agent Instructions

This is the ONE agent instruction file. It applies to EVERY agent, workflow, and AI
session working in this repo (Claude Code, subagents, background agents, any other tool).
`CLAUDE.md` is only a short pointer to it.

The **Operating Contract** below (authored by Sri, 2026-07-06) is authoritative. The
**Operational Reference** after it provides the concrete mechanics the contract refers to
(lock protocol, git modes, local runbook, handoff). Where the reference conflicts with the
contract, the contract wins.

---

# Ascend Agent Operating Prompt

You are working on Ascend, a retail-first POS and business operating platform.

## Source Of Truth — the single entry point (Sri directive, 2026-07-19)

This file is the ONE entry point for agents, skills, orchestration, design
principles, and pipelines. Everything hangs off the map below — do NOT create
new instruction/status/pipeline/design files; update the mapped file instead.

| Concern | The one file |
|---|---|
| Agent instructions & skills | `AGENTS.md` (this file) |
| Orchestration: workflows, plans, agents, skills | `docs/architecture/ORCHESTRATION.md` |
| Design principles | `docs/architecture/DESIGN_PRINCIPLES.md` |
| Architecture | `docs/architecture/ARCHITECTURE.md` (+ ADRs under `docs/architecture/ADR/`) |
| Gaps (what's actually still missing, code-verified) | `docs/architecture/GAPS.md` |
| CI/CD & release pipeline | `docs/architecture/PIPELINE.md` (feature → develop → staging → master; master merges are Sri-only) |
| Orchestration: loop program | `WORK/LOOP_PROTOCOL.md` |
| Orchestration: session lock | `WORK/LOCK.md` |
| Project plan | `WORK/FORWARD_PLAN.md` |
| **Work updates (ALL of them)** | `WORK/LOOP_STATE.md` — heartbeat, iteration log, backlog, NEEDS-SRI, delivery/release status. One file, updated in place. |
| Point-in-time audits | `WORK/audits/AUDIT_<UTC>-<slug>.md` (append-only snapshots — the only sanctioned new files) |
| Cross-session traps already paid for | `.agents/memory/MEMORY.md` (index) + the notes it links |

(2026-07-20 consolidation: `ENGINEERING_CONSTITUTION.md`, `CODING_STANDARDS.md`,
`ENGINEERING_ORG.md`, `ACPA_ROADMAP.md`, `DOMAIN_MODEL.md`,
`PLATFORM_ROADMAP.md`, `CTO_CHARTER.md`, and `orchestration/gaps/*.md` were
folded into the four files above per Sri's directive — archived under
`docs/architecture/_archive/` and `orchestration/_archive/`, not deleted.)

**Branch rules (Sri directive, 2026-07-19, refined same day — binding, not optional):**

- **NEVER branch from `master`.** Every new branch starts from `develop`
  (`git checkout -b feature/<name> develop`). `master` is a release target,
  not a starting point — branching from it re-creates the exact
  skip-the-flow mistake this repo has already been corrected for twice.
- **Feature branches correctly cut from `develop` do not have to be deleted
  the instant they merge** — it's fine for a few to stay alive if work is
  ongoing. What is NOT optional: **the production tree must always be
  clean.** "Production tree" means `master` and the pipeline that feeds it
  (`staging`, `develop`) — these three follow a strict, structural
  merge/push process (PR only, never an ad-hoc push) and nothing else
  accumulates on them.
- **Keep `develop` ≥ `staging` ≥ `master` in sync at all times.** The moment
  anything merges to `master`, back-merge it into `staging` and `develop` in
  the same session — don't let the tiers drift apart. Before ending any
  session that touched git, verify this invariant holds
  (`git rev-list --count origin/master..origin/staging` and
  `origin/master..origin/develop` should both be 0 right after a release).
- Stale, fully-merged branches (already absorbed into `staging`) should
  still be cleared out periodically so `git branch -r` stays legible — just
  not treated as an immediate per-merge requirement for active `develop`
  branches.

Before making changes, read in order:

1. `AGENTS.md`
2. `docs/architecture/DESIGN_PRINCIPLES.md` and `docs/architecture/ARCHITECTURE.md` —
   the engineering constitution + as-built architecture (rules, ADRs,
   roadmap). Mandatory for any architectural or cross-module work; update
   them (and add an ADR) whenever you make a significant architectural or
   domain change.
3. `WORK/LOOP_STATE.md` (current work state) and `WORK/FORWARD_PLAN.md` (plan)
4. `WORK/LOCK.md`
5. Latest relevant file in `WORK/audits/`
6. `.agents/memory/MEMORY.md` — a one-line index of traps already hit and paid
   for (typecheck pitfalls, demo/mock activation, the `origin/develop` revert
   trap, the drizzle-push trap). Cheap to skim, and each entry exists because
   someone lost a session to it. Read the linked note before touching the area
   it names.

There is only one active agent instruction file:

- `AGENTS.md`

There is only one active project plan:

- `WORK/FORWARD_PLAN.md`

Do not create or revive duplicate planning files such as:

- `CLAUDE.md`
- `ROADMAP.md`
- `RULES.md`
- `WORK_STATE.md`
- `PROJECT_PLAN.md`
- `WORK/PIPELINE.md`, `STATUS.md`, `RELEASE_STATUS.md`, or any other ad-hoc
  status/pipeline file — delivery status lives in `WORK/LOOP_STATE.md`, the
  pipeline rulebook is `docs/architecture/PIPELINE.md`
- `* 2.*` duplicate copies

If duplicate or obsolete files appear, remove them only when they are clearly redundant and not user-created work.

## Product Direction

Ascend is retail-first.

Priority order:

1. Retail proof
2. Wholesale / B2B expansion
3. Vertical packs
4. Broader business operating platform

Do not add broad vertical depth before the retail flow is complete and verified.

The first production-ready Ascend release must prove this flow with real backend data:

```text
Create business
-> Add/import products
-> Set stock and cost prices
-> Record sales
-> Record expenses
-> View dashboard
-> Review recommendations
-> Complete tasks with evidence
```

Ascend must help a retailer answer:

- What products do I sell?
- What is in stock?
- What sold?
- What did I make?
- What is low, slow, profitable, or risky?
- What should I do next?

## Required Status Labels

Use honest status labels:

- `built_verified`
- `built_unverified`
- `partial`
- `mocked`
- `planned`
- `missing`

Never mark a feature complete just because a page exists.

A feature is complete only when it has:

- Backend endpoint
- Database persistence
- Tenant isolation
- Permission checks
- Audit logging where appropriate
- Frontend wired to real backend in production mode
- Loading, empty, error, and success states
- Tests for important behavior
- No production dependency on MSW or fake auth

## Mock And Partial Rules

Mocks are allowed only for:

- Local development
- Tests
- Clearly labeled demo/preview mode

Production behavior must use real backend routes.

Known mock-backed / partial frontend API prefixes:

- `/api/v1/promotions`
- `/api/v1/documents`
- `/api/v1/golf`
- `/api/v1/pricing`
- `/api/v1/warehouse`

Do not advertise these as production-ready until real backend modules or rewired backend routes exist.

`/api/v1/product-locations` is connected through `src/modules/store_locations` and is not a gap.

Partial pages should stay hidden from normal navigation unless explicitly enabled with:

```text
NEXT_PUBLIC_SHOW_PARTIAL_PAGES=true
```

## Backend Rules

Every backend change must follow these rules:

- Business tables must be tenant-scoped.
- Business queries must filter by tenant.
- Mutating routes must validate request bodies.
- Sensitive routes must enforce role or permission checks.
- Money must use integer cents.
- Inventory quantity must change through immutable movement records.
- Orders, payments, refunds, voids, register sessions, permission changes, and business profile changes must be auditable where appropriate.
- Return clear errors.
- Add focused tests for critical paths.

## Frontend Rules

Every frontend change must follow these rules:

- Do not build UI without a backend contract or explicit mock-only label.
- Frontend production calls must hit real backend routes.
- Add loading, empty, error, and success states.
- Sensitive actions must be hidden or disabled when the user lacks access.
- Keep the UI practical, dense, and operational. Ascend is not a marketing site.
- Do not add decorative complexity that distracts from POS, inventory, reporting, and workflow tasks.

## Design System Rules

Ascend has ONE design system: the tokens in `web/tailwind.config.ts`, the primitives in
`web/components/`, and the authoritative spec `docs/ENTERPRISE_UX_SPEC.md`. Every new or edited
page/component MUST conform. These are hard requirements, not preferences — treat a violation the
same as a failing gate.

- **Colors: tokens only.** Use the `brand`, `erp`, and semantic (`success`/`warning`/`danger`)
  tokens. Do NOT hard-code hex colors (`#0137FC`, `bg-[#1890FF]`) in pages/components, and do NOT
  reach for raw Tailwind default-palette classes (`text-slate-500`, `bg-red-50`, `border-gray-200`) —
  map them to `erp`/semantic tokens (e.g. `text-erp-text-secondary`, `border-erp-table-border`,
  `text-danger-700`). A genuinely new color is added to `tailwind.config.ts` as a named token first.
- **Primitives are mandatory.** Build with the design-system components — `Button`, `Input`,
  `Select`, `Card`, `Table`, `Modal`, `ConfirmDialog`, `Badge`, `EmptyState`, `Skeleton`, `KpiCard`.
  Do NOT use raw `<button>`, `<input>`, or `<select>` in feature pages. If a primitive lacks a
  variant you need, extend the primitive — never bypass it with bespoke markup.
- **Spacing:** 8px base system (`gap-2`/`gap-4`/`p-4`…). No arbitrary pixel margins.
- **Accessibility: WCAG 2.1 AA (non-negotiable).** Every interactive element needs a visible focus
  state (`focus-visible:ring-*`), an accessible name/label, a ≥44px touch target, and keyboard
  operability; text/background pairs must meet AA contrast (token comments record the ratios).
- **States:** every async view wires loading (`Skeleton`), empty (`EmptyState`), error, and success —
  this restates the Frontend Rules and is enforced here too.
- **Branding:** never hard-code an old/other product name (e.g. `SalesGent`, `Finder`) into new
  styles, tokens, or copy — the product is Ascend (see the Hard rule on brand names).
- When unsure, read `docs/ENTERPRISE_UX_SPEC.md` first — it is authoritative; never reinvent a
  primitive that already exists.

## AI / Recommendations Rules

- Do not make AI the source of truth.
- The first recommendation system must be rule-based.
- Recommendations should inspect real data such as:
  - Missing setup data
  - Products with no cost
  - Low stock
  - Products with no recent sales
  - High sales with low margin
  - Uncategorized expenses
  - Weak revenue trend
  - Inventory movement issues
  - Evidence gaps in validation tasks
- AI may explain deterministic recommendations later, but it must not invent business facts.

## Progress Intelligence Rules

Use this model:

```text
Hypothesis -> Plan -> Task -> Evidence -> Verified Result -> Decision
```

Allowed task states:

- `not_started`
- `planned`
- `in_progress`
- `self_reported_done`
- `evidence_attached`
- `system_verified`
- `validated`
- `invalidated`
- `blocked`
- `skipped`

Use `system_verified` only when Ascend can prove completion from internal data, such as:

- Sales records
- Inventory movements
- Expenses
- Payment records
- Audit events
- Connected integration data

## Command Gates

Run the smallest relevant gate while developing.
Before claiming work complete, run the relevant full gate.

Backend/root:

```bash
npm run typecheck
npm test
npm run smoke
```

Frontend:

```bash
cd web
npm run typecheck
npm run lint
npm test
npm run build
```

Structural guards (fast, no DB needed — CI's `guard` job runs these, so a PR that
skips them goes red for reasons `typecheck` and `npm test` cannot catch):

```bash
npm run hygiene        # copy-junk, collision backups, merge leftovers, >1 AGENTS.md
npm run prevent:drift  # dirty tracked edits, stray src/modules/, revived obsolete docs
npm run gap:scan       # every frontend API path literal resolves to a real backend route
npm run contract:scan  # every operation documented in contracts/openapi.yaml has a route
npm run authz:scan     # every PUT/PATCH/DELETE reaches its handler behind an authz guard
npm run table:scan     # no two modules create the same table name with different schemas
```

Before release / for the full backend + web gate in one shot:

```bash
npm run verify   # hygiene + gap/contract/authz/table scans
                 # + backend typecheck/test/smoke + web typecheck/lint/build
```

`verify` does NOT include `prevent:drift`, web `npm test`, or Playwright — run
those separately (CI runs the first two; e2e runs on push, not on PRs).

Full production confidence:

```bash
cd web
NEXT_PUBLIC_MOCK=false npm run build
npx playwright test
```

Do not use `npm run dev` as proof of production backend wiring.

## Work Queue Rules

Use `WORK/FORWARD_PLAN.md` as the active queue.
Pick the first unchecked item in the correct lane unless the user gives a newer instruction.

Current priority:

1. Resolve frontend/backend route alignment.
2. Build retail proof audit endpoint.
3. Complete expenses MVP.
4. Add profit visibility metrics.
5. Add progress intelligence model.
6. Add deterministic recommendation engine.
7. Add segmented business health scores.

## File Hygiene

Keep the project organized.

- Do not create duplicate instruction or plan files.
- Do not leave untracked duplicate files.
- Do not delete user work.

If the tree is dirty:

- Preserve unrelated changes.
- Work only in files needed for the task.
- Do not revert changes you did not make.
- Ask only if existing changes make the task impossible.

## Final Response Rules

When finished, report:

- What changed
- What files changed
- What was verified
- What remains incomplete or risky

Be honest. Do not overstate readiness.

---

# Operational Reference (mechanics the contract refers to)

> The Operating Contract above is authoritative. This section fills in the concrete
> details it points to and does not restate them. Where they conflict, the contract wins.

## Repository map (where the code actually lives)

Domain-driven **modular monolith**: Express/TypeScript backend (`src/`), Next.js 14
frontend (`web/`), one PostgreSQL. Shape, invariants and module→team ownership are in
`docs/architecture/ARCHITECTURE.md`; code idioms are in
`docs/architecture/DESIGN_PRINCIPLES.md`. This map is only *where to look* — it does not
restate either.

```
src/                  Backend. The only tree `npm run typecheck` + `npm test` cover
                      (with scripts/) — see "What the gates do NOT cover" below.
  app.ts              buildApp(): opens DB, runs every module's migrations in
                      registration order, mounts each module's router.
  server.ts           HTTP entry (`npm run dev` / `npm start`).
  gateway/            Cross-cutting request path, in app.ts order: requestId →
                      metrics → accessLog → global rateLimit; then per-path auth
                      (JWT/API-key), with `/api/v1` behind auth + tenantResolver +
                      per-tenant rate limit. errorMiddleware terminates.
  identity/           Users, JWT, MFA, API keys, devices, signup/trial lifecycle.
                      Its own module, NOT under modules/.
  modules/<name>/     53 bounded contexts. index.ts exports a PosModule; see anatomy below.
  modules/index.ts    The registry. Registration order IS migration order — append,
                      and keep dependencies earlier (catalog → inventory → orders → …).
  orchestration/      The ENGINE: sagas, workflows, queues, idempotency, outbox wiring.
  shared/             Shared kernel — import, don't fork: money.ts (integer cents),
                      db.ts (named-param SQL), http.ts (handler/HttpError/ERROR_CODES),
                      events.ts, outbox.ts, pagination.ts (keyset), docnumber.ts.

web/                  Next.js 14 app router, ~123 pages. Its own package.json, own
                      typecheck/lint/test — root `npm test` does not touch it.
  app/(protected)/    Authenticated pages, one dir per domain area.
  app/store/          Public storefront (unauthenticated).
  components/         THE design system. Build with these primitives, never raw
                      <button>/<input>/<select> — see Design System Rules above.
  api-client/         apiGet/apiPost/… + types.ts generated from contracts/openapi.yaml.
  mocks/              MSW handlers. `npm run dev` ALWAYS mocks; a mock, its frontend
                      call and its backend route are ONE unit of work.
  middleware.ts       Auth gate. Separate system from next.config.mjs rewrites — a
                      proxied public route must be allowlisted in BOTH.

contracts/openapi.yaml  The API contract. `contract:scan` and web's generate:client
                        both read THIS file.
db/                   Canonical DDL (`migrations/`, `rls/policies.sql`, `seeds/`,
                      `backup/`). Per-module migrations mirror it; see the trap below.
tools/                Repo guards, all dependency-free. See Command Gates + tools/README.md.
scripts/              Runners: test.ts (embedded PG harness), smoke.ts, seed-e2e.ts,
                      seed-demo.ts, db-check.ts, deploy.sh.
docs/                 Architecture, ADRs, UX spec, vertical guides. Mapped in the
                      source-of-truth table above.
WORK/                 Live work state, plan, lock, audits. Not product docs.
.agents/memory/       Traps already paid for. Read before touching what they name.
api/index.js          Vercel serverless entry wrapping dist/src/app.js.
Dockerfile            Production build (backend runs as a long-lived process).
```

### Anatomy of a backend module

Every `src/modules/<name>/` follows one shape — match it rather than inventing another:

| File | Role |
|---|---|
| `index.ts` | Exports `const <name>Module: PosModule = { name, mountPath?, migrations[], register(ctx) }`. Migration SQL lives here as idempotent `CREATE TABLE IF NOT EXISTS` / `ALTER … ADD COLUMN IF NOT EXISTS` consts — **appended, never edited**. |
| `service.ts` | All business logic. Handlers stay thin. |
| `routes.ts` | zod `parseBody`, authz guard, `tenantId(res)`, delegate to the service. |
| `<name>.test.ts` | `node:test` + `node:assert/strict`, colocated, driving the HTTP surface. |
| `test-request.ts` | Local test helper where the module needs one. |

Routes mount at `/api/v1/<name>` unless `mountPath` overrides it (`store_locations`
serves top-level `/product-locations` and `/store-locations` that way).

**Modules never import each other's TypeScript.** They integrate through shared tables
and `EventBus` events only. Before adding a module, endpoint or table, check it does not
already exist (`git grep -n "<name>" origin/develop`), then find the owner in
`ARCHITECTURE.md`'s "Domain → owning implementation" table and extend that file.

### Traps: things that exist twice

Each pair below is a real ambiguity in this tree, where the wrong one looks entirely
plausible. Two are recorded incidents (the table collision, the `lib/` tree); the other two
are structural traps not yet known to have caused damage.

- **`src/orchestration/` is the engine; `orchestration/` at root is process docs.** Different
  things, near-identical names. Code changes go in `src/`.
- **`contracts/openapi.yaml` is the real contract; `lib/api-spec/openapi.yaml` is not.**
  Nothing in `src/` or `web/` imports `lib/` at all — it is an unwired parallel
  client/spec tree. Editing it changes nothing and no gate will tell you.
- **`db/migrations/*.sql` is the canonical DDL, but boot runs the per-module `migrations[]`
  in `src/modules/*/index.ts`.** A table added in only one of the two drifts silently.
- **Two modules creating the same table name with different schemas** silently 500s every
  write. `npm run table:scan` is the guard; grep the tree before writing a migration.

### What the gates do NOT cover

Root `tsconfig.json` includes only `src/**` and `scripts/**`. `api/`, `lib/`, `desktop/`,
and the sub-projects under `artifacts/` are outside root typecheck, root tests, and web's
gates — they are tracked but unverified by the standard gate set. Treat a change there as
untested unless you verify it another way, and prefer not to make one at all.

## Transitional note — governance consolidation

The contract mandates ONE agent file (`AGENTS.md`) and ONE plan (`WORK/FORWARD_PLAN.md`),
and lists `RULES.md` / `WORK_STATE.md` among files that should not exist. **That part is
done** — verified 2026-08-05: neither `WORK/WORK_STATE.md` nor `WORK/RULES.md` exists on
`master`, `staging`, or `develop`. Live state, including open production actions, is
`WORK/LOOP_STATE.md`; do not go looking for `WORK_STATE.md`, and do not recreate it.

The broader **Foundation Hardening** restructure (`WORK/FOUNDATION_HARDENING.md`) is still
queued and must run as a single exclusive `WORK/LOCK.md` claim when the board is clear.

## Multi-agent coordination lock

Before editing code, check `WORK/LOCK.md`.

**Agent teams** (experimental, enabled in Sri's user settings): a session may spawn
in-session teammates with a shared task list. The whole team is ONE lock unit — the
lead claims one queue item in `WORK/LOCK.md` listing the union of files its teammates
will touch, splits the work so no two teammates edit the same file, and releases the
claim after the combined result is verified, committed, and pushed. Teammates never
claim lock entries themselves, and inter-team coordination with other app sessions
(desktop Claude, Codex, etc.) still happens only through this lock file.

- If it is marked `FREE`, claim exactly one queue item by editing `WORK/LOCK.md` with:
  agent/session name, queue item, files/areas expected, start time, and status `ACTIVE`.
- If it is `ACTIVE` and the item overlaps your intended work, **stop**. Do not build the
  same fix in parallel. Pull latest, read the active claim, and either wait or pick a
  non-overlapping queue item.
- If it is `ACTIVE` but clearly stale, do not delete it silently. Mark it `STALE?`, add a
  note, and stop for human/lead review.
- At handoff, set your claim to `RELEASED`/`FREE` only after commit + push succeed and the
  live-state record is updated. If blocked, leave the lock `ACTIVE` with blocker details so
  another agent does not duplicate the same broken path.

Parallel AI sessions can create false errors: stale builds, port conflicts, dirty-tree
overwrites, duplicate fixes, migration mismatches, and e2e failures caused by another
server/process. Treat unexplained failures as possible coordination conflicts until
`git status`, `git pull --ff-only`, ports, and `WORK/LOCK.md` are checked.

## Git: where and how (3-tier, PR-gated)

- **Remote:** `origin` = https://github.com/Sricharangellu/Ascend.git. Three long-lived
  branches: `develop` (where work lands) → `staging` (QA) → `master` (release target,
  protected: PR required, CI checks required, admin-enforced, force-push and deletion blocked).
- **Session start:** `git fetch origin develop`. Branch new work off `develop` — never off
  `master` (see the Branch rules in the contract above). Never rebase or force-push any of the
  three tiers.
- **Commits:** conventional commits (`feat:`/`fix:`/`chore:`/`docs:`/`ci:`/`test:`), small
  and scoped, one logical change each. Stage only files you authored — never `git add -A`.
  Never commit secrets or generated artifacts.
- **Mode: PR-only, forward-only.** Short-lived `<type>/<slug>` branch (use
  `tools/new-worktree.sh <slug>`) → PR into `develop` → green CI → merge. Promotion onward is
  `develop → staging → master`, each by PR. There is no direct-push path to any tier, and no
  workflow auto-merges anything — a human clicks merge every time.
- **`master` merges are Sri's, every time.** Green CI is necessary, never sufficient, and a
  prior approval never carries forward to a later merge. The full rulebook — what CI runs per
  branch, what protection is enforced, rollback — is `docs/architecture/PIPELINE.md`.

### Sri-only actions (agents cannot do these)

- Merge anything to `master` (branch protection is admin-enforced; there is no agent path).
- Repo Settings → General: enable "Allow squash merging" only + "Automatically delete head branches".
- Fix Actions secrets: `VERCEL_TOKEN`, `STAGING_BACKEND_URL`, staging DB secrets.
- **Live production actions** are tracked in `WORK/LOOP_STATE.md` (the single live work-updates
  file). Two carried over from the retired `WORK_STATE.md` and are **not** currently recorded
  there, so they are parked here until someone re-verifies and files them: `NODE_ENV=production`
  / `METRICS_TOKEN` confirmation, and the orphaned legacy `finder-pos.vercel.app` deployment
  returning 500 (the live frontend is `ascendhqweb.vercel.app` — the old host should be
  deleted, not fixed).

### Branch hygiene

- **Salvage branches:** 12 `worktree-agent-*` branches on origin are parked pre-pause work —
  do NOT delete or bulk-merge; harvest selectively per `WORK/audits/` through the definition of done.
- Stale merged branches (`dev`, `prod`, `testing`, `backend-cycle3`) are deletion candidates
  pending Sri's confirmation.
- If you create a branch or worktree, delete it when merged / before ending the session.

## Repo hygiene & single source of truth (enforced — do not defeat)

Duplicate files and second checkouts caused real damage (blocked rebases, diverged trees,
lost-then-recovered work). These rules exist so it cannot recur:

- **One agent file:** this `AGENTS.md`. `CLAUDE.md` is only a short pointer. CI fails if more
  than one `AGENTS.md` is tracked.
- **Never create ` 2.<ext>` copies or `*.collision-backup.md`.** They are `.gitignore`d and a
  CI guard fails if one is force-committed. Dated audits use a collision-proof
  UTC-ISO-timestamp name, never the next-free letter. **Run `node tools/hygiene-check.mjs`
  before committing** — it fails on copy files, collision backups, merge leftovers, and a
  duplicate `AGENTS.md` (dependency-free; see `tools/README.md`).
- **One canonical checkout.** Work only in the primary clone. Do NOT make a second clone —
  two clones of the same remote diverge and collide on push. For parallel sessions run
  **`tools/new-worktree.sh <task-slug>`** (isolated worktree off `origin/develop`), never
  independent clones.
- **Before building any feature/module/endpoint, check it does not already exist** —
  `git grep -n "<name>" origin/develop` and scan `src/modules/`. Duplicate *work* (two
  sessions building the same thing) is the costliest collision; extend, don't fork.
- **Then find the OWNER before you write the code.** Look the business rule up in
  `docs/architecture/ARCHITECTURE.md`'s "Domain → owning implementation" table and extend
  that file. Writing a local helper beside a canonical one is the *other* duplication
  failure — it passes every existing gate, because nothing is missing and nothing
  collides, and it only surfaces later as behaviour drift. Real example: a private
  `apiFetch` in `web/contexts/StoreAuthContext.tsx` sat next to the shared API client
  long enough to diverge on error parsing (users saw `[object Object]`) and to read an
  env var that exists nowhere in the repo. If a domain has no owner listed, naming one
  is the first task, not the refactor.
- **New agent/session onboarding:** paste §1 of `tools/AGENT_PROMPT.md` — the prompt guide.
  §1 is the copy-paste session brief (read order, queue, duplicate-check, worktree, lock
  claim, branch base, gates, PR flow, honest reporting); §2–§4 cover how to write the task
  prompt that goes with it, a template per job type, and the anti-prompts to avoid; §5 is one
  prompt per app-store pre-submission check.
- Before ending a session: `git status` must show no untracked ` 2.` / backup junk.

## Local runbook (macOS dev machine)

- **Fast proof (no setup):** `npm run smoke` — boots the real app on embedded Postgres and
  drives the full POS lifecycle. Local Postgres 15 also available:
  `export PATH="/opt/homebrew/opt/postgresql@15/bin:$PATH"`.
- **Real-stack e2e** (mocks OFF requires a PRODUCTION build — `npm run dev` ALWAYS mocks):
  1. `pg_ctl -D /opt/homebrew/var/postgresql@15 start && createdb finder_e2e`
  2. Backend: `DATABASE_URL=postgresql://$USER@localhost:5432/finder_e2e JWT_SECRET=<any> PORT=3001 npx tsx src/server.ts`
  3. Seed: same `DATABASE_URL` + `ALLOW_E2E_SEED=1 npx tsx scripts/seed-e2e.ts` (guard requires the opt-in)
  4. Frontend: `cd web && NEXT_PUBLIC_MOCK=false npm run build && cp -r .next/static .next/standalone/.next/static && cp -r public .next/standalone/public && PORT=3000 BACKEND_URL=http://localhost:3001 node .next/standalone/server.js`
  5. `cd web && npx playwright test`
  6. Afterwards stop servers and `pg_ctl -D /opt/homebrew/var/postgresql@15 stop`.

## Handoff protocol (every session, no exceptions)

1. Update live state in **`WORK/LOOP_STATE.md`**: what was done, next 3 actions, blockers.
   (Consolidation is done — see the Transitional note above. Do NOT create
   `WORK/WORK_STATE.md`; `npm run prevent:drift` and CI's guard job both fail if it exists.)
2. New verification results → new audit `WORK/audits/AUDIT_<UTC-ISO-timestamp>-<short-slug>.md`
   (collision-proof — never the next-free-letter); never edit old audits.
3. Working tree clean, no stray root files, no leftover worktrees/branches, servers stopped.
4. Commit and push. Report honestly what passed AND what failed, with the status labels above.

## Hard rules

- Never write secrets (VERCEL_TOKEN, keys, tokens) into any file.
- Never reference competitor POS/ERP brand names anywhere.
- Conventional commits; typecheck + tests must pass before committing.
- Product specs live in `docs/` and `contracts/` — do not duplicate them into WORK/.
- Clean up after yourself: no stray files at repo root, no leftover worktrees/branches.

---

## Cursor Cloud specific instructions

These are non-obvious environment caveats for Cursor Cloud VMs. Dependencies are
installed automatically on VM start (`npm install` at root + in `web/`). Standard
commands live in **Command Gates** above and
[`docs/getting-started/local-development.md`](docs/getting-started/local-development.md) —
don't duplicate them; the notes below only cover what bites you on these VMs.

- **Backend tests/smoke need a larger `/dev/shm` (biggest gotcha).** The VM ships
  `/dev/shm` at 64 MB. The embedded-Postgres suite (`npm test`, `npm run smoke`
  with `DATABASE_URL` unset) exhausts it mid-run and ~295 of 759 backend tests
  fail with `could not resize shared memory segment … No space left on device`.
  This is the same issue CI solves with `--shm-size=1g`. Remount before running
  them (persists only for the session, re-run after a reboot):
  `sudo mount -o remount,size=1g /dev/shm`. With this, all 759 backend tests pass.
- **Use Node 24 (matches `.nvmrc`/CI).** The default shell `node` is v22
  (`/exec-daemon/node`); the full `web` vitest suite has 3 jsdom `Blob`/`FileReader`
  tests that only pass on Node 24. Activate it in a fresh shell with
  `export PATH="$HOME/.nvm/versions/node/v24.18.1/bin:$PATH"` (or `nvm use 24`).
  Backend tests/smoke/typecheck and the web build/typecheck/lint pass on either.
- **Local Postgres is a system service, not Docker (no Docker on the VM).**
  Postgres 16 is installed with role/db matching `.env.example`
  (`finder:finder@localhost:5432/finder_dev`). Start it with
  `sudo pg_ctlcluster 16 main start` if `curl localhost:3001/readyz` can't connect.
- **The dev backend does NOT auto-load `.env`** — export `DATABASE_URL` and
  `JWT_SECRET` (≥32 chars) before `npm run dev`, or every authed request 500s.
  Migrations auto-apply on boot; `/readyz` must show `"db":"connected"`.
- **To log in via the UI, seed the demo tenant** into your dev DB:
  `ALLOW_E2E_SEED=1 DATABASE_URL=… npx tsx scripts/seed-e2e.ts`
  (owner `owner@ascend.dev` / `AscendDemo!2026`).
- **Frontend against the real backend:** `next dev` defaults to MSW mocks. Run
  `NEXT_PUBLIC_MOCK=false BACKEND_URL=http://localhost:3001 npm run dev` in `web/`;
  it proxies `/api/*` and `/readyz` to the backend (no browser CORS).
