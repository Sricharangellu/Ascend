"use client";

/**
 * Keyboard shortcuts help — only lists shortcuts that are actually wired in
 * the terminal today. Aspirational F-keys / Ctrl+P print / gift-card tender
 * were removed so cashiers aren't trained on dead controls (Wave B trust).
 */

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
      { key: "Enter", description: "Confirm payment (when in payment mode)" },
      { key: "Esc", description: "Cancel tender and return to cart" },
    ],
  },
  {
    category: "General",
    items: [
      { key: "?", description: "Show this shortcuts guide" },
    ],
  },
];

export function ShortcutsOverlay({ open, onClose }: ShortcutsOverlayProps) {
  return (
    <Modal open={open} onClose={onClose} title="Keyboard Shortcuts">
      <div className="space-y-5">
        {SHORTCUTS.map((section) => (
          <div key={section.category}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-erp-text-secondary">
              {section.category}
            </h3>
            <div className="space-y-1.5">
              {section.items.map((item) => (
                <div key={item.key} className="flex items-center justify-between gap-4">
                  <span className="text-sm text-erp-text-secondary">{item.description}</span>
                  <kbd className="shrink-0 rounded border border-erp-table-border bg-erp-page px-2 py-0.5 font-mono text-xs text-erp-text-primary shadow-sm">
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
