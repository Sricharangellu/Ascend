# ADR-013: `master` is the operations runtime, not just production's code

Date: 2026-08-10 · Status: Accepted
Owner: Claude Code session — infrastructure & environment integration audit (PR #208)

**Context:** GitHub runs `schedule:` workflows from the **default branch only**,
never from the branch a change was merged to. This repo's default branch is
`master`, and on 2026-08-08 `master` was **245 commits behind `staging`**.

The consequence had gone unstated in every document, and it is not small: three
weeks of ops hardening merged to `develop` was **inert**, because the runs that
matter execute `master`'s copies of those files.

- `uptime.yml`'s repo-variable indirection (ADR-011, PRs #191/#197/#201) — the
  15-minute heartbeat still ran `master`'s hardcoded `curl` form. Proven, not
  inferred: scheduled run `31270958830` logged the hardcoded step text while a
  `workflow_dispatch` of the same workflow on `develop` (`31272326653`) logged
  the `"$BACKEND/healthz"` form. Same workflow name, two different files.
- `backup.yml`'s "green lie" fix — `master` still had the version that exits 0
  silently, so the daily job kept reporting success while taking no backup.
- `security.yml` **does not exist on `master` at all**, so its weekly CodeQL /
  gitleaks / SBOM re-scan has never run and cannot.

Two further mechanisms compound it. **Render deploys the production backend from
`master`**, so the same staleness applies to the running backend, not only to
workflows. And a required status check on `master` had been renamed without
updating branch protection (PR #209), which made the merge button structurally
dead — so the branch could not be un-stalled even deliberately.

What triggered this ADR now: a session had just spent effort improving
`uptime.yml` on `develop` believing it was fixing the live heartbeat. It was
not, and nothing in the repo would have told them.

**Decision:** Treat `master` as a **runtime**, not an archive.

The invariant: **a change to a `schedule:`-triggered workflow, or to anything
Render deploys, is not "done" when it merges to `develop` — it is done when it
reaches `master`.** Until then it is written but not running, and must be
described that way.

Three obligations follow:

1. **Any PR touching a scheduled workflow says so in its own text.** State
   plainly that the change is inert until released. `uptime.yml` and
   `backup.yml` carry a header comment to that effect; keep it accurate rather
   than deleting it when the branch catches up.
2. **`master` has a drift budget.** Release at least weekly, or record why not.
   245 commits is not a backlog, it is a disabled operations layer.
3. **A "fix" to monitoring or backup is reported as pending until a scheduled
   run from `master` demonstrates it.** The evidence is a green run, not a
   merged diff — the same bar ADR-011 sets for probe URLs.

**Alternatives considered:**

- *Move the schedules onto a branch that moves faster.* Not possible: GitHub
  offers no branch selector for `schedule:`. It is the default branch or
  nothing.
- *Make `develop` the default branch.* This genuinely would make the schedules
  track the fast-moving branch, and was the most tempting option. Rejected
  because it inverts the meaning of every probe: the heartbeat exists to test
  **production**, and running it from `develop` would monitor production using
  whatever unreleased configuration `develop` happens to carry, which is a
  different and worse kind of lie. It would also silently redirect
  `backup.yml` — a job that touches the production database — to unreviewed
  code. Changing the default branch is additionally a Sri-only setting with
  blast radius across PR bases and clone defaults.
- *Duplicate the scheduled workflows onto `master` only.* Two copies of the
  same file diverging is the exact failure this repo names as its dominant
  defect class, and it is what happened to the two error handlers consolidated
  in this same PR.
- *Do nothing — it is obvious once you know.* It demonstrably is not: three
  separate sessions improved `uptime.yml` without it being mentioned anywhere,
  and one of them recorded "verified fixed" for a heartbeat that had not
  changed.

**Consequences:**

- Anyone reading a scheduled workflow now learns, at the top of the file,
  that editing it on `develop` changes nothing until a release. That is the
  cheapest possible place for that warning to live.
- Release cadence becomes an operational property with a stated budget, not a
  matter of taste. This is a real constraint on how long work may sit on
  `develop`, and it is meant to be.
- It does **not** decide how `master` gets unblocked when a required check is
  misconfigured — that is a branch-protection setting only Sri can change (see
  `PIPELINE.md`'s warning box and this audit's §17 item 0). This ADR says the
  drift matters; repairing the specific block is an action, not a policy.
- Deliberately deferred: automating a check that `master` is not more than N
  commits behind. Nothing in this repo can read branch protection or act on it,
  and a nagging check that cannot fix what it reports is the "check that always
  fails" anti-pattern ADR-010 exists to prevent. Revisit when a release can
  actually be performed on demand — that is the evidence bar.

**Supersedes:** none. Extends ADR-011, which established that deploy and probe
targets are repo variables; this adds the branch the variable is *read on*.

**Related Issues:** none.

**Related PRs:** #191, #197, #201, #206, #208, #209.
