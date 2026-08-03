
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
          <div className="flex items-center justify-between border-b px-5 py-3" style={{ borderColor: "var(--color-border)" }}>
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
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
              <table className="min-w-full divide-y text-sm divide-[var(--color-table-border)]">
                <thead className="text-left text-xs font-semibold uppercase tracking-wide" style={{ backgroundColor: "var(--color-table-header)", color: "var(--color-text-muted)" }}>
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
                <tbody className="divide-y divide-[var(--color-table-border)]" style={{ backgroundColor: "var(--color-surface)" }}>
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-8 text-center" style={{ color: "var(--color-text-muted)" }}>
                        No discount rules yet. Create one to get started.
                      </td>
                    </tr>
                  )}
                  {items.map((d) => (
                    <tr key={d.id} className="hover:bg-[var(--color-surface-subtle)]">
                      <td className="whitespace-nowrap px-5 py-3 font-medium" style={{ color: "var(--color-text-primary)" }}>{d.name}</td>
                      <td className="whitespace-nowrap px-5 py-3">
                        <RuleTypeBadge ruleType={d.rule_type} />
                      </td>
                      <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--color-text-secondary)" }}>{valueLabel(d)}</td>
                      <td className="whitespace-nowrap px-5 py-3 font-mono text-xs" style={{ color: "var(--color-text-secondary)" }}>
                        {d.coupon_code ?? (d.auto_applicable ? (
                          <span className="rounded bg-green-50 px-1.5 py-0.5 font-sans text-xs text-green-700 not-italic">
                            auto
                          </span>
                        ) : "—")}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 capitalize" style={{ color: "var(--color-text-secondary)" }}>{d.apply_to}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-right" style={{ color: "var(--color-text-muted)" }}>
                        {d.used_count}{d.usage_limit != null ? `/${d.usage_limit}` : ""}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3">
                        <StatusBadge status={d.status} />
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-right">
                        {statusBusy === d.id ? (
                          <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>Updating…</span>
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
