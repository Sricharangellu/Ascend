
import { useState } from "react";
import type { CatalogProduct } from "@/api-client/types";
import { formatMoney } from "@/lib/money";

// ── Types ─────────────────────────────────────────────────────────────────────

interface LabelTemplate {
  id: string;
  name: string;
  description: string;
  size: string;
  fields: string[];
}

const TEMPLATES: LabelTemplate[] = [
  {
    id: "price",
    name: "Price Tag",
    description: "Name, price, and SKU. Standard shelf label.",
    size: "2.25\" × 1.25\"",
    fields: ["name", "price", "sku"],
  },
  {
    id: "barcode",
    name: "Barcode Label",
    description: "Barcode, SKU, and unit price. For receiving and stocking.",
    size: "2\" × 1\"",
    fields: ["barcode", "sku", "price"],
  },
  {
    id: "detail",
    name: "Product Detail",
    description: "Full label with name, description, price, and barcode.",
    size: "3\" × 2\"",
    fields: ["name", "description", "price", "barcode", "sku"],
  },
  {
    id: "wholesale",
    name: "Wholesale / Case Label",
    description: "Case count, cost price, and vendor SKU for receiving.",
    size: "4\" × 2\"",
    fields: ["name", "sku", "vendor_sku", "case_qty", "cost_price"],
  },
];

// ── Label preview ─────────────────────────────────────────────────────────────

function LabelPreview({ template, product, qty }: { template: LabelTemplate; product: CatalogProduct; qty: number }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative overflow-hidden rounded-lg border-2 border-dashed bg-white px-6 py-4 text-center shadow-sm"
        style={{ minWidth: 200, minHeight: 90, borderColor: "var(--color-border)" }}>
        {template.id === "price" && (
          <>
            <p className="text-[11px] font-bold leading-tight text-slate-900">{product.name}</p>
            <p className="mt-2 text-[22px] font-black text-slate-950">{formatMoney(product.price_cents)}</p>
            <p className="mt-1 text-[10px] text-slate-400">{product.sku}</p>
          </>
        )}
        {template.id === "barcode" && (
          <>
            <div className="flex items-center justify-center gap-px">
              {Array.from({ length: 22 }).map((_, i) => (
                <div key={i} className={`h-8 ${[2,5,8,11,14,17,20].includes(i) ? "w-1" : "w-0.5"} bg-slate-900`} />
              ))}
            </div>
            <p className="mt-1 text-[10px] font-mono text-slate-600">{product.barcode || product.sku}</p>
            <p className="text-[11px] font-semibold text-slate-900">{formatMoney(product.price_cents)}</p>
          </>
        )}
        {template.id === "detail" && (
          <>
            <p className="text-[11px] font-bold text-slate-900">{product.name}</p>
            {product.description && <p className="mt-0.5 text-[9px] text-slate-500 line-clamp-2">{product.description}</p>}
            <p className="mt-1.5 text-[18px] font-black text-slate-950">{formatMoney(product.price_cents)}</p>
            <div className="mt-1.5 flex items-center justify-center gap-px">
              {Array.from({ length: 18 }).map((_, i) => (
                <div key={i} className={`h-5 ${[2,5,8,11,14,17].includes(i) ? "w-0.5" : "w-px"} bg-slate-800`} />
              ))}
            </div>
            <p className="mt-0.5 text-[9px] text-slate-400">{product.sku}</p>
          </>
        )}
        {template.id === "wholesale" && (
          <div className="text-left">
            <p className="text-[11px] font-bold text-slate-900">{product.name}</p>
            <div className="mt-2 grid grid-cols-2 gap-x-4 text-[10px]">
              <span className="text-slate-400">SKU</span><span className="font-mono text-slate-700">{product.sku}</span>
              {product.raw_cost_price_cents && (<><span className="text-slate-400">Cost</span><span className="font-semibold text-slate-900">{formatMoney(product.raw_cost_price_cents)}</span></>)}
            </div>
          </div>
        )}

        {/* Qty watermark */}
        {qty > 1 && (
          <div className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-[9px] font-bold text-white">
            ×{qty}
          </div>
        )}
      </div>
      <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>{template.size}</p>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function LabelsTab({ product }: { product: CatalogProduct }) {
  const [selectedTemplate, setSelectedTemplate] = useState<string>("price");
  const [qty, setQty]       = useState(1);
  const [queued, setQueued] = useState(false);
  const [queueHistory, setQueueHistory] = useState<Array<{ template: string; qty: number; time: string }>>([]);

  const template = TEMPLATES.find((t) => t.id === selectedTemplate)!;

  const handleAddToQueue = () => {
    setQueued(true);
    setQueueHistory((prev) => [
      {
        template: template.name,
        qty,
        time: new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date()),
      },
      ...prev,
    ]);
    setTimeout(() => setQueued(false), 2000);
  };

  const handlePrint = () => { handleAddToQueue(); };

  return (
    <div className="space-y-6">

      {/* ── Template selector ──────────────────────────────────────────────── */}
      <div>
        <h3 className="mb-3 text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Select label template</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelectedTemplate(t.id)}
              className={`rounded-xl border-2 p-4 text-left transition-all ${
                selectedTemplate === t.id
                  ? "border-brand-600 bg-brand-600/5"
                  : "hover:border-[var(--color-border-hover,#cbd5e1)]"
              }`}
              style={selectedTemplate !== t.id ? { borderColor: "var(--color-border)" } : {}}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>{t.name}</p>
                  <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-text-secondary)" }}>{t.description}</p>
                  <p className="mt-1 text-[10px]" style={{ color: "var(--color-text-muted)" }}>Size: {t.size}</p>
                </div>
                <div className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 transition-all ${
                  selectedTemplate === t.id ? "border-brand-600 bg-brand-600" : ""
                }`} style={selectedTemplate !== t.id ? { borderColor: "var(--color-border)" } : {}} />
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {t.fields.map((f) => (
                  <span key={f} className="rounded px-1.5 py-0.5 text-[10px] capitalize"
                    style={{ backgroundColor: "var(--color-surface-subtle)", color: "var(--color-text-secondary)" }}>
                    {f.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Preview + print controls ──────────────────────────────────────── */}
      <div className="grid gap-6 sm:grid-cols-2">
        {/* Preview */}
        <div>
          <h3 className="mb-3 text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Preview</h3>
          <div className="flex min-h-[160px] items-center justify-center rounded-xl border p-6"
            style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-subtle)" }}>
            <LabelPreview template={template} product={product} qty={qty} />
          </div>
          {qty > 1 && (
            <p className="mt-2 text-center text-[11px]" style={{ color: "var(--color-text-muted)" }}>{qty} labels will be printed</p>
          )}
        </div>

        {/* Controls */}
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[12px] font-medium" style={{ color: "var(--color-text-secondary)" }}>Quantity</label>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="flex h-9 w-9 items-center justify-center rounded-lg border transition-colors hover:bg-[var(--color-surface-subtle)]"
                style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}>
                −
              </button>
              <input
                type="number" min="1" max="500" value={qty}
                onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-20 rounded-lg border py-2 text-center text-[13px] font-semibold focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }}
              />
              <button type="button" onClick={() => setQty((q) => Math.min(500, q + 1))}
                className="flex h-9 w-9 items-center justify-center rounded-lg border transition-colors hover:bg-[var(--color-surface-subtle)]"
                style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}>
                +
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[1, 5, 10, 25, 50, 100].map((n) => (
                <button key={n} type="button" onClick={() => setQty(n)}
                  className={`rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ${
                    qty === n ? "border-brand-600 bg-brand-600 text-white" : "hover:border-[var(--color-border)]"
                  }`}
                  style={qty !== n ? { borderColor: "var(--color-border)", color: "var(--color-text-secondary)" } : {}}>
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[12px] font-medium" style={{ color: "var(--color-text-secondary)" }}>Product info</label>
            <div className="space-y-1 rounded-lg border p-3 text-[12px]"
              style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-subtle)", color: "var(--color-text-secondary)" }}>
              <div className="flex justify-between">
                <span style={{ color: "var(--color-text-muted)" }}>Name</span>
                <span className="font-medium" style={{ color: "var(--color-text-primary)" }}>{product.name}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: "var(--color-text-muted)" }}>SKU</span>
                <span className="font-mono">{product.sku}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: "var(--color-text-muted)" }}>Price</span>
                <span className="font-semibold">{formatMoney(product.price_cents)}</span>
              </div>
              {product.barcode && (
                <div className="flex justify-between">
                  <span style={{ color: "var(--color-text-muted)" }}>Barcode</span>
                  <span className="font-mono">{product.barcode}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={handleAddToQueue}
              className={`rounded-xl border px-5 py-2.5 text-[13px] font-semibold transition-all ${
                queued ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-brand-600 text-brand-600 hover:bg-brand-600/5"
              }`}
            >
              {queued ? "✓ Added to print queue" : "Add to Print Queue"}
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="rounded-xl bg-brand-600 px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-[#4849d0] transition-colors"
            >
              Print {qty === 1 ? "Label" : `${qty} Labels`} Now
            </button>
          </div>
        </div>
      </div>

      {/* ── Print queue history ────────────────────────────────────────────── */}
      {queueHistory.length > 0 && (
        <div className="rounded-xl border" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
          <div className="border-b px-5 py-3" style={{ borderColor: "var(--color-border)" }}>
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--color-text-secondary)" }}>
              Queue history (this session)
            </h3>
          </div>
          <ul className="divide-y divide-[var(--color-table-border)]">
            {queueHistory.map((item, i) => (
              <li key={i} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>{item.template}</p>
                  <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                    {item.qty} label{item.qty !== 1 ? "s" : ""} · {item.time}
                  </p>
                </div>
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">Queued</span>
              </li>
            ))}
          </ul>
        </div>
      )}

    </div>
  );
}
