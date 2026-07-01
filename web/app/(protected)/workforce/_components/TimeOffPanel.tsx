"use client";

import { clsx } from "clsx";
import type { TimeOffRequest, TimeOffStatus } from "@/api-client/types";
import { TO_STATUS_COLORS } from "./workforceTypes";

function Row({ r, onUpdateStatus }: { r: TimeOffRequest; onUpdateStatus: (id: string, status: TimeOffStatus) => void }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800">{r.employee_name}</p>
        <p className="text-xs text-slate-500">
          {r.date_from === r.date_to ? r.date_from : `${r.date_from} → ${r.date_to}`}
          {r.reason && <span className="ml-2 text-slate-400">· {r.reason}</span>}
        </p>
      </div>
      <div className="flex items-center gap-2 ml-4">
        <span className={clsx("text-xs px-2 py-0.5 rounded-full font-medium", TO_STATUS_COLORS[r.status])}>
          {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
        </span>
        {r.status === "pending" && (
          <>
            <button onClick={() => onUpdateStatus(r.id, "approved")}
              className="text-xs px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700">
              Approve
            </button>
            <button onClick={() => onUpdateStatus(r.id, "denied")}
              className="text-xs px-2 py-1 rounded bg-slate-200 text-slate-700 hover:bg-slate-300">
              Deny
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function TimeOffPanel({ requests, onUpdateStatus }: {
  requests: TimeOffRequest[];
  onUpdateStatus: (id: string, status: TimeOffStatus) => void;
}) {
  const pending  = requests.filter((r) => r.status === "pending");
  const resolved = requests.filter((r) => r.status !== "pending");

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
      <h3 className="text-sm font-semibold text-slate-800 mb-4">
        Time-Off Requests
        {pending.length > 0 && (
          <span className="ml-2 bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded-full">{pending.length} pending</span>
        )}
      </h3>
      {requests.length === 0 ? (
        <p className="text-sm text-slate-400">No time-off requests.</p>
      ) : (
        <div>
          {pending.map((r) => <Row key={r.id} r={r} onUpdateStatus={onUpdateStatus} />)}
          {resolved.map((r) => <Row key={r.id} r={r} onUpdateStatus={onUpdateStatus} />)}
        </div>
      )}
    </div>
  );
}
