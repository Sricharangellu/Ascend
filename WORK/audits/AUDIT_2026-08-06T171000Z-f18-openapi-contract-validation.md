# AUDIT 2026-08-06T171000Z — F-18: OpenAPI contract validation

**Session:** Claude Code web — `claude/status-staging-vs-develop-0vv2gg`
**Base:** `develop@41f6eda` (`feat(db): add npm run db:check preflight + Supabase setup docs (#195)`)
**Scope:** Phase 9.9 finding **F-18**. Build the CI check that validates
`contracts/openapi.yaml` against the real backend, and fix the drift it finds.
**Not in scope:** any `src/**` behaviour change, `artifacts/**`, and the F-28
decision this pass surfaced.

---

## 1. Why this item

Phase 9's execution order is `S-1 → F-11 → F-3 → F-15/F-16/F-17 → F-5, F-14,
F-9 → F-19 → F-12, F-18 → F-20`. Walking it against the real tree:

| Item | State found | Actionable? |
|---|---|---|
| S-1, S-2 | repo settings | no — Sri-only |
| F-11 (tax authority) | needs a decision on which of 3 authorities wins | no |
| F-3 (`artifacts/` tree) | NEEDS-SRI | no |
| F-15, F-16, F-17 | ✅ done 2026-08-04 | — |
| **F-5** | table said `⬜ READY`; **already shipped in PR #185** | corrected |
| **F-9** | table said `⬜ READY`; **already shipped in PR #185** | corrected |
| F-14, F-19, F-22, F-23, F-27 | all declare `Depends on: F-3` | no |
| F-12 | waits on F-11 | no |
| **F-18** | genuinely unblocked, no dependencies | **taken** |
| F-24, F-25 | unblocked but framework/test-runner majors | deferred |
| F-20 | explicitly sequenced last | deferred |

F-18 was the last unblocked, non-major item in the stated order.

### 1a. Two stale board rows, corrected

Both were verified against the tree, not assumed:

- **F-5** — `src/shared/test-request.ts` exists; all 46 per-module copies are
  thin re-exports of `sendRequest`/`resolveApiPath`/`bearer` that pin their own
  default role. Spot-checked the exact case the acceptance criteria named:
  `workflows` still defaults to `manager`, `catalog` to `owner`, and `identity`
  deliberately signs no token and does not upgrade the path. Shipped `409f617`.
- **F-9** — `web/tests/setup.ts` reads `process.versions.node`, compares against
  `.nvmrc`, and prints a named warning. Shipped `df1a45f`.

A row that says READY for work already done is the same failure mode Phase 9
exists to correct, so this is recorded as a finding rather than a silent edit.

---

## 2. The check

`tools/openapi-contract-scan.mjs` — `npm run contract:scan`, wired into CI's
guard job and into `npm run verify`.

Dependency-free, matching every other tool in `tools/`: they must be able to run
as a bare `node` call before `npm ci`, which is the property that let
`hygiene-check` survive the root-manifest hijack (F-2).

Route extraction mirrors `tools/api-gap-scan.mjs` — same registration model
(module `mountPath` + `app.ts` direct routes + `identity`) — extended to keep the
**HTTP method**, since a path documented for `GET` but only served for `POST` is
real drift a path-only comparison cannot see. Verified the extraction is complete
for this repo before relying on it: no module has nested route directories, every
`router.use()` in `src/modules` mounts middleware rather than a sub-router, and
`registerPublicRoutes` attaches to `/api/v1/sso`, the same path the `sso` module
already declares.

### Gate design — deliberately asymmetric

| Direction | Treatment | Why |
|---|---|---|
| **Phantom** — documented, not served | **FATAL** | The check is exact and the count is already zero. Gating a zero costs nobody anything and stops the drift coming back. See §3a — no compiler will ever catch this class, so nothing else can. |
| **Undocumented** — served, not documented | ratcheted report-only | 475 of them. The contract covers the public surface, not the 623-route internal total. Gating today would fail every PR on arrival, and Phase 9.6 is explicit that such a check gets deleted rather than fixed. |

This is a departure from "non-blocking first" for the phantom half, and the
justification is narrow: the count it gates on is **already zero**, because all
9 findings were corrected in the same PR. A gate that is green on arrival does
not block anyone.

### The naive YAML reader, and why it is safe

A YAML library would break the dependency-free property. The reader models the
narrow part of the format — path keys at two-space indent, method keys at four —
which is what the file uses throughout. Two guards keep
it from silently degrading:

1. Cross-validated against PyYAML on the real file: **148 operations vs 148**,
   no misses, no extras.
2. It throws on any two-space key inside `paths:` that is not a path, on a
   missing `paths:` block, and on parsing zero operations. A parser that
   silently sees fewer operations turns this gate into a green light, which is
   worse than no gate.

---

## 3. What it found — 9 phantom operations

All confirmed against the real handlers, not inferred from the scanner:

| Documented | Reality |
|---|---|
| `PATCH /api/v1/appointments/{id}/status` | real route is `PATCH /appointments/{id}` |
| `POST /api/v1/healthcare/prescriptions` | real is `POST /patients/{id}/prescriptions` — patient comes from the path |
| `PATCH /api/v1/automotive/work-orders/{id}/status` | real is `PATCH /work-orders/{id}` |
| `POST /api/v1/hospitality/rooms/{id}/charges` | real is `/charge`, **singular** |
| `GET /api/v1/hospitality/rooms/{id}/folio` | never built; `GET /rooms/{id}/charges` is the real one |
| `PATCH /api/v1/entertainment/events/{id}/status` | never built at all — no PATCH on events |
| `POST /api/v1/entertainment/tickets` | real is `POST /events/{id}/sell` |
| `POST /api/v1/education/fees` | real is `POST /students/{id}/fees` |
| `GET /api/v1/audit_log` | module registers as `audit-log` (hyphen) |

**The frontend was innocent in every case** — checked each: it calls
`/prescriptions/{id}/dispense`, `/work-orders/{id}`, `/rooms/{id}/charges`,
`/tickets/redeem`, `/fees/{id}/collect`, all real. `gap:scan` is green and none
of these are allowlisted, which is consistent: nothing calls the phantoms.

So the contract was wrong, not the backend. **Corrected the contract rather than
inventing backend routes** — building `PATCH /events/{id}/status` because a
document mentioned it would be inventing product surface, which is the opposite
of what this program is for. The two operations with no real counterpart at all
(`events/{id}/status`, and `folio` as a distinct concept) were removed.

While rewriting those blocks, four real but undocumented routes were added,
since they are the natural contents of paths being created anyway:
`GET /patients/{id}/prescriptions`, `GET /events/{id}/tickets`,
`DELETE /appointments/{id}`, and the real `GET /rooms/{id}/charges`.

### 3a. A correction to this audit's own first draft — and F-29

The obvious justification for gating this check was that `contracts/openapi.yaml`
feeds orval, so a phantom ships as generated client code that 404s. **That is
false, and it was written into the scanner header, the CI comment and this
report before being checked.** Recording it rather than quietly deleting it,
because the near-miss is the point: it is a plausible, repo-shaped claim that
would have justified a gate on a reason that does not exist.

What is actually true:

| Spec | Lines | Paths | Consumed by |
|---|---|---|---|
| `contracts/openapi.yaml` | 3,170 | 109 → 111 | **nothing programmatic** — docs and archived orchestration files only |
| `lib/api-spec/openapi.yaml` | 36 | 1 (`/healthz`) | orval → `lib/api-client-react`, `lib/api-zod` |

`web/api-client/types.ts` is hand-maintained despite archived docs
(`orchestration/_archive/AGENT_FRONTEND.md`) calling it "GENERATED from
contracts/openapi.yaml (do not hand-edit)" — its own header admits this and
F-21 already tracks it.

So the real justification is weaker but still sufficient: **no compiler, type
error, or existing check has ever looked at this file.** Drift here is silent by
construction, which is exactly how 9 phantoms and 11 wrong request bodies
accumulated. The gate stands on a narrower footing — the check is exact and the
count is already zero, so gating costs nothing and prevents regression.

The two-spec split is itself a finding: two files named `openapi.yaml`, one the
3,170-line contract of record and one a 36-line stub wired to codegen, with
nothing relating them. Recorded as **F-29**, same class as F-10 (`scripts/` has
two owners).

---

## 4. The second class — 11 lying request bodies (and F-28 underneath)

Measured while fixing the above, not guessed: of 68 documented operations with a
JSON request body, 15 declared snake_case properties. Checking each against its
module's actual zod schema split them cleanly:

- **4 were correct.** `catalog` and `service_orders` genuinely accept
  snake_case (`price_cents`, `tax_class`, `estimate_cents`). My first read of
  this was wrong — the initial assumption that "requests are camelCase
  everywhere" does not hold, and the contract was right for these.
- **11 were wrong.** The eight vertical modules take camelCase, so
  `starts_at`, `labour_cents`, `vehicle_id`, `room_number`, `qty_consumed`,
  `daily_rate_cents`, `ticket_price_cents` and friends would all be rejected.
  `POST /rental/contracts/{id}/return` documented a `damage_cents` on an
  endpoint that **reads no request body at all**.

All 11 corrected against the real zod schemas; re-measured **11 → 0**. Query
parameters in the same operations were fixed alongside (`employee_id` →
`employeeId`, plus the undocumented `from`/`to`; dropped `customer_id` and
`vehicle_id` filters that no handler reads).

### F-28 — the part that is *not* fixed

Fixing the documentation does not fix why it drifted. **The repo has two
request-field naming conventions**: snake_case in `catalog`/`service_orders`,
camelCase in the eight verticals. Responses are raw DB rows and therefore
snake_case everywhere — so a caller of a camelCase module sends one convention
and reads back another.

Recorded as **F-28, NEEDS-SRI**. Renaming accepted request fields is a breaking
API change, not a cleanup, and this program's own governing rule is that an
agent turned loose to "fix everything" trades known defects for unknown
regressions. Picking the convention is Sri's call.

---

## 5. Gates

Run on the working tree, against real Postgres 16.13 (embedded-postgres cannot
`initdb` as root in this sandbox — same limit the 2026-08-04 audit hit; a system
cluster on port 55432 was used via `DATABASE_URL`).

| Gate | Result |
|---|---|
| `npm run typecheck` (backend) | exit 0 |
| `npm run hygiene` | PASS — 2181 files |
| `npm run gap:scan` | PASS — no unexplained FE→BE gaps |
| `npm run contract:scan` | PASS — 148 documented, 0 phantom |
| `npm run table:scan` | PASS — 166 table names, no collisions |
| `npm run prevent:drift` | PASS (after commit; it correctly flagged this session's own uncommitted edits first) |
| `npm test` (backend) | see §5a |
| web typecheck / lint / build | see §5a |

### 5a. Verification of the scanner itself

Failure modes proven, not asserted — the standard this repo applies to any new
guard:

| Scenario | Expected | Actual |
|---|---|---|
| Clean tree | exit 0 | exit 0 |
| Inject a phantom operation | exit 1, names it | exit 1, `GET /api/v1/totally-made-up` |
| Undocumented count exceeds baseline | exit 1 | exit 1, `475 → 400` breach reported |
| Two-space non-path key in `paths:` | hard error | `unexpected key "notAPath"` |
| Pre-fix contract (`git HEAD`) | exit 1 | exit 1 — reproduces the drift unaided |

`contracts/openapi.yaml` was confirmed byte-identical after each destructive
test, and re-parsed cleanly by PyYAML after all edits.

---

## 6. What remains in Phase 9

Nothing unblocked is left except two dependency majors and one burndown:
**F-24** (Next 14→16), **F-25** (vitest 2→4), **F-20** (suppressions, sequenced
last). Everything else waits on a decision: **S-1**/**S-2** (repo settings),
**F-11** (tax authority), **F-3** (the `artifacts/` tree — which alone gates
F-14, F-19, F-22, F-23 and F-27), **F-13** (pricing owner), and now **F-28**.

The honest read: Phase 9's remaining surface is decision-bound, not
effort-bound.
