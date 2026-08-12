"use client";
import { Modal } from "@/components/Modal";

interface ShortcutsOverlayProps {
  open: boolean;
  onClose: () => void;
}

/** Only list shortcuts that the terminal actually implements. */
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
                  <kbd className="shrink-0 rounded border border-erp-table-border bg-erp-table-header px-2 py-0.5 font-mono text-xs text-erp-text-primary shadow-sm">
                    {item.key}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        ))}
        <p className="text-xs text-erp-text-secondary">
          Payment tender (cash, card, gift card, store credit) is chosen on the Complete sale screen.
        </p>
      </div>
    </Modal>
  );
}
