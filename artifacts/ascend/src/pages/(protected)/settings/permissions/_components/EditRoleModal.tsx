
import { useState } from "react";
import type { CustomRole, RoleEntry } from "./permissionsTypes";
import { COLOR_OPTIONS } from "./permissionsTypes";

export function EditRoleModal({
  role,
  onClose,
  onSave,
}: {
  role: RoleEntry;
  onClose: () => void;
  onSave: (patch: Pick<CustomRole, "name" | "description" | "color">) => void;
}) {
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description);
  const [color, setColor] = useState(role.color);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl shadow-2xl" style={{ backgroundColor: "var(--color-surface)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <h2 className="text-base font-semibold" style={{ color: "var(--color-text-primary)" }}>Edit Role</h2>
          <button type="button" onClick={onClose} className="hover:opacity-70" style={{ color: "var(--color-text-muted)" }} aria-label="Close">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm focus:border-brand-600 focus:outline-none"
              style={{ border: "1px solid var(--color-border)" }} />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>Description</label>
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm focus:border-brand-600 focus:outline-none"
              style={{ border: "1px solid var(--color-border)" }} />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>Color</label>
            <div className="flex flex-wrap gap-2">
              {COLOR_OPTIONS.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)}
                  className={`h-7 w-7 rounded-full ${c} ${color === c ? "scale-110 ring-2 ring-brand-600 ring-offset-2" : "hover:scale-105"}`}
                  aria-label={c} />
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3" style={{ borderTop: "1px solid var(--color-border)" }}>
          <button type="button" onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium hover:bg-[var(--color-surface-subtle)]"
            style={{ border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}>
            Cancel
          </button>
          <button type="button" onClick={() => { onSave({ name, description, color }); onClose(); }}
            className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-[#4849d0]">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
