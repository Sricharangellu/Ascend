
import { useState } from "react";
import { apiPost, ApiResponseError } from "@/api-client/client";
import { FieldInput, FieldSelect } from "./TeamFormFields";
import { ROLES, ROLE_LABELS, DEPT_OPTIONS, type RoleId, type EmploymentType } from "./teamTypes";

interface Props {
  onClose: () => void;
  onAdded: () => void;
}

export function AddEmployeeModal({ onClose, onAdded }: Props) {
  const [form, setForm] = useState({
    name: "", email: "", phone: "", role: "cashier" as RoleId,
    department: "", employment_type: "full_time" as EmploymentType,
    hourly_rate: "", pin: "", hire_date: new Date().toISOString().split("T")[0] ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.email.trim()) {
      setError("Name and email are required.");
      return;
    }
    setSaving(true); setError(null);
    try {
      await apiPost("/api/v1/team", {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        role: form.role,
        department: form.department || null,
        employment_type: form.employment_type,
        hourly_rate_cents: form.hourly_rate ? Math.round(parseFloat(form.hourly_rate) * 100) : null,
        pin: form.pin || null,
        hire_date: form.hire_date ? new Date(form.hire_date).getTime() : Date.now(),
      });
      onAdded();
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : "Failed to add employee.");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl shadow-2xl" style={{ backgroundColor: "var(--color-surface)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--color-border)" }}>
          <h2 className="text-base font-semibold" style={{ color: "var(--color-text-primary)" }}>Add Employee</h2>
          <button type="button" onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]" aria-label="Close">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
          {error && (
            <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <FieldInput label="Full Name *" value={form.name} onChange={(v) => set("name", v)} placeholder="Jane Smith" />
            <FieldInput label="Email *" type="email" value={form.email} onChange={(v) => set("email", v)} placeholder="jane@company.com" />
            <FieldInput label="Phone" type="tel" value={form.phone} onChange={(v) => set("phone", v)} placeholder="555-0100" />
            <FieldSelect label="Role" value={form.role} onChange={(v) => set("role", v)}>
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </FieldSelect>
            <FieldSelect label="Department" value={form.department} onChange={(v) => set("department", v)}>
              <option value="">— None —</option>
              {DEPT_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
            </FieldSelect>
            <FieldSelect label="Employment Type" value={form.employment_type} onChange={(v) => set("employment_type", v)}>
              <option value="full_time">Full-time</option>
              <option value="part_time">Part-time</option>
              <option value="contractor">Contractor</option>
            </FieldSelect>
            <FieldInput label="Hourly Rate ($)" type="number" value={form.hourly_rate} onChange={(v) => set("hourly_rate", v)} placeholder="18.00" />
            <FieldInput label="Hire Date" type="date" value={form.hire_date} onChange={(v) => set("hire_date", v)} />
            <FieldInput
              label="Clock-in PIN" type="password" inputMode="numeric" maxLength={6}
              value={form.pin} onChange={(v) => set("pin", v.replace(/\D/g, ""))}
              placeholder="4–6 digits"
            />
          </div>
          <p className="mt-2 text-xs" style={{ color: "var(--color-text-muted)" }}>PIN is used by the employee to clock in and out at the terminal.</p>
        </div>

        <div className="flex justify-end gap-2 border-t px-5 py-3" style={{ borderColor: "var(--color-border)" }}>
          <button type="button" onClick={onClose}
            className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-[var(--color-surface-subtle)]"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}>
            Cancel
          </button>
          <button type="button" onClick={() => void handleSubmit()} disabled={saving}
            className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-[#4849d0] disabled:opacity-40">
            {saving ? "Adding…" : "Add Employee"}
          </button>
        </div>
      </div>
    </div>
  );
}
