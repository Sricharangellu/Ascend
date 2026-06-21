import type { PosModule } from "../types.js";
import { AuditLogService } from "./service.js";
import { registerRoutes } from "./routes.js";

const CREATE_INDEX = `
CREATE INDEX IF NOT EXISTS audit_log_tenant_occurred_idx ON audit_log (tenant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_tenant_type_idx     ON audit_log (tenant_id, entity_type);
`;

/**
 * Audit log read module. The audit_log table itself is created by the identity
 * module migrations — this module only adds read indexes and the query endpoint.
 * Mounted at /api/v1/audit-log.
 */
export const auditLogModule: PosModule = {
  name: "audit-log",
  migrations: [CREATE_INDEX],
  async register({ db, router }) {
    const service = new AuditLogService(db);
    registerRoutes(router, service);
  },
};

export { AuditLogService } from "./service.js";
export type { AuditEvent } from "./service.js";
