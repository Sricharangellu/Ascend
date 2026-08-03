"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, ApiResponseError } from "@/api-client/client";
import { fmtDate } from "@/lib/date";

type DocType =
  | "spec_sheet" | "msds" | "certificate" | "invoice" | "purchase_order"
  | "agreement" | "compliance" | "policy" | "template" | "report" | "other";

interface DocTemplate {
  id: string;
  name: string;
  type: DocType;
  description: string;
  file_name: string;
  uses: number;
  created_at: number;
}

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

const TYPE_COLORS: Record<string, string> = {
  agreement: "bg-purple-50 text-purple-700",
  purchase_order: "bg-blue-50 text-blue-700",
  spec_sheet: "bg-indigo-50 text-indigo-700",
  compliance: "bg-green-50 text-green-700",
  policy: "bg-amber-50 text-amber-700",
};

function typeColor(t: DocType): string {
  return TYPE_COLORS[t] ?? "bg-slate-50 text-slate-700";
}

export function TemplatesTab() {
  const [templates, setTemplates] = useState<DocTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{ items: DocTemplate[] }>("/api/v1/documents/templates");
      setTemplates(data.items);
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : "Failed to load templates.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Reusable document templates — download and fill to create new documents.
        </p>
      </div>

      {templates.length === 0 ? (
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
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
          <p className="text-sm">No templates yet</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((tpl) => (
            <div
              key={tpl.id}
              className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 leading-snug">
                    {tpl.name}
                  </p>
                </div>
                <span
                  className={[
                    "shrink-0 rounded-md px-2 py-0.5 text-xs font-medium",
                    typeColor(tpl.type),
                  ].join(" ")}
                >
                  {TYPE_LABELS[tpl.type]}
                </span>
              </div>

              <p className="text-xs text-slate-500 leading-relaxed">{tpl.description}</p>

              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>{tpl.file_name}</span>
                <span>{tpl.uses} uses</span>
              </div>

              <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                <span className="text-xs text-slate-400">
                  Added {fmtDate(tpl.created_at)}
                </span>
                <button
                  type="button"
                  className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-indigo-300 hover:text-indigo-700 transition-colors"
                  onClick={() => {
                    // In production this would trigger a real download
                    alert(`Downloading ${tpl.file_name}…`);
                  }}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Download
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
