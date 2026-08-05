# Ascend — Prompt Guide

How to start, shape, and end an AI session on this repo. Two audiences, one file:

- **Starting a session?** Paste §1 into the agent. That is the prompt.
- **Writing the task line that goes with it?** §2 is what a good one carries, §3 has a
  fill-in-the-blank template per job, §4 is what not to ask for.

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

## 5. Environment notes

Same discipline everywhere; the tooling differs.

| Environment | Notes |
|---|---|
| **Claude Code** (CLI / web / desktop) | Full SDLC including autonomous loop work (`WORK/LOOP_PROTOCOL.md` — re-read it each wake, never work from memory). Web sessions have **no `gh` CLI** — use the GitHub MCP tools for PRs, issues, and CI status |
| **Cursor** (editor / cloud) | Human-paired implementation, debugging, refactors. Bootstraps from `.cursor/rules/ascend.mdc` → `AGENTS.md`. Cloud VM caveats — `/dev/shm` remount, Node 24, system Postgres — are in `AGENTS.md`'s Cursor Cloud section |
| **Replit** | Sandbox/prototyping only. **Not a deploy target**, must not touch `master`/staging secrets or the prod/testing Supabase projects (`REPLIT.md`). Its workspace manifest has hijacked the npm root more than once — if `package.json` says `{"name":"workspace"}` or a pnpm lockfile appears, that's the incident, and `node tools/hygiene-check.mjs` catches it |

Every environment bootstraps from the same source of truth: `CLAUDE.md`, `.cursor/rules/ascend.mdc`,
and `REPLIT.md` are pointers to `AGENTS.md`, never copies of it.

---

## 6. Where the rules actually live

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
