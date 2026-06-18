import { v7 as uuidv7 } from "uuid";
import { HttpError } from "../../shared/http.js";
import type { DB } from "../../shared/db.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type TriggerCondition =
  | "age_verification"
  | "loyalty_capture"
  | "id_scan"
  | "customer_required"
  | "signature_required"
  | "custom_prompt";

export type StepType =
  | "prompt"
  | "gate"
  | "capture"
  | "external_api";

export interface WorkflowStep {
  id: string;
  workflowId: string;
  tenantId: string;
  name: string;
  stepType: StepType;
  triggerCondition: TriggerCondition;
  /** JSON config specific to step_type (e.g. prompt text, external URL). */
  config: Record<string, unknown>;
  position: number;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface WorkflowDefinition {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  /** Outlet this workflow applies to; null = applies to all outlets. */
  outletId: string | null;
  enabled: boolean;
  steps: WorkflowStep[];
  createdAt: number;
  updatedAt: number;
}

interface WorkflowDefinitionRow {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  outlet_id: string | null;
  enabled: number | boolean;
  created_at: number;
  updated_at: number;
}

interface WorkflowStepRow {
  id: string;
  workflow_id: string;
  tenant_id: string;
  name: string;
  step_type: string;
  trigger_condition: string;
  config: string;
  position: number;
  enabled: number | boolean;
  created_at: number;
  updated_at: number;
}

function parseStep(row: WorkflowStepRow): WorkflowStep {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    tenantId: row.tenant_id,
    name: row.name,
    stepType: row.step_type as StepType,
    triggerCondition: row.trigger_condition as TriggerCondition,
    config: JSON.parse(row.config) as Record<string, unknown>,
    position: row.position,
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseDefinition(row: WorkflowDefinitionRow, steps: WorkflowStep[]): WorkflowDefinition {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    description: row.description,
    outletId: row.outlet_id,
    enabled: Boolean(row.enabled),
    steps,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Input types ───────────────────────────────────────────────────────────────

export interface CreateWorkflowInput {
  name: string;
  description?: string;
  outletId?: string | null;
}

export interface UpdateWorkflowInput {
  name?: string;
  description?: string;
  outletId?: string | null;
  enabled?: boolean;
}

export interface CreateStepInput {
  name: string;
  stepType: StepType;
  triggerCondition: TriggerCondition;
  config?: Record<string, unknown>;
  position?: number;
}

export interface UpdateStepInput {
  name?: string;
  stepType?: StepType;
  triggerCondition?: TriggerCondition;
  config?: Record<string, unknown>;
  position?: number;
  enabled?: boolean;
}

// ── Service ───────────────────────────────────────────────────────────────────

export class WorkflowsService {
  constructor(private readonly db: DB) {}

  private async getSteps(tenantId: string, workflowId: string): Promise<WorkflowStep[]> {
    const rows = await this.db.query<WorkflowStepRow>(
      "SELECT * FROM workflow_steps WHERE tenant_id = @tenantId AND workflow_id = @workflowId ORDER BY position ASC",
      { tenantId, workflowId },
    );
    return rows.map(parseStep);
  }

  async list(tenantId: string, outletId?: string): Promise<WorkflowDefinition[]> {
    const rows = outletId
      ? await this.db.query<WorkflowDefinitionRow>(
          "SELECT * FROM workflow_definitions WHERE tenant_id = @tenantId AND (outlet_id = @outletId OR outlet_id IS NULL) ORDER BY name ASC",
          { tenantId, outletId },
        )
      : await this.db.query<WorkflowDefinitionRow>(
          "SELECT * FROM workflow_definitions WHERE tenant_id = @tenantId ORDER BY name ASC",
          { tenantId },
        );
    return Promise.all(rows.map(async (r) => parseDefinition(r, await this.getSteps(tenantId, r.id))));
  }

  async get(tenantId: string, id: string): Promise<WorkflowDefinition> {
    const row = await this.db.one<WorkflowDefinitionRow>(
      "SELECT * FROM workflow_definitions WHERE id = @id AND tenant_id = @tenantId",
      { id, tenantId },
    );
    if (!row) throw new HttpError(404, "not_found", "Workflow not found.");
    return parseDefinition(row, await this.getSteps(tenantId, id));
  }

  async create(tenantId: string, input: CreateWorkflowInput): Promise<WorkflowDefinition> {
    const id = `wfd_${uuidv7()}`;
    const now = Date.now();
    await this.db.query(
      `INSERT INTO workflow_definitions (id, tenant_id, name, description, outlet_id, enabled, created_at, updated_at)
       VALUES (@id, @tenantId, @name, @description, @outletId, TRUE, @now, @now)`,
      { id, tenantId, name: input.name, description: input.description ?? null, outletId: input.outletId ?? null, now },
    );
    return this.get(tenantId, id);
  }

  async update(tenantId: string, id: string, input: UpdateWorkflowInput): Promise<WorkflowDefinition> {
    const existing = await this.get(tenantId, id);
    const now = Date.now();
    await this.db.query(
      `UPDATE workflow_definitions SET
         name        = @name,
         description = @description,
         outlet_id   = @outletId,
         enabled     = @enabled,
         updated_at  = @now
       WHERE id = @id AND tenant_id = @tenantId`,
      {
        id,
        tenantId,
        name: input.name ?? existing.name,
        description: input.description !== undefined ? input.description : existing.description,
        outletId: "outletId" in input ? (input.outletId ?? null) : existing.outletId,
        enabled: input.enabled !== undefined ? input.enabled : existing.enabled,
        now,
      },
    );
    return this.get(tenantId, id);
  }

  async delete(tenantId: string, id: string): Promise<void> {
    await this.get(tenantId, id); // 404 guard
    await this.db.query("DELETE FROM workflow_steps WHERE workflow_id = @id AND tenant_id = @tenantId", { id, tenantId });
    await this.db.query("DELETE FROM workflow_definitions WHERE id = @id AND tenant_id = @tenantId", { id, tenantId });
  }

  // ── Steps ───────────────────────────────────────────────────────────────────

  async addStep(tenantId: string, workflowId: string, input: CreateStepInput): Promise<WorkflowStep> {
    await this.get(tenantId, workflowId); // ensure workflow exists
    // Auto-assign position = max existing + 1 if not provided.
    let position = input.position;
    if (position === undefined) {
      const maxRow = await this.db.one<{ max_pos: number | null }>(
        "SELECT MAX(position) AS max_pos FROM workflow_steps WHERE workflow_id = @workflowId AND tenant_id = @tenantId",
        { workflowId, tenantId },
      );
      position = (maxRow?.max_pos ?? 0) + 1;
    }
    const id = `wst_${uuidv7()}`;
    const now = Date.now();
    await this.db.query(
      `INSERT INTO workflow_steps
         (id, workflow_id, tenant_id, name, step_type, trigger_condition, config, position, enabled, created_at, updated_at)
       VALUES
         (@id, @workflowId, @tenantId, @name, @stepType, @triggerCondition, @config, @position, TRUE, @now, @now)`,
      {
        id,
        workflowId,
        tenantId,
        name: input.name,
        stepType: input.stepType,
        triggerCondition: input.triggerCondition,
        config: JSON.stringify(input.config ?? {}),
        position,
        now,
      },
    );
    const row = await this.db.one<WorkflowStepRow>(
      "SELECT * FROM workflow_steps WHERE id = @id",
      { id },
    );
    return parseStep(row!);
  }

  async updateStep(
    tenantId: string,
    workflowId: string,
    stepId: string,
    input: UpdateStepInput,
  ): Promise<WorkflowStep> {
    const existing = await this.db.one<WorkflowStepRow>(
      "SELECT * FROM workflow_steps WHERE id = @stepId AND workflow_id = @workflowId AND tenant_id = @tenantId",
      { stepId, workflowId, tenantId },
    );
    if (!existing) throw new HttpError(404, "not_found", "Workflow step not found.");
    const now = Date.now();
    await this.db.query(
      `UPDATE workflow_steps SET
         name              = @name,
         step_type         = @stepType,
         trigger_condition = @triggerCondition,
         config            = @config,
         position          = @position,
         enabled           = @enabled,
         updated_at        = @now
       WHERE id = @stepId AND tenant_id = @tenantId`,
      {
        stepId,
        tenantId,
        name: input.name ?? existing.name,
        stepType: input.stepType ?? existing.step_type,
        triggerCondition: input.triggerCondition ?? existing.trigger_condition,
        config: JSON.stringify(input.config ?? JSON.parse(existing.config)),
        position: input.position ?? existing.position,
        enabled: input.enabled !== undefined ? input.enabled : Boolean(existing.enabled),
        now,
      },
    );
    const updated = await this.db.one<WorkflowStepRow>(
      "SELECT * FROM workflow_steps WHERE id = @stepId",
      { stepId },
    );
    return parseStep(updated!);
  }

  async deleteStep(tenantId: string, workflowId: string, stepId: string): Promise<void> {
    const existing = await this.db.one<WorkflowStepRow>(
      "SELECT id FROM workflow_steps WHERE id = @stepId AND workflow_id = @workflowId AND tenant_id = @tenantId",
      { stepId, workflowId, tenantId },
    );
    if (!existing) throw new HttpError(404, "not_found", "Workflow step not found.");
    await this.db.query("DELETE FROM workflow_steps WHERE id = @stepId AND tenant_id = @tenantId", { stepId, tenantId });
  }
}
