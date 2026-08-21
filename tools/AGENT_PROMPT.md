# Ascend — Prompt Guide

How to start, shape, and end an AI session on this repo. Two audiences, one file:

- **Starting a session?** Paste §1 into the agent. That is the prompt.
- **Writing the task line that goes with it?** §2 is what a good one carries, §3 has a
  fill-in-the-blank template per job, §4 is what not to ask for.
- **Shipping to the app stores?** §5 is one prompt per pre-submission check.

**Precedence.** `AGENTS.md` is the operating contract. This file is the onboarding prompt it
sanctions ("New agent/session onboarding: paste `tools/AGENT_PROMPT.md`") — a working copy of
the load-bearing rules plus the prompt scaffolding around them, not a second rulebook. **If
this file disagrees with `AGENTS.md`, `AGENTS.md` wins and this file is the bug.** Everything
else it points to rather than restates, so there is one place to change each rule.

---

## 1. Paste this at session start

> You are working on **Ascend**, a retail-first POS and business operating platform.
> Multiple AI sessions (Claude Code, Cursor, Replit) work this repo at once. Duplicate files
> and duplicate *work* — two sessions building the same thing — have cost real effort here.
> The steps below are what prevents it. Follow them in order.
>
> **1. Orient before touching anything.**
> ```bash
> git fetch origin develop && git status
> ```
> Read, in this order: `AGENTS.md` → `docs/architecture/DESIGN_PRINCIPLES.md` +
> `docs/architecture/ARCHITECTURE.md` → `WORK/LOOP_STATE.md` + `WORK/FORWARD_PLAN.md` →
> `WORK/LOCK.md` (other sessions' active claims are law) → the newest file in `WORK/audits/`.
>
> **2. Take the task from the live queue.** `WORK/FORWARD_PLAN.md` is the authoritative queue —
> take the first unchecked item in the right lane unless you were given a newer instruction.
> `WORK/LOOP_STATE.md` holds the backlog and the NEEDS-SRI list; never self-assign a NEEDS-SRI
> item. (GitHub Issues with `lane:*` labels are the intended durable-ownership layer, but the
> board is **empty as of 2026-08-05** — don't wait on it, and don't report an empty
> `lane:ready` query as "nothing to do".)
>
> **3. Prove it doesn't already exist — before you write code.**
> ```bash
> git grep -ni "<feature-or-route-name>" origin/develop ; ls src/modules/
> ```
> If it exists, **extend it — never build a parallel version.** Then find the *owner*: look the
> business rule up in the "Domain → owning implementation" table in
> `docs/architecture/ARCHITECTURE.md` and change that file. A correct-looking helper written
> beside the canonical one passes every gate and only surfaces later as behaviour drift.
>
> **4. Work in isolation, and claim the files.** `tools/new-worktree.sh <task-slug>` — a
> worktree off `origin/develop`, never a second `git clone`. The moment you start editing, add
> a claim to `WORK/LOCK.md`: session name, exact files/areas, an explicit NOT-list, `ACTIVE`.
> Set it `RELEASED` with gates evidence as soon as those edits land — a `LOCK.md` entry is a
> short-lived file lock, not a task tracker, and must not outlive your session.
>
> **5. Branch from `develop`. Never from `master`.**
> ```bash
> git checkout -b <type>/<slug> origin/develop     # feat|fix|chore|docs|ci|test|refactor
> ```
> Promotion is forward-only: `feature/* → develop → staging → master`. `master` is a release
> target, not a starting point.
>
> **6. Gates — all green before you call anything done.**
> ```bash
> npm run verify   # hygiene + gap/table scans + backend typecheck/test/smoke + web typecheck/lint/build
> ```
> Smaller loops while developing: `npm run typecheck && npm test && npm run smoke` (backend),
> `cd web && npm run typecheck && npm run lint && npm test && npm run build` (frontend).
> **`npm run dev` always serves MSW mocks — never cite it as proof of real-backend wiring.**
> A red gate is fixed or reverted, never committed and never worked around by disabling a check.
>
> **7. Land via PR into `develop`.** Conventional commits, small and scoped, staging only files
> you authored — never `git add -A`. Open the PR against `develop`.
> **No agent merges to `master`, ever, without Sri's explicit word for that specific merge** —
> green CI is necessary, never sufficient, and a prior approval does not carry forward.
>
> **8. Report honestly.** Use the status labels — `built_verified` · `built_unverified` ·
> `partial` · `mocked` · `planned` · `missing` — and close with: what changed · which files ·
> what you actually verified (real output, not a claim) · what remains incomplete or risky.
> "Built" ≠ "verified" ≠ "deployed". Never mark a feature complete because a page renders.
>
> **Non-negotiables, in any change you make:** money in integer **cents**, never floats · every
> business table and query **tenant-scoped** · permission/role check on every sensitive route ·
> inventory changes only through immutable movement records · no secrets in any file · no
> competitor POS/ERP brand names, and never the retired `Finder`/`SalesGent` names · design-system
> tokens and primitives only, never raw hex or a bare `<button>` · one `AGENTS.md`, one
> `WORK/FORWARD_PLAN.md` — never create a second instruction, plan, status, or `* 2.*` file.

---

## 2. What every Ascend prompt must carry

A prompt that omits any of these produces work that has to be redone. In order of how often
the omission has actually cost something here:

| # | Carry | Why — the failure it prevents |
|---|---|---|
| 1 | **The base branch** (`develop`, always) | Work cut from `master` has to be re-cut; the repo has been corrected for this more than once |
| 2 | **The task, and its lane in `WORK/FORWARD_PLAN.md`** | "Improve X" produces a refactor nobody asked for; a lane makes the scope arguable up front |
| 3 | **The files it may touch — and an explicit NOT-list** | This is what goes in the `LOCK.md` claim. Without it, two sessions edit the same file in the same ten minutes |
| 4 | **Which gate proves it** (`npm run verify`, or the specific suite) | "Tests pass" with no named command is unfalsifiable |
| 5 | **A demand for honest labels** | Without it you get "done" for a page wired to MSW |
| 6 | **The report shape** (changed · files · verified · remaining/risky) | Otherwise the handoff is a summary of intentions |

**Weak prompt:** *"Fix the expenses page."*

**Strong prompt:** *"On a worktree off `develop`, complete the expenses MVP — FORWARD_PLAN
priority 3. Touch `src/modules/expenses/**` and `web/app/(protected)/expenses/**` only; do NOT
touch `src/modules/reports/**` (another session's claim). Check first whether the category
rollup already exists in the reports module — extend it if so. Backend must be tenant-scoped
with integer cents and a permission check; frontend needs loading/empty/error/success states
and design-system primitives. Gate: `npm run verify`. Report with honest status labels and say
explicitly what you did not verify."*

The difference is not politeness or length. The strong one is **falsifiable** — every clause
can be checked against the diff.

---

## 3. Prompt recipes

Fill in `<...>`. Each assumes §1 has already been pasted, so none of them restate the read
order, the claim protocol, or the gates.

### Backend module or endpoint
> Extend `<module>` in `src/modules/<module>/` with `<capability>`. First run
> `git grep -ni "<name>" origin/develop` and check the "Domain → owning implementation" table
> in `ARCHITECTURE.md` — if this rule already has an owner, change that file instead of adding
> a helper next to it. Requirements: tenant-scoped table and query; request-body validation on
> the mutating route; `requireCapability`/`requireRole` enforced (verify the middleware is
> actually mounted, not just referenced); money in integer cents; audit record on write; a
> focused test for the critical path. Migration must be safe in **both** directions. Gate:
> `npm run typecheck && npm test && npm run smoke`. Report the Delivery Standard —
> architecture · database (both migration paths) · testing evidence · security · rollback ·
> monitoring; write "none" where it's none, don't omit the line.

### Frontend page or component
> Build `<page>` under `web/app/(protected)/<path>/`. Do not build UI without a backend
> contract — if the route is mock-backed, label it and keep it behind
> `NEXT_PUBLIC_SHOW_PARTIAL_PAGES`. Use design-system primitives only (`Button`, `Input`,
> `Table`, `Modal`, `Badge`, `EmptyState`, `Skeleton`, `KpiCard`) and `brand`/`erp`/semantic
> tokens — no raw hex, no default-palette Tailwind classes, no bare `<button>`/`<input>`. Wire
> all four states: loading, empty, error, success. WCAG 2.1 AA: visible focus ring, accessible
> name, ≥44px target, keyboard operable. Hide or disable anything the user's role can't do.
> Read `docs/ENTERPRISE_UX_SPEC.md` before inventing a pattern. Gate:
> `cd web && npm run typecheck && npm run lint && npm test && npm run build`. Confirm against a
> **production** build with `NEXT_PUBLIC_MOCK=false` — `npm run dev` always mocks.

### Bug fix
> Reproduce `<symptom>` first and paste the actual failing output. Then trace to the smallest
> responsible part, fix that, and prove it with a test that fails before and passes after. Do
> not guess-patch, and do not fix a second thing you noticed on the way — note it in
> `WORK/LOOP_STATE.md`'s backlog instead. If the failure is unexplained, check for a
> coordination conflict before assuming a code bug: `git status`, `git pull --ff-only`, port
> collisions, and other `ACTIVE` claims in `WORK/LOCK.md`. Report what the root cause actually
> was, not what you changed.

### Audit / verify a claim
> Verify `<claim>` against the code on `origin/develop`. Every finding needs in-repo evidence
> — `file:line`, a command with its real output, or a failing call. A grep over one file is not
> proof of absence. Treat external reports and prior audits as unverified: this repo's history
> includes a "verified gap" that was already built, and review reports that fabricated quotes.
> Write the result to a **new** `WORK/audits/AUDIT_<UTC-ISO-timestamp>-<slug>.md` — never the
> next-free letter (letters collide between parallel sessions), never by editing an existing
> audit. Separate confirmed from plausible, and say what you could not check.

### Docs / consolidation
> Update `<the one mapped file>` in place. Do **not** create a new instruction, plan, status,
> or pipeline file — the map in `AGENTS.md` names the single owner for each concern, and adding
> a file beside it is the drift this repo keeps paying for. Check whether the content already
> lives somewhere before adding it; point rather than restate, so each rule has exactly one
> home. Run `node tools/hygiene-check.mjs` before committing.

### Promotion / release
> Open the promotion PR `<develop → staging | staging → master>`. Do not merge it — merging to
> `master` is Sri's explicit call, every time. Confirm before opening: CI green on the source
> branch, `npm run verify` clean locally, and no `ACTIVE` claim in `WORK/LOCK.md` covering
> in-flight files. List every PR rolled up in the promotion. After any `master` merge lands,
> back-merge `master → staging → develop` in the same session so the tiers don't drift —
> `git rev-list --count origin/master..origin/develop` should be 0 right after a release.

### Hotfix
> Branch off `master` — the one sanctioned exception to the develop-first rule — fix the
> smallest thing that stops the bleeding, PR into `master`, and stop there for Sri's merge.
> Then back-merge `master → staging → develop` in the same session. Everything that isn't the
> bleeding goes in the backlog, not in this branch.

---

## 4. Anti-prompts

Each of these has produced real rework here. The fix is in the prompt, not in the review.

| Don't ask for | Ask instead |
|---|---|
| "Build a `<thing>` service" | "Check whether `<thing>` exists, then extend its owner" — duplicate *work* is the costliest collision, and a parallel implementation passes every gate |
| "Clean up the repo" / "improve consistency" | One named target, one lane, one NOT-list. Open-ended cleanup rewrites files other sessions are holding |
| "Make it production-ready" | Name the missing piece — real endpoint, persistence, tenant scope, RBAC, states, tests. "Production-ready" is what gets claimed, not built |
| "Add a doc explaining X" | "Update `<the mapped file>`." A new file is the default failure mode, and the map exists to prevent it |
| "Just push it" / "merge when green" | PR into `develop`. Green CI is necessary, never sufficient, and `master` is Sri's |
| "Use whatever colors look good" | Tokens only. A hard-coded hex passes lint and breaks the system quietly |
| "Mock it for now" (on a production path) | Mocks are for dev, tests, and labeled demo mode. Anything else must hit a real route |
| "Make the tests pass" | "Make the behavior correct, and show the test that proves it." The first phrasing invites disabling the check |

---

## 5. Launch readiness — prompts for shipping to the app stores

One check per prompt, each run and reported separately. Two rules make this list different from a
generic pre-launch checklist:

- **A shipped mobile binary cannot be recalled.** Store review takes days, and users keep running an
  old build against a moving backend. Every check below assumes the client and server are versioned
  apart.
- **Start from `docs/architecture/GAPS.md`.** The C-1…C-4 criticals are already verified open and
  already labelled the operational floor — they outrank everything here. Don't re-derive them; run
  them.

Ascend Mobile lives in `artifacts/ascend-mobile` (Expo + expo-router). Note that `artifacts/` is a
known duplicate tree (audit finding H-1 / backlog F-3) that active `LOCK.md` claims exclude — settle
whether that is the shipping app before certifying anything in it. Current submission blockers are
recorded in `WORK/audits/AUDIT_2026-08-06T050023Z-mobile-store-readiness.md`.

### Store submission mechanics

> **App identity & versioning.** Audit `artifacts/ascend-mobile/app.json` for submission readiness:
> `ios.bundleIdentifier`, `android.package`, `ios.buildNumber`, `android.versionCode`, and an
> `eas.json` with build + submit profiles for both stores. Confirm the `expo-router` `origin` is an
> Ascend-owned URL. Report each field present/missing with its exact JSON path — do not infer
> defaults the build would apply.

> **Privacy manifest & data safety.** Produce the data-collection inventory this app must declare:
> every category of user or device data read, transmitted, or stored, mapped to `file:line`. Check
> whether an iOS privacy manifest exists and whether any Required Reason API is used without a
> declared reason. Cross-check against what a Play Data Safety form needs. List what you could not
> determine from code rather than guessing.

> **Permission strings.** Find every native capability requested (camera for barcode scanning,
> notifications, photos, location, biometrics). Verify each has a purpose string — iOS
> `NS*UsageDescription`, Android manifest permission — explaining the retail use, not a placeholder.
> A permission requested in code with no purpose string is a hard rejection; report those first.

> **In-app account deletion.** Both stores require an in-app deletion path for any app with account
> creation. Trace whether one exists, and what deleting an owner account would do to a tenant's
> orders, inventory movements, and audit rows — which are retained records. Report the current
> behaviour honestly; if there is no path, describe the smallest compliant design given retention.

> **Payments & store billing rules.** Classify every purchase flow: physical goods sold to a
> retailer's customer (exempt from in-app purchase) versus any Ascend subscription, tier upgrade, or
> feature unlock sold to the retailer (which Apple will require to go through IAP). Cite `file:line`
> per flow. A single in-app link to an external upgrade page can trigger rejection — flag those.

### Auth & session

> **Token storage at rest.** Trace where the mobile app persists access/refresh tokens, tenant id,
> and cached PII, and whether that store is encrypted at rest on both platforms. A JWT in plain
> async storage on a rooted or jailbroken device is readable — state plainly whether that is the
> current state.

> **Reauthentication.** Verify the 15-minute access token / single-use refresh rotation on mobile:
> silent refresh, refresh-reuse detection, hours-long backgrounding, and forced step-up before
> sensitive actions (refunds, voids, register close, permission changes, price overrides). Prove each
> with a test, not a code reading. Report which sensitive actions have no step-up check today.

> **Logout, revocation, device loss.** Test that logout invalidates server-side, not just locally;
> that a revoked user is ejected on the next request rather than at token expiry; and that a lost
> device can be cut off. Include the offline case — what a stolen device with a cached session can
> still do with the network off. For a POS that is the real risk.

### Data & correctness

> **Data formats.** Audit every boundary where money, quantity, dates, and identifiers cross into the
> mobile client. Money must be integer cents end to end — find anywhere it becomes a float, a string,
> or a locale-formatted value before arithmetic. Check register-session and end-of-day timezone
> handling (a sale at 23:58 must land in the right business day), decimal separators under non-US
> locales, and barcode/SKU strings that could lose leading zeros. `file:line` per defect.

> **API versioning & forced upgrade.** A shipped binary lives for months against a moving backend.
> Verify a version handshake lets the server require a minimum client version, and that the "please
> update" path is tested. Review recent API changes for anything that breaks an older client. Report
> whether the backend can currently deploy without breaking a binary already in users' hands.

> **Offline sync & conflict resolution.** Test the failure modes, not the happy path: the same
> register offline on two devices; a sale recorded offline for a product whose price or stock changed
> server-side; a sync interrupted midway; a clock-skewed device; a duplicate submit on retry. Prove
> inventory movements stay immutable and no order is double-counted. Report each scenario's observed
> result.

> **Migration safety during rollout.** For every migration shipping with this release, verify both
> directions and confirm it is safe while an older client is live — the deploy and the store rollout
> are never simultaneous. Flag any column drop, rename, or NOT NULL addition that would break the
> currently published binary during the rollout window.

### Security

> **Row-level security.** Verify tenant isolation at both layers — app-layer JWT scoping and the
> Postgres policies in `db/rls/`. For each business table confirm a policy exists and that a forged or
> swapped tenant id is denied at the database even when a handler forgets to scope. Test cross-tenant
> reads *and* writes, including tables added since the policies were last reviewed.
> `src/gateway/tenant-isolation.test.ts` is the starting point, not proof of completeness.

> **Authorization / IDOR.** For every mobile-reachable endpoint, verify the object-level check: can a
> cashier fetch, mutate, or delete a record belonging to another outlet, register, or user by changing
> an id? Confirm `requireCapability`/`requireRole` is actually mounted, not just imported. Enumerate
> unchecked routes as a ranked list.

> **Secret management.** Scan the shipped bundle for anything that must not be in a client binary —
> API keys, service tokens, service-role keys, signing material. Every `EXPO_PUBLIC_*` value is
> readable by anyone who downloads the app. Verify no secret is committed to the repo or build config,
> and that rotation is possible without a store resubmission. Report what an attacker extracts from
> the built artifact.

> **Transport security.** Confirm TLS is enforced with no debug bypass reachable in a release build,
> and check GAPS.md **C-3** — production DB connections still trusting certificates in some paths
> despite the code supporting `PG_CA_CERT` verification. Decide whether certificate pinning is
> warranted for a client touching payment flows, and state the tradeoff rather than just recommending
> it.

> **Mock-backed surfaces must not ship.** `AGENTS.md` lists the mock-backed / partial API prefixes.
> Verify none is reachable from a production mobile build, that `NEXT_PUBLIC_MOCK` is false in every
> release path, and that no MSW handler or fake-auth shim is bundled. Anything partial must be hidden
> from navigation, not merely unlinked.

### Reliability & operations

> **Load testing.** Load test the real backend at the design point — 600 RPS sustained, 3,000 RPS
> peak, p95 < 200 ms read / < 400 ms write. Model retail shape: a checkout burst at open, end-of-day
> close across many tenants at once, reports running concurrently. Report the breaking point and which
> resource saturates first. GAPS.md **C-2** flags `setInterval`-based background workers, which behave
> badly under load — include them.

> **Rate limiting & abuse.** Verify rate limiting works in production rather than in-memory
> per-instance. Test login brute force, refresh-token abuse, and a runaway client. Confirm limits are
> keyed per tenant *and* per user so one busy retailer cannot exhaust another's budget.

> **Backup & restore drill.** GAPS.md **C-1**: the restore drill has never run against real
> infrastructure. Actually run it — restore to a scratch environment, measure RPO/RTO against the
> ≤5 min / ≤30 min targets, and verify restored data is complete and tenant-isolated. A backup that
> has never been restored is not a backup. Report measured numbers, not configuration.

> **Monitoring, alerting, crash reporting.** GAPS.md **C-4**: no alerting between deploys beyond the
> heartbeat. Define the minimum set required before launch — error rate, p95 latency, failed payments,
> sync backlog, DB connection saturation — each with an owner and a runbook. Separately verify mobile
> crash reporting is wired with source maps for release builds; a store binary cannot be debugged
> without them.

> **Rollback & kill switch.** A bad mobile release cannot be recalled. Verify an over-the-air update
> path for JS-only fixes, a server-side feature flag to disable a broken flow without resubmission,
> and a tested backend rollback that does not strand the published client. Describe exactly what you
> would do if checkout broke for all users an hour after release.

### Product & compliance

> **Age verification.** This app sells age-restricted tobacco, vapor, and hemp products. Test that the
> workflow cannot be bypassed offline, by a role without permission, or by cancelling mid-flow, and
> that every verification is audit-logged. Verify the store age rating and content declarations match
> what the app actually does.

> **Tax & compliance correctness.** Verify MSA reporting and state-specific tobacco/vapor/hemp rules
> produce correct output for the launch states, using known-good fixtures with expected totals.
> Financial correctness has veto: any rounding, jurisdiction, or effective-date defect blocks release
> regardless of schedule.

> **Accessibility.** Audit against WCAG 2.1 AA and the platform accessibility APIs: screen-reader
> labels on every interactive element, ≥44pt touch targets, contrast ratios, dynamic type without
> clipping, no colour-only status signals. `app.json` sets a dark-only `userInterfaceStyle` — verify
> contrast holds throughout. Report violations by screen and element.

---

## 6. Environment notes

Same discipline everywhere; the tooling differs.

| Environment | Notes |
|---|---|
| **Claude Code** (CLI / web / desktop) | Full SDLC including autonomous loop work (`WORK/LOOP_PROTOCOL.md` — re-read it each wake, never work from memory). Web sessions have **no `gh` CLI** — use the GitHub MCP tools for PRs, issues, and CI status |
| **Cursor** (editor / cloud) | Human-paired implementation, debugging, refactors. Bootstraps from `.cursor/rules/ascend.mdc` → `AGENTS.md`. Cloud VM caveats — `/dev/shm` remount, Node 24, system Postgres — are in `AGENTS.md`'s Cursor Cloud section |
| **Replit** | Sandbox/prototyping only. **Not a deploy target**, must not touch `master`/staging secrets or the prod/testing Supabase projects (`REPLIT.md`). Its workspace manifest has hijacked the npm root more than once — if `package.json` says `{"name":"workspace"}` or a pnpm lockfile appears, that's the incident, and `node tools/hygiene-check.mjs` catches it |

Every environment bootstraps from the same source of truth: `CLAUDE.md`, `.cursor/rules/ascend.mdc`,
and `REPLIT.md` are pointers to `AGENTS.md`, never copies of it.

---

## 7. Where the rules actually live

Nothing here is authoritative on its own. Change the rule in its one home:

| Concern | File |
|---|---|
| Operating contract, git rules, gates, hard rules | `AGENTS.md` |
| Workflows, plans, agents, skills, role routing | `docs/architecture/ORCHESTRATION.md` |
| Design principles · as-built architecture + ADRs | `docs/architecture/DESIGN_PRINCIPLES.md` · `docs/architecture/ARCHITECTURE.md` |
| Code-verified gaps | `docs/architecture/GAPS.md` |
| CI/CD, promotion, release policy, config registry | `docs/architecture/PIPELINE.md` |
| UI spec (authoritative for anything visual) | `docs/ENTERPRISE_UX_SPEC.md` |
| The work queue / plan | `WORK/FORWARD_PLAN.md` |
| All live work updates — heartbeat, backlog, NEEDS-SRI, delivery status | `WORK/LOOP_STATE.md` |
| Autonomous loop program | `WORK/LOOP_PROTOCOL.md` |
| Session file locks | `WORK/LOCK.md` |
| Point-in-time audits (append-only) | `WORK/audits/AUDIT_<UTC>-<slug>.md` |
| Hygiene/collision tooling | `tools/README.md` |
