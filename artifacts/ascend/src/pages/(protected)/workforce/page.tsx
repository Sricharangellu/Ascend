
import { useState, useEffect, useCallback } from "react";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { Button } from "@/components/Button";
import { apiGet, apiPatch } from "@/api-client/client";
import type { Employee, Shift, ShiftsResponse, TimeOffRequest, ShiftRole, TimeOffStatus } from "@/api-client/types";
import { clsx } from "clsx";
import { ShiftModal } from "./_components/ShiftModal";
import { ScheduleGrid } from "./_components/ScheduleGrid";
import { TimeOffPanel } from "./_components/TimeOffPanel";
import { mondayOf, isoDate, weekDates, fmtWeekRange, ROLE_COLORS, ROLE_LABELS } from "./_components/workforceTypes";

export default function WorkforcePage() {
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts]       = useState<Shift[]>([]);
  const [timeOff, setTimeOff]     = useState<TimeOffRequest[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]     = useState<Shift | null>(null);
  const [prefillDate, setPrefillDate]         = useState<string | undefined>();
  const [prefillEmployee, setPrefillEmployee] = useState<string | undefined>();

  const dates = weekDates(weekStart);
  const dateFrom = isoDate(dates[0]!);
  const dateTo   = isoDate(dates[6]!);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [empData, shiftData, toData] = await Promise.all([
        apiGet<{ items: Employee[] }>("/api/v1/workforce/employees"),
        apiGet<ShiftsResponse>(`/api/v1/workforce/shifts?date_from=${dateFrom}&date_to=${dateTo}`),
        apiGet<{ items: TimeOffRequest[] }>("/api/v1/workforce/time-off"),
      ]);
      setEmployees(empData.items);
      setShifts(shiftData.items);
      setTimeOff(toData.items);
    } finally { setLoading(false); }
  }, [dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  function openNew(date: string, empId: string) {
    setPrefillDate(date); setPrefillEmployee(empId); setEditing(null); setShowModal(true);
  }

  function openEdit(sh: Shift) {
    setEditing(sh); setPrefillDate(undefined); setPrefillEmployee(undefined); setShowModal(true);
  }

  function handleSaved(sh: Shift) {
    setShifts((prev) => {
      const idx = prev.findIndex((s) => s.id === sh.id);
      return idx === -1 ? [...prev, sh] : prev.map((s) => s.id === sh.id ? sh : s);
    });
    setShowModal(false);
  }

  function handleDeleted(id: string) {
    setShifts((prev) => prev.filter((s) => s.id !== id));
    setShowModal(false);
  }

  async function handleTimeOffStatus(id: string, status: TimeOffStatus) {
    try {
      const updated = await apiPatch<TimeOffRequest>(`/api/v1/workforce/time-off/${id}`, { status });
      setTimeOff((prev) => prev.map((r) => r.id === id ? updated : r));
    } catch { /* ignore */ }
  }

  function prevWeek() { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d); }
  function nextWeek() { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d); }
  function goToday()  { setWeekStart(mondayOf(new Date())); }

  const totalHours = shifts.reduce((sum, s) => {
    const [sh, sm] = s.start_time.split(":").map(Number);
    const [eh, em] = s.end_time.split(":").map(Number);
    return sum + ((eh! * 60 + em!) - (sh! * 60 + sm!)) / 60;
  }, 0);

  const pendingCount = timeOff.filter((r) => r.status === "pending").length;

  return (
    <EnterpriseShell active="workforce" title="Workforce" subtitle="Employee scheduling and time-off management">
      <div className="p-6 space-y-5">

        {/* Stat row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Employees",       value: employees.length,            color: "border-[var(--color-border)]" },
            { label: "Shifts This Week", value: shifts.length,               color: "border-blue-400" },
            { label: "Hours Scheduled",  value: `${totalHours.toFixed(0)}h`, color: "border-emerald-400" },
            { label: "Pending Requests", value: pendingCount,                color: "border-amber-400" },
          ].map((c) => (
            <div key={c.label} className={clsx("rounded-xl border-l-4 p-4 shadow-sm", c.color)} style={{ backgroundColor: "var(--color-surface)" }}>
              <p className="text-xs uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>{c.label}</p>
              <p className="text-2xl font-bold mt-1" style={{ color: "var(--color-text-primary)" }}>{c.value}</p>
            </div>
          ))}
        </div>

        {/* Schedule grid card */}
        <div className="rounded-xl shadow-sm overflow-hidden" style={{ backgroundColor: "var(--color-surface)", borderWidth: 1, borderStyle: "solid", borderColor: "var(--color-border)" }}>
          {/* Toolbar */}
          <div className="flex items-center justify-between px-5 py-3" style={{ borderBottomWidth: 1, borderBottomStyle: "solid", borderColor: "var(--color-border)" }}>
            <div className="flex items-center gap-2">
              <button onClick={prevWeek} className="p-1.5 rounded hover:bg-[var(--color-surface-subtle)] transition-colors" style={{ color: "var(--color-text-muted)" }} aria-label="Previous week">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <span className="text-sm font-semibold min-w-[180px] text-center" style={{ color: "var(--color-text-secondary)" }}>{fmtWeekRange(weekStart)}</span>
              <button onClick={nextWeek} className="p-1.5 rounded hover:bg-[var(--color-surface-subtle)] transition-colors" style={{ color: "var(--color-text-muted)" }} aria-label="Next week">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
              <button onClick={goToday} className="ml-1 text-xs px-2.5 py-1 rounded hover:bg-[var(--color-surface-subtle)] transition-colors" style={{ borderWidth: 1, borderStyle: "solid", borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}>Today</button>
            </div>
            <div className="hidden sm:flex items-center gap-3 text-xs">
              {(Object.keys(ROLE_COLORS) as ShiftRole[]).map((r) => (
                <span key={r} className={clsx("px-2 py-0.5 rounded font-medium", ROLE_COLORS[r].bg, ROLE_COLORS[r].text)}>
                  {ROLE_LABELS[r]}
                </span>
              ))}
            </div>
            <Button variant="primary" size="sm" onClick={() => { setEditing(null); setPrefillDate(isoDate(new Date())); setPrefillEmployee(employees[0]?.id); setShowModal(true); }}>
              + Add Shift
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-60 text-sm" style={{ color: "var(--color-text-muted)" }}>Loading schedule…</div>
          ) : (
            <ScheduleGrid employees={employees} shifts={shifts} dates={dates} onCellClick={openNew} onShiftClick={openEdit} />
          )}
        </div>

        <TimeOffPanel requests={timeOff} onUpdateStatus={handleTimeOffStatus} />
      </div>

      {showModal && (
        <ShiftModal
          employees={employees}
          shift={editing}
          prefillDate={prefillDate}
          prefillEmployee={prefillEmployee}
          onClose={() => setShowModal(false)}
          onSaved={handleSaved}
          onDeleted={editing ? handleDeleted : undefined}
        />
      )}
    </EnterpriseShell>
  );
}
