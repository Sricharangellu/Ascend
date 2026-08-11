# AUDIT 2026-08-11T005455Z — F-18: the OpenAPI contract is now checked against the code

Point-in-time snapshot. Append-only per `AGENTS.md` — do not edit later; write a
new audit instead.

**Scope:** the next unblocked item in Phase 9's stated execution order, after
F-5 and F-9 closed on `claude/ascend-f5-test-request-factory` (PR #215).

---

## Why this item

`WORK/FORWARD_PLAN.md` §9.3 fixes the order. Walking it against reality again:

| Item | State | Why not this one |
|---|---|---|
| S-1 | ⛔ Sri-only | Branch-protection setting; the protection API returns 403 to agents. |
| F-11 | ⛔ BLOCKED | "Sri: which tax authority wins." Changes what customers are charged. |
| F-3 | ⛔ NEEDS-SRI | Whether `artifacts/` (1,004 files) is deleted. |
| F-15/16/17 | ✅ DONE | Guardrails shipped. |
| F-5, F-9 | ✅ DONE | PR #215, this session. |
| F-14 | ⛔ transitively blocked | `Depends on: F-3`. |
| F-19 | nominally READY | Gated on F-3 for the `artifacts/` tree; also 1–2 d and cross-cutting. |
| **F-18** | ⬜ **READY, no dependencies** | ← taken |

## What the gap actually was

`contracts/openapi.yaml` is 3,060 lines describing 146 operations. It was
written *from* the routes, and nothing has ever checked that it still describes
them. Two things make a stale entry expensive rather than untidy:

1. **It is the instruction frontend work is written against.** The standing
   guidance is literal: "If it's not in the spec, you don't call it"
   (`orchestration/_archive/AGENT_FRONTEND.md`). A path documented here and
   served nowhere is a direction to build a call that 404s — the 2026-07-18
   incident (pages green against MSW mocks, real API 404) approached from the
   other side. `api-gap-scan.mjs` has guarded that road one way since M-3;
   nothing guarded this one.

2. **A generator is still wired at it.** `web/package.json` carries
   `generate:client: openapi-typescript ../contracts/openapi.yaml -o
   api-client/types.ts`. Run it and every documented path becomes a typed,
   autocompleting client method.

Point 2 needs an honest correction to what the older audits say. Both
`AUDIT_2026-08-06T170227Z` and `AUDIT_2026-08-06T170650Z` describe
`web/api-client/types.ts` as generated output. It is not. That file's own
header records the verification (2026-07-19): running the command produces
openapi-typescript's raw `paths`/`operations`/`components` shape (~5,900 lines),
while the checked-in file is ~1,900 lines of hand-curated named interfaces that
**218 files import from**. The script is a live footgun, not a build step. That
weakens the "generated client" framing and does not weaken the case: the
contract is read by people and agents, and the generator is one command away
from being run by someone who believes the script name.

## What was built

**`tools/openapi-contract-scan.mjs`** (`npm run contract:scan`) — fails when a
documented `<METHOD> <path>` has no backend route. Dependency-free, like every
other scanner in `tools/`, which is the property that lets `hygiene-check.mjs`
run as CI's first step before `npm ci`. Adding `js-yaml` for one file would cost
that; the reader only needs `paths:` → path → method, which in this document is
two fixed indent levels.

**`tools/lib/backend-routes.mjs`** — the route extraction and the path
normalizer, now shared. `api-gap-scan` grew both first for a question that only
needed paths ("does the path the frontend calls exist?"). This needed the method
too. Copying an extractor to add one field is exactly how the repo ended up with
41 identical `test-request.ts` files, so it moved rather than forked.

The normalizer moved for the same reason, on a second pass: the first cut of
this refactor left `api-gap-scan`'s local `norm()` in place for frontend paths
while the backend half used the shared `normalizePath()`. The two were the same
function apart from the `{id}` case — a near-duplicate, and worse, one that made
the two halves of a single scanner normalize differently. `api-gap-scan` now
imports the shared one and has no private copy.

Verified as **set-identical**, not merely same-count — the two path sets were
dumped from the pre-refactor scanner (`origin/develop`) and the refactored one
and compared directly:

```
before: 474 backend paths, 382 frontend paths, 17 allowlisted
after:  474 backend paths, 382 frontend paths, 17 allowlisted
diff of the sorted {backend, frontend} sets: empty
```

Counts alone would not have caught a swap; the set diff does.

### One-way, deliberately

The backend serves **626 operations**; the contract documents **146**. Checking
code → contract as well would arrive with ~480 findings and be deleted inside a
week. An undocumented route is a documentation gap. A documented-but-absent
route is a lie told to whoever reads the spec. Only the second is gated.

### The normalization is load-bearing

Express `:id` and OpenAPI `{id}` are the same parameter written two ways. The
first run, before `{id}` was handled, reported **50 findings — 41 of them purely
the brace-vs-colon difference.** That is the shape of a check that gets deleted
on arrival. With both notations normalized to `:p`, 9 survived, and all 9 were
real.

## The 9 findings

Triaged against the actual route registrations, not against the module names.

### 3 were plain typos — fixed here

| Contract said | Code serves | Evidence it is a typo |
|---|---|---|
| `GET /api/v1/audit_log` | `GET /api/v1/audit-log` | The module directory is `audit_log/` and the **table** is `audit_log`, but the manifest says `name: "audit-log"` — so the mount is hyphenated. `web/app/(protected)/audit-log/page.tsx` and `settings/modes/page.tsx` already call the hyphen. |
| `POST /api/v1/hospitality/rooms/{id}/charges` | `POST .../rooms/{id}/charge` | Singular in `src/modules/hospitality/index.ts:124`; `web/app/(protected)/hospitality/page.tsx:96` already posts to the singular. |
| `GET /api/v1/hospitality/rooms/{id}/folio` | `GET .../rooms/{id}/charges` | No `/folio` route exists at any address. `hospitality/page.tsx:72` fetches the folio from `/charges`, and the MSW handlers mock `/charges`. |

In every one of the three, **the frontend was already calling the corrected
path.** The contract was the only thing that disagreed with everyone else.

### 6 need an API decision — allowlisted, and filed as F-28

Not a rename, so not fixed here. A consistent pattern, which is why it is worth
one item rather than six:

- **The contract creates flat; the code creates nested.**
  `POST /healthcare/prescriptions` carries `patient_id` in the body — the code
  serves `POST /healthcare/patients/:id/prescriptions`. Same for
  `POST /education/fees` (`student_id`) → `POST /education/students/:id/fees`,
  and `POST /entertainment/tickets` (`event_id`) →
  `POST /entertainment/events/:id/sell`.
- **The contract models status as a sub-resource; the code makes it a field.**
  `PATCH /appointments/{id}/status` → `PATCH /appointments/:id`, whose
  `patchSchema` accepts `status` alongside `notes`/`startsAt`/`endsAt`.
- **Two are absent outright.** `PATCH /entertainment/events/{id}/status` — the
  module registers no PATCH on events at any address. `PATCH
  /automotive/work-orders/{id}/status` — the contract describes a *bodyless
  auto-advance* (`open→in_progress→completed`); the code's
  `PATCH /work-orders/:id` requires the caller to supply the target status.
  Address and semantics both differ, so this one is a decision, not a rename.

The tell that this is creation-and-status drift specifically, not a wholesale
mismatch: every sibling *action* endpoint matches exactly —
`POST /prescriptions/{id}/dispense`, `POST /fees/{id}/collect`,
`POST /tickets/redeem`, `PATCH /rooms/{id}/status`.

Each allowlist entry **names the route that actually serves the capability**, so
whoever takes F-28 does not repeat this triage. An allowlist whose entries only
say "known" is where findings go to die; `contract:scan` also fails on a stale
entry, so the cleanup is enforced rather than hoped for.

## The scope line, and why it was held

The scan compares **paths and methods only**. Bodies drift too, and the
hospitality charge is the proof: the code's `chargeSchema` is
`{description, amountCents, orderId?}`, while the contract requires
`{description, amount_cents, category}` — camelCase vs snake_case, plus a
`category` field that does not exist in the handler or the table.

That was tempting to fix while renaming the path two lines above it. It was not
fixed, for a reason worth stating: **no test in this PR could verify a body
edit.** Rewriting request schemas from a reading of handler code, in a PR whose
purpose is to add a CI check, risks making the contract *more* wrong while
turning the scanner green — and the scanner would not catch it. Body-level
consistency is F-19's pass (DB ↔ API ↔ FE types), which is a systematic sweep
with its own verification. Recorded in the allowlist's `_readme` and here rather
than half-done.

The three renames were in scope by a narrower test: each is provable from a
route that already exists *and* a frontend call that already uses the corrected
spelling. Nothing was inferred.

## Proof the guard can fail

This repo has shipped two guards that were inert for their entire lives — F-1's
SQL-interpolation grep (an unclosed `\(` made grep exit 2, and a leading `!`
inverted the error into a pass) and F-2's mutation-route grep (`|| echo "…✓"`
discarded the exit status; reproduced printing 39 matching lines **and** the ✓
**and** exit 0). So this one was negative-tested before being wired in.

| Test | Expected | Result |
|---|---|---|
| Plant `GET /api/v1/totally-invented/{id}/nonsense` in the contract | fail, naming it | ✅ exit 1, named |
| Plant an allowlist entry for `GET /api/v1/catalog` (which **is** served) | fail as stale | ✅ exit 1, named |
| Shift every path/method line one space right (document shape changes) | fail on the parser floor | ✅ exit 1, "only 0 operations parsed … do not lower this floor" |
| Restore | pass | ✅ exit 0, `146 documented operations vs 626 backend routes` |

The third matters most. Without the floor, a future reformatting of
`openapi.yaml` would make the reader match nothing, and the scan would report
"every documented operation is served" forever — the same never-fires failure,
rebuilt.

### And the reader is provably equivalent to a real YAML parser

The floor only catches *gross* breakage. A reader that silently missed a handful
of operations would sail past it — and every missed operation is one this scan
can never flag. So the hand-rolled reader was diffed against `pyyaml` parsing
the same document:

```
real YAML parser  : 146 operations
hand-rolled reader: 146 operations
only in YAML parser: none
only in hand reader: none
```

Set-identical. Zero missed, zero spurious. That is the evidence that skipping
`js-yaml` — taken to keep every scanner in `tools/` runnable on the runner's
bare node before `npm ci` — cost nothing in coverage on this document. The floor
remains as the guard for the day the document's shape changes.

## Verification

Every gate, run in this container against real PostgreSQL 16.

| Gate | Result |
|---|---|
| `npm run typecheck` | ✅ clean |
| `npm test` | ✅ **899/899 pass, 0 fail** |
| `npm run smoke` | ✅ **20/20**, full POS lifecycle |
| `npm run hygiene` | ✅ 2205 files |
| `npm run gap:scan` | ✅ 474 / 382, 17 allowlisted — **path sets proven identical to pre-refactor** |
| **`npm run contract:scan`** | ✅ 146 documented vs 626 routes, 6 allowlisted |
| `npm run authz:scan` | ✅ 49 route files, 6 allowlisted, 0 unguarded |
| `npm run table:scan` | ✅ 166 names, no collisions |
| `npm run dupe:scan` | ✅ unchanged (41 files — F-5's fix is on PR #215, not this branch) |
| `npm run prevent:drift` | ✅ clean (2206 tracked files, no dirty drift or stray modules) |
| web `typecheck` | ✅ clean |
| web `lint` | ✅ 0 errors, 0 warnings |
| web `vitest` | ✅ **206/206 across 29 files** |
| web `build` | ✅ production build succeeds |
| `contracts/openapi.yaml` parses | ✅ 109 paths via `yaml.safe_load` — no duplicate keys introduced by the renames |
| `.github/workflows/ci.yml` parses | ✅ |

The backend suite is not incidental here: the three contract renames are
documentation, but the shared-extractor refactor changes a scanner two CI jobs
depend on, and `gap:scan`'s byte-identical output is the direct evidence it did
not change behaviour.

**Not run:** Playwright e2e — no `web/` file changed, and CI runs the golden
paths on the PR. `actionlint` — not installed in this container; the workflow
was validated by YAML parse instead, and the change is one step with no shell
beyond `npm run contract:scan`. Node here is 22, not the pinned 24; the web
suite passed 206/206 anyway, and the F-9 version-gap banner printed as designed.

**Container note, recorded because it cost real time and will recur.** The
backend suite killed its own PostgreSQL. 899 tests each build a fresh schema
(123 `buildApp()` call sites across 86 files), which grew `ascend_test` to
**15 GB** against 14 GB of remaining writable allowance; the server died
mid-checkpoint with no shutdown line in its log. Restarting it triggered a
crash-recovery fsync sweep over all 15 GB — minutes of work to recover a
directory whose entire contents are disposable. Wiping and re-initing took
seconds and returned free space from 14 GB to 29 GB. Anyone running the full
suite in a fresh container should expect to drop the test database afterwards
rather than reuse it. Same defect family as the advisory-lock timeout already
recorded in `WORK/LOOP_STATE.md` (2026-08-07) — the per-test schema build is
expensive in ways that surface as unrelated-looking failures.

## Left alone deliberately

- **Request and response body drift** — F-19's pass, per the reasoning above.
- **`web/package.json`'s `generate:client` footgun.** It points a generator at a
  hand-maintained file whose overwrite would break 218 importers. Removing the
  script or repointing it is F-21's territory (which already records the
  manually-maintained finding); doing it here would be a second bucket.
- **The 480 undocumented backend routes.** Deliberate, per the one-way design.
- **`src/**`** — untouched. In all 9 findings the code was right.

## Next unblocked item

F-11, F-3, F-14 remain blocked. With F-5, F-9 and F-18 closed, the remaining
READY items are **F-27** (triage the 95 unreferenced value exports — its own row
warns it "is the one item that deletes code" and requires removals in a separate
reviewed PR), **F-19** (DB↔API↔FE type consistency — nominally gated on F-3 for
the `artifacts/` tree only, and now with a concrete first finding from this
work), **F-28** (new, from this audit), **F-24** (Next 14→16, High risk),
**F-25** (vitest 2→4), and **F-20** (marked "READY last").
