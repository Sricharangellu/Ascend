import { redirect } from "next/navigation";

/**
 * Retired (Ponytail Wave 2b): standalone tender audit duplicated
 * `/orders/[id]` → Payments tab (real order payments). Canonical surface is Orders.
 */
export default function LegacyPaymentsRedirect() {
  redirect("/orders");
}
