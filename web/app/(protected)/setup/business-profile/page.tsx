import { redirect } from "next/navigation";

/**
 * Duplicate of capabilities-driven Business Modes (/settings/modes).
 * Ponytail Wave 1 — consolidate to the single SoT.
 */
export default function LegacyBusinessProfileRedirect() {
  redirect("/settings/modes");
}
