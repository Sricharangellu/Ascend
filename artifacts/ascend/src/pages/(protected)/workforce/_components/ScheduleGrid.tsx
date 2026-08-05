
import { clsx } from "clsx";
import { fmtDateShort } from "@/lib/date";
import type { Employee, Shift, ShiftRole } from "@/api-client/types";
import { DAYS, ROLE_COLORS, ROLE_LABELS, isoDate, isToday } from "./workforceTypes";

export function ScheduleGrid({
  employees,
  shifts,
  dates,
  onCellClick,
  onShiftClick,
}: {
  employees: Employee[];
  shifts: Shift[];
  dates: Date[];
  onCellClick: (date: string, employeeId: string) => void;
  onShiftClick: (shift: Shift) => void;
}) {
  function shiftsFor(empId: string, date: Date): Shift[] {
    const d = isoDate(date);
    return shifts.filter((s) => s.employee_id === empId && s.date === d);
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse min-w-[900px]">
        <thead>
          <tr style={{ backgroundColor: "var(--color-table-header)" }}>
            <th className="text-left px-4 py-3 text-sm font-semibold z-10 sticky left-0" style={{ color: "var(--color-text-secondary)", borderBottomWidth: 1, borderBottomStyle: "solid", borderColor: "var(--color-border)", backgroundColor: "var(--color-table-header)", width: "10rem" }}>
              Employee
            </th>
            {dates.map((d, i) => (
              <th key={i} className={clsx(
                "text-center py-3 px-2 text-sm font-semibold min-w-[110px]",
                isToday(d) ? "bg-blue-50 text-blue-700" : ""
              )}
              style={isToday(d) ? { borderBottomWidth: 1, borderBottomStyle: "solid", borderColor: "var(--color-border)" } : { borderBottomWidth: 1, borderBottomStyle: "solid", borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}>
                <div>{DAYS[i]}</div>
                <div className={clsx("text-xs font-normal mt-0.5", isToday(d) ? "text-blue-500" : "")}
                  style={isToday(d) ? undefined : { color: "var(--color-text-muted)" }}>
                  {fmtDateShort(d.getTime())}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {employees.map((emp) => (
            <tr key={emp.id} className="group hover:bg-[var(--color-surface-subtle)]/50" style={{ borderBottomWidth: 1, borderBottomStyle: "solid", borderColor: "var(--color-border)" }}>
              <td className="px-4 py-3 sticky left-0 z-10 group-hover:bg-[var(--color-surface-subtle)]/50" style={{ backgroundColor: "var(--color-surface)", borderRightWidth: 1, borderRightStyle: "solid", borderColor: "var(--color-border)" }}>
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                    style={{ backgroundColor: emp.avatar_color }}
                  >
                    {emp.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-medium truncate max-w-[100px]" style={{ color: "var(--color-text-secondary)" }}>{emp.name}</p>
                    <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{ROLE_LABELS[emp.role as ShiftRole]}</p>
                  </div>
                </div>
              </td>
              {dates.map((d, i) => {
                const dayShifts = shiftsFor(emp.id, d);
                return (
                  <td
                    key={i}
                    className={clsx(
                      "px-1.5 py-2 align-top cursor-pointer min-h-[60px]",
                      isToday(d) && "bg-blue-50/40"
                    )}
                    onClick={() => dayShifts.length === 0 && onCellClick(isoDate(d), emp.id)}
                  >
                    {dayShifts.length === 0 ? (
                      <div className="h-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-xl leading-none" style={{ color: "var(--color-text-muted)" }}>+</span>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {dayShifts.map((sh) => {
                          const colors = ROLE_COLORS[sh.role as ShiftRole] ?? ROLE_COLORS.cashier;
                          return (
                            <button
                              key={sh.id}
                              onClick={(e) => { e.stopPropagation(); onShiftClick(sh); }}
                              className={clsx(
                                "w-full text-left rounded-md px-2 py-1 text-xs border transition-opacity hover:opacity-80",
                                colors.bg, colors.text, colors.border
                              )}
                            >
                              <div className="font-semibold truncate">{sh.start_time}–{sh.end_time}</div>
                              {sh.notes && <div className="truncate opacity-70">{sh.notes}</div>}
                            </button>
                          );
                        })}
                        <button
                          onClick={(e) => { e.stopPropagation(); onCellClick(isoDate(d), emp.id); }}
                          className="w-full text-center text-lg leading-tight opacity-0 group-hover:opacity-100 transition-opacity"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                          +
                        </button>
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
