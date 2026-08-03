"use client";

import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { formatMoney } from "@/lib/money";
import { fmtDate } from "@/lib/date";
import { receiveStatusBadge } from "./receiveStockTypes";
import type { PendingPO } from "./receiveStockTypes";

export function PendingPOsTable({
  pendingPOs,
  suppliers,
  onSelect,
  onCreatePO,
}: {
  pendingPOs: PendingPO[];
  suppliers: Array<{ id: string; name: string }>;
  onSelect: (id: string) => void;
  onCreatePO: () => void;
}) {
  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? id;

  if (pendingPOs.length === 0) {
    return (
      <Card>
        <div className="flex flex-col items-center py-12 text-center">
          <svg aria-hidden="true" className="w-10 h-10 text-slate-200 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
          </svg>
          <p className="font-semibold text-slate-700">No pending shipments</p>
          <p className="text-sm text-slate-400 mt-1">All purchase orders have been received.</p>
          <Button variant="primary" size="sm" className="mt-4" onClick={onCreatePO}>Create a PO</Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Pending shipments</h2>
        <p className="text-xs text-slate-400">Click a row or use the selector above to start receiving</p>
      </div>
      <table className="min-w-full divide-y divide-slate-100 text-sm">
        <thead className="bg-slate-50 text-xs text-left text-slate-500 uppercase tracking-wide">
          <tr>
            <th className="px-4 py-2.5">PO #</th>
            <th className="px-4 py-2.5">Supplier</th>
            <th className="px-4 py-2.5">Status</th>
            <th className="px-4 py-2.5 text-right">Total</th>
            <th className="px-4 py-2.5">Created</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50 bg-white">
          {pendingPOs.map((po) => (
            <tr key={po.id} className="cursor-pointer hover:bg-blue-50 transition-colors" onClick={() => onSelect(po.id)}>
              <td className="px-4 py-3 font-semibold text-blue-700">#{po.po_number ?? po.id}</td>
              <td className="px-4 py-3 font-medium text-slate-900">{supplierName(po.supplier_id)}</td>
              <td className="px-4 py-3">
                <Badge variant={receiveStatusBadge(po.receive_status)}>{po.receive_status ?? "pending"}</Badge>
              </td>
              <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatMoney(po.total_cost_cents)}</td>
              <td className="px-4 py-3 text-slate-400 text-xs">{fmtDate(po.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
