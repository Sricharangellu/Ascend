
import { useCallback, useState } from "react";
import { Card } from "@/components/Card";
import { useQuery } from "@/lib/useQuery";
import { apiDownload, apiGet, ApiResponseError } from "@/api-client/client";
import { hasRole } from "@/lib/auth";

interface BackupStatusResponse {
  backupEnabled: boolean;
  lastSuccessfulBackup: { file: string; bytes: number; at: string } | null;
  schedulerJob: {
    id: string; status: string; attempts: number;
    scheduledAt: string; lastError: string | null;
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
  const rel = hours < 1 ? "less than an hour ago" : hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
  return `${date.toLocaleString()} (${rel})`;
}

export function BackupHealthCard() {
  const isOwner = hasRole("owner");
  const fetchStatus = useCallback(() => apiGet<BackupStatusResponse>("/api/v1/admin/db/backup-status"), []);
  const { data, loading, error } = useQuery("dashboard:backup-status", fetchStatus, { staleMs: 60_000, enabled: isOwner });
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const downloadBackup = async () => {
    setDownloading(true);
    setDownloadError(null);
    try {
      const blob = await apiDownload("/api/v1/admin/db/export", {
        headers: { Accept: "application/sql,application/octet-stream,*/*" },
      });
      const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19) + "Z";
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `ascend-backup-${ts}.sql`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(
        err instanceof ApiResponseError ? err.message : "Backup download failed. Please try again."
      );
    } finally {
      setDownloading(false);
    }
  };

  if (!isOwner) return null;

  const job = data?.schedulerJob ?? null;
  const failed = job?.status === "failed";
  const last = data?.lastSuccessfulBackup ?? null;
  const stale = !!data?.backupEnabled && (!last || Date.now() - new Date(last.at).getTime() > 48 * 3_600_000);
  const healthy = !failed && !stale;

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Last Backup</h2>
        {data && (
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
            healthy ? "bg-emerald-50 text-emerald-700" : "bg-danger-50 text-danger-700"
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${healthy ? "bg-emerald-500" : "bg-danger-500"}`} aria-hidden="true" />
            {failed ? "FAILED" : stale ? "STALE" : "OK"}
          </span>
        )}
      </div>

      {loading && !data ? (
        <p className="py-4 text-center text-[13px]" style={{ color: "var(--color-text-muted)" }}>Checking backup status…</p>
      ) : error ? (
        <p role="alert" className="py-4 text-center text-[13px]" style={{ color: "var(--color-text-muted)" }}>
          Backup status unavailable: {error}
        </p>
      ) : !data ? null : (
        <dl className="space-y-2 text-[13px]">
          <div className="flex items-center justify-between gap-3">
            <dt style={{ color: "var(--color-text-secondary)" }}>Last successful backup</dt>
            <dd className="text-right font-medium" style={{ color: "var(--color-text-primary)" }}>
              {last ? formatWhen(last.at) : "Never"}
            </dd>
          </div>
          {last && (
            <div className="flex items-center justify-between gap-3">
              <dt style={{ color: "var(--color-text-secondary)" }}>File size</dt>
              <dd className="font-mono" style={{ color: "var(--color-text-primary)" }}>{formatBytes(last.bytes)}</dd>
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <dt style={{ color: "var(--color-text-secondary)" }}>Scheduler</dt>
            <dd className={`font-medium ${failed ? "text-danger-700" : ""}`}
              style={!failed ? { color: "var(--color-text-primary)" } : {}}>
              {!data.backupEnabled ? "Disabled" : job
                ? `${job.status}${job.attempts > 1 ? ` (${job.attempts} attempts)` : ""}`
                : "No backup job scheduled yet"}
            </dd>
          </div>
          {failed && job?.lastError && (
            <p className="mt-2 rounded-lg border border-danger-100 bg-danger-50 px-3 py-2 text-[11px] text-danger-700">
              {job.lastError}
            </p>
          )}
        </dl>
      )}

      <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--color-border)" }}>
        <button
          type="button"
          onClick={() => void downloadBackup()}
          disabled={downloading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-text-primary)",
            backgroundColor: "var(--color-surface)",
          }}
        >
          {downloading ? "Preparing backup…" : "Download backup"}
        </button>
        {downloadError && (
          <p role="alert" className="mt-2 rounded-lg border border-danger-100 bg-danger-50 px-3 py-2 text-[11px] text-danger-700">
            {downloadError}
          </p>
        )}
      </div>
    </Card>
  );
}
