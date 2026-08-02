
import { useCallback } from "react";
import { Card } from "@/components/Card";
import { useQuery } from "@/lib/useQuery";
import { apiGet } from "@/api-client/client";
import { hasRole } from "@/lib/auth";

interface BackupStatusResponse {
  backupEnabled: boolean;
  lastSuccessfulBackup: { file: string; bytes: number; at: string } | null;
  schedulerJob: {
    id: string;
    status: string;
    attempts: number;
    scheduledAt: string;
    lastError: string | null;
  } | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const diffMs = Date.now() - date.getTime();
  const hours = Math.floor(diffMs / 3_600_000);
  const rel =
    hours < 1 ? "less than an hour ago"
    : hours < 24 ? `${hours}h ago`
    : `${Math.floor(hours / 24)}d ago`;
  return `${date.toLocaleString()} (${rel})`;
}

/**
 * Owner-only "Last backup" health card (dashboard operational section).
 * Surfaces backup-scheduler failures that would otherwise only appear in email.
 */
export function BackupHealthCard() {
  const isOwner = hasRole("owner");
  const fetchStatus = useCallback(
    () => apiGet<BackupStatusResponse>("/api/v1/admin/db/backup-status"),
    [],
  );
  const { data, loading, error } = useQuery(
    "dashboard:backup-status",
    fetchStatus,
    { staleMs: 60_000, enabled: isOwner },
  );

  if (!isOwner) return null;

  const job = data?.schedulerJob ?? null;
  const failed = job?.status === "failed";
  // A backup older than 48h with backups enabled is also a problem worth flagging.
  const last = data?.lastSuccessfulBackup ?? null;
  const stale =
    !!data?.backupEnabled &&
    (!last || Date.now() - new Date(last.at).getTime() > 48 * 3_600_000);
  const healthy = !failed && !stale;

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Last Backup</h2>
        {data && (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              healthy ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${healthy ? "bg-emerald-500" : "bg-red-500"}`}
              aria-hidden="true"
            />
            {failed ? "FAILED" : stale ? "STALE" : "OK"}
          </span>
        )}
      </div>

      {loading && !data ? (
        <p className="py-4 text-center text-sm text-slate-400">Checking backup status…</p>
      ) : error ? (
        <p role="alert" className="py-4 text-center text-sm text-slate-400">
          Backup status unavailable: {error}
        </p>
      ) : !data ? null : (
        <dl className="space-y-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-slate-500">Last successful backup</dt>
            <dd className="text-right font-medium text-slate-900">
              {last ? formatWhen(last.at) : "Never"}
            </dd>
          </div>
          {last && (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500">File size</dt>
              <dd className="font-mono text-slate-900">{formatBytes(last.bytes)}</dd>
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <dt className="text-slate-500">Scheduler</dt>
            <dd className={`font-medium ${failed ? "text-red-700" : "text-slate-900"}`}>
              {!data.backupEnabled
                ? "Disabled"
                : job
                  ? `${job.status}${job.attempts > 1 ? ` (${job.attempts} attempts)` : ""}`
                  : "No backup job scheduled yet"}
            </dd>
          </div>
          {failed && job?.lastError && (
            <p className="mt-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
              {job.lastError}
            </p>
          )}
        </dl>
      )}
    </Card>
  );
}
