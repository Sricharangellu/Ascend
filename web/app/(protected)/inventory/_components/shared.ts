import type { InventoryLevel } from "@/api-client/types";
import { formatMoney } from "@/lib/money";

export interface StockMovement {
  id: string;
  type: "sale" | "adjustment" | "receive" | "transfer" | "return";
  delta: number;
  location: string;
  actor: string;
  note: string | null;
  created_at: number;
}

export type StockStatus = "Healthy" | "Watch" | "Reorder";
export type StockStatusFilter = "All" | StockStatus;

export interface InventoryRow {
  id: string;
  sku: string;
  name: string;
  category: string;
  productStatus: string;
  priceCents: number;
  onHand: number;
  committed: number;
  available: number;
  reorderPoint: number;
  costCents: number | null;
  stockStatus: StockStatus;
  velocity: number;
}

export type LocalProductStatus = "active" | "draft" | "archived";
export type CatalogStatusFilter = "All" | LocalProductStatus;

export function stockStatusFor(item: InventoryLevel): StockStatus {
  if (item.lowStock || item.available <= item.reorderPoint) return "Reorder";
  if (item.reorderPoint > 0 && item.available <= item.reorderPoint * 1.5) return "Watch";
  return "Healthy";
}

export function toInventoryRow(item: InventoryLevel): InventoryRow {
  return {
    id: item.id,
    sku: item.sku,
    name: item.name,
    category: item.category,
    productStatus: item.status,
    priceCents: item.priceCents,
    onHand: item.onHand,
    committed: item.committed,
    available: item.available,
    reorderPoint: item.reorderPoint,
    costCents: item.costCents,
    stockStatus: stockStatusFor(item),
    velocity: item.velocity,
  };
}

export function formatCost(cents: number | null) {
  return cents === null ? "-" : formatMoney(cents);
}

export function formatMargin(priceCents: number, costCents: number | null) {
  if (costCents === null || priceCents <= 0) return "-";
  const margin = ((priceCents - costCents) / priceCents) * 100;
  return `${margin.toFixed(1)}%`;
}

export function formatVelocity(value: number) {
  return value > 0 ? `${value}/wk` : "Learning";
}
