"use client";

/**
 * /imports-exports — File import management and CSV export.
 *
 * Two tabs:
 *  1. Imports — new import form + import history table
 *  2. Exports — export buttons + export history table
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { apiGet, apiPost } from "@/api-client/client";
import { useToast } from "@/components/Toast";

interface ImportBatch {
  id: string;
  import_type: string;
  file_name: string;
  status: "pending" | "processing" | "completed" | "failed";
  total_rows: number;
  success_rows: number;
  failed_rows: number;
  created_at: number;
  completed_at: number | null;
}

interface ExportBatch {
  id: string;
  export_type: string;
  status: "pending" | "processing" | "completed" | "failed";
  total_rows: number;
  file_url: string | null;
  created_at: number;
}

const IMPORT_TYPES = [
  { value: "customers", label: "Customers" },
  { value: "products", label: "Products" },
  { value: "vendors", label: "Vendors" },
  { value: "invoices", label: "Invoices" },
  { value: "purchase_orders", label: "Purchase Orders" },
];

const STATUS_BADGE: Record<string, "yellow" | "blue" | "green" | "red"> = {
  pending: "yellow",
  processing: "blue",
  completed: "green",
  failed: "red",
};

function fmtDate(ms: number | null): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ImportsExportsPage() {
  const { addToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<"imports" | "exports">("imports");

  // Imports state
  const [importBatches, setImportBatches] = useState<ImportBatch[]>([]);
  const [loadingImports, setLoadingImports] = useState(true);
  const [importType, setImportType] = useState("customers");
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);

  // Exports state
  const [exportBatches, setExportBatches] = useState<ExportBatch[]>([]);
  const [loadingExports, setLoadingExports] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);

  const loadImports = useCallback(() => {
    setLoadingImports(true);
    apiGet<{ items: ImportBatch[] }>("/api/v1/sync/import-batches")
      .then(r => setImportBatches(r.items ?? []))
      .catch(() => addToast({ title: "Failed to load import history", variant: "error" }))
      .finally(() => setLoadingImports(false));
  }, [addToast]);

  const loadExports = useCallback(() => {
    setLoadingExports(true);
    apiGet<{ items: ExportBatch[] }>("/api/v1/sync/export-batches")
      .then(r => setExportBatches(r.items ?? []))
      .catch(() => addToast({ title: "Failed to load export history", variant: "error" }))
      .finally(() => setLoadingExports(false));
  }, [addToast]);

  useEffect(() => {
    loadImports();
    loadExports();
  }, [loadImports, loadExports]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setFileName(file.name);
  };

  const handleImport = async () => {
    if (!fileName) {
      addToast({ title: "Please choose a CSV file first", variant: "error" });
      return;
    }
    setImporting(true);
    try {
      await apiPost("/api/v1/sync/import-batches", {
        importType,
        fileName,
      });
      setFileName("");
      if (fileRef.current) fileRef.current.value = "";
      loadImports();
      addToast({ title: "Import queued successfully", variant: "success" });
    } catch (e) {
      addToast({
        title: "Import failed",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      });
    } finally {
      setImporting(false);
    }
  };

  const handleExport = async (exportType: string, url: string) => {
    setExporting(exportType);
    try {
      const token = typeof window !== "undefined"
        ? (localStorage.getItem("access_token") ?? "")
        : "";
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) throw new Error(`Export failed: ${resp.statusText}`);
      const blob = await resp.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `${exportType}-export-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
      loadExports();
      addToast({ title: `${exportType} export started`, variant: "success" });
    } catch (e) {
      addToast({
        title: "Export failed",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      });
    } finally {
      setExporting(null);
    }
  };

  return (
    <EnterpriseShell
      active="imports-exports"
      title="Imports / Exports"
      subtitle="Bulk data movement for catalog, customers, vendors, and inventory"
    >
      <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-5 sm:px-6">

        {/* ── Tab bar ──────────────────────────────────────────────────────── */}
        <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1" style={{ width: "fit-content" }}>
          {(["imports", "exports"] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-md px-5 py-1.5 text-sm font-medium capitalize transition-colors ${
                tab === t
                  ? "bg-white shadow-sm text-slate-900"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* ── Imports tab ──────────────────────────────────────────────────── */}
        {tab === "imports" && (
          <>
            <Card title="New Import">
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                      Import Type
                    </label>
                    <select
                      value={importType}
                      onChange={e => setImportType(e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none"
                    >
                      {IMPORT_TYPES.map(opt => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                      CSV File
                    </label>
                    <div className="flex gap-2">
                      <div
                        className="flex flex-1 cursor-pointer items-center gap-2 rounded-md border border-dashed border-slate-300 px-3 py-2.5 text-sm transition-colors hover:border-slate-400"
                        onClick={() => fileRef.current?.click()}
                      >
                        <svg
                          className="h-4 w-4 shrink-0 text-slate-400"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={1.5}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                          />
                        </svg>
                        <span className={fileName ? "text-slate-800" : "text-slate-400"}>
                          {fileName || "Choose CSV file"}
                        </span>
                      </div>
                      <input
                        ref={fileRef}
                        type="file"
                        accept=".csv"
                        className="hidden"
                        onChange={handleFileChange}
                      />
                      <Button
                        variant="primary"
                        loading={importing}
                        disabled={importing}
                        onClick={() => void handleImport()}
                      >
                        Import
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            <Card title="Import History" noPadding>
              {loadingImports ? (
                <div className="space-y-2 p-4">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-10 animate-pulse rounded bg-slate-100" />
                  ))}
                </div>
              ) : importBatches.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-slate-400">
                  No imports yet.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">File</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Rows</th>
                      <th className="px-4 py-3 hidden md:table-cell">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {importBatches.map(batch => (
                      <tr key={batch.id} className="transition-colors hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <span className="capitalize font-medium text-slate-900">
                            {batch.import_type.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="max-w-[160px] truncate px-4 py-3 text-slate-600">
                          {batch.file_name}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={STATUS_BADGE[batch.status] ?? "gray"}>
                            {batch.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                          {batch.success_rows}/{batch.total_rows}
                          {batch.failed_rows > 0 && (
                            <span className="ml-1 text-xs text-red-500">
                              ({batch.failed_rows} failed)
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500 hidden md:table-cell">
                          {fmtDate(batch.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </>
        )}

        {/* ── Exports tab ──────────────────────────────────────────────────── */}
        {tab === "exports" && (
          <>
            <Card title="Export Data">
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="secondary"
                  loading={exporting === "products"}
                  disabled={!!exporting}
                  onClick={() => void handleExport("products", "/api/v1/catalog/export")}
                >
                  Export Products (CSV)
                </Button>
                <Button
                  variant="secondary"
                  loading={exporting === "customers"}
                  disabled={!!exporting}
                  onClick={() => void handleExport("customers", "/api/v1/customers/export")}
                >
                  Export Customers (CSV)
                </Button>
              </div>
            </Card>

            <Card title="Export History" noPadding>
              {loadingExports ? (
                <div className="space-y-2 p-4">
                  {[...Array(2)].map((_, i) => (
                    <div key={i} className="h-10 animate-pulse rounded bg-slate-100" />
                  ))}
                </div>
              ) : exportBatches.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-slate-400">
                  No exports yet.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right hidden sm:table-cell">Rows</th>
                      <th className="px-4 py-3 hidden md:table-cell">Date</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {exportBatches.map(batch => (
                      <tr key={batch.id} className="transition-colors hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <span className="capitalize font-medium text-slate-900">
                            {batch.export_type.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={STATUS_BADGE[batch.status] ?? "gray"}>
                            {batch.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-700 hidden sm:table-cell">
                          {batch.total_rows.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500 hidden md:table-cell">
                          {fmtDate(batch.created_at)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {batch.file_url && batch.status === "completed" && (
                            <a
                              href={batch.file_url}
                              download
                              className="text-xs font-medium text-brand-600 hover:text-brand-700"
                            >
                              Download
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </>
        )}

      </div>
    </EnterpriseShell>
  );
}
