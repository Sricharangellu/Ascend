"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/Button";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open) {
      if (!el.open) el.showModal();
    } else {
      if (el.open) el.close();
    }
  }, [open]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handleClose = () => onCancel();
    el.addEventListener("close", handleClose);
    return () => el.removeEventListener("close", handleClose);
  }, [onCancel]);

  return (
    <dialog
      ref={ref}
      className="rounded-xl shadow-2xl p-6 max-w-sm w-full backdrop:bg-black/40 border-0 outline-none"
      onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}
    >
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      <p className="mt-2 text-sm text-gray-600">{message}</p>
      <div className="mt-5 flex justify-end gap-3">
        <Button variant="secondary" size="sm" onClick={onCancel}>Cancel</Button>
        <Button
          variant={destructive ? "danger" : "primary"}
          size="sm"
          onClick={() => { onConfirm(); }}
        >
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
