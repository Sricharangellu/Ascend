"use client";
import { Modal } from "@/components/Modal";

interface ShortcutsOverlayProps {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  {
    category: "Search & Add",
    items: [
      { key: "/", description: "Focus product search" },
      { key: "Enter", description: "Add top search result to cart" },
      { key: "Esc", description: "Clear search / close overlay" },
    ],
  },
  {
    category: "Cart",
    items: [
      { key: "Backspace", description: "Remove last item from cart" },
      { key: "0–9 then ×", description: "Set quantity (e.g. 3× then scan)" },
      { key: "Delete", description: "Clear entire cart" },
    ],
  },
  {
    category: "Payment",
    items: [
      { key: "F1", description: "Cash tender" },
      { key: "F2", description: "Card tender" },
      { key: "F3", description: "Gift card tender" },
      { key: "F4", description: "Split tender" },
      { key: "Enter", description: "Confirm payment (when in payment mode)" },
    ],
  },
  {
    category: "General",
    items: [
      { key: "?", description: "Show this shortcuts guide" },
      { key: "Ctrl+P", description: "Print last receipt" },
      { key: "Ctrl+Z", description: "Void last transaction" },
    ],
  },
];

export function ShortcutsOverlay({ open, onClose }: ShortcutsOverlayProps) {
  return (
    <Modal open={open} onClose={onClose} title="Keyboard Shortcuts">
      <div className="space-y-5">
        {SHORTCUTS.map((section) => (
          <div key={section.category}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
              {section.category}
            </h3>
            <div className="space-y-1.5">
              {section.items.map((item) => (
                <div key={item.key} className="flex items-center justify-between gap-4">
                  <span className="text-sm text-slate-600">{item.description}</span>
                  <kbd className="shrink-0 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-xs text-slate-700 shadow-sm">
                    {item.key}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
