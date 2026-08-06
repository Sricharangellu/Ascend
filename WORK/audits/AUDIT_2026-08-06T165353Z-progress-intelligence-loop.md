# AUDIT 2026-08-06T165353Z — Progress intelligence: closing the truth-tracking loop

**Session:** Claude Code web, `claude/ascend-erp-protocol-mbg7nv`
**Mandate:** Sri protocol 2026-08-06 — "deliver one complete production-ready feature at a
time… a feature is not complete until every layer has been implemented."
**Status label:** `built_verified` (backend + frontend + tests + gates, evidence below).
**Scope:** one feature. No other module was touched.

---

## 1. Why this feature, and how it was chosen

The protocol names no specific feature, so the queue chose it. Working through
`AGENTS.md`'s read order:

| Candidate source | Finding |
|---|---|
| `AGENTS.md` "Current priority" 1–7 | All seven have shipped (route alignment, retail-proof endpoint, expenses MVP, profit metrics, progress model, recommendation engine, health scores — each has a dated audit and live code). |
| `docs/architecture/GAPS.md` | Every open row is a **NEEDS-SRI decision** (catalog credits, EDI parsing, approval-chain wiring, custom-roles contract, pricing ownership) except one row that is **stale** — see §6. |
| `WORK/FORWARD_PLAN.md` Phase 9 execution order | `S-1` → `F-11` → `F-3` are all Sri-blocked; the guardrails (`F-15/16/17`) are done. The next unblocked items (`F-5`, `F-14`, `F-9`) are cleanup refactors, not features. |

So no *feature* was queued and unblocked — but the Progress Intelligence model
that `AGENTS.md` mandates turned out to be **half-shipped**, verified by reading
the code rather than the docs:

| Loop stage | Backend | Frontend (before this change) |
|---|---|---|
| Hypothesis | `GET`/`POST /progress/hypotheses` — real, tenant-scoped, RBAC, audited | **none** — no type, no page, no component |
| Task | real | dashboard `ProgressPanel` |
| Evidence | `POST` only — **no `GET` existed at all** | create-only; **attached evidence was invisible after saving** |
| Verified result | `POST /tasks/:id/system-verify` | dashboard `ProgressPanel` |
| Decision | `POST /hypotheses/:id/decisions` — real, gated on evidence | **none** |

Evidence for "zero frontend": `grep -rn "hypothes" web/` returned only a doc
comment, `hypothesis_id` fields, and summary counters. `grep -rni "/decisions"
web/` returned **nothing**.

By this repo's own completeness definition (`AGENTS.md`, "A feature is complete
only when it has… Frontend wired to real backend in production mode"), the two
ends of the loop were `partial`, not done. That is the feature this session
finished.

---

## 2. What was built

### Backend — `src/modules/progress/`

Three new read routes. All tenant-scoped, all bounded, all additive (no existing
response shape changed — the dashboard panel was not touched and keeps working):

| Route | Purpose |
|---|---|
| `GET /api/v1/progress/hypotheses/:id` | The whole loop in one read: hypothesis + its tasks + evidence + decisions. One round trip so the UI renders a complete loop or none of it. |
| `GET /api/v1/progress/evidence?taskId=\|hypothesisId=` | Evidence list. **A filter is required** — an unfiltered call returns 400 rather than becoming an accidental tenant-wide export. |
| `GET /api/v1/progress/hypotheses/:id/decisions` | Decision history, append-only, newest first. |

Two correctness fixes found while building:

1. **`listHypotheses` was unbounded** (`SELECT * … ORDER BY created_at DESC`, no
   `LIMIT`) — the same defect class this repo already swept three times
   (movements, `audit_log`, `journal_entries`; loop iterations 1/4/5). Now uses
   the shared `clampLimit` (default 50, ceiling 200) and reports the bound it
   applied. `listTasks` got the same treatment plus a `hypothesisId` filter.
   Both stayed backward-compatible: `limit` is an added field, `items` is
   unchanged.
2. **The evidence predicate was written twice.** `createDecision`'s gate used an
   inline `hypothesis_id = X OR task.hypothesis_id = X` union. Any read that
   showed a user "their evidence" could have drifted from it — meaning the UI
   could show *no evidence* on a hypothesis the backend would happily let them
   validate, or the reverse. Extracted to one `EVIDENCE_FOR_HYPOTHESIS`
   constant that the gate **and** every read now share, so they cannot disagree.
   This is the F-4/F-11 duplication class caught before it shipped, not after.

### Frontend

| File | What |
|---|---|
| `web/lib/progress.ts` *(new)* | Canonical display vocabulary for the domain — status labels/badges, verification sources, categories, date format. Put in `lib/` so a second surface extends it instead of forking. |
| `web/app/(protected)/progress/page.tsx` *(new)* | The page. |
| `…/progress/_components/HypothesisList.tsx` *(new)* | List + create form. Presentational. |
| `…/progress/_components/HypothesisDetail.tsx` *(new)* | The loop for one hypothesis: tasks, evidence timeline, decision history, decision form. Presentational. |
| `…/progress/_components/ProgressLoop.tsx` *(new)* | Container — fetching, mutations, toasts. |
| `web/api-client/types.ts` | `ProgressHypothesis`, `ProgressDecision`, `ProgressHypothesisDetail`, list envelopes, input types. |
| `web/lib/features.ts` | New RBAC feature id `progress` (flows into the permissions matrix automatically). |
| `web/components/EnterpriseShell.tsx` | One nav child under Reporting. Two-line change; no other nav behaviour touched. |
| `web/mocks/handlers.ts` | Full MSW coverage for the new routes. |

**The decision form is gated on evidence existing, and says so.** That mirrors
the backend rule rather than inventing a looser UI rule — the disabled state
reads "Attach at least one piece of evidence before deciding — Ascend records
results, not opinions," so it presents as a workflow step, not a broken button.

**Design system:** built entirely from the mandated primitives (`Card`,
`Button`, `Input`, `Select`, `Badge`, `EmptyState`, `Skeleton`) — zero raw
`<input>`/`<select>`/`<button>` in the feature components, zero hard-coded hex,
zero raw Tailwind default-palette classes (`erp`/semantic tokens and CSS vars
only). Loading (`Skeleton` + `role="status"`), empty (`EmptyState`), error
(`role="alert"`) and success (`Toast`) states are all wired.

**Accessibility:** selection is announced via `aria-current` (not colour alone),
every control has a real label, list rows are `min-h-touch` (44px), all
interactive elements inherit the primitives' `focus-visible:ring-*`, and the
decision form has **no `onSubmit`** — "Validate" and "Invalidate" are opposite
outcomes, so Enter must not silently pick one.

**MSW parity:** the mocks enforce the same rules as the backend — the
evidence-before-decision gate, the evidence-counts-two-ways union, the 400 on an
unfiltered evidence list. A looser mock is how UI passes in dev and 400s in
prod; that trap was closed deliberately. Evidence created through the *task*
route and through system-verify is now recorded in the shared mock store too, so
it shows up on the hypothesis exactly as it does against the real backend.

---

## 3. Verification — what was actually run

| Gate | Result |
|---|---|
| Backend `npm run typecheck` | **PASS** (exit 0) |
| Backend `npm test` (full suite, real Postgres 16) | **PASS — 894/894, 0 fail** (see §5) |
| `src/modules/progress` isolated | **7/7 pass** (3 pre-existing + 4 new) |
| Web `npm run typecheck` | **PASS** |
| Web `npm run lint` | **PASS — 0 warnings, 0 errors** |
| Web `npx vitest run` (full suite) | **PASS — 206/206 across 29 files** |
| New web tests | **18/18** (`tests/progressHypotheses.test.tsx`) |
| Web `npm run build` (production) | **PASS — compiled successfully, `/progress` emitted** |
| `node tools/hygiene-check.mjs` | **PASS** — 2188 files, no junk/tracked-env/conflict-markers/secrets/broken doc links |
| `npm run gap:scan` | **PASS** — 474 backend / 382 frontend paths, 17 allowlisted, no unexplained FE→BE gaps |
| `npm run table:scan` | **PASS** — 166 table names, no collisions |

### New backend tests (4), each proving a rule rather than a route

- `hypothesis detail returns the whole loop in one read` — detail is readable by
  a cashier (it's a read); only *this* hypothesis's tasks appear; evidence
  attached **via a task** and **directly** both count; validating pins
  confidence at 100; another tenant gets 404.
- `evidence listing is filtered, bounded, and tenant-scoped` — unfiltered → 400;
  another tenant sees 0 rows for the same task id; `limit=9999` clamps to 200;
  `limit=abc` falls back to 50 rather than 400ing a read.
- `a hypothesis cannot be decided before evidence exists` — 400 before evidence,
  **and the read agrees with the gate** (`evidence.length === 0`); cashier gets
  403 on the decision; `next_action` round-trips.
- `hypothesis and task lists are bounded and filterable` — the previously
  unbounded hypothesis list now reports its bound; tasks filter to one
  hypothesis; unknown id → 404.

### New web tests (18)

Cover both components across: status rendering, `aria-current` selection,
create-with-category, client-side validation, loading/empty/read-only states,
the full loop render, **the evidence gate in both directions**, validate and
invalidate paths, direct evidence attachment, and the decided/closed state.

---

## 4. Integration with existing modules

- **Audit log** — every mutation already wrote through `shared/audit.ts`
  (`progress.hypothesis_created`, `progress.decision_created`, …). Verified
  present, not re-implemented.
- **RBAC** — mutations are `requireRole("manager")` on the backend; the UI hides
  the controls for lower roles. The UI hiding is convenience; the backend guard
  is the actual gate, and the 403 test proves it.
- **Tenant isolation** — every new query filters `tenant_id`; three of the four
  new tests assert the cross-tenant boundary.
- **Dashboard `ProgressPanel`** — deliberately **not modified**. See §7.
- **Recommendations** — the dashboard's "Track as task" flow still posts to
  `POST /progress/tasks`, unchanged; those tasks now surface under their
  hypothesis when one is linked.

## Performance

Every new read is bounded and hits an existing index — no migration, no new
index, no schema change. The detail endpoint runs its three child reads with
`Promise.all` (one round trip for the caller, three concurrent queries server
side) rather than the four sequential requests a naive UI would have made:

- `progress_tasks_hypothesis_idx (tenant_id, hypothesis_id)` → detail tasks
- `progress_evidence_{task,hypothesis}_idx` → evidence reads
- `progress_decisions_hypothesis_idx (tenant_id, hypothesis_id, created_at DESC)` → decisions
- `progress_hypotheses_tenant_idx (tenant_id, created_at DESC)` → list

## Security

- No new mutation surface — the three added routes are reads.
- Reads are tenant-scoped and role-checked by the existing gateway middleware.
- The evidence list **refuses** an unfiltered query, so it cannot be turned into
  a tenant-wide dump by omitting a parameter.
- Every value is `@param`-bound; the one interpolated fragment
  (`EVIDENCE_FOR_HYPOTHESIS`) is a module-level constant containing no user
  input.
- Evidence URLs render with `rel="noreferrer noopener"` on `target="_blank"`.

---

## 5. Environment notes (so the numbers are reproducible)

- Container started with **empty `node_modules`** — `npm ci` was run at root and
  in `web/` before any gate.
- Backend suite ran against **system PostgreSQL 16** (`pg_ctlcluster 16 main
  start`, role/db per `.env.example`), not embedded Postgres. `/dev/shm` is 16G
  here, so the documented 64MB shm failure mode did not apply.
- Node is **22.22.2**; `.nvmrc`/CI pin 24, and Node 24 is not installed in this
  container. The web suite nonetheless passed **206/206** — the 3 jsdom
  `Blob`/`FileReader` failures that `AGENTS.md` warns about did not occur, and
  the suite now prints an explicit version-gap banner naming the cause (which is
  what **F-9** asked for). Recorded as an observation, not a claim that F-9 is
  closed — that should be confirmed by whoever owns F-9.

---

## 6. Findings recorded, NOT fixed (out of this feature's scope)

Per the protocol ("record it in the backlog… continue with the current
feature"):

1. **`GAPS.md` row 35 is stale.** It lists "Product/inventory pages: dead
   routes, broken transfers redirect, duplicate batch/expiry models" as **Open**
   and points at `PRODUCT_MODULE_REVIEW.md` — but that review's own §12/§13 mark
   every item **shipped** (PRs #106–#108 plus the expiry retirement). Corrected
   in `GAPS.md` this session, since keeping that file honest is its stated
   purpose; the underlying work needed nothing.
2. **`dashboard/_components/ProgressPanel.tsx` holds private copies** of
   `STATUS_LABEL`, `STATUS_BADGE` and `VERIFICATION_SOURCES` that now duplicate
   `web/lib/progress.ts`. It should import the shared module. **Not done here on
   purpose:** `dashboard/**` is inside the Cursor Cloud "Wave A/B trust
   leftovers + palette" claim, which is still `ACTIVE` in `WORK/LOCK.md`. Filed
   in `LOOP_STATE.md` for whoever picks it up after that lock releases.
3. **No `GET /progress/hypotheses/:id` equivalent for tasks.** A task detail
   view (its own evidence trail) has no route. Not needed by this feature —
   `GET /evidence?taskId=` covers it — but worth noting if a task drill-down is
   ever built.

---

## 7. What is deliberately NOT in this change

- **`web/app/(protected)/dashboard/**` — untouched.** Another session's claim
  covers it. The new work is a separate page and separate components precisely
  so the two cannot collide.
- **No schema change, no migration.** All four `progress_*` tables and their six
  indexes already existed and were sufficient.
- **No `artifacts/**` changes.** That tree remains the open NEEDS-SRI F-3
  decision.
- **Load/stress testing.** Same blocker as the 2026-08-05 audit: no reachable
  TESTING tier. Reported as not done, not softened.
- **E2E (Playwright).** Not run — this container has no built+served real-stack
  pair, and CI runs the golden paths on the PR. The feature's own behaviour is
  covered by 4 backend integration tests against real Postgres and 18 component
  tests; the untested layer is specifically "this page inside a real browser
  against a real server." Stated plainly rather than implied green.

---

## 8. Honest status

| Layer | Status |
|---|---|
| Architecture / design | `built_verified` — owner recorded in `ARCHITECTURE.md`'s domain table |
| Database | no change needed — `built_verified` (tables + indexes pre-existed) |
| Backend, API, business logic, validation | `built_verified` |
| RBAC, audit logging, tenant isolation | `built_verified` (tests assert 403 and cross-tenant 404/empty) |
| Frontend UI, states, a11y, responsive | `built_verified` (typecheck + lint + 18 tests + production build) |
| Integration with existing modules | `built_verified` |
| Unit + integration tests | `built_verified` — 894 backend, 206 web, all green |
| End-to-end (Playwright) | **not run** — see §7 |
| Performance | `built_verified` for query shape (bounded, indexed); **no profiling under load** — see §7 |
| Security review | `built_verified` for this diff's surface |
| Documentation | `built_verified` — this audit, `ARCHITECTURE.md`, `GAPS.md`, `LOOP_STATE.md` |
| Deployment readiness | **unchanged by this work.** The release blockers are still the operational ones in `AUDIT_2026-08-05T054800Z` (no production backup has ever run; heartbeat probes a dead host). This feature does not move that verdict, and does not claim to. |
