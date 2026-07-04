"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, ApiResponseError } from "@/api-client/client";

type DocType =
  | "spec_sheet" | "msds" | "certificate" | "invoice" | "purchase_order"
  | "agreement" | "compliance" | "policy" | "template" | "report" | "other";

interface TypeStat {
  key: DocType;
  label: string;
  count: number;
}

type DocStatus = "active" | "archived" | "draft" | "expired";

interface Doc {
  id: string;
  name: string;
  type: DocType;
  status: DocStatus;
  file_name: string;
  file_size_bytes: number;
  uploaded_by: string;
  uploaded_at: number;
  expires_at: number | null;
  tags: string[];
  version: number;
  description: string | null;
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const TYPE_ICONS: Record<string, string> = {
  spec_sheet: "📄",
  msds: "⚠️",
  certificate: "🏅",
  invoice: "🧾",
  purchase_order: "📦",
  agreement: "🤝",
  compliance: "✅",
  policy: "📋",
  template: "📝",
  report: "📊",
  other: "📁",
};

export function ByTypeTab() {
  const [types, setTypes] = useState<TypeStat[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [activeType, setActiveType] = useState<DocType | null>(null);
  const [loading, setLoading] = useState(true);
  const [docsLoading, setDocsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTypes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{ types: TypeStat[] }>("/api/v1/documents/types");
      const nonEmpty = data.types.filter((t) => t.count > 0);
      setTypes(nonEmpty);
      if (nonEmpty.length > 0 && activeType === null) {
        setActiveType(nonEmpty[0].key);
      }
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDocs = useCallback(async (type: DocType) => {
    setDocsLoading(true);
    try {
      const data = await apiGet<{ items: Doc[]; total: number }>(
        `/api/v1/documents?type=${type}`
      );
      setDocs(data.items);
    } catch {
      setDocs([]);
    } finally {
      setDocsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTypes();
  }, [loadTypes]);

  useEffect(() => {
    if (activeType) loadDocs(activeType);
  }, [activeType, loadDocs]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-slate-400">
        Loading…
      </div>
    );
  }

  if (error) {
    return <p role="alert" className="text-sm text-red-700">{error}</p>;
  }

  const activeLabel = types.find((t) => t.key === activeType)?.label ?? "";

  return (
    <div className="flex gap-5">
      {/* Type sidebar */}
      <nav className="w-52 shrink-0">
        <ul className="space-y-1">
          {types.map((t) => (
            <li key={t.key}>
              <button
                type="button"
                onClick={() => setActiveType(t.key)}
                className={[
                  "flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors",
                  activeType === t.key
                    ? "bg-indigo-50 font-semibold text-indigo-700"
                    : "text-slate-700 hover:bg-slate-100",
                ].join(" ")}
              >
                <span className="flex items-center gap-2">
                  <span aria-hidden="true">{TYPE_ICONS[t.key] ?? "📄"}</span>
                  {t.label}
                </span>
                <span
                  className={[
                    "rounded-full px-2 py-0.5 text-xs font-medium",
                    activeType === t.key
                      ? "bg-indigo-100 text-indigo-700"
                      : "bg-slate-100 text-slate-500",
                  ].join(" ")}
                >
                  {t.count}
                </span>
              </button>
            </li>
          ))}
          {types.length === 0 && (
            <li className="px-3 py-2 text-sm text-slate-400">No documents</li>
          )}
        </ul>
      </nav>

      {/* Doc list */}
      <div className="min-w-0 flex-1">
        {activeType && (
          <h3 className="mb-3 text-sm font-semibold text-slate-700">{activeLabel}</h3>
        )}
        {docsLoading ? (
          <div className="py-8 text-center text-sm text-slate-400">Loading…</div>
        ) : docs.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-400">No documents in this category</div>
        ) : (
          <ul className="space-y-2">
            {docs.map((doc) => (
              <li
                key={doc.id}
                className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3 hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{doc.name}</p>
                  <p className="text-xs text-slate-400">
                    {doc.file_name} · {formatBytes(doc.file_size_bytes)} · v{doc.version}
                  </p>
                  {doc.tags.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {doc.tags.slice(0, 4).map((t) => (
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
                <div className="shrink-0 text-right">
                  <p className="text-xs text-slate-500">{doc.uploaded_by}</p>
                  <p className="text-xs text-slate-400">{fmtDate(doc.uploaded_at)}</p>
                  {doc.expires_at && (
                    <p className="text-xs text-amber-600">Exp {fmtDate(doc.expires_at)}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
