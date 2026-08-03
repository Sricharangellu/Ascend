"use client";

import { useCallback, useEffect, useState } from "react";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { TableSkeleton } from "@/components/TableSkeleton";
import { formatMoney } from "@/lib/money";
import { apiGet, apiPatch } from "@/api-client/client";
import { useToast } from "@/components/Toast";
import type { Discount, DiscountStatus } from "@/api-client/types";
import { NewDiscountPanel } from "./_components/NewDiscountPanel";
import { RuleTypeBadge, StatusActionsDropdown, StatusBadge } from "./_components/DiscountTableRow";

export default function DiscountsPage() {
  const { addToast } = useToast();
  const [items, setItems] = useState<Discount[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState<Discount | null>(null);
  const [statusBusy, setStatusBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const r = await apiGet<{ items: Discount[] }>("/api/v1/discounts");
      setItems(r.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load discounts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleStatusChange = async (id: string, status: DiscountStatus) => {
    setStatusBusy(id);
    try {
      await apiPatch(`/api/v1/discounts/${id}/status`, { status });
      addToast({ title: `Discount ${status}`, description: `Status updated to ${status}.`, variant: "success" });
      await load();
    } catch (e) {
      addToast({ title: "Action failed", description: e instanceof Error ? e.message : "Could not update status.", variant: "error" });
    } finally {
      setStatusBusy(null);
    }
  };

  const handleEdit = (discount: Discount) => {
    setEditingDiscount(discount);
    setPanelOpen(true);
  };

  function valueLabel(d: Discount) {
    if (d.rule_type === "bxgy") return "Buy/Get";
    return d.discount_type === "fixed" ? formatMoney(d.value) : `${d.value}%`;
  }

  return (
    <EnterpriseShell active="discounts" title="Discounts" subtitle="Promotions & coupon rules">
      <div className="mx-auto w-full max-w-7xl space-y-4 px-4 py-6">
        {error && (
          <div className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}

        <Card
          title="Discount Rules"
          description="Simple, volume, and Buy-X-Get-Y promotions with coupon or auto-apply."
          noPadding
        >
          {/* Toolbar */}
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
            <p className="text-sm text-gray-500">
              {items.length} rule{items.length !== 1 ? "s" : ""} configured
            </p>
            <Button
              variant="primary"
              size="sm"
              onClick={() => { setEditingDiscount(null); setPanelOpen(true); }}
            >
              + New Discount
            </Button>
          </div>

          {/* Table */}
          {loading ? (
            <TableSkeleton
              headers={["Name", "Type", "Discount", "Coupon code", "Applies to", "Usage", "Status", ""]}
              rows={6}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-5 py-3">Name</th>
                    <th className="px-5 py-3">Type</th>
                    <th className="px-5 py-3">Discount</th>
                    <th className="px-5 py-3">Coupon code</th>
                    <th className="px-5 py-3">Applies to</th>
                    <th className="px-5 py-3 text-right">Usage</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-gray-400">
                        No discount rules yet. Create one to get started.
                      </td>
                    </tr>
                  )}
                  {items.map((d) => (
                    <tr key={d.id} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-5 py-3 font-medium text-gray-900">{d.name}</td>
                      <td className="whitespace-nowrap px-5 py-3">
                        <RuleTypeBadge ruleType={d.rule_type} />
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-gray-700">{valueLabel(d)}</td>
                      <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-gray-600">
                        {d.coupon_code ?? (d.auto_applicable ? (
                          <span className="rounded bg-green-50 px-1.5 py-0.5 font-sans text-xs text-green-700 not-italic">
                            auto
                          </span>
                        ) : "—")}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 capitalize text-gray-600">{d.apply_to}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-right text-gray-500">
                        {d.used_count}{d.usage_limit != null ? `/${d.usage_limit}` : ""}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3">
                        <StatusBadge status={d.status} />
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-right">
                        {statusBusy === d.id ? (
                          <span className="text-xs text-gray-400">Updating…</span>
                        ) : (
                          <StatusActionsDropdown
                            discount={d}
                            onStatusChange={(id, status) => void handleStatusChange(id, status)}
                            onEdit={handleEdit}
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <NewDiscountPanel
        open={panelOpen}
        onClose={() => { setPanelOpen(false); setEditingDiscount(null); }}
        onCreated={() => void load()}
        editingDiscount={editingDiscount}
      />
    </EnterpriseShell>
  );
}
