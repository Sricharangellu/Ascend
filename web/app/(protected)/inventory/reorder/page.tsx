import { redirect } from "next/navigation";

/**
 * Retired as a peer Inventory page (Ponytail Wave 1).
 * Reorder suggestions live on the Purchasing hub Reorder tab.
 */
export default function LegacyInventoryReorderRedirect() {
  redirect("/purchasing?tab=reorder");
}
