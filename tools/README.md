# tools/ — repo-hygiene & collision-prevention

Small, dependency-free tools that make the "no duplicate files / no colliding
sessions" rules *structural* instead of relying on vigilance. Background: multiple
AI sessions sharing one working tree and pushing directly to `master` have
repeatedly produced duplicate files and duplicate *work* (two sessions building the
same endpoint). These tools address the mechanical causes.

## `hygiene-check.mjs` — fail-fast on duplicate/junk files

```bash
node tools/hygiene-check.mjs
```

Exits non-zero if the tree contains a numeric copy file (`AGENTS 2.md`), a
`*.collision-backup.md`, a merge leftover (`*.orig` / `*.rej`), or more than one
`AGENTS.md`. Run it locally before committing.

**Wire into CI** (owner of `.github/workflows/ci.yml`, add one step to the guard job):

```yaml
      - name: Repo hygiene
        run: node tools/hygiene-check.mjs
```

**Optional pre-commit hook** (`.git/hooks/pre-commit`, `chmod +x`):

```bash
#!/usr/bin/env bash
node tools/hygiene-check.mjs || exit 1
```

## `prevention-agent.mjs` — fail-fast on dirty drift

```bash
npm run prevent:drift
```

This stricter guard blocks the local patterns that create unrelated dirty code:

- tracked edits/deletions left in the working tree;
- generated design-sync folders such as `.design-sync/`, `.ds-sync/`, `ds-bundle/`;
- untracked source modules under `src/modules/`;
- obsolete duplicate planning/instruction files such as `CLAUDE.md`, `WORK/RULES.md`,
  `WORK/WORK_STATE.md`, `web/PROJECT_PLAN.md`, and `web/WORK_STATE.md`;
- numeric copy files such as `Report 2.md`.

Run this before opening a PR or handing off a session. CI also runs it in the guard job.

## `route-authz-scan.mjs` — every mutating route must carry an authz guard

```bash
npm run authz:scan
```

Fails if any `PUT`/`PATCH`/`DELETE` route in `src/` reaches its handler with no
`requireRole` / `requirePermission` / `requireScope` / `requireCapability` /
`requireModule` in front of it. A guard counts whether it is applied inline,
through a `const mgr = requireRole("manager")` alias declared in the same file,
or through an earlier `router.use(...)`.

Replaces a CI grep step that was inert twice over: it ended in `|| echo "…✓"`,
so it exited 0 on every run it ever made, and it only matched the literal text
`requireRole` on the route's own line — which meant the 20+ files using the
hoisted-alias convention all read as unguarded. Repaired as written it reported
39 findings, ~35 of them false. This scanner reports **4**, all real, and one
(`quotes DELETE /:id` — a hard delete of a commercial document by any cashier,
with no soft-delete column and no audit entry) was fixed rather than
allowlisted. Full reasoning in `docs/architecture/ADR/ADR-008`.

`POST` is deliberately out of scope: in a POS it is the ordinary cashier action
(ring a sale, take payment, open a tab), so gating it would be wrong for the
product. The allowlist is **shrink-only** — an entry means "reviewed, and
cashier-level access is correct here", and carries the reason. Never add one to
make CI green.

## `duplicate-code-scan.mjs` — copy-paste detector (report-only)

```bash
npm run dupe:scan              # summary + top 10 groups
npm run dupe:scan -- --verbose # every file in every group
npm run dupe:scan -- --max 12  # exit 1 if groups exceed 12
```

Finds two things the other scanners structurally cannot: files that are
identical after comments and whitespace are stripped, and blocks of ≥25
identical lines shared across files. Everything else in this directory looks
for something **missing** (`api-gap-scan`) or **colliding** (`table-collision-scan`,
`hygiene-check`) — duplication is neither, which is how 48 copies of
`test-request.ts` and a second `apiFetch` beside the canonical one both survived
a full green pipeline until a human read the code.

**Exits 0 by default, on purpose.** A new detector over a 2,195-file repo
reports a backlog, and gating merges on it before that backlog is burned down
blocks all work — at which point the check gets deleted rather than fixed. Same
staged rollout `docker-build` and `e2e` got. Add `--max <n>` to the CI step once
the number is small and stable.

Scope is `src/` + `web/`, matching `api-gap-scan`. `artifacts/` is excluded: it
is a known ~1,000-file duplicate of the whole app (audit finding H-1 / backlog
F-3), and including it would bury every actionable finding under one already-
tracked one. Re-scope when F-3 is resolved.

## `dead-code-scan.mjs` — unreferenced exports (report-only)

```bash
npm run dead:scan               # summary, split by value vs type
npm run dead:scan -- --verbose  # every file
npm run dead:scan -- --max 40   # exit 1 above N *value* exports
```

Reports exports whose name appears nowhere outside the file declaring them.
Results split into **value** exports (functions/classes/consts — the actionable
list) and **type-only** exports (over-exposed surface, low priority), because a
single undifferentiated number buries the ~95 that matter under ~276 that
mostly do not.

**The method can only under-report.** It is a word-boundary text match, not an
import graph, so anything mentioned anywhere — a real import, a re-export, a
dynamic `import()`, a string in a test — counts as live. That bias is chosen
deliberately: this feeds *deletion* decisions, and proposing the removal of
live code is the one outcome that must never happen. A clean run therefore does
not mean "no dead code", only "none this method can prove".

**Most hits are over-exported, not dead.** Verified examples: `CREATE_USERS_TABLE`
in `src/identity/migrations.ts` is used at line 493 of its own file;
`withStripeBreaker` is used only inside `stripe.ts`. Both are correctly
"referenced nowhere else" — and neither should be deleted. Treat every hit as a
candidate to investigate, and check dynamic imports, string-keyed registries and
framework conventions before touching anything.

Next.js App Router files (`page`/`layout`/`route`/…), `middleware.ts` and
`src/server.ts` are excluded — the framework calls them, so nothing imports them.

## `new-worktree.sh` — one isolated checkout per session

```bash
tools/new-worktree.sh expenses-mvp              # -> ../ascend-wt-expenses-mvp, branch wt/expenses-mvp
tools/new-worktree.sh fix/expenses-cents        # a slug with a type prefix becomes the branch as-is
tools/new-worktree.sh hotfix/readyz-500 master  # the one sanctioned master base; warns
```

Creates `../ascend-wt-<slug>` on a fresh branch off `origin/develop`. The base is
`develop` by design — promotion is forward-only (`feature/* → develop → staging →
master`) and `master` is a release target, not a starting point. Pass a second
argument only for a real hotfix.

Use this (or run sessions one at a time) so parallel work does not share the primary
tree — the single biggest source of the collisions. **Never make a second clone**; a
worktree shares one object store, a clone diverges.

## PR protection on `master` — already on

No session pushes to `master` directly. Branch protection requires the CI checks and is
**admin-enforced** — there is no bypass, including for repo admins — and no workflow
auto-merges anything, so a human clicks merge every time. The authoritative description
of what is enforced, and the config registry behind it, live in
`docs/architecture/PIPELINE.md`; the check names themselves are the `name:` fields in
`.github/workflows/ci.yml`. Read them there rather than copying the list here — a copy
made on 2026-08-05 was stale within a day, when the frontend job gained a `test` step
and became `Frontend — typecheck + lint + test + build`.

Every session therefore follows: branch off `develop` → PR into `develop` → green CI
→ Sri merges. See `AGENTS.md` "Git: where and how" and `tools/AGENT_PROMPT.md`.
