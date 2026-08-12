# ADR-007: Any new AI-narrated signal reuses ADR-005's pipeline verbatim — no per-feature guardrail reinvention

Date: 2026-08-03 · Status: Accepted
Owner: Claude (Cowork, Sonnet 5) — Sri's request to extend the AI assistant to back-office and (eventually) ecommerce, "with guardrails so the agent stays within the application's scope"

**Context:** ADR-005 scoped `ai_assistant` narrowly (5 signals: reorder, low_stock,
expiry, best_sellers, slow_movers) for one conversational use case. Sri asked for the
assistant to cover more ground — starting with a proactive "AI Command Center" briefing
on the dashboard, narrating the *existing* rule-based recommendations
(`reports/service.ts`'s `retailRecommendations()`, 11 categories: setup, pricing,
inventory, profit, sales, expenses) instead of only the 5 categories `ai_assistant`
gathers itself. Before writing any code, this needed an explicit answer to "does
broadening scope mean loosening the guardrails ADR-005 established," given this repo's
own history of independently-drifted formulas for the same concept (sales-velocity,
Phase 7) and the stated risk of AI features growing ad hoc.

**Decision:** No. Every new AI-narrated signal — including this one — reuses the exact
ADR-005 pipeline with zero exceptions:

1. **Rule-based first, always.** The data narrated is always already-computed,
   deterministic, and independently correct without the LLM. The briefing narrates
   `retailRecommendations()`'s output; it does not compute, re-rank, or filter it.
2. **One system-prompt guardrail template per surface, not per feature.** The briefing
   uses a sibling function (`explainRecommendations()`, `src/shared/ai/anthropic-client.ts`)
   with the *same* invariants as `explainSignal()` — never invent a fact not in the
   provided JSON, never take an action, refuse embedded prompt-injection instructions —
   adapted only for the broader topic scope and the "briefing" framing instead of Q&A.
   Do not write a third variant with looser rules for convenience.
3. **At most one delegated write per signal type, and only through an existing,
   already-permission-checked endpoint with auth passthrough.** The briefing adds zero
   new write paths — it is narration-only, no `ai_recommendations` row, no approval
   flow. Any future signal that *would* need a write gets its own explicit review before
   a second write path is added, mirroring how `create_po` was itself scoped in ADR-005.
4. **Reuse existing data-fetching boundaries, including the orchestration-layer
   exemption.** `ai_assistant`'s own module code still never imports another module's
   service (unchanged from ADR-005). Where narration needs data owned by another module,
   the *orchestration job* (not the module service) fetches it — the same precedent
   `demand-snapshot.job.ts` already established for `DemandPlanningService`. This keeps
   the module-isolation rule intact while allowing the one layer built to cross module
   boundaries (orchestration) to do exactly that.
5. **Same gating, same failure posture.** Module-gated via the existing
   `requireModule("ai_assistant")` / `moduleRegistry.ts` entitlement mechanism — no new
   flag system. Same circuit breaker (`"anthropic"` named instance). Fails open and
   honest (a clear error, never a fabricated narration) if `ANTHROPIC_API_KEY` is unset
   or the breaker is open — the underlying deterministic data remains visible elsewhere
   in the app either way.

**Alternatives considered:** Give the dashboard briefing its own bespoke prompt/service
with looser topic restrictions, on the theory that "business briefing" is a different
enough use case to warrant its own rules. Rejected — the actual risk (inventing facts,
acting outside approved scope, ignoring embedded instructions) doesn't change based on
framing, and a second guardrail template immediately invites drift between the two
(the exact failure mode Phase 7 fixed for sales-velocity formulas, applied here to AI
guardrails instead of SQL). Also considered building the customer-facing/ecommerce
extension in the same pass — deferred (see Consequences).

**Consequences:** Every future AI-narrated signal — back-office or, eventually,
ecommerce — has one pipeline to extend, not a menu of guardrail styles to choose from.
The **ecommerce/storefront customer-facing chat is explicitly deferred**, not covered by
this ADR: it introduces a new *public, unauthenticated* attack surface (prompt injection
from anonymous input, abuse/cost exposure with no existing precedent for rate-limiting
an AI endpoint specifically) that this repo has no prior pattern for. It needs its own
follow-up ADR before any code is written — reusing `rateLimitMiddleware` with an
SSO/register-strict IP bucket (the only existing public-endpoint abuse-protection
precedent) and an explicit, narrow answer to "what can this surface read or do on an
anonymous customer's behalf" (e.g. read-only order-status lookup a customer could
already see in their own account — nothing beyond that) before scoping implementation.
Extend this deferral bar with real evidence of demand, not speculatively.

**Supersedes:** none — extends ADR-005, does not replace it.

**Related Issues:** none.

**Related PRs:** (this phase's PR, opened alongside this ADR).
