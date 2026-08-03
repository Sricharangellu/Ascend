import { redirect } from "next/navigation";

/**
 * Retired (2026-08-02, Ponytail Wave 0): this page called MSW-only
 * `/api/v1/sales/history` (no backend route) — blank/broken in production.
 * Canonical retail sales history is `/orders` → real `/api/v1/orders`.
 */
export default function LegacySalesHistoryRedirect() {
  redirect("/orders");
}
