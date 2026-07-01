"use client";

import { useEffect, useState } from "react";
import { apiPatch, apiPost } from "@/api-client/client";
import { Button } from "@/components/Button";
import { useToast } from "@/components/Toast";
import type { ApplyTo, Discount, DiscountType, RuleType } from "@/api-client/types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface NewDiscountForm {
  name: string;
  rule_type: RuleType;
  discount_type: DiscountType;
  value: string;
  apply_to: ApplyTo;
  coupon_code: string;
  auto_applicable: boolean;
  min_order_cents: string;
  min_qty: string;
  buy_qty: string;
  get_qty: string;
  usage_limit: string;
  per_customer_limit: string;
  start_date: string;
  end_date: string;
  tier_restriction: string;
}

const defaultForm: NewDiscountForm = {
  name: "",
  rule_type: "simple",
  discount_type: "percent",
  value: "",
  apply_to: "order",
  coupon_code: "",
  auto_applicable: false,
  min_order_cents: "",
  min_qty: "",
  buy_qty: "",
  get_qty: "",
  usage_limit: "",
  per_customer_limit: "",
  start_date: "",
  end_date: "",
  tier_restriction: "",
};

// ── NewDiscountPanel ──────────────────────────────────────────────────────────

export function NewDiscountPanel({
  open,
  onClose,
  onCreated,
  editingDiscount,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  editingDiscount: Discount | null;
}) {
  const { addToast } = useToast();
  const [form, setForm] = useState<NewDiscountForm>(defaultForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editingDiscount) {
      setForm({
        name: editingDiscount.name,
        rule_type: editingDiscount.rule_type,
        discount_type: editingDiscount.discount_type,
        value:
          editingDiscount.discount_type === "fixed"
            ? (editingDiscount.value / 100).toFixed(2)
            : String(editingDiscount.value),
        apply_to: editingDiscount.apply_to,
        coupon_code: editingDiscount.coupon_code || "",
        auto_applicable: editingDiscount.auto_applicable === 1,
        min_order_cents: editingDiscount.min_order_cents
          ? (editingDiscount.min_order_cents / 100).toFixed(2)
          : "",
        min_qty: editingDiscount.min_qty ? String(editingDiscount.min_qty) : "",
        buy_qty: editingDiscount.buy_qty ? String(editingDiscount.buy_qty) : "",
        get_qty: editingDiscount.get_qty ? String(editingDiscount.get_qty) : "",
        usage_limit: editingDiscount.usage_limit ? String(editingDiscount.usage_limit) : "",
        per_customer_limit: editingDiscount.per_customer_limit
          ? String(editingDiscount.per_customer_limit)
          : "",
        start_date: editingDiscount.start_date
          ? new Date(Number(editingDiscount.start_date)).toISOString().split("T")[0]!
          : "",
        end_date: editingDiscount.end_date
          ? new Date(Number(editingDiscount.end_date)).toISOString().split("T")[0]!
          : "",
        tier_restriction: editingDiscount.tier_restriction
          ? String(editingDiscount.tier_restriction)
          : "",
      });
    } else {
      setForm(defaultForm);
    }
  }, [editingDiscount, open]);

  function set<K extends keyof NewDiscountForm>(key: K, value: NewDiscountForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Name is required."); return; }
    const numValue = parseFloat(form.value);
    if (isNaN(numValue) || numValue <= 0) {
      setError("Discount value must be a positive number.");
      return;
    }

    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      ruleType: form.rule_type,
      discountType: form.discount_type,
      value: form.discount_type === "fixed" ? Math.round(numValue * 100) : numValue,
      applyTo: form.apply_to === "order" ? "cart" : form.apply_to,
      autoApplicable: form.coupon_code ? false : form.auto_applicable,
    };

    if (form.coupon_code.trim()) payload.couponCode = form.coupon_code.trim().toUpperCase();
    if (form.min_order_cents.trim()) {
      const dollars = parseFloat(form.min_order_cents);
      if (!isNaN(dollars)) payload.minOrderCents = Math.round(dollars * 100);
    }
    if (form.usage_limit.trim()) {
      const n = parseInt(form.usage_limit, 10);
      if (!isNaN(n) && n > 0) payload.usageLimit = n;
    }
    if (form.per_customer_limit.trim()) {
      const n = parseInt(form.per_customer_limit, 10);
      if (!isNaN(n) && n > 0) payload.perCustomerLimit = n;
    }
    if (form.start_date) payload.startDate = new Date(form.start_date + "T00:00:00").getTime();
    if (form.end_date) payload.endDate = new Date(form.end_date + "T23:59:59").getTime();
    if (form.tier_restriction.trim()) {
      const parts = form.tier_restriction
        .split(",")
        .map((p) => parseInt(p.trim(), 10))
        .filter((n) => !isNaN(n));
      if (parts.length > 0) payload.tierRestriction = parts;
    }
    if (form.rule_type === "volume" && form.min_qty.trim()) {
      const n = parseInt(form.min_qty, 10);
      if (!isNaN(n) && n > 0) payload.minQty = n;
    }
    if (form.rule_type === "bxgy") {
      const buyQty = parseInt(form.buy_qty, 10);
      const getQty = parseInt(form.get_qty, 10);
      if (!isNaN(buyQty) && buyQty > 0) payload.buyQty = buyQty;
      if (!isNaN(getQty) && getQty > 0) payload.getQty = getQty;
    }

    setSubmitting(true);
    setError(null);
    try {
      if (editingDiscount) {
        await apiPatch(`/api/v1/discounts/${editingDiscount.id}`, payload);
        addToast({ title: "Discount updated", variant: "success" });
      } else {
        await apiPost("/api/v1/discounts", payload);
        addToast({ title: "Discount created", variant: "success" });
      }
      setForm(defaultForm);
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save discount.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  const inputCls =
    "min-h-[44px] w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600";
  const labelCls = "block text-xs font-medium text-gray-700 mb-1";

  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/30" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-label={editingDiscount ? "Edit discount" : "New discount"}
        className="fixed right-0 top-0 z-40 h-full w-full max-w-lg overflow-y-auto bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h2 className="text-base font-semibold text-gray-900">
            {editingDiscount ? "Edit Discount Rule" : "New Discount Rule"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded p-1 text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-600"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5 px-5 py-5">
          {error && (
            <div className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700" role="alert">
              {error}
            </div>
          )}

          {/* Name */}
          <div>
            <label className={labelCls}>Name <span className="text-red-500">*</span></label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Summer Sale 20%"
              className={inputCls}
            />
          </div>

          {/* Rule type */}
          <div>
            <p className={labelCls}>Rule type</p>
            <div className="flex gap-3">
              {(["simple", "volume", "bxgy"] as const).map((rt) => (
                <label key={rt} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="rule_type"
                    value={rt}
                    checked={form.rule_type === rt}
                    onChange={() => set("rule_type", rt)}
                    className="h-4 w-4 border-gray-300 text-brand-600 focus:ring-brand-600"
                  />
                  <span className="text-sm capitalize text-gray-700">
                    {rt === "bxgy" ? "Buy X Get Y" : rt}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Discount type + value */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className={labelCls}>Discount type</p>
              <div className="flex gap-3">
                {(["percent", "fixed"] as const).map((dt) => (
                  <label key={dt} className="flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name="discount_type"
                      value={dt}
                      checked={form.discount_type === dt}
                      onChange={() => set("discount_type", dt)}
                      className="h-4 w-4 border-gray-300 text-brand-600 focus:ring-brand-600"
                    />
                    <span className="text-sm capitalize text-gray-700">{dt}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className={labelCls}>
                Value {form.discount_type === "fixed" ? "($)" : "(%)"}
                <span className="text-red-500"> *</span>
              </label>
              <input
                type="number"
                required
                min="0.01"
                step="0.01"
                value={form.value}
                onChange={(e) => set("value", e.target.value)}
                placeholder={form.discount_type === "fixed" ? "5.00" : "10"}
                className={inputCls}
              />
            </div>
          </div>

          {/* Apply to */}
          <div>
            <label className={labelCls}>Apply to</label>
            <select
              value={form.apply_to}
              onChange={(e) => set("apply_to", e.target.value as ApplyTo)}
              className={inputCls}
            >
              <option value="order">Order</option>
              <option value="product">Product</option>
              <option value="category">Category</option>
            </select>
          </div>

          {/* Coupon code */}
          <div>
            <label className={labelCls}>Coupon code (optional)</label>
            <input
              type="text"
              value={form.coupon_code}
              onChange={(e) => set("coupon_code", e.target.value.toUpperCase())}
              placeholder="e.g. SAVE20"
              className={inputCls}
            />
          </div>

          {/* Auto-applicable */}
          {!form.coupon_code && (
            <div>
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={form.auto_applicable}
                  onChange={(e) => set("auto_applicable", e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-600"
                />
                <span className="text-sm text-gray-700">
                  Auto-applicable (apply automatically without a code)
                </span>
              </label>
            </div>
          )}

          {/* Min order */}
          <div>
            <label className={labelCls}>Minimum order amount ($, optional)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.min_order_cents}
              onChange={(e) => set("min_order_cents", e.target.value)}
              placeholder="0.00"
              className={inputCls}
            />
          </div>

          {/* Volume: min qty */}
          {form.rule_type === "volume" && (
            <div>
              <label className={labelCls}>Minimum quantity</label>
              <input
                type="number"
                min="1"
                step="1"
                value={form.min_qty}
                onChange={(e) => set("min_qty", e.target.value)}
                placeholder="e.g. 5"
                className={inputCls}
              />
            </div>
          )}

          {/* Buy X Get Y */}
          {form.rule_type === "bxgy" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Buy quantity</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={form.buy_qty}
                  onChange={(e) => set("buy_qty", e.target.value)}
                  placeholder="e.g. 2"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Get quantity</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={form.get_qty}
                  onChange={(e) => set("get_qty", e.target.value)}
                  placeholder="e.g. 1"
                  className={inputCls}
                />
              </div>
            </div>
          )}

          {/* Usage limits */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Total usage limit (optional)</label>
              <input
                type="number"
                min="1"
                step="1"
                value={form.usage_limit}
                onChange={(e) => set("usage_limit", e.target.value)}
                placeholder="Unlimited"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Per-customer limit (optional)</label>
              <input
                type="number"
                min="1"
                step="1"
                value={form.per_customer_limit}
                onChange={(e) => set("per_customer_limit", e.target.value)}
                placeholder="Unlimited"
                className={inputCls}
              />
            </div>
          </div>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Start date (optional)</label>
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => set("start_date", e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>End date (optional)</label>
              <input
                type="date"
                value={form.end_date}
                onChange={(e) => set("end_date", e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          {/* Tier restriction */}
          <div>
            <label className={labelCls}>Tier restriction (1-5, optional)</label>
            <input
              type="number"
              min="1"
              max="5"
              step="1"
              value={form.tier_restriction}
              onChange={(e) => set("tier_restriction", e.target.value)}
              placeholder="No restriction"
              className={inputCls}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 border-t border-gray-100 pt-4">
            <Button type="button" variant="secondary" onClick={onClose} fullWidth disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" fullWidth loading={submitting}>
              {editingDiscount ? "Save Changes" : "Create Discount"}
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
