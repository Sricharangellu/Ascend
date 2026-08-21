
export function FieldInput({
  label, value, onChange, type = "text", placeholder, readOnly, inputMode, maxLength,
}: {
  label: string; value: string; onChange?: (v: string) => void;
  type?: string; placeholder?: string; readOnly?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]; maxLength?: number;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        placeholder={placeholder}
        readOnly={readOnly}
        inputMode={inputMode}
        maxLength={maxLength}
        className={`w-full rounded-lg border px-3 py-2 text-sm focus:border-brand-600 focus:outline-none ${readOnly ? "text-[var(--color-text-muted)]" : ""}`}
        style={{ borderColor: "var(--color-border)", ...(readOnly ? { backgroundColor: "var(--color-surface-subtle)" } : {}) }}
      />
    </div>
  );
}

export function FieldSelect({
  label, value, onChange, children,
}: {
  label: string; value: string; onChange: (v: string) => void; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border px-3 py-2 text-sm focus:border-brand-600 focus:outline-none"
        style={{ borderColor: "var(--color-border)" }}
      >
        {children}
      </select>
    </div>
  );
}
