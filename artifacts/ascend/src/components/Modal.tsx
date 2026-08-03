import { useEffect, useRef } from "react";
import { clsx } from "clsx";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  footer?: React.ReactNode;
}

export function Modal({ open, onClose, title, children, size = "md", footer }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const sizeClass = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" }[size];

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open) { if (!d.open) d.showModal(); } else { if (d.open) d.close(); }
  }, [open]);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    const onCancel = (e: Event) => { e.preventDefault(); onClose(); };
    d.addEventListener("cancel", onCancel);
    return () => d.removeEventListener("cancel", onCancel);
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      className={clsx(
        "w-full rounded-2xl p-0 m-auto backdrop:bg-black/50 backdrop:backdrop-blur-sm",
        "open:flex open:flex-col",
        "shadow-[var(--shadow-xl)]",
        sizeClass
      )}
      style={{
        border: "1px solid var(--color-border)",
        backgroundColor: "var(--color-surface)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between border-b px-6 py-4"
        style={{ borderColor: "var(--color-border)" }}
      >
        <h2 className="text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30"
          style={{ color: "var(--color-text-muted)" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--color-surface-subtle)";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-primary)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-muted)";
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

      {/* Footer */}
      {footer && (
        <div
          className="border-t px-6 py-4"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-subtle)" }}
        >
          {footer}
        </div>
      )}
    </dialog>
  );
}
