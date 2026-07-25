# ADR-005: AI Assistant explains rule-based signals; it never is the source of truth

Date: 2026-07-25 · Status: Accepted

**Context:** Request for a conversational AI assistant over menu/inventory
decisions (reorder, low stock, expiry, best/slow sellers), with human
approval before any write. DESIGN_PRINCIPLES.md already bans AI as source of
truth ("the first recommendation system must be rule-based... AI may explain
deterministic recommendations later, but it must not invent business facts").
Full autonomous action-taking AI is E6 in ACPA_ROADMAP.md and depends on E4,
neither of which has started.
**Decision:** New `ai_assistant` module, scoped below E6: (1) rule-based
signal layer reuses/matches existing tested queries (`reorderAlerts()`'s
`inventory`/`stock_qty`/`reorder_pt` join for reorder/low-stock,
`inventory_lots` for expiry, `order_lines`/`orders` for best/slow sellers);
(2) an async job (`ai_assistant_answer` queue, per DESIGN_PRINCIPLES.md's
"AI processing is async by default") calls Anthropic to narrate that
signal in plain language — the model is given only the pre-computed JSON and
is instructed never to invent a fact not present in it; (3) any recommended
write (currently only `create_po`) is never executed by this module — it
delegates to inventory's existing, tested `POST
/pipeline/reorder-alerts/:id/create-po` endpoint via an internal HTTP call
carrying the caller's own auth, only after a `requireRole("manager")`-gated
human approval. The deterministic recommendation is created and independently
visible in the Recommendations list regardless of whether LLM narration
succeeds — if `ANTHROPIC_API_KEY` is absent, the conversation fails openly
with a clear error instead of fabricating pseudo-AI text.
**Consequences:** No new "knowledge article"/RAG system — citations are the
rule/table the query came from, in the `reason` field. Module boundary
respected: `ai_assistant` never imports purchasing/inventory service code,
only reads shared tables and calls one already-permission-checked HTTP
endpoint. Gated via the existing business-pack module system
(`ai_assistant` added to the `restaurant` bundle in `moduleRegistry.ts`),
fail-closed like all `requireModule` checks. This is a scoped precursor to
E6, not E6 itself — full roadmap-scale AI (proactive suggestions, broader
domain coverage, RAG over a real knowledge base) remains gated behind E4.
