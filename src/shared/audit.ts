import { v7 as uuidv7 } from "uuid";
import type { DB } from "./db.js";

export interface AuditEntry {
  tenantId: string;
  /** User id of the actor, or "system" for non-interactive mutations. */
  actorId: string;
  /** Dot-scoped action name, e.g. "order.created", "register.session_closed". */
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}

/**
 * Best-effort audit write for critical business mutations (orders, payments,
 * register sessions). Never throws — an audit failure must not fail the
 * mutation it records, the same rule the identity module applies to login
 * auditing. Rows land in the same audit_log table the /audit-log page reads.
 */
export async function writeAudit(db: DB, entry: AuditEntry): Promise<void> {
  try {
    await db.query(
      `INSERT INTO audit_log
         (id, tenant_id, actor_id, action, entity_type, entity_id, before_state, after_state, occurred_at, request_id)
       VALUES
         (@id, @tenantId, @actorId, @action, @entityType, @entityId, @before, @after, @now, NULL)`,
      {
        id: `aud_${uuidv7()}`,
        tenantId: entry.tenantId,
        actorId: entry.actorId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        before: entry.before !== undefined ? JSON.stringify(entry.before) : null,
        after: entry.after !== undefined ? JSON.stringify(entry.after) : null,
        now: Date.now(),
      },
    );
  } catch {
    // Never fail a business mutation because audit logging failed.
  }
}
