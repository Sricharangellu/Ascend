import type { PosModule } from "../types.js";
import type { DB } from "../../shared/db.js";
import type { EventBus } from "../../shared/events.js";
import type { Router } from "express";
import { AiAssistantService } from "./service.js";
import { registerRoutes } from "./routes.js";

/**
 * AI Assistant module — conversational menu/inventory recommendations,
 * grounded exclusively in real tenant data (AGENTS.md "AI / Recommendations
 * Rules": rule-based signal first, AI explains, never invents facts).
 *
 * Integration posture, per shared architecture rule (modules never import
 * each other's code): this module reads the shared tables `inventory_stock`,
 * `products`, `inventory_lots`, `order_lines`/`orders`, `purchase_order_lines`
 * directly (read-only), the same pattern reports/insights already use. The
 * one write action it can trigger (creating a PO from an approved reorder
 * recommendation) is delegated to the inventory module's own existing,
 * tested endpoint (`POST /inventory/pipeline/reorder-alerts/:id/create-po`)
 * via an internal HTTP call carrying the original request's auth — this
 * module never writes to purchasing's tables directly.
 *
 * Async by default (DESIGN_PRINCIPLES.md non-negotiable: "AI processing"
 * must be async) — see src/orchestration/index.ts's QueueNames.AI_ASSISTANT_ANSWER
 * handler registration for the actual LLM call.
 */

const CREATE_AI_CONVERSATIONS = `
CREATE TABLE IF NOT EXISTS ai_conversations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  created_at BIGINT NOT NULL,
  completed_at BIGINT
);
CREATE INDEX IF NOT EXISTS ai_conversations_tenant_idx ON ai_conversations (tenant_id, created_at DESC);
`;

const CREATE_AI_RECOMMENDATIONS = `
CREATE TABLE IF NOT EXISTS ai_recommendations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  recommendation TEXT NOT NULL,
  reason TEXT NOT NULL,
  data_used TEXT NOT NULL,
  confidence_score INTEGER NOT NULL,
  required_approval_level TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_ref TEXT,
  action_type TEXT NOT NULL DEFAULT 'none',
  action_payload TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at BIGINT NOT NULL,
  decided_at BIGINT,
  decided_by TEXT
);
CREATE INDEX IF NOT EXISTS ai_recommendations_tenant_idx ON ai_recommendations (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_recommendations_status_idx ON ai_recommendations (tenant_id, status);
`;

export const aiAssistantModule: PosModule = {
  name: "ai-assistant",
  mountPath: "/api/v1/ai-assistant",
  migrations: [CREATE_AI_CONVERSATIONS, CREATE_AI_RECOMMENDATIONS],
  register({ db, events, router }: { db: DB; events: EventBus; router: Router }) {
    const service = new AiAssistantService(db, events);
    registerRoutes(router, service);
  },
};

export { AiAssistantService } from "./service.js";
