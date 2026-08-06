# ADR-008: Security checks gate on arrival only when the backlog is already zero

Date: 2026-08-06 · Status: Accepted
Owner: Claude Code session — ERP infrastructure audit

**Context:** Before this ADR the repo had no security scanning at all: no secret
scan, no SBOM, no licence inventory, no SAST. It did have a `guard` job full of
anti-pattern checks, and two of those had been silently inert since the day they
were written — the raw-SQL check aborted on its own malformed regex (fixed
2026-08-05), and the unguarded-mutation-route check ended in
`! grep … || echo "…✓"`, which laundered a successful match into exit 0. That
second one printed 39 real matches and a green ✓ in the same run and had
therefore never once evaluated this codebase.

Adding scanners to a repo that already carries findings creates the opposite
failure. `web` has 14 dependency advisories (1 critical, 9 high) whose fixes are
major-version migrations, not patches. A scanner switched on in gating mode
against that backlog fails every PR on arrival, and this repo's own history shows
what happens next: a check that blocks all work gets deleted or `|| true`'d, and
the `|| true` outlives the reason for it. That is precisely how the two inert
checks above came to exist.

So the question is not "should security checks gate" but "gate *when*", and it
needed a rule rather than a per-check judgement call.

**Decision:** A security check ships **gating** if and only if the codebase
already passes it at the moment it lands. Otherwise it ships **report-only**,
with the promotion condition written at the step — a named backlog item, not
"when we get to it".

Applied to what this audit added:

| Check | Mode | Why |
|---|---|---|
| Secret scan, working tree (`gitleaks`) | **Gates** | First full scan found 4 hits, all false positives, all justified in `.gitleaks.toml`. Zero real backlog, so it ships able to say no. Verified against planted AWS/Stripe/GitHub credentials before landing. |
| Secret scan, git history | Report-only | A hit means a credential was published and needs rotating — a decision, not a red build on an unrelated PR. Promote once history has been reviewed once. |
| Unguarded mutation routes (`route-guard-scan`) | **Gates** | Ships with the 76 currently-unguarded routes allowlisted and individually classified, so it is green today and fails on the 77th. |
| Dependency advisories | Report-only | 14 open in `web`; fixes are F-24/F-25 migrations. Promote to `--audit-level=high` when those land. |
| Licence inventory | Report-only | Which licence families are acceptable is a business decision. Promote once a policy exists. |
| SBOM | Artifact only | Evidence for security review, not a gate. |

The invariant every future caller can rely on: **a check in this repo either
fails on a real violation or is explicitly labelled report-only at the step
where it runs.** There is no third state. `|| true` and `|| echo` without that
label are prohibited, and a check that cannot fail is treated as a defect
regardless of what it prints.

Two mechanisms make an allowlist an asset rather than a mute button, and both
are required for any new allowlisted check:

1. **Every entry carries its reason**, categorised. `route-guard-allowlist.json`
   uses `open-by-design:` / `in-handler:` / `GAP:` — the third being an
   admission of debt, not a justification, and each one is a numbered finding in
   the audit that produced it.
2. **Stale entries fail.** An allowlist key that no longer matches a real
   violation is an error, not a no-op. Without this, an allowlist decays into a
   list of things that were fixed years ago and the check quietly stops covering
   anything.

**Alternatives considered:**

- *Gate everything immediately.* Honest, and it would fail every PR from the
  first run against 14 unfixable-today advisories. The predictable outcome is
  the check being disabled, which is strictly worse than report-only because it
  removes the visible reminder too.
- *Report-only for everything, promote later.* Simple and uniform, and it is
  what the repo did for `docker-build`, `e2e`, `duplicate-code-scan` and
  `dead-code-scan`. Rejected here because it wastes the one case that matters
  most: secret scanning found nothing real, so there was no reason to accept a
  toothless version of the check that most deserves teeth.
- *Suppress findings with inline ignore comments* rather than a central
  allowlist. Rejected — inline suppressions are invisible in aggregate. Nobody
  can answer "how much authorization debt do we have" by grepping for comments,
  and the 76-route count is exactly the number that needed to become visible.
- *Do nothing.* This is what "we have a `guard` job" felt like from the outside
  for months while two of its checks evaluated nothing.

**Consequences:**

- The count of allowlisted violations becomes the debt metric, and it is
  shrink-only by construction. `route-guard-allowlist.json` says 76 today; any
  future reader can see whether that number moved.
- A new unguarded mutating route now fails CI. That is a real behavioural change
  for contributors and the intended one.
- Report-only checks still cost CI minutes while proving nothing. Accepted
  deliberately: their output is the input to the migration work that promotes
  them, and the promotion condition is written down rather than remembered.
- Deferred: SAST (CodeQL or equivalent) and container image scanning. Both are
  recommended in the audit and neither is implemented here — CodeQL on a private
  repository requires GitHub Advanced Security, which is a licensing decision
  and therefore Sri's, not an agent's. **Evidence bar for revisiting:** adopt
  when GHAS is purchased, or when a non-GHAS scanner has been proven green
  against this codebase on a branch first — same bar every other check in this
  ADR had to clear.

**Supersedes:** none.

**Related Issues:** none.

**Related PRs:** none.
