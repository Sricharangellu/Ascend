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

## `route-guard-scan.mjs` — mutating routes with no authorization (gating)

```bash
npm run route:scan
```

Fails when a `router.post/put/patch/delete` registers no authorization
middleware between its path and its handler. Current tree: **314 mutating routes
across 49 route files, 76 unguarded, all allowlisted** in
`route-guard-allowlist.json`.

**This replaced a CI grep step that could never fail.** The old step ended
`! grep … || echo "All mutation routes have role guards ✓"` — the `!` inverts a
successful match into non-zero and `|| echo` swallows that into exit 0.
Reproduced 2026-08-06: it printed 39 matching lines *and* the ✓ *and* exited 0.
It had never once evaluated this codebase. Its detection was also wrong in both
directions: it excluded a line only if the literal `requireRole` appeared on it,
but 44 route files declare `const mgr = requireRole("manager")` and pass `mgr`,
so guarded routes read as violations; and `-A1` meant middleware on a later line
read as guarded.

A regex over line pairs cannot answer this. This script walks from
`router.<method>(` to the balanced closing paren (string- and comment-aware),
splits the top-level arguments, and treats everything between the path (first
argument) and the handler (last) as the middleware chain — resolving per-file
`const x = requireRole(...)` aliases and `router.use(...)` router-level guards.

**The allowlist is a debt register, not a mute button.** Every entry states why,
categorised `open-by-design:` / `in-handler:` / `GAP:` — the third being an
admission of real debt, each one a numbered finding in
`WORK/audits/AUDIT_2026-08-06T170650Z-erp-infrastructure-audit.md` §4. **Stale
entries fail**: a key that no longer matches an unguarded route is an error, so
the list cannot decay into things that were fixed years ago.

Gating policy for this and every other check here: **ADR-008.**

## `license-scan.mjs` — licence inventory over a CycloneDX SBOM (report-only)

```bash
npm sbom --sbom-format=cyclonedx > sbom.cdx.json
node tools/license-scan.mjs sbom.cdx.json
node tools/license-scan.mjs --fail-on copyleft,unknown sbom.cdx.json
```

Classifies every component into permissive / weak-copyleft / copyleft / other /
unknown. Run against the real tree 2026-08-06: **858 unique components, 851
permissive, 2 weak-copyleft (MPL-2.0), 0 copyleft, 2 with no declared licence.**

It deliberately encodes **no policy** — which licence families are acceptable is
a business decision, so it exits 0 unless `--fail-on` says otherwise. `unknown`
is not benign: an undeclared licence is legally "all rights reserved" until
proven otherwise. Runs in `.github/workflows/security.yml` alongside SBOM
generation.

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
