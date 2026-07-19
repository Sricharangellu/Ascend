# Ascend — Delivery Pipeline & Full-Stack Connectivity Status

Last verified: 2026-07-19 (session G). Re-run the checks below after any deploy.

## The full-stack chain

```text
Browser
  → finder-pos-frontend.vercel.app        (Next.js, NEXT_PUBLIC_MOCK must be "false")
  → next.config.mjs rewrites /api/*       (server-side proxy, no CORS)
  → finder-pos-backend.vercel.app         (Express, api/index)
  → Supabase Postgres                     (RLS backstop)
```

## Connectivity status by link (2026-07-19)

| Link | Status | Evidence |
|---|---|---|
| FE code → BE code | ✅ CLEAN | `npm run gap:scan`: 444 backend / 373 frontend paths, 21 allowlisted (all board-tracked Preview/NEEDS-SRI) |
| BE code → DB schema | ✅ CLEAN | `npm run table:scan`: 157 tables, no collisions; typecheck 0 errors; 601/601 tests (iter 17) + waves 18–20 |
| Backend prod → DB | ✅ LIVE | `GET finder-pos-backend.vercel.app/readyz` → `{"status":"ok","db":"connected"}`, 51 modules mounted |
| **Local → GitHub** | ❌ **GAP 1** | `feat/delivery-pipeline` is **32 commits ahead of origin** — includes all 8 Phase-0 production bug fixes. PR #70 on GitHub is stale. |
| **PR #70 → master** | ❌ **GAP 2** | Unmerged. Prod backend still runs PR #66 code (2026-07-16) — **prod today still has the bugs fixed locally**: customer-invoice creation with lines 500s, quotes module 100% non-functional (table collision), store_location product writes 500, workforce clockIn orphans time entries. |
| **Frontend prod** | ❌ **GAP 3** | `finder-pos-frontend.vercel.app` returns an empty body on `/`, `/healthz`, `/readyz` — deployment is broken, protected, or absent. Also unverified: Vercel env must set `NEXT_PUBLIC_MOCK=false` and `BACKEND_URL=https://finder-pos-backend.vercel.app` (mock mode defaults ON per next.config.mjs). |
| **web build proof** | ⚠️ GAP 4 | `npm --prefix web run build` never confirmed in the Cowork sandbox (architectural limit — see AUDIT_2026-07-19T062148Z §2a). Vercel build of PR #70 doubles as this proof. |

Everything code-addressable is done and verified. All four gaps are
push/merge/deploy operations — they need your machine or a browser.

## The pipeline (run in order)

### Step 1 — Commit boards + push (your terminal, 30 seconds)

```bash
cd /Users/sri/Desktop/Prj/Ascend
rm -f .git/index.lock   # stale lock from a crashed git process; sandbox can't remove it
git add WORK/PIPELINE.md WORK/LOOP_STATE.md
git commit -m "docs(work): full-stack connectivity audit — delivery-tail gaps + Chrome verification pipeline"
git push origin feat/delivery-pipeline
```

(The Cowork sandbox has no GitHub credentials and can't clear the lock — this must run on your machine.)

### Step 2 — Merge PR #70 (Claude in Chrome — Prompt A below)

### Step 3 — Verify backend deploy (Claude in Chrome — Prompt B)

### Step 4 — Fix/verify frontend deploy + env (Claude in Chrome — Prompt C)

### Step 5 — End-to-end smoke in the real browser (Claude in Chrome — Prompt D)

### Step 6 — Report back here

Paste Chrome's findings into a Cowork session; the loop updates
`WORK/LOOP_STATE.md` and closes Phase 0's last exit criterion.

## Claude-in-Chrome prompts (copy-paste one at a time)

### Prompt A — merge PR #70

> Open https://github.com/Sricharangellu/Ascend/pull/70. Confirm the branch
> feat/delivery-pipeline shows the latest commit 6caa4fc ("docs(work): close
> Phase 0 test-coverage continuation") — if it doesn't, stop and tell me the
> head commit you see, because my push didn't land. Check the CI status on the
> PR. If all checks are green, merge it (regular merge, not squash). If any
> check is red, do NOT merge — open the failing job's log and paste me the
> first real error line.

### Prompt B — verify backend deploy

> Open the Vercel dashboard, project finder-pos-backend. Confirm a new
> production deployment triggered from the master merge and finished
> successfully. Then open https://finder-pos-backend.vercel.app/readyz in a
> tab and confirm the JSON shows "status":"ok" and "db":"connected". Tell me
> the deployment's commit SHA so I can confirm it matches master.

### Prompt C — fix the frontend deployment

> Open the Vercel dashboard, project finder-pos-frontend. Three things:
> 1. Check the latest production deployment status. If the last build failed,
>    open the build log and paste me the first error.
> 2. Go to Settings → Environment Variables (Production) and confirm:
>    NEXT_PUBLIC_MOCK = false, and BACKEND_URL = https://finder-pos-backend.vercel.app.
>    Add or fix any that are missing/wrong, then redeploy.
> 3. Go to Settings → Deployment Protection. If protection is enabled on
>    production, tell me — that explains why the site returns empty responses.
> When done, open https://finder-pos-frontend.vercel.app/readyz — it must
> return the backend's JSON with "db":"connected" (that proves the /api proxy
> rewrite works end to end).

### Prompt D — real-browser end-to-end smoke

> Open https://finder-pos-frontend.vercel.app. Open DevTools-level checks as
> you go (use your network/console reading tools). Then:
> 1. Log in with the demo credentials I give you when you ask.
> 2. Confirm network requests go to /api/v1/* and return 200s — NOT intercepted
>    by MSW (no "[MSW]" console messages; responses must come from the network).
> 3. Catalog: open Products, confirm a real list loads.
> 4. Create a customer invoice WITH at least one line item and confirm it
>    saves (this was the invoice-creation 500 bug — it must work now).
> 5. Quotes: create a quotation and confirm it saves (this module was 100%
>    broken before PR #70).
> 6. Workforce: clock in with a valid employee, confirm it appears in the
>    time-entries list.
> Report each step pass/fail with the failing request's URL + status if any.

## Standing guardrails (unchanged)

- `npm run verify` is the local gate; `gap:scan` + `table:scan` fail CI on drift.
- Never mark a module done without gap:scan clean (WORK/README.md rule).
- NEEDS-SRI list in WORK/LOOP_STATE.md: product decisions, not code — untouched by this pipeline.
