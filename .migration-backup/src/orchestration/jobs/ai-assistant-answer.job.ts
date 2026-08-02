import type { DB } from "../../shared/db.js";
import type { EventBus } from "../../shared/events.js";
import type { JobRow } from "../types.js";
import { moduleLogger } from "../../shared/logger.js";
import { AiAssistantService } from "../../modules/ai_assistant/service.js";

const log = moduleLogger("ai-assistant-answer");

/**
 * AI Assistant Answer Job
 *
 * Processes one chat question: rule-based signal gathering (real tenant
 * data) + LLM narration, per DESIGN_PRINCIPLES.md's async-by-default rule
 * for AI processing. One-shot, not self-rescheduling — triggered per
 * `POST /ai-assistant/ask` call, not on a timer.
 */
export async function aiAssistantAnswerJob(job: JobRow, db: DB, events: EventBus): Promise<void> {
  const payload = JSON.parse(job.payload) as { conversationId?: string };
  if (!payload.conversationId) {
    log.warn({ jobId: job.id }, "ai-assistant-answer job missing conversationId");
    return;
  }
  const service = new AiAssistantService(db, events);
  await service.processQuestion(job.tenant_id, payload.conversationId);
}
