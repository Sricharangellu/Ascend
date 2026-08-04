import type { DB } from "../../shared/db.js";
import type { EventBus } from "../../shared/events.js";
import type { JobRow } from "../types.js";
import { moduleLogger } from "../../shared/logger.js";
import { AiAssistantService, BRIEFING_SENTINEL } from "../../modules/ai_assistant/service.js";
import { ReportsService } from "../../modules/reports/service.js";

const log = moduleLogger("ai-assistant-answer");

/**
 * AI Assistant Answer Job
 *
 * Processes one chat question: rule-based signal gathering (real tenant
 * data) + LLM narration, per DESIGN_PRINCIPLES.md's async-by-default rule
 * for AI processing. One-shot, not self-rescheduling — triggered per
 * `POST /ai-assistant/ask` call, not on a timer.
 *
 * The dashboard's daily-briefing request (`POST /ai-assistant/briefing`)
 * reuses this same queue/job — recognized by its sentinel question. Briefing
 * narration needs the reports module's already-computed recommendations,
 * which ai_assistant's own service must not fetch itself (modules never
 * import each other's code) — the orchestration layer is exempt from that
 * rule (same precedent as demand-snapshot.job.ts importing
 * DemandPlanningService directly), so this job fetches it here and hands it
 * to processQuestion() instead of letting the service gather a signal itself.
 */
export async function aiAssistantAnswerJob(job: JobRow, db: DB, events: EventBus): Promise<void> {
  const payload = JSON.parse(job.payload) as { conversationId?: string };
  if (!payload.conversationId) {
    log.warn({ jobId: job.id }, "ai-assistant-answer job missing conversationId");
    return;
  }
  const service = new AiAssistantService(db, events);
  const conv = await service.getConversation(job.tenant_id, payload.conversationId);
  if (conv?.question === BRIEFING_SENTINEL) {
    const reportsService = new ReportsService(db);
    const report = await reportsService.retailRecommendations(job.tenant_id);
    await service.processQuestion(job.tenant_id, payload.conversationId, {
      data: { recommendations: report.recommendations, summary: report.summary },
      found: report.recommendations.length > 0,
    });
    return;
  }
  await service.processQuestion(job.tenant_id, payload.conversationId);
}
