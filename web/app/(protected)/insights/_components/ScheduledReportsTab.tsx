"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { TableSkeleton } from "@/components/TableSkeleton";
import { fmtDate } from "@/lib/date";
import { apiGet, apiPost, apiPatch, apiDelete, ApiResponseError } from "@/api-client/client";
import { useToast } from "@/components/Toast";
import { REPORT_TYPE_LABELS, FREQ_LABELS } from "./insightsTypes";
import type { ScheduledReport, ReportType, Frequency } from "./insightsTypes";

export function ScheduledReportsTab({ isOwner }: { isOwner: boolean }) {
  const { addToast } = useToast();
  const [reports, setReports] = useState<ScheduledReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    name: "",
    reportType: "sales_summary" as ReportType,
    frequency: "weekly" as Frequency,
    recipientEmails: "",
  });

  const load = useCallback(() => {
    setLoading(true);
    apiGet<{ items: ScheduledReport[] }>("/api/v1/insights/scheduled-reports")
      .then((d) => setReports(d.items ?? []))
      .catch(() => setReports([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const createReport = async () => {
    const emails = form.recipientEmails.split(",").map((e) => e.trim()).filter(Boolean);
    if (!form.name.trim() || emails.length === 0) return;
    setBusy(true);
    try {
      await apiPost("/api/v1/insights/scheduled-reports", {
        name: form.name.trim(),
        reportType: form.reportType,
        frequency: form.frequency,
        recipientEmails: emails,
      });
      setShowAdd(false);
      setForm({ name: "", reportType: "sales_summary", frequency: "weekly", recipientEmails: "" });
      load();
      addToast({ title: "Report scheduled", variant: "success" });
    } catch (e) {
      addToast({ title: "Failed", description: e instanceof ApiResponseError ? e.message : "Unknown error", variant: "error" });
    } finally { setBusy(false); }
  };

  const toggleEnabled = async (r: ScheduledReport) => {
    try {
      await apiPatch(`/api/v1/insights/scheduled-reports/${r.id}`, { enabled: !r.enabled });
      load();
    } catch { addToast({ title: "Failed to update", variant: "error" }); }
  };

  const deleteReport = async (id: string) => {
    if (!confirm("Delete this scheduled report?")) return;
    try {
      await apiDelete(`/api/v1/insights/scheduled-reports/${id}`);
      load();
      addToast({ title: "Report deleted", variant: "success" });
    } catch { addToast({ title: "Failed to delete", variant: "error" }); }
  };

  const triggerReport = async (id: string) => {
    try {
      await apiPost(`/api/v1/insights/scheduled-reports/${id}/trigger`, {});
      load();
      addToast({ title: "Report triggered", description: "Next send time advanced.", variant: "success" });
    } catch { addToast({ title: "Failed to trigger", variant: "error" }); }
  };

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-slate-950">Scheduled reports</h2>
            <p className="text-sm text-slate-500">Automated report emails sent on a recurring schedule.</p>
          </div>
          {isOwner && !showAdd && (
            <Button variant="primary" size="sm" onClick={() => setShowAdd(true)}>+ New report</Button>
          )}
        </div>

        {showAdd && isOwner && (
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-4 space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Report name</label>
                <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Weekly Sales Digest"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-950" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Recipients (comma-separated emails)</label>
                <input value={form.recipientEmails} onChange={(e) => setForm((f) => ({ ...f, recipientEmails: e.target.value }))}
                  placeholder="owner@example.com, cfo@example.com"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-950" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Report type</label>
                <select value={form.reportType} onChange={(e) => setForm((f) => ({ ...f, reportType: e.target.value as ReportType }))}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-950 bg-white">
                  {(Object.entries(REPORT_TYPE_LABELS) as [ReportType, string][]).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Frequency</label>
                <select value={form.frequency} onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value as Frequency }))}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-950 bg-white">
                  {(Object.entries(FREQ_LABELS) as [Frequency, string][]).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button size="sm" variant="primary" loading={busy}
                disabled={!form.name.trim() || !form.recipientEmails.trim()}
                onClick={createReport}>
                Schedule
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <TableSkeleton headers={["Name", "Type", "Frequency", "Last sent", "Next send", "Status"]} rows={4} />
        ) : reports.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm text-slate-500">No scheduled reports yet.</p>
            {isOwner && <p className="mt-1 text-sm text-slate-400">Create one above to start sending automated reports.</p>}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Frequency</th>
                <th className="px-4 py-3 hidden md:table-cell">Last sent</th>
                <th className="px-4 py-3 hidden md:table-cell">Next send</th>
                <th className="px-4 py-3">Status</th>
                {isOwner && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reports.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-950">{r.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{r.recipientEmails.join(", ")}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{REPORT_TYPE_LABELS[r.reportType] ?? r.reportType}</td>
                  <td className="px-4 py-3"><Badge variant="blue">{FREQ_LABELS[r.frequency] ?? r.frequency}</Badge></td>
                  <td className="px-4 py-3 text-slate-500 hidden md:table-cell">{fmtDate(r.lastSentAt)}</td>
                  <td className="px-4 py-3 text-slate-500 hidden md:table-cell">{fmtDate(r.nextSendAt)}</td>
                  <td className="px-4 py-3">
                    <Badge variant={r.enabled ? "green" : "gray"}>{r.enabled ? "Active" : "Paused"}</Badge>
                  </td>
                  {isOwner && (
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => triggerReport(r.id)}>Run</Button>
                        <Button size="sm" variant="ghost" onClick={() => toggleEnabled(r)}>{r.enabled ? "Pause" : "Resume"}</Button>
                        <Button size="sm" variant="ghost" onClick={() => deleteReport(r.id)}>Delete</Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
