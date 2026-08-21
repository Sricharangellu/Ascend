
import { useCallback, useEffect, useState } from "react";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { apiGet, apiPost, apiPatch, ApiResponseError } from "@/api-client/client";
import type { WorkflowDefinition, WorkflowsResponse } from "@/api-client/types";
import { WorkflowFormModal } from "./_components/WorkflowFormModal";
import { WorkflowRow } from "./_components/WorkflowRow";

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = "workflows" | "approval-chains" | "run-history" | "templates";

interface ApprovalStep { role: string; label: string }
interface ApprovalChain {
  id: string; name: string; trigger: string; threshold: number | null;
  steps: ApprovalStep[]; enabled: boolean; runs: number; created_at: number;
}
interface RunRecord {
  id: string; workflow_name: string; trigger: string;
  status: "passed" | "failed" | "skipped";
  cashier: string; duration_ms: number; ran_at: number; outlet: string;
}
interface WfTemplate {
  id: string; name: string; category: string; description: string;
  steps: number; installs: number; installed: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TABS: { key: Tab; label: string }[] = [
  { key: "workflows",       label: "Workflows" },
  { key: "approval-chains", label: "Approval Chains" },
  { key: "run-history",     label: "Run History" },
  { key: "templates",       label: "Templates" },
];

const TRIGGER_LABELS: Record<string, string> = {
  price_override:  "Price Override",
  refund:          "Refund",
  vendor_create:   "New Vendor",
  discount_create: "Discount Created",
  custom:          "Custom",
  age_verification:"Age Verification",
  loyalty_capture: "Loyalty Capture",
  custom_prompt:   "Custom Prompt",
};

const CATEGORY_CLS: Record<string, string> = {
  compliance: "bg-red-100 text-red-700",
  loyalty:    "bg-purple-100 text-purple-700",
  approvals:  "bg-amber-100 text-amber-700",
  payments:   "bg-teal-100 text-teal-700",
  b2b:        "bg-indigo-100 text-indigo-700",
};

// ── Shared ────────────────────────────────────────────────────────────────────

function Badge({ label, cls }: { label: string; cls: string }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${cls}`}>{label}</span>;
}

function Skeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="divide-y divide-[var(--color-table-border)]">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-4">
          <div className="h-3 flex-1 animate-skeleton rounded" />
          <div className="h-3 w-20 animate-skeleton rounded" />
        </div>
      ))}
    </div>
  );
}

// ── Workflows Tab ─────────────────────────────────────────────────────────────

function WorkflowsTab() {
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
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const activeCount   = workflows.filter(w => w.enabled).length;
  const inactiveCount = workflows.filter(w => !w.enabled).length;

  return (
    <div className="space-y-4">
      {!loading && !error && workflows.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {[
            { label: "Active",   count: activeCount,   cls: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" },
            { label: "Inactive", count: inactiveCount, cls: "bg-[var(--color-surface-subtle)] ring-1 ring-[var(--color-border)]", style: { color: "var(--color-text-secondary)" } as React.CSSProperties },
          ].map(({ label, count, cls, style }) => (
            <span key={label} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${cls}`} style={style}>
              <span className="text-base font-semibold">{count}</span> {label}
            </span>
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded-xl shadow-sm" style={{ borderWidth: 1, borderStyle: "solid", borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
        <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottomWidth: 1, borderBottomStyle: "solid", borderColor: "var(--color-border)" }}>
          <div>
            <h2 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>Workflow definitions</h2>
            {!loading && <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{workflows.length} {workflows.length === 1 ? "workflow" : "workflows"}</p>}
          </div>
          <button type="button" onClick={() => setShowCreate(true)}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-[#4B4DC8]">
            + New Workflow
          </button>
        </div>

        {loading ? <Skeleton /> : error ? (
          <p className="px-5 py-6 text-sm text-red-600">{error}</p>
        ) : workflows.length === 0 ? (
          <div className="py-14 text-center">
            <p className="text-sm font-medium" style={{ color: "var(--color-text-secondary)" }}>No workflows yet</p>
            <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>Create a workflow to automate checkout steps — or install one from Templates.</p>
            <button type="button" onClick={() => setShowCreate(true)}
              className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-[#4B4DC8]">
              Create first workflow
            </button>
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-table-border)]">
            {workflows.map(wf => <WorkflowRow key={wf.id} workflow={wf} onReload={load} />)}
          </div>
        )}
      </div>

      {!loading && workflows.length > 0 && (
        <div className="rounded-xl px-5 py-3 text-sm" style={{ borderWidth: 1, borderStyle: "solid", borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-subtle)", color: "var(--color-text-secondary)" }}>
          <span className="font-semibold">How workflows fire: </span>
          Each workflow runs at the point-of-sale when its trigger condition is met (e.g. an age-restricted product is added to a cart).
          Steps execute in order — a Gate step can block the transaction until the condition is cleared.
        </div>
      )}

      {showCreate && (
        <WorkflowFormModal
          onSave={async body => { await apiPost("/api/v1/workflows", body); await load(); }}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}

// ── Approval Chains Tab ───────────────────────────────────────────────────────

function ApprovalChainsTab() {
  const [chains, setChains]   = useState<ApprovalChain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await apiGet<{ items: ApprovalChain[] }>("/api/v1/workflows/approval-chains");
      setChains(r.items ?? []);
    } catch (err: unknown) {
      setError(err instanceof ApiResponseError ? err.message : "Failed to load approval chains.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const ROLE_CLS: Record<string, string> = {
    manager:    "bg-blue-100 text-blue-700",
    supervisor: "bg-purple-100 text-purple-700",
    finance:    "bg-teal-100 text-teal-700",
    legal:      "bg-orange-100 text-orange-700",
    owner:      "bg-red-100 text-red-700",
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-100 bg-amber-50 px-5 py-3 text-sm text-amber-700">
        Approval chains define multi-step sign-off flows for sensitive operations. Each step routes to a role and blocks the action until approved.
      </div>

      <div className="overflow-hidden rounded-xl shadow-sm" style={{ borderWidth: 1, borderStyle: "solid", borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
        <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottomWidth: 1, borderBottomStyle: "solid", borderColor: "var(--color-border)" }}>
          <h3 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>{chains.length} approval chains</h3>
          <button type="button"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-[#4B4DC8]">
            + New Chain
          </button>
        </div>

        {loading ? <Skeleton /> : error ? (
          <p className="px-5 py-6 text-sm text-red-600">{error}</p>
        ) : (
          <div className="divide-y divide-[var(--color-table-border)]">
            {chains.map(c => (
              <div key={c.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold" style={{ color: "var(--color-text-primary)" }}>{c.name}</p>
                      <Badge label={c.enabled ? "Active" : "Disabled"}
                        cls={c.enabled ? "bg-emerald-100 text-emerald-700" : "bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)]"} />
                      <Badge label={TRIGGER_LABELS[c.trigger] ?? c.trigger} cls="bg-indigo-100 text-indigo-700" />
                      {c.threshold !== null && (
                        <Badge label={`Threshold: ${c.threshold}${c.trigger === "price_override" || c.trigger === "discount_create" ? "%" : c.trigger === "refund" ? "¢" : ""}`}
                          cls="bg-orange-100 text-orange-700" />
                      )}
                    </div>
                    <p className="mt-0.5 text-xs" style={{ color: "var(--color-text-muted)" }}>{c.runs.toLocaleString()} lifetime runs</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={async () => {
                        await apiPatch(`/api/v1/workflows/approval-chains/${c.id}`, { enabled: !c.enabled });
                        await load();
                      }}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${c.enabled ? "bg-brand-600" : "bg-[var(--color-surface-subtle)]"}`}
                    >
                      <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${c.enabled ? "translate-x-4" : "translate-x-0"}`} />
                    </button>
                    <button className="rounded-lg px-3 py-1.5 text-xs font-semibold hover:bg-[var(--color-surface-subtle)]" style={{ borderWidth: 1, borderStyle: "solid", borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}>Edit</button>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  {c.steps.map((s, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      {i > 0 && <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>→</span>}
                      <div className="flex items-center gap-1.5 rounded-lg px-3 py-1.5" style={{ borderWidth: 1, borderStyle: "solid", borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-subtle)" }}>
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${ROLE_CLS[s.role] ?? "bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)]"}`}>{s.role}</span>
                        <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>{s.label}</span>
                      </div>
                    </div>
                  ))}
                  {c.steps.length === 0 && <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>No approvers configured</span>}
                </div>
              </div>
            ))}
            {chains.length === 0 && (
              <p className="py-10 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>No approval chains configured.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Run History Tab ───────────────────────────────────────────────────────────

function RunHistoryTab() {
  const [runs, setRuns]       = useState<RunRecord[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    void apiGet<{ items: RunRecord[]; total: number }>("/api/v1/workflows/run-history").then(r => {
      setRuns(r.items ?? []); setTotal(r.total ?? 0); setLoading(false);
    }).catch((err: unknown) => { setError((err as Error).message ?? "Failed to load"); setLoading(false); });
  }, []);

  const STATUS_CLS: Record<RunRecord["status"], string> = {
    passed:  "bg-emerald-100 text-emerald-700",
    failed:  "bg-red-100 text-red-700",
    skipped: "bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)]",
  };

  if (error) return <p className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-600">{error}</p>;

  const passedCount  = runs.filter(r => r.status === "passed").length;
  const failedCount  = runs.filter(r => r.status === "failed").length;
  const skippedCount = runs.filter(r => r.status === "skipped").length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Passed",  value: passedCount,  cls: "text-emerald-700" },
          { label: "Failed",  value: failedCount,  cls: "text-red-600" },
          { label: "Skipped", value: skippedCount, style: { color: "var(--color-text-muted)" } as React.CSSProperties },
        ].map(m => (
          <div key={m.label} className="rounded-xl px-4 py-3 shadow-sm" style={{ borderWidth: 1, borderStyle: "solid", borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>{m.label}</p>
            <p className={`mt-1 text-2xl font-bold ${"cls" in m ? m.cls : ""}`} style={"style" in m ? m.style : undefined}>{m.value}</p>
            <p className="mt-0.5 text-xs" style={{ color: "var(--color-text-muted)" }}>of {runs.length} shown ({total.toLocaleString()} total)</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl shadow-sm" style={{ borderWidth: 1, borderStyle: "solid", borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
        <div className="px-5 py-3.5" style={{ borderBottomWidth: 1, borderBottomStyle: "solid", borderColor: "var(--color-border)" }}>
          <h3 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>Recent workflow runs</h3>
        </div>
        {loading ? <Skeleton /> : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs font-semibold" style={{ borderBottomWidth: 1, borderBottomStyle: "solid", borderColor: "var(--color-border)", backgroundColor: "var(--color-table-header)", color: "var(--color-text-muted)" }}>
              <tr>
                <th className="px-5 py-3">Workflow</th>
                <th className="px-5 py-3">Trigger</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Cashier</th>
                <th className="px-5 py-3">Outlet</th>
                <th className="px-5 py-3 text-right">Duration</th>
                <th className="px-5 py-3">Ran at</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-table-border)]">
              {runs.map(r => (
                <tr key={r.id} className="hover:bg-[var(--color-surface-subtle)] transition-colors">
                  <td className="px-5 py-3.5 font-medium" style={{ color: "var(--color-text-primary)" }}>{r.workflow_name}</td>
                  <td className="px-5 py-3.5 text-xs" style={{ color: "var(--color-text-muted)" }}>{TRIGGER_LABELS[r.trigger] ?? r.trigger}</td>
                  <td className="px-5 py-3.5">
                    <Badge label={r.status.charAt(0).toUpperCase() + r.status.slice(1)} cls={STATUS_CLS[r.status]} />
                  </td>
                  <td className="px-5 py-3.5" style={{ color: "var(--color-text-secondary)" }}>{r.cashier}</td>
                  <td className="px-5 py-3.5 text-xs" style={{ color: "var(--color-text-muted)" }}>{r.outlet}</td>
                  <td className="px-5 py-3.5 text-right font-mono text-xs" style={{ color: "var(--color-text-muted)" }}>{r.duration_ms}ms</td>
                  <td className="px-5 py-3.5 text-xs" style={{ color: "var(--color-text-muted)" }}>{new Date(r.ran_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Templates Tab ─────────────────────────────────────────────────────────────

function TemplatesTab({ onInstall }: { onInstall: () => void }) {
  const [templates, setTemplates] = useState<WfTemplate[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await apiGet<{ items: WfTemplate[] }>("/api/v1/workflows/templates");
      setTemplates(r.items ?? []);
    } catch (err: unknown) {
      setError(err instanceof ApiResponseError ? err.message : "Failed to load templates.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleInstall = async (id: string) => {
    setInstalling(id);
    try {
      await apiPost(`/api/v1/workflows/templates/${id}/install`, {});
      await load();
      onInstall();
    } catch { /* ignore */ }
    finally { setInstalling(null); }
  };

  if (error) return <p className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-600">{error}</p>;

  const CATEGORY_LABEL: Record<string, string> = {
    compliance: "Compliance",
    loyalty:    "Loyalty",
    approvals:  "Approvals",
    payments:   "Payments",
    b2b:        "B2B",
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-blue-100 bg-blue-50 px-5 py-3 text-sm text-blue-700">
        Templates are pre-built workflow definitions. Install one to add it to your Workflows list, then customize it as needed.
      </div>

      {loading ? <Skeleton rows={8} /> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map(t => (
            <div key={t.id} className={`rounded-xl p-5 shadow-sm`} style={{ borderWidth: 1, borderStyle: "solid", borderColor: t.installed ? "rgba(var(--color-brand-rgb,90,94,200),0.3)" : "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold" style={{ color: "var(--color-text-primary)" }}>{t.name}</p>
                  <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                    <Badge label={CATEGORY_LABEL[t.category] ?? t.category} cls={CATEGORY_CLS[t.category] ?? "bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)]"} />
                    <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>{t.steps} step{t.steps !== 1 ? "s" : ""}</span>
                    <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>{t.installs.toLocaleString()} installs</span>
                  </div>
                </div>
                {t.installed && (
                  <span className="shrink-0 rounded-full bg-brand-600/10 px-2.5 py-0.5 text-[10px] font-bold text-brand-600">Installed</span>
                )}
              </div>
              <p className="mt-3 text-xs leading-relaxed" style={{ color: "var(--color-text-muted)" }}>{t.description}</p>
              <div className="mt-4">
                {t.installed ? (
                  <button disabled className="w-full rounded-lg py-2 text-xs font-semibold cursor-not-allowed" style={{ borderWidth: 1, borderStyle: "solid", borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}>
                    Already installed
                  </button>
                ) : (
                  <button
                    onClick={() => void handleInstall(t.id)}
                    disabled={installing === t.id}
                    className="w-full rounded-lg bg-brand-600 py-2 text-xs font-semibold text-white hover:bg-[#4B4DC8] disabled:opacity-50"
                  >
                    {installing === t.id ? "Installing…" : "Install template"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function WorkflowsPage() {
  const [activeTab, setActiveTab]     = useState<Tab>("workflows");
  const [workflowsKey, setWorkflowsKey] = useState(0);

  return (
    <EnterpriseShell
      active="workflows"
      title="Workflow Engine"
      subtitle="Checkout automation, approval chains, and compliance gates"
      contentClassName="overflow-y-auto"
    >
      <div className="mx-auto w-full max-w-6xl space-y-0 px-4 py-5 sm:px-6">
        {/* Tabs */}
        <div style={{ borderBottomWidth: 1, borderBottomStyle: "solid", borderColor: "var(--color-border)" }}>
          <nav className="-mb-px flex gap-1 overflow-x-auto">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`shrink-0 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === t.key
                    ? "border-brand-600 text-brand-600"
                    : "border-transparent hover:border-[var(--color-border)]"
                }`}
                style={activeTab === t.key ? undefined : { color: "var(--color-text-muted)" }}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="pt-5">
          {activeTab === "workflows"       && <WorkflowsTab key={workflowsKey} />}
          {activeTab === "approval-chains" && <ApprovalChainsTab />}
          {activeTab === "run-history"     && <RunHistoryTab />}
          {activeTab === "templates"       && (
            <TemplatesTab onInstall={() => setWorkflowsKey(k => k + 1)} />
          )}
        </div>
      </div>
    </EnterpriseShell>
  );
}
