
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

  const selectCls = "h-7 rounded-lg border px-2 text-[12px] outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500";
  const selectStyle = { borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" };

  return (
    <div className="border-b px-4 py-2"
      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-primary-subtle)" }}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold text-brand-700">
          {count} product{count !== 1 ? "s" : ""} selected
        </span>
        <span className="text-[11px] text-brand-300">|</span>
        <select value={field} onChange={(e) => { setField(e.target.value); setValue(""); }}
          className={selectCls} style={selectStyle}>
          <option value="">Set field…</option>
          <option value="status">Status</option>
          <option value="category">Category</option>
          <option value="tax_class">Tax class</option>
          <option value="age_restricted">Age restriction</option>
        </select>
        {field && (
          <select value={value} onChange={(e) => setValue(e.target.value)}
            className={selectCls} style={selectStyle}>
            <option value="">Choose value…</option>
            {(VALUE_OPTIONS[field] ?? []).map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        )}
        <button type="button" disabled={!canApply}
          onClick={() => { if (canApply) { onApply(field, value); setValue(""); setField(""); } }}
          className="h-7 rounded-lg bg-brand-600 px-3 text-[12px] font-medium text-white hover:bg-brand-700 disabled:opacity-40">
          {loading ? "Updating…" : "Apply to selected"}
        </button>
        <button type="button" onClick={onClear}
          className="ml-auto text-[12px] font-medium text-brand-600 hover:underline">
          Clear selection
        </button>
      </div>
      {error && <p role="alert" className="mt-1 text-[11px]" style={{ color: "var(--color-danger-text)" }}>{error}</p>}
    </div>
  );
}
