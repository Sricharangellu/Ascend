"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/Button";
import type { Discount, DiscountStatus } from "@/api-client/types";

// ── StatusBadge ───────────────────────────────────────────────────────────────

export function StatusBadge({ status }: { status: string }) {
  const classes =
    status === "active"
      ? "bg-green-100 text-green-800"
      : status === "paused"
      ? "bg-yellow-100 text-yellow-800"
      : "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${classes}`}>
      {status}
    </span>
  );
}

// ── RuleTypeBadge ─────────────────────────────────────────────────────────────

export function RuleTypeBadge({ ruleType }: { ruleType: string }) {
  const label =
    ruleType === "bxgy" ? "Buy X Get Y" : ruleType === "volume" ? "Volume" : "Simple";
  const classes =
    ruleType === "bxgy"
      ? "bg-purple-100 text-purple-800"
      : ruleType === "volume"
      ? "bg-blue-100 text-blue-800"
      : "bg-brand-100 text-brand-800";
  return (
    <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${classes}`}>
      {label}
    </span>
  );
}

// ── StatusActionsDropdown ─────────────────────────────────────────────────────

export function StatusActionsDropdown({
  discount,
  onStatusChange,
  onEdit,
}: {
  discount: Discount;
  onStatusChange: (id: string, status: DiscountStatus) => void;
  onEdit: (discount: Discount) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const allActions = [
    { label: "Activate", status: "active" },
    { label: "Pause", status: "paused" },
    { label: "Archive", status: "archived" },
  ] satisfies { label: string; status: DiscountStatus }[];
  const actions = allActions.filter((a) => a.status !== discount.status);

  return (
    <div className="relative" ref={ref}>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
      >
        Actions
        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </Button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-36 rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="py-1">
            <button
              type="button"
              onClick={() => { setOpen(false); onEdit(discount); }}
              className="w-full border-b border-gray-100 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
            >
              Edit
            </button>
            {actions.map((a) => (
              <button
                key={a.status}
                type="button"
                onClick={() => { setOpen(false); onStatusChange(discount.id, a.status); }}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
