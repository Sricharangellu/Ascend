"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiDelete, ApiResponseError } from "@/api-client/client";
import { Badge, BadgeVariant } from "@/components/Badge";
import { Button } from "@/components/Button";
import { fmtDate, fmtDateTime } from "@/lib/date";

type DocStatus = "active" | "archived" | "draft" | "expired";
type DocType =
  | "spec_sheet" | "msds" | "certificate" | "invoice" | "purchase_order"
  | "agreement" | "compliance" | "policy" | "template" | "report" | "other";

interface Doc {
  id: string;
  name: string;
  type: DocType;
  status: DocStatus;
  file_name: string;
  file_size_bytes: number;
  mime_type: string;
  linked_entity_type: string | null;
  linked_entity_name: string | null;
  uploaded_by: string;
  uploaded_at: number;
  expires_at: number | null;
  tags: string[];
  version: number;
  description: string | null;
}

const STATUS_BADGE: Record<DocStatus, BadgeVariant> = {
  active: "green",
  archived: "gray",
  draft: "yellow",
  expired: "red",
};

const TYPE_LABELS: Record<DocType, string> = {
  spec_sheet: "Spec Sheet",
  msds: "Safety Data Sheet",
  certificate: "Certificate",
  invoice: "Invoice",
  purchase_order: "Purchase Order",
  agreement: "Agreement",
  compliance: "Compliance",
  policy: "Policy",
  template: "Template",
  report: "Report",
  other: "Other",
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

interface Props {
  refreshKey?: number;
  onUpload?: () => void;
}

export function AllDocumentsTab({ refreshKey = 0, onUpload }: Props) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("active");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Doc | null>(null);
  const [archiving, setArchiving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filterType !== "all") params.set("type", filterType);
      if (filterStatus !== "all") params.set("status", filterStatus);
      if (q) params.set("q", q);
      const data = await apiGet<{ items: Doc[]; total: number }>(
        `/api/v1/documents?${params}`
      );
      setDocs(data.items);
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : "Failed to load documents.");
    } finally {
      setLoading(false);
    }
  }, [filterType, filterStatus, q, refreshKey]);

  useEffect(() => {
    load();
  }, [load]);

  async function archive(doc: Doc) {
    if (!confirm(`Archive "${doc.name}"? It will be hidden from active views.`)) return;
    setArchiving(doc.id);
    try {
      await apiDelete(`/api/v1/documents/${doc.id}`);
      setDocs((prev) => prev.filter((d) => d.id !== doc.id));
      if (selected?.id === doc.id) setSelected(null);
    } catch {
      // silently fail — user can retry
    } finally {
      setArchiving(null);
    }
  }

  const isExpiringSoon = (doc: Doc) =>
    doc.expires_at !== null && doc.expires_at - Date.now() < 30 * 86_400_000;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder="Search documents…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-8 w-56 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="h-8 rounded-lg border border-slate-200 px-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="all">All types</option>
          {(Object.keys(TYPE_LABELS) as DocType[]).map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="h-8 rounded-lg border border-slate-200 px-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="expired">Expired</option>
          <option value="archived">Archived</option>
        </select>
        <div className="ml-auto">
          <Button variant="primary" onClick={onUpload}>
            + Upload Document
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-sm text-slate-400">
          Loading…
        </div>
      ) : docs.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-slate-400">
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <p className="text-sm">No documents found</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-medium text-slate-500">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Size</th>
                <th className="px-4 py-3">Uploaded by</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Expires</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {docs.map((doc) => (
                <tr
                  key={doc.id}
                  className="cursor-pointer transition-colors hover:bg-slate-50"
                  onClick={() => setSelected(doc)}
                >
                  <td className="max-w-xs px-4 py-3">
                    <div className="flex items-start gap-2">
                      <FileIcon mime={doc.mime_type} />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900">{doc.name}</p>
                        <p className="truncate text-xs text-slate-400">{doc.file_name}</p>
                        {doc.tags.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {doc.tags.slice(0, 3).map((t) => (
                              <span
                                key={t}
                                className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {TYPE_LABELS[doc.type]}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                    {formatBytes(doc.file_size_bytes)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {doc.uploaded_by}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                    {fmtDate(doc.uploaded_at)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {doc.expires_at ? (
                      <span
                        className={
                          isExpiringSoon(doc) ? "font-medium text-amber-700" : "text-slate-500"
                        }
                      >
                        {fmtDate(doc.expires_at)}
                        {isExpiringSoon(doc) && " ⚠"}
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <Badge variant={STATUS_BADGE[doc.status]}>{doc.status}</Badge>
                  </td>
                  <td
                    className="px-4 py-3 text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {doc.status !== "archived" && (
                      <button
                        onClick={() => archive(doc)}
                        disabled={archiving === doc.id}
                        className="text-xs text-slate-400 hover:text-red-600 disabled:opacity-50"
                        aria-label={`Archive ${doc.name}`}
                      >
                        Archive
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail drawer */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-end bg-black/30 sm:items-stretch"
          onClick={() => setSelected(null)}
        >
          <div
            className="w-full max-w-md overflow-y-auto rounded-t-2xl bg-white shadow-xl sm:rounded-none sm:rounded-l-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-900">{selected.name}</h2>
              <button
                onClick={() => setSelected(null)}
                className="text-slate-400 hover:text-slate-600"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="space-y-4 px-5 py-5">
              <div className="flex items-center gap-2">
                <Badge variant={STATUS_BADGE[selected.status]}>{selected.status}</Badge>
                <span className="text-xs text-slate-400">v{selected.version}</span>
              </div>
              {selected.description && (
                <p className="text-sm text-slate-600">{selected.description}</p>
              )}
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <dt className="text-slate-500">Type</dt>
                <dd className="text-slate-900">{TYPE_LABELS[selected.type]}</dd>
                <dt className="text-slate-500">File</dt>
                <dd className="truncate text-slate-900">{selected.file_name}</dd>
                <dt className="text-slate-500">Size</dt>
                <dd className="text-slate-900">{formatBytes(selected.file_size_bytes)}</dd>
                <dt className="text-slate-500">Uploaded by</dt>
                <dd className="text-slate-900">{selected.uploaded_by}</dd>
                <dt className="text-slate-500">Uploaded</dt>
                <dd className="text-slate-900">{fmtDateTime(selected.uploaded_at)}</dd>
                {selected.expires_at && (
                  <>
                    <dt className="text-slate-500">Expires</dt>
                    <dd
                      className={
                        isExpiringSoon(selected)
                          ? "font-medium text-amber-700"
                          : "text-slate-900"
                      }
                    >
                      {fmtDate(selected.expires_at)}
                      {isExpiringSoon(selected) && " — expiring soon"}
                    </dd>
                  </>
                )}
                {selected.linked_entity_name && (
                  <>
                    <dt className="text-slate-500">Linked to</dt>
                    <dd className="text-slate-900">
                      {selected.linked_entity_type}: {selected.linked_entity_name}
                    </dd>
                  </>
                )}
              </dl>
              {selected.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {selected.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FileIcon({ mime }: { mime: string }) {
  const color =
    mime.includes("pdf")
      ? "text-red-500"
      : mime.includes("sheet") || mime.includes("csv")
      ? "text-green-600"
      : mime.includes("word") || mime.includes("document")
      ? "text-blue-600"
      : "text-slate-400";

  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`mt-0.5 shrink-0 ${color}`}
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}
