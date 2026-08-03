"use client";

import { useState, useEffect } from "react";
import { apiGet, apiPost } from "@/api-client/client";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useToast } from "@/components/Toast";

interface ReceiptTemplate {
  outletId: string;
  headerText: string;
  footerText: string;
  showLogo: boolean;
  showBarcode: boolean;
  showTaxBreakdown: boolean;
  contactInfo: string;
  returnPolicy: string;
}

const BLANK_TEMPLATE: Omit<ReceiptTemplate, "outletId"> = {
  headerText: "",
  footerText: "",
  showLogo: true,
  showBarcode: true,
  showTaxBreakdown: true,
  contactInfo: "",
  returnPolicy: "",
};

function ReceiptPreview({ template, outletName }: { template: Omit<ReceiptTemplate, "outletId">; outletName: string }) {
  return (
    <div
      aria-label="Receipt preview"
      className="w-full max-w-[220px] mx-auto rounded bg-white shadow-lg border border-slate-200 text-[11px] font-mono text-slate-800 px-4 py-5 space-y-2 select-none"
    >
      {template.showLogo && (
        <div className="flex justify-center mb-1">
          <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-400 text-xs font-bold">
            LOGO
          </div>
        </div>
      )}
      <div className="text-center font-bold text-[12px] leading-tight">{outletName || "Your Store"}</div>
      {template.contactInfo && (
        <div className="text-center text-[10px] text-slate-500 leading-tight whitespace-pre-line">{template.contactInfo}</div>
      )}
      {template.headerText && (
        <div className="text-center text-[10px] italic text-slate-500 leading-tight border-t border-dashed border-slate-300 pt-2">{template.headerText}</div>
      )}
      <div className="border-t border-dashed border-slate-300 pt-2 space-y-1">
        <div className="flex justify-between"><span>Latte × 2</span><span>$9.98</span></div>
        <div className="flex justify-between"><span>Cold Brew × 1</span><span>$5.49</span></div>
        <div className="flex justify-between"><span>Croissant × 1</span><span>$3.25</span></div>
      </div>
      <div className="border-t border-dashed border-slate-300 pt-2 space-y-1">
        <div className="flex justify-between"><span>Subtotal</span><span>$18.72</span></div>
        {template.showTaxBreakdown && (
          <div className="flex justify-between text-slate-500"><span>Tax (8.75%)</span><span>$1.64</span></div>
        )}
        <div className="flex justify-between font-bold pt-0.5"><span>TOTAL</span><span>$20.36</span></div>
        <div className="flex justify-between text-slate-500"><span>VISA ···· 4242</span><span>$20.36</span></div>
      </div>
      {template.showBarcode && (
        <div className="border-t border-dashed border-slate-300 pt-2 flex flex-col items-center gap-0.5">
          <div className="flex gap-px">
            {Array.from({ length: 28 }).map((_, i) => (
              <div key={i} className="bg-slate-800" style={{ width: i % 3 === 0 ? 2 : 1, height: 18 }} />
            ))}
          </div>
          <span className="text-[9px] text-slate-500 tracking-widest">2026061800001</span>
        </div>
      )}
      {template.footerText && (
        <div className="border-t border-dashed border-slate-300 pt-2 text-center text-[10px] text-slate-500 leading-tight italic">{template.footerText}</div>
      )}
      {template.returnPolicy && (
        <div className="text-center text-[9px] text-slate-400 leading-tight border-t border-dashed border-slate-300 pt-2">{template.returnPolicy}</div>
      )}
      <div className="text-center text-[9px] text-slate-400 pt-1">Thank you for your business!</div>
    </div>
  );
}

export function ReceiptsSection({ canManage, addToast }: { canManage: boolean; addToast: ReturnType<typeof useToast>["addToast"] }) {
  const [outlets, setOutlets] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedOutletId, setSelectedOutletId] = useState<string>("");
  const [template, setTemplate] = useState<Omit<ReceiptTemplate, "outletId">>(BLANK_TEMPLATE);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiGet<{ items: Array<{ id: string; name: string }> }>("/api/v1/outlets")
      .then((d) => {
        const list = d.items ?? [];
        setOutlets(list);
        if (list[0]) setSelectedOutletId(list[0].id);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedOutletId) return;
    setLoading(true);
    apiGet<ReceiptTemplate>(`/api/v1/settings/receipts/${selectedOutletId}`)
      .then((d) => {
        setTemplate({
          headerText: d.headerText ?? "",
          footerText: d.footerText ?? "",
          showLogo: d.showLogo ?? true,
          showBarcode: d.showBarcode ?? true,
          showTaxBreakdown: d.showTaxBreakdown ?? true,
          contactInfo: d.contactInfo ?? "",
          returnPolicy: d.returnPolicy ?? "",
        });
      })
      .catch(() => setTemplate(BLANK_TEMPLATE))
      .finally(() => setLoading(false));
  }, [selectedOutletId]);

  const set = <K extends keyof typeof template>(k: K, v: (typeof template)[K]) =>
    setTemplate((t) => ({ ...t, [k]: v }));

  const save = async () => {
    if (!selectedOutletId) return;
    setSaving(true);
    try {
      await apiPost(`/api/v1/settings/receipts/${selectedOutletId}`, { ...template, outletId: selectedOutletId });
      addToast({ title: "Receipt template saved.", variant: "success" });
    } catch {
      addToast({ title: "Failed to save template.", variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const outletName = outlets.find((o) => o.id === selectedOutletId)?.name ?? "";

  return (
    <Card>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-slate-900">Receipt templates</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Customize the printed receipt for each outlet. Changes apply to new receipts immediately.
        </p>
      </div>

      <div className="mb-5">
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
          Outlet
        </label>
        <select
          value={selectedOutletId}
          onChange={(e) => setSelectedOutletId(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none w-full max-w-xs"
        >
          {outlets.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-10 rounded bg-slate-100" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_240px]">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Header text</label>
              <input
                type="text"
                value={template.headerText}
                onChange={(e) => set("headerText", e.target.value)}
                placeholder="e.g. Welcome to our store!"
                maxLength={120}
                disabled={!canManage}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Footer text</label>
              <input
                type="text"
                value={template.footerText}
                onChange={(e) => set("footerText", e.target.value)}
                placeholder="e.g. Thank you for shopping with us!"
                maxLength={120}
                disabled={!canManage}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Contact info</label>
              <input
                type="text"
                value={template.contactInfo}
                onChange={(e) => set("contactInfo", e.target.value)}
                placeholder="e.g. 123 Main St · (555) 000-0000 · store.example.com"
                maxLength={200}
                disabled={!canManage}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Return policy</label>
              <textarea
                value={template.returnPolicy}
                onChange={(e) => set("returnPolicy", e.target.value)}
                placeholder="e.g. Returns accepted within 30 days with receipt."
                rows={3}
                maxLength={300}
                disabled={!canManage}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:opacity-50 resize-none"
              />
            </div>

            <div className="space-y-3 pt-1">
              {(
                [
                  ["showLogo", "Show logo"],
                  ["showBarcode", "Show barcode / QR code"],
                  ["showTaxBreakdown", "Show tax breakdown"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 px-4 py-3 hover:bg-slate-50 transition-colors">
                  <span className="text-sm font-medium text-slate-800">{label}</span>
                  <span
                    role="switch"
                    aria-checked={template[key]}
                    onClick={() => canManage && set(key, !template[key])}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      template[key] ? "bg-slate-950" : "bg-slate-200"
                    } ${!canManage ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        template[key] ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </span>
                </label>
              ))}
            </div>

            {canManage && (
              <div className="pt-2">
                <Button
                  variant="primary"
                  loading={saving}
                  onClick={() => void save()}
                  disabled={!selectedOutletId}
                >
                  Save template
                </Button>
              </div>
            )}
          </div>

          <div className="xl:border-l xl:border-slate-100 xl:pl-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Live preview</p>
            <ReceiptPreview template={template} outletName={outletName} />
          </div>
        </div>
      )}
    </Card>
  );
}
