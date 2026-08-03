"use client";

import React, { useState } from "react";
import { Button } from "@/components/Button";
import { apiPost, apiPatch, apiDelete } from "@/api-client/client";
import type { Employee, Shift, ShiftRole } from "@/api-client/types";
import { ROLE_LABELS, isoDate } from "./workforceTypes";

export interface ShiftModalProps {
  employees: Employee[];
  shift: Shift | null;
  prefillDate?: string;
  prefillEmployee?: string;
  onClose: () => void;
  onSaved: (s: Shift) => void;
  onDeleted?: (id: string) => void;
}

export function ShiftModal({ employees, shift, prefillDate, prefillEmployee, onClose, onSaved, onDeleted }: ShiftModalProps) {
  const [employeeId, setEmployeeId] = useState(shift?.employee_id ?? prefillEmployee ?? employees[0]?.id ?? "");
  const [date, setDate]             = useState(shift?.date       ?? prefillDate       ?? isoDate(new Date()));
  const [startTime, setStartTime]   = useState(shift?.start_time ?? "09:00");
  const [endTime, setEndTime]       = useState(shift?.end_time   ?? "17:00");
  const [notes, setNotes]           = useState(shift?.notes      ?? "");
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!employeeId || !date) return;
    setSaving(true); setError(null);
    try {
      const payload = { employee_id: employeeId, date, start_time: startTime, end_time: endTime, notes: notes.trim() || null };
      const saved = shift
        ? await apiPatch<Shift>(`/api/v1/workforce/shifts/${shift.id}`, payload)
        : await apiPost<Shift>("/api/v1/workforce/shifts", payload);
      onSaved(saved);
    } catch {
      setError("Failed to save shift. Please try again.");
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!shift || !onDeleted) return;
    setSaving(true);
    try {
      await apiDelete(`/api/v1/workforce/shifts/${shift.id}`);
      onDeleted(shift.id);
    } catch {
      setError("Failed to delete shift.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">{shift ? "Edit Shift" : "Add Shift"}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
        </div>
        <form id="shift-form" onSubmit={submit} className="p-6 space-y-4">
          {error && <div role="alert" className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Employee <span className="text-red-500">*</span></label>
            <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.name} — {ROLE_LABELS[emp.role as ShiftRole]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Date <span className="text-red-500">*</span></label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Start Time</label>
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">End Time</label>
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional note…"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </form>
        <div className="px-6 pb-5 flex items-center justify-between">
          <div>
            {shift && onDeleted && (
              <Button variant="danger" onClick={handleDelete} disabled={saving} size="sm">Delete</Button>
            )}
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button variant="primary" type="submit" form="shift-form" disabled={saving}>
              {saving ? "Saving…" : shift ? "Update" : "Add Shift"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
