export type ReportType = "sales_summary" | "top_products" | "inventory_valuation" | "p_l" | "ar_aging" | "ap_aging";
export type Frequency = "daily" | "weekly" | "monthly";

export interface ScheduledReport {
  id: string;
  name: string;
  reportType: ReportType;
  frequency: Frequency;
  recipientEmails: string[];
  enabled: boolean;
  lastSentAt: number | null;
  nextSendAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface ReorderRec {
  productId: string;
  sku: string;
  name: string;
  currentStock: number;
  reorderPoint: number;
  reorderQuantity: number;
  leadTimeDays: number;
  velocityPerDay: number;
  daysOfStock: number;
  belowReorderPoint: boolean;
  supplierId: string | null;
}

export interface OrderRec {
  productId: string;
  sku: string;
  name: string;
  totalUnitsSold: number;
  revenueGrossCents: number;
  rank: number;
  belowReorderPoint: boolean;
}

// ── Constants ──────────────────────────────────────────────────────────────────

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  sales_summary: "Sales Summary",
  top_products: "Top Products",
  inventory_valuation: "Inventory Valuation",
  p_l: "Profit & Loss",
  ar_aging: "AR Aging",
  ap_aging: "AP Aging",
};

export const FREQ_LABELS: Record<Frequency, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

export function urgencyBadge(rec: ReorderRec): "red" | "yellow" | "gray" {
  if (rec.currentStock === 0) return "red";
  if (rec.belowReorderPoint || rec.daysOfStock <= rec.leadTimeDays) return "yellow";
  return "gray";
}

export function urgencyLabel(rec: ReorderRec): string {
  if (rec.currentStock === 0) return "Out of stock";
  if (rec.belowReorderPoint) return "Below reorder point";
  if (rec.daysOfStock <= rec.leadTimeDays) return "Order soon";
  return "Monitor";
}
