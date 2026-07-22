"use client";

import { formatMoney } from "@/lib/money";
import type { CatalogProduct } from "@/api-client/types";

function appendLabelStyles(doc: Document) {
  const style = doc.createElement("style");
  style.textContent = `
    body { margin: 0; font-family: monospace; }
    .sheet { display: grid; grid-template-columns: repeat(4, 2in); gap: 0.125in; padding: 0.25in; }
    .label { width: 2in; height: 1in; border: 1px solid #ccc; padding: 4px; box-sizing: border-box; display: flex; flex-direction: column; overflow: hidden; }
    .name { font-size: 9px; font-weight: bold; line-height: 1.2; }
    .sku { font-size: 7px; color: #888; }
    .barcode-box { flex: 1; background: #f3f3f3; margin: 2px 0; display: flex; align-items: center; justify-content: center; font-size: 6px; color: #555; }
    .price { font-size: 13px; font-weight: bold; text-align: right; }
    @media print { @page { margin: 0.25in; } }
  `;
  doc.head.appendChild(style);
}

function appendText(doc: Document, parent: HTMLElement, className: string, text: string) {
  const node = doc.createElement("div");
  node.className = className;
  node.textContent = text;
  parent.appendChild(node);
}

function printLabels(products: CatalogProduct[]) {
  const win = window.open("", "_blank");
  if (!win) return;

  const doc = win.document;
  doc.title = "Labels";
  doc.head.replaceChildren();
  doc.body.replaceChildren();
  appendLabelStyles(doc);

  const sheet = doc.createElement("div");
  sheet.className = "sheet";
  for (const product of products) {
    const label = doc.createElement("div");
    label.className = "label";
    appendText(doc, label, "name", product.name);
    appendText(doc, label, "sku", product.sku);
    appendText(doc, label, "barcode-box", product.barcode ?? product.sku);
    appendText(doc, label, "price", formatMoney(product.price_cents));
    sheet.appendChild(label);
  }
  doc.body.appendChild(sheet);

  win.setTimeout(() => {
    win.print();
    win.close();
  }, 0);
}

export function PrintLabelsModal({
  selected,
  onClose,
}: {
  selected: CatalogProduct[];
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-full max-w-md flex-col rounded-md bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-950">Print Labels</h2>
          <button type="button" onClick={onClose} aria-label="Close print labels" className="flex h-9 w-9 items-center justify-center rounded-md text-xl leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-600">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {selected.length === 0 ? (
            <p className="text-sm text-slate-500">Select products first using the checkboxes.</p>
          ) : (
            <>
              <p className="mb-3 text-sm text-slate-600">{selected.length} product{selected.length !== 1 ? "s" : ""} selected for printing:</p>
              <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
                {selected.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-950">{p.name}</p>
                      <p className="font-mono text-xs text-slate-500">{p.sku}</p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-slate-950">{formatMoney(p.price_cents)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button type="button" onClick={onClose} className="min-h-[40px] rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
          <button
            type="button"
            disabled={selected.length === 0}
            onClick={() => { printLabels(selected); onClose(); }}
            className="min-h-[40px] rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            Print
          </button>
        </div>
      </div>
    </div>
  );
}
