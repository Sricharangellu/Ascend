# AUDIT 2026-08-11T003413Z — F-5: one `test-request` factory (Phase 9 cleanup)

Point-in-time snapshot. Append-only per `AGENTS.md` — do not edit later; write a
new audit instead.

**Scope:** the next unblocked item in Phase 9's stated execution order. Also
records F-9 as already-done, because its status in the plan was stale.

---

## Why this item

`WORK/FORWARD_PLAN.md` §9.3 fixes the order:

> **S-1** → **F-11** (tax owner) → **F-3** decision → **F-15/F-16/F-17**
> guardrails → **F-5**, **F-14**, **F-9** cleanups → **F-19** → **F-12**,
> **F-18** → **F-20**

Walking it against reality:

| Item | State | Why not this one |
|---|---|---|
| S-1 | ⛔ Sri-only | Branch-protection setting; the protection API returns 403 to agents. |
| F-11 | ⛔ BLOCKED | "Sri: which tax authority wins." Changes what customers are charged. Not an agent's call. |
| F-3 | ⛔ NEEDS-SRI | Whether `artifacts/` (1,004 files) is deleted. |
| F-15/16/17 | ✅ DONE | Guardrails already shipped. |
| **F-5** | ⬜ **READY, no dependencies** | ← taken |
| F-14 | ⛔ transitively blocked | `Depends on: F-3`. |
| F-9 | ⬜ READY | Taken too — turned out already done, see below. |

F-5 is the first item in the order with no blocker.

## What was actually there

Measured, not recalled:

```
46  src/modules/*/test-request.ts   (excluding src/shared/)
 8  distinct contents by md5
41  of the 46 byte-identical, in three groups: 31 + 5 + 5
```

`dupe:scan` reported those three groups on every PR:

```
duplicate-code-scan: 771 files scanned · 3 identical-file groups (41 files) · 7 duplicated blocks
  31× src/modules/accounting/test-request.ts
   5× src/modules/ai_assistant/test-request.ts
   5× src/modules/discounts/test-request.ts
```

The eight variants:

| Variant | Count | Signature | Default role |
|---|---|---|---|
| A | 31 | `(app, method, path, body?)` | `owner`, hard-coded subject |
| B | 5 | `(app, method, path, body?, role?)` | `owner` |
| C | 5 | `(app, method, path, body?, role?)` | `manager` |
| `reports` | 1 | as B, but `role: Role` | `owner` |
| `business` | 1 | `(…, claims: TestClaims)` — arbitrary sub/tenant/role | `owner` |
| `custom_roles` | 1 | as B + `{customRoleId, permissions}` | `owner` |
| `progress` | 1 | `(app: App, method, path, role, body?, tenantId?)` | required |
| `identity` | 1 | no token, no path rewrite, returns headers | none |

A prior pass had already extracted the *plumbing* (`sendRequest`, `bearer`,
`resolveApiPath`) into `src/shared/test-request.ts`. What it deliberately left
alone was the composition — and that is what stayed duplicated 41 ways.

## What changed

**`makeRequest(defaultRole)`** added to `src/shared/test-request.ts`, returning
the `(app, method, path, body?, role?)` signature that variants A/B/C had
already converged on independently. The 41 identical helpers became one-line
calls; each module keeps its own file so the default role stays greppable next
to the tests that depend on it.

**Five helpers were deliberately left hand-written** — `identity`, `progress`,
`business`, `custom_roles`, `reports`. Their differences are real, and folding
them in would mean an options bag with five one-off flags, which is the
duplication back again wearing a hat. They were never part of the 41 anyway:
each is a singleton, contributing zero to the duplication count.

## The two risks, and how each was closed

**1. Could adding a 5th parameter change an existing call?** The 31 variant-A
helpers declared four parameters. If any of their call sites passed a fifth, it
was silently discarded before and would now take effect.

Checked rather than assumed — every `request(` call in those 31 modules was
parsed with a paren-balanced, string-aware scanner counting top-level arguments:

```
variant-A modules: 31
calls passing a 5th arg: none
```

So the added parameter is a strict superset. The subject also matches exactly:
variant A hard-coded `usr_demo_owner`; the factory derives `usr_demo_${role}`,
which for `owner` is the same string.

**2. Could a module be silently re-roled?** F-5's named acceptance criterion is
"per-module default roles preserved *exactly* (`workflows` stays `manager`)".
The post-change `manager` set was diffed against the same set computed from git
before the change:

```
before (git stash):  discounts insights purchasing sso workflows
after:               discounts insights purchasing sso workflows
```

Identical. `workflows` stays `manager`.

## F-9 — already done, status was stale

F-9 asked to "assert the Node major in the web test setup so the failure names
its own cause". `web/tests/setup.ts` already does exactly that. Verified by
running the web suite on this container's Node 22.22.2:

```
⚠  Node 22.22.2 is older than .nvmrc (24).
   Expect 3 failures in tests/api-client.test.ts, all reading:
     "Failed to execute 'readAsText' on 'FileReader': parameter 1 is not of type 'Blob'"
   That is this version gap, not a regression — jsdom's FileReader rejects the
   Blob undici returns before Node 24. CI runs Node 24 and is unaffected.
   Run `nvm use` to match it.
```

That is the acceptance criterion met verbatim. Marked ✅ DONE in the plan.

Worth stating plainly: **an unticked item that is actually finished is not a
harmless inaccuracy.** It is an invitation for the next agent to build it again
— the duplicate-work failure this repo paid for four days ago, when two parallel
sessions shipped overlapping infrastructure audits (PR #197/#198). A stale
status is the same defect class as a stale allowlist entry, which is why
`route-authz-scan` fails on those.

## Verification

Every gate, run in this container against real PostgreSQL 16.

| Gate | Result |
|---|---|
| `npm run typecheck` | ✅ clean |
| `npm test` | ✅ **899/899 pass, 0 fail** |
| `npm run smoke` | ✅ **20/20**, full POS lifecycle |
| `npm run dupe:scan` | ✅ **3 identical-file groups → 0** (41 files → 0) |
| `npm run hygiene` | ✅ 2202 files |
| `npm run authz:scan` | ✅ 49 route files, 6 allowlisted, 0 unguarded |
| `npm run gap:scan` | ✅ 474 backend / 382 frontend, 17 allowlisted |
| `npm run table:scan` | ✅ 166 names, no collisions |
| web `typecheck` | ✅ clean |
| web `lint` | ✅ 0 errors, 0 warnings |
| web `vitest` | ✅ **206/206 across 29 files** |
| web `build` | ✅ production build succeeds |

The backend suite is the gate that matters here: this change touches the test
harness of 41 of 55 modules, so a broken factory or a re-roled module would show
up as failures across the suite, not in one file. 899/899.

**Not run:** Playwright e2e — no `web/` file changed, and CI runs the golden
paths on the PR. Node here is 22, not the pinned 24; the web suite passed
206/206 anyway (the three documented jsdom failures did not occur).

## Left alone deliberately

- **The 7 duplicated *blocks* (≥25 identical lines)** `dupe:scan` still reports,
  mostly shared setup inside `*.test.ts` files (`customer_invoices`, `loyalty`,
  `product_batches`, `quotes`) plus the two web pairs already tracked as F-22
  and F-23. Not F-5's scope, and Phase 9's governing rule is explicit: "Do not
  open a PR that spans two buckets."
- **The 5 hand-written helpers**, per the reasoning above.
- **F-14** (`expenses` layout) — `Depends on: F-3`, still blocked.

## Next unblocked item

With F-5 and F-9 closed, walking the order again: F-11, F-3, F-14 remain
blocked. The next item with no blocker is **F-27** (triage the 95 unreferenced
value exports F-17 surfaced) — though its own row warns it "is the one item that
deletes code" and requires removals in a separate reviewed PR. **F-18** (OpenAPI
contract validation) and **F-19** (DB↔API↔FE type consistency) are also READY,
with F-19 nominally gated on F-3 for the `artifacts/` tree only.
