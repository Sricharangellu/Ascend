import type { DB } from "../../shared/db.js";
import type { EventBus } from "../../shared/events.js";
import type { JobRow } from "../types.js";
import { BillingService } from "../../modules/billing/service.js";

/**
 * AR Dunning Job
 *
 * Runs the AR dunning sweep for one tenant: updates dunning_level on
 * overdue invoices and emits invoice.overdue events that trigger
 * customer notification emails.
 *
 * Intended to be enqueued once per active tenant per day, typically
 * at bootstrap (startup) and again after a 24-hour delay.
 */
export async function arDunningJob(job: JobRow, db: DB, events: EventBus): Promise<void> {
  const payload = JSON.parse(job.payload) as { tenantId?: string };
  const tenantId = payload.tenantId ?? job.tenant_id;
  if (!tenantId) return;

  const service = new BillingService(db, events);
  const result = await service.runDunning(tenantId);

  if (result.processed > 0) {
    const { byLevel } = result;
    const levels = Object.entries(byLevel)
      .filter(([, n]) => n > 0)
      .map(([lvl, n]) => `level${lvl}=${n}`)
      .join(", ");
    console.info(`[ar-dunning] tenant=${tenantId} processed=${result.processed} (${levels})`);
  }
}
