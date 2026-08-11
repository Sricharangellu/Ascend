"use client";

import { Card } from "@/components/Card";
import { DataTable, type DataColumn } from "@/components/DataTable";
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

  const columns: DataColumn<PendingPO>[] = [
    { key: "po", header: "PO #", hideable: false, sticky: true,
      sortValue: (po) => po.po_number ?? po.id,
      render: (po) => <span className="font-semibold text-accent-700">#{po.po_number ?? po.id}</span> },
    { key: "supplier", header: "Supplier", sortValue: (po) => supplierName(po.supplier_id),
      render: (po) => <span className="font-medium text-content-primary">{supplierName(po.supplier_id)}</span> },
    { key: "status", header: "Status", sortValue: (po) => po.receive_status ?? "pending",
      render: (po) => (
        <Badge variant={receiveStatusBadge(po.receive_status)}>{po.receive_status ?? "pending"}</Badge>
      ) },
    { key: "total", header: "Total", numeric: true, sortValue: (po) => po.total_cost_cents,
      render: (po) => <span className="font-semibold">{formatMoney(po.total_cost_cents)}</span> },
    { key: "created", header: "Created", sortValue: (po) => po.created_at,
      render: (po) => <span className="text-xs text-content-muted">{fmtDate(po.created_at)}</span> },
  ];

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
      <DataTable<PendingPO>
        caption="Purchase orders awaiting receipt, with supplier, status and total"
        columns={columns}
        rows={pendingPOs}
        rowKey={(po) => po.id}
        onRowClick={(po) => onSelect(po.id)}
        storageKey="receive-pending-pos"
        className="px-0"
      />
    </Card>
  );
}
