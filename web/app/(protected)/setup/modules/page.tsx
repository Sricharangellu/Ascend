import { redirect } from "next/navigation";

/**
 * Duplicate module marketplace — same job as /settings/modes module toggles.
 * Ponytail Wave 1 — consolidate.
 */
export default function LegacyModulesMarketplaceRedirect() {
  redirect("/settings/modes");
}
