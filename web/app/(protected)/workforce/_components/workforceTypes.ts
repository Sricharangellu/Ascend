import type { ShiftRole, TimeOffStatus } from "@/api-client/types";
import { fmtDateShort } from "@/lib/date";

// ── Constants ──────────────────────────────────────────────────────────────────

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const ROLE_COLORS: Record<ShiftRole, { bg: string; text: string; border: string }> = {
  manager:    { bg: "bg-purple-100",  text: "text-purple-800",  border: "border-purple-300" },
  supervisor: { bg: "bg-emerald-100", text: "text-emerald-800", border: "border-emerald-300" },
  cashier:    { bg: "bg-blue-100",    text: "text-blue-800",    border: "border-blue-300" },
  stock:      { bg: "bg-amber-100",   text: "text-amber-800",   border: "border-amber-300" },
  delivery:   { bg: "bg-orange-100",  text: "text-orange-800",  border: "border-orange-300" },
};

export const ROLE_LABELS: Record<ShiftRole, string> = {
  manager: "Manager", supervisor: "Supervisor", cashier: "Cashier",
  stock: "Stock", delivery: "Delivery",
};

export const TO_STATUS_COLORS: Record<TimeOffStatus, string> = {
  pending:  "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  denied:   "bg-red-100 text-red-700",
};

// ── Week helpers ───────────────────────────────────────────────────────────────

export function mondayOf(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const m = new Date(d);
  m.setDate(d.getDate() + diff);
  m.setHours(0, 0, 0, 0);
  return m;
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function weekDates(mon: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return d;
  });
}

export function fmtWeekRange(mon: Date): string {
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return `${fmtDateShort(mon.getTime())} – ${fmtDateShort(sun.getTime())}`;
}

export function isToday(d: Date): boolean {
  return isoDate(d) === isoDate(new Date());
}
