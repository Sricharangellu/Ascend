"use client";

import { useCallback, useEffect, useState } from "react";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { Card } from "@/components/Card";
import { TableSkeleton } from "@/components/TableSkeleton";
import { apiGet, apiPost, ApiResponseError } from "@/api-client/client";
import type { WorkflowDefinition, WorkflowsResponse } from "@/api-client/types";
import { WorkflowFormModal } from "./_components/WorkflowFormModal";
import { WorkflowRow } from "./_components/WorkflowRow";

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await apiGet<WorkflowsResponse>("/api/v1/workflows");
      setWorkflows(data.items ?? []);
    } catch (err) {
      setError(err instanceof ApiResponseError ? err.message : "Failed to load workflows.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (body: { name: string; description?: string }) => {
    await apiPost("/api/v1/workflows", body);
    await load();
  };

  const activeCount   = workflows.filter((w) => w.enabled).length;
  const inactiveCount = workflows.filter((w) => !w.enabled).length;

  return (
    <EnterpriseShell
      active="workflows"
      title="Workflows"
      subtitle="Automate checkout steps and compliance gates"
      contentClassName="overflow-y-auto"
    >
      <div className="mx-auto w-full max-w-4xl space-y-5 px-4 py-5 sm:px-6">

        {!loading && !error && workflows.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {[
              { label: "Active",   count: activeCount,   color: "bg-green-50 text-green-700 ring-1 ring-green-200" },
              { label: "Inactive", count: inactiveCount, color: "bg-slate-50 text-slate-600 ring-1 ring-slate-200" },
            ].map(({ label, count, color }) => (
              <span key={label} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${color}`}>
                <span className="text-base font-semibold">{count}</span> {label}
              </span>
            ))}
          </div>
        )}

        <Card className="overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <h2 className="text-base font-semibold text-slate-950">Workflow definitions</h2>
              <p className="text-sm text-slate-500">
                {!loading && `${workflows.length} ${workflows.length === 1 ? "workflow" : "workflows"}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              + New workflow
            </button>
          </div>

          {loading ? (
            <TableSkeleton headers={["Name", "Steps", "Status", ""]} rows={5} />
          ) : error ? (
            <div className="px-4 py-6">
              <p role="alert" className="text-sm text-red-700">{error}</p>
            </div>
          ) : workflows.length === 0 ? (
            <div className="px-4 py-14 text-center">
              <p className="text-sm font-medium text-slate-700">No workflows yet</p>
              <p className="mt-1 text-sm text-slate-500">
                Create a workflow to automate checkout steps like age verification, loyalty capture, or custom prompts.
              </p>
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Create first workflow
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {workflows.map((wf) => (
                <WorkflowRow key={wf.id} workflow={wf} onReload={load} />
              ))}
            </div>
          )}
        </Card>

        {!loading && workflows.length > 0 && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <span className="font-medium">How workflows fire: </span>
            Each workflow runs at the point-of-sale when its trigger condition is met (e.g. an age-restricted product is added to a cart).
            Steps execute in order — a Gate step can block the transaction until the condition is cleared.
          </div>
        )}
      </div>

      {showCreate && (
        <WorkflowFormModal onSave={handleCreate} onClose={() => setShowCreate(false)} />
      )}
    </EnterpriseShell>
  );
}
