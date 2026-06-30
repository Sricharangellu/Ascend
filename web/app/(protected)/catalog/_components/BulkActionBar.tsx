"use client";

import { useState } from "react";
import type { Category } from "@/api-client/types";

export function BulkActionBar({
  count, categories, onApply, onClear, loading, error,
}: {
  count: number; categories: Category[];
  onApply: (field: string, value: string) => void;
  onClear: () => void; loading: boolean; error: string | null;
}) {
  const [field, setField] = useState("");
  const [value, setValue] = useState("");

  const VALUE_OPTIONS: Record<string, { value: string; label: string }[]> = {
    status:    [
      { value: "active",   label: "Active" },
      { value: "draft",    label: "Draft" },
      { value: "archived", label: "Archived" },
    ],
    category:  categories.map(c => ({ value: c.name, label: c.name })),
    tax_class: [
      { value: "standard", label: "Standard" },
      { value: "exempt",   label: "Tax exempt" },
    ],
    age_restricted: [
      { value: "true",  label: "Restricted (18+)" },
      { value: "false", label: "Not restricted" },
    ],
  };

  const canApply = field && value && !loading;

  return (
    <div className="border-b border-brand-200 bg-brand-50 px-4 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-brand-800">
          {count} product{count !== 1 ? "s" : ""} selected
        </span>
        <span className="text-brand-300 text-xs">|</span>
        <select
          value={field}
          onChange={e => { setField(e.target.value); setValue(""); }}
          className="rounded-md border border-brand-200 bg-white px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">Set field…</option>
          <option value="status">Status</option>
          <option value="category">Category</option>
          <option value="tax_class">Tax class</option>
          <option value="age_restricted">Age restriction</option>
        </select>
        {field && (
          <select
            value={value}
            onChange={e => setValue(e.target.value)}
            className="rounded-md border border-brand-200 bg-white px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">Choose value…</option>
            {(VALUE_OPTIONS[field] ?? []).map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        )}
        <button
          type="button"
          disabled={!canApply}
          onClick={() => { if (canApply) { onApply(field, value); setValue(""); setField(""); } }}
          className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-40"
        >
          {loading ? "Updating…" : "Apply to selected"}
        </button>
        <button
          type="button"
          onClick={onClear}
          className="ml-auto text-xs font-medium text-brand-700 hover:underline"
        >
          Clear selection
        </button>
      </div>
      {error && <p role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}
