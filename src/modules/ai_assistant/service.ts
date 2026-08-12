import { v7 as uuidv7 } from "uuid";
import type { DB } from "../../shared/db.js";
import type { EventBus } from "../../shared/events.js";
import { HttpError } from "../../shared/http.js";
import { writeAudit } from "../../shared/audit.js";
import { moduleLogger } from "../../shared/logger.js";
import { explainSignal, explainRecommendations, isAnthropicConfigured } from "../../shared/ai/anthropic-client.js";

const log = moduleLogger("ai-assistant");

export type Intent = "reorder" | "low_stock" | "expiry" | "best_sellers" | "slow_movers" | "briefing" | "unknown";

/**
 * A conversation created with this exact question text is the dashboard's
 * daily-briefing request, not a user-typed question — matchIntent() maps it
 * deterministically to "briefing" (never produced by keyword matching, only
 * ever set by createBriefing() below). Exported so the orchestration job can
 * recognize it without importing this module's private gathering logic.
 */
export const BRIEFING_SENTINEL = "__DAILY_BRIEFING__";

export interface Conversation {
  id: string;
  tenantId: string;
  userId: string;
  question: string;
  answer: string | null;
  status: "pending" | "complete" | "failed";
  error: string | null;
  createdAt: number;
  completedAt: number | null;
}

export interface Recommendation {
  id: string;
  tenantId: string;
  conversationId: string;
  recommendation: string;
  reason: string;
  dataUsed: Record<string, unknown>;
  confidenceScore: number;
  requiredApprovalLevel: "manager" | "owner" | "none";
  sourceType: Intent;
  sourceRef: string | null;
  actionType: "create_po" | "none";
  actionPayload: Record<string, unknown> | null;
  status: "pending" | "approved" | "rejected";
  createdAt: number;
  decidedAt: number | null;
  decidedBy: string | null;
}

interface Signal {
  found: boolean;
  data: Record<string, unknown>;
  recommendation: string;
  reason: string;
  confidence: number;
  approvalLevel: "manager" | "owner" | "none";
  sourceRef: string | null;
  actionType: "create_po" | "none";
  actionPayload: Record<string, unknown> | null;
}

// ── Priority-ordered keyword intent classifier. Deterministic and testable —
// see AGENTS.md: "the first recommendation system must be rule-based." This
// mirrors the same has()-array pattern already proven out in the EcoBrew
// residency prototype, applied here to Ascend's real data instead of a
// simulated one.
function has(msg: string, ...words: string[]): boolean {
  return words.some((w) => msg.includes(w));
}

export function matchIntent(question: string): Intent {
  if (question === BRIEFING_SENTINEL) return "briefing";
  const q = question.toLowerCase();
  if (has(q, "reorder", "re-order", "order more", "should i order", "running low", "running out")) return "reorder";
  if (has(q, "low stock", "low on stock", "out of stock", "stock level")) return "low_stock";
  if (has(q, "expir", "going bad", "spoil", "use by", "best by")) return "expiry";
  if (has(q, "best sell", "top sell", "popular", "best-selling", "what sells")) return "best_sellers";
  if (has(q, "slow", "not selling", "no sales", "worst sell", "dead stock", "overstock")) return "slow_movers";
  return "unknown";
}

/** Extracts a product name fragment to narrow the search, e.g. "coffee beans"
 *  from "Should I reorder coffee beans?" — best-effort substring match against
 *  the tenant's own product names, never invented. */
function extractProductHint(question: string): string | null {
  const q = question.toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim();
  const stopwords = new Set([
    "should", "i", "reorder", "re", "order", "more", "the", "a", "an", "is", "are", "we", "running",
    "low", "out", "of", "stock", "on", "what", "are", "our", "any", "do", "have", "need", "to",
    // Intent-trigger vocabulary from matchIntent() — these describe the
    // question type, not a product name, and must not leak into the ILIKE
    // filter (e.g. "what is expiring soon" must not require a product named
    // literally "expiring soon").
    "expir", "expiring", "expires", "expired", "going", "bad", "spoil", "spoiling",
    "spoiled", "soon", "use", "by", "best", "sell", "sells", "selling", "sold",
    "top", "popular", "slow", "not", "no", "sales", "worst", "dead", "overstock",
  ]);
  const words = q.split(/\s+/).filter((w) => w.length > 2 && !stopwords.has(w));
  return words.length ? words.join(" ") : null;
}

export class AiAssistantService {
  constructor(
    private readonly db: DB,
    private readonly events: EventBus,
  ) {
    void this.events; // reserved for future cross-module event emission
  }

  // ── Conversations ──────────────────────────────────────────────────────

  async createConversation(tenantId: string, userId: string, question: string): Promise<Conversation> {
    const trimmed = question.trim().slice(0, 2000);
    if (!trimmed) throw new HttpError(400, "invalid_question", "Question cannot be empty.");
    const row = {
      id: `aiconv_${uuidv7()}`,
      tenant_id: tenantId,
      user_id: userId,
      question: trimmed,
      answer: null,
      status: "pending",
      error: null,
      created_at: Date.now(),
      completed_at: null,
    };
    await this.db.query(
      `INSERT INTO ai_conversations (id, tenant_id, user_id, question, answer, status, error, created_at, completed_at)
       VALUES (@id, @tenant_id, @user_id, @question, @answer, @status, @error, @created_at, @completed_at)`,
      row,
    );
    return toConversation(row);
  }

  /**
   * The dashboard's "AI Command Center" briefing is a conversation like any
   * other — same table, same status/polling lifecycle, same narration
   * pipeline — just with the sentinel question instead of user-typed text.
   * No new table, no new queue: reuses everything the Q&A flow already has.
   */
  async createBriefing(tenantId: string, userId: string): Promise<Conversation> {
    return this.createConversation(tenantId, userId, BRIEFING_SENTINEL);
  }

  async getConversation(tenantId: string, id: string): Promise<Conversation | null> {
    const rows = await this.db.query<ConversationRow>(
      `SELECT * FROM ai_conversations WHERE tenant_id = @tenantId AND id = @id`,
      { tenantId, id },
    );
    return rows[0] ? toConversation(rows[0]) : null;
  }

  async listConversations(tenantId: string, limit = 25): Promise<Conversation[]> {
    const rows = await this.db.query<ConversationRow>(
      `SELECT * FROM ai_conversations WHERE tenant_id = @tenantId ORDER BY created_at DESC LIMIT @limit`,
      { tenantId, limit: Math.min(Math.max(limit, 1), 100) },
    );
    return rows.map(toConversation);
  }

  // ── The actual signal-gathering + explanation pipeline. Called from the
  //    async job handler (src/orchestration/index.ts), never synchronously
  //    from the HTTP request per DESIGN_PRINCIPLES.md's async-by-default rule.

  async processQuestion(
    tenantId: string,
    conversationId: string,
    /**
     * Briefing-only: the recommendations report, pre-fetched by the
     * orchestration job. ai_assistant's own service must not import
     * reports/service.ts directly (modules never import each other's code) —
     * the orchestration layer is exempt from that rule (same precedent as
     * demand-snapshot.job.ts importing DemandPlanningService directly), so
     * the job fetches it there and hands it to this method. Ignored for
     * every non-briefing intent.
     */
    prefetchedRecommendations?: { data: Record<string, unknown>; found: boolean },
  ): Promise<void> {
    const convRows = await this.db.query<ConversationRow>(
      `SELECT * FROM ai_conversations WHERE tenant_id = @tenantId AND id = @id`,
      { tenantId, id: conversationId },
    );
    const conv = convRows[0];
    if (!conv) return;

    try {
      const intent = matchIntent(conv.question);
      const signal: Signal =
        intent === "briefing" && prefetchedRecommendations
          ? {
              found: prefetchedRecommendations.found,
              data: prefetchedRecommendations.data,
              recommendation: "",
              reason: "",
              confidence: prefetchedRecommendations.found ? 90 : 0,
              approvalLevel: "none",
              sourceRef: null,
              actionType: "none",
              actionPayload: null,
            }
          : await this.gatherSignal(tenantId, intent, conv.question);

      // The deterministic recommendation is created regardless of whether the
      // LLM narration succeeds — a manager can act on it from the
      // Recommendations list even if chat narration is degraded or
      // unconfigured. Narration and recommendation creation are deliberately
      // independent, not one faked as a substitute for the other.
      //
      // Briefing is the one exception: it summarizes many existing report
      // items at once, not a single actionable one, so there is no sensible
      // ai_recommendations row to create (no single sourceRef, no single
      // action) — each underlying item already has its own action/href in
      // the dashboard's own recommendations list. Only narration applies.
      let recommendationId: string | null = null;
      if (signal.found && intent !== "briefing") {
        recommendationId = `airec_${uuidv7()}`;
        await this.db.query(
          `INSERT INTO ai_recommendations
             (id, tenant_id, conversation_id, recommendation, reason, data_used, confidence_score,
              required_approval_level, source_type, source_ref, action_type, action_payload, status, created_at)
           VALUES
             (@id, @tenant_id, @conversation_id, @recommendation, @reason, @data_used, @confidence_score,
              @required_approval_level, @source_type, @source_ref, @action_type, @action_payload, 'pending', @created_at)`,
          {
            id: recommendationId,
            tenant_id: tenantId,
            conversation_id: conversationId,
            recommendation: signal.recommendation,
            reason: signal.reason,
            data_used: JSON.stringify(signal.data),
            confidence_score: signal.confidence,
            required_approval_level: signal.approvalLevel,
            source_type: intent,
            source_ref: signal.sourceRef,
            action_type: signal.actionType,
            action_payload: signal.actionPayload ? JSON.stringify(signal.actionPayload) : null,
            created_at: Date.now(),
          },
        );
      }

      // Narration is a separate, best-effort step from this point on — a
      // recommendation created above already stands on its own regardless of
      // whether this succeeds.
      if (!isAnthropicConfigured()) {
        await this.db.query(
          `UPDATE ai_conversations SET status = 'failed', error = @error, completed_at = @now WHERE tenant_id = @tenantId AND id = @id`,
          { error: "ANTHROPIC_API_KEY is not configured — AI narration is unavailable.", now: Date.now(), tenantId, id: conversationId },
        );
        return;
      }

      const answer =
        intent === "briefing"
          ? await explainRecommendations({
              recommendationsJson: JSON.stringify(signal.data),
              hasRecommendations: signal.found,
            })
          : await explainSignal({
              userQuestion: conv.question,
              signalJson: JSON.stringify(signal.data),
              signalFound: signal.found,
            });

      await this.db.query(
        `UPDATE ai_conversations SET answer = @answer, status = 'complete', completed_at = @now WHERE tenant_id = @tenantId AND id = @id`,
        { answer, now: Date.now(), tenantId, id: conversationId },
      );
      await writeAudit(this.db, {
        tenantId,
        actorId: conv.user_id,
        action: "ai_assistant.question_answered",
        entityType: "ai_conversation",
        entityId: conversationId,
        after: { intent, signalFound: signal.found, recommendationId },
      });
    } catch (err) {
      log.error({ err, tenantId, conversationId }, "ai_assistant: failed to process question");
      await this.db.query(
        `UPDATE ai_conversations SET status = 'failed', error = @error, completed_at = @now WHERE tenant_id = @tenantId AND id = @id`,
        { error: err instanceof Error ? err.message : "unknown error", now: Date.now(), tenantId, id: conversationId },
      );
    }
  }

  // ── Rule-based signal gathering — reads shared tables directly (reports/
  //    insights precedent), never imports another module's service code.

  private async gatherSignal(tenantId: string, intent: Intent, question: string): Promise<Signal> {
    const hint = extractProductHint(question);
    switch (intent) {
      case "reorder":
      case "low_stock":
        return this.gatherReorderSignal(tenantId, hint);
      case "expiry":
        return this.gatherExpirySignal(tenantId, hint);
      case "best_sellers":
        return this.gatherBestSellersSignal(tenantId);
      case "slow_movers":
        return this.gatherSlowMoversSignal(tenantId);
      default:
        return { found: false, data: {}, recommendation: "", reason: "", confidence: 0, approvalLevel: "none", sourceRef: null, actionType: "none", actionPayload: null };
    }
  }

  // NOTE: joins the legacy flat `inventory` table (stock_qty/reorder_pt),
  // matching inventory/pipeline-views.ts::reorderAlerts() exactly — that is
  // the table Ascend's existing, tested reorder-alert/create-PO flow actually
  // reads and writes today (see db/README.md + PRODUCT_MODULE_REVIEW.md on
  // the two coexisting inventory schemas). Using inventory_stock here would
  // silently disagree with the endpoint this module delegates PO-creation to.
  private async gatherReorderSignal(tenantId: string, hint: string | null): Promise<Signal> {
    const rows = await this.db.query<{
      product_id: string; name: string; sku: string; on_hand: number; reorder_level: number;
    }>(
      `SELECT i.product_id, p.name, p.sku,
              COALESCE(i.stock_qty, 0)::int AS on_hand,
              i.reorder_pt::int AS reorder_level
         FROM inventory i
         JOIN products p ON p.id = i.product_id AND p.tenant_id = i.tenant_id
        WHERE i.tenant_id = @tenantId
          AND i.reorder_pt > 0 AND COALESCE(i.stock_qty, 0) <= i.reorder_pt
          AND (@hint::text IS NULL OR p.name ILIKE '%' || @hint || '%' OR p.sku ILIKE '%' || @hint || '%')
        ORDER BY (COALESCE(i.stock_qty, 0)::float / GREATEST(i.reorder_pt, 1)) ASC
        LIMIT 5`,
      { tenantId, hint },
    );
    if (!rows.length) {
      return { found: false, data: { checked: "reorder alerts", hint }, recommendation: "", reason: "", confidence: 0, approvalLevel: "none", sourceRef: null, actionType: "none", actionPayload: null };
    }
    const top = rows[0]!;
    const suggestedQty = top.reorder_level; // matches reorderAlerts()'s own suggestedQty fallback when no sales velocity is available
    return {
      found: true,
      data: { candidates: rows, chosen: top },
      recommendation: `Reorder ${suggestedQty} units of ${top.name}.`,
      reason: `Current on-hand: ${top.on_hand}. Reorder point: ${top.reorder_level}. Source: inventory (Inventory module reorder-alerts).`,
      confidence: 80,
      approvalLevel: "manager",
      sourceRef: top.product_id,
      actionType: "create_po",
      actionPayload: { productId: top.product_id, suggestedQty },
    };
  }

  private async gatherExpirySignal(tenantId: string, hint: string | null): Promise<Signal> {
    const soon = Date.now() + 30 * 24 * 60 * 60 * 1000;
    const rows = await this.db.query<{ product_id: string; name: string; qty: number; expiry_date: number; lot_code: string | null }>(
      `SELECT l.product_id, p.name, l.qty_on_hand AS qty, l.expiry_date, l.lot_code
         FROM inventory_lots l
         JOIN products p ON p.tenant_id = l.tenant_id AND p.id = l.product_id
        WHERE l.tenant_id = @tenantId AND l.qty_on_hand > 0 AND l.expiry_date <= @soon
          AND (@hint::text IS NULL OR p.name ILIKE '%' || @hint || '%')
        ORDER BY l.expiry_date ASC
        LIMIT 5`,
      { tenantId, soon, hint },
    );
    if (!rows.length) {
      return { found: false, data: { checked: "expiring lots (next 30 days)", hint }, recommendation: "", reason: "", confidence: 0, approvalLevel: "none", sourceRef: null, actionType: "none", actionPayload: null };
    }
    const top = rows[0]!;
    const daysLeft = Math.max(0, Math.round((top.expiry_date - Date.now()) / 86_400_000));
    return {
      found: true,
      data: { lots: rows },
      recommendation: `${top.qty} units of ${top.name} expire in ${daysLeft} day(s) — consider a promotion or write-off plan.`,
      reason: `Lot ${top.lot_code ?? top.product_id} expires ${new Date(top.expiry_date).toISOString().slice(0, 10)}. Source: inventory_lots (Inventory module, live FEFO ledger).`,
      confidence: 95,
      approvalLevel: "none",
      sourceRef: top.product_id,
      actionType: "none",
      actionPayload: null,
    };
  }

  private async gatherBestSellersSignal(tenantId: string): Promise<Signal> {
    const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const rows = await this.db.query<{ product_id: string; name: string; units: number; revenue: number }>(
      `SELECT ol.product_id, MAX(ol.name) AS name, SUM(ol.quantity)::int AS units, SUM(ol.line_cents) AS revenue
         FROM order_lines ol
         JOIN orders o ON o.id = ol.order_id AND o.tenant_id = ol.tenant_id
        WHERE ol.tenant_id = @tenantId AND o.status = 'completed' AND o.created_at >= @since
        GROUP BY ol.product_id
        ORDER BY revenue DESC
        LIMIT 5`,
      { tenantId, since },
    );
    if (!rows.length) {
      return { found: false, data: { checked: "best sellers (last 30 days)" }, recommendation: "", reason: "", confidence: 0, approvalLevel: "none", sourceRef: null, actionType: "none", actionPayload: null };
    }
    const top = rows[0]!;
    return {
      found: true,
      data: { topProducts: rows },
      recommendation: `${top.name} is your best seller (${top.units} units, $${(top.revenue / 100).toFixed(2)} revenue in the last 30 days).`,
      reason: `Ranked by revenue across completed orders. Source: order_lines/orders (Reports module query pattern).`,
      confidence: 97,
      approvalLevel: "none",
      sourceRef: top.product_id,
      actionType: "none",
      actionPayload: null,
    };
  }

  private async gatherSlowMoversSignal(tenantId: string): Promise<Signal> {
    const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const rows = await this.db.query<{ product_id: string; name: string; units: number }>(
      `SELECT p.id AS product_id, p.name, COALESCE(SUM(ol.quantity), 0)::int AS units
         FROM products p
         LEFT JOIN order_lines ol ON ol.product_id = p.id AND ol.tenant_id = p.tenant_id
         LEFT JOIN orders o ON o.id = ol.order_id AND o.tenant_id = ol.tenant_id AND o.status = 'completed' AND o.created_at >= @since
        WHERE p.tenant_id = @tenantId AND p.status = 'active'
        GROUP BY p.id, p.name
        HAVING COALESCE(SUM(ol.quantity), 0) = 0
        ORDER BY p.name ASC
        LIMIT 5`,
      { tenantId, since },
    );
    if (!rows.length) {
      return { found: false, data: { checked: "products with zero sales in 30 days" }, recommendation: "", reason: "", confidence: 0, approvalLevel: "none", sourceRef: null, actionType: "none", actionPayload: null };
    }
    const names = rows.map((r) => r.name).join(", ");
    return {
      found: true,
      data: { slowMovers: rows },
      recommendation: `${rows.length} product(s) had zero sales in the last 30 days: ${names}.`,
      reason: `No completed order_lines in the last 30 days for these active products. Source: products + order_lines (no existing "slow mover" endpoint — new query, per AGENTS.md's required signal list).`,
      confidence: 90,
      approvalLevel: "none",
      sourceRef: rows[0]!.product_id,
      actionType: "none",
      actionPayload: null,
    };
  }

  // ── Recommendations: list + human-gated approve/reject ─────────────────

  async listRecommendations(tenantId: string, status?: string): Promise<Recommendation[]> {
    const rows = await this.db.query<RecommendationRow>(
      status
        ? `SELECT * FROM ai_recommendations WHERE tenant_id = @tenantId AND status = @status ORDER BY created_at DESC LIMIT 50`
        : `SELECT * FROM ai_recommendations WHERE tenant_id = @tenantId ORDER BY created_at DESC LIMIT 50`,
      status ? { tenantId, status } : { tenantId },
    );
    return rows.map(toRecommendation);
  }

  async getRecommendation(tenantId: string, id: string): Promise<Recommendation | null> {
    const rows = await this.db.query<RecommendationRow>(
      `SELECT * FROM ai_recommendations WHERE tenant_id = @tenantId AND id = @id`,
      { tenantId, id },
    );
    return rows[0] ? toRecommendation(rows[0]) : null;
  }

  async decide(
    tenantId: string,
    id: string,
    decision: "approved" | "rejected",
    actor: { id: string | null; role: string },
  ): Promise<Recommendation> {
    const rec = await this.getRecommendation(tenantId, id);
    if (!rec) throw new HttpError(404, "not_found", "Recommendation not found.");
    if (rec.status !== "pending") throw new HttpError(409, "already_decided", `This recommendation was already ${rec.status}.`);

    await this.db.query(
      `UPDATE ai_recommendations SET status = @status, decided_at = @now, decided_by = @actorId WHERE tenant_id = @tenantId AND id = @id`,
      { status: decision, now: Date.now(), actorId: actor.id, tenantId, id },
    );
    await writeAudit(this.db, {
      tenantId,
      actorId: actor.id ?? "system",
      action: `ai_recommendation.${decision}`,
      entityType: "ai_recommendation",
      entityId: id,
      before: { status: "pending" },
      after: { status: decision, recommendation: rec.recommendation },
    });

    const updated = await this.getRecommendation(tenantId, id);
    return updated!;
  }
}

// ── Row → domain mapping ──────────────────────────────────────────────────

interface ConversationRow {
  id: string; tenant_id: string; user_id: string; question: string; answer: string | null;
  status: string; error: string | null; created_at: number; completed_at: number | null;
}
function toConversation(r: ConversationRow): Conversation {
  return {
    id: r.id, tenantId: r.tenant_id, userId: r.user_id, question: r.question, answer: r.answer,
    status: r.status as Conversation["status"], error: r.error, createdAt: Number(r.created_at),
    completedAt: r.completed_at !== null ? Number(r.completed_at) : null,
  };
}

interface RecommendationRow {
  id: string; tenant_id: string; conversation_id: string; recommendation: string; reason: string;
  data_used: string; confidence_score: number; required_approval_level: string; source_type: string;
  source_ref: string | null; action_type: string; action_payload: string | null; status: string;
  created_at: number; decided_at: number | null; decided_by: string | null;
}
function toRecommendation(r: RecommendationRow): Recommendation {
  return {
    id: r.id, tenantId: r.tenant_id, conversationId: r.conversation_id, recommendation: r.recommendation,
    reason: r.reason, dataUsed: JSON.parse(r.data_used), confidenceScore: Number(r.confidence_score),
    requiredApprovalLevel: r.required_approval_level as Recommendation["requiredApprovalLevel"],
    sourceType: r.source_type as Intent, sourceRef: r.source_ref,
    actionType: r.action_type as Recommendation["actionType"],
    actionPayload: r.action_payload ? JSON.parse(r.action_payload) : null,
    status: r.status as Recommendation["status"], createdAt: Number(r.created_at),
    decidedAt: r.decided_at !== null ? Number(r.decided_at) : null, decidedBy: r.decided_by,
  };
}
