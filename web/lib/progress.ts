/**
 * Shared display vocabulary for the progress-intelligence domain
 * (`Hypothesis → Plan → Task → Evidence → Verified Result → Decision`).
 *
 * Canonical home for the labels, badge variants and verification-source names
 * that every progress surface renders. Kept in `lib/` rather than inside one
 * component so a second surface extends this instead of forking its own copy —
 * the duplication failure mode `AGENTS.md` and Phase 9 both call out.
 *
 * NOTE: `app/(protected)/dashboard/_components/ProgressPanel.tsx` still carries
 * its own private copies of these maps (written before this module existed). It
 * should import from here instead; that edit was deliberately not made in the
 * same change because `dashboard/**` was under another session's LOCK claim.
 */

import type { BadgeVariant } from "@/components/Badge";
import type { ProgressStatus } from "@/api-client/types";

export const PROGRESS_STATUS_LABEL: Record<ProgressStatus, string> = {
  not_started: "Not started",
  planned: "Planned",
  in_progress: "In progress",
  self_reported_done: "Self-reported",
  evidence_attached: "Evidence attached",
  system_verified: "System verified",
  validated: "Validated",
  invalidated: "Invalidated",
  blocked: "Blocked",
  skipped: "Skipped",
};

export const PROGRESS_STATUS_BADGE: Record<ProgressStatus, BadgeVariant> = {
  not_started: "gray",
  planned: "gray",
  in_progress: "blue",
  self_reported_done: "yellow",
  evidence_attached: "purple",
  system_verified: "green",
  validated: "green",
  invalidated: "red",
  blocked: "red",
  skipped: "gray",
};

/** Verification sources Ascend can prove from real tenant data. Mirrors the
 *  backend's `checkVerificationSource` switch — adding one here without adding
 *  it there produces a 400, not a silent pass. */
export const VERIFICATION_SOURCES: readonly { value: string; label: string }[] = [
  { value: "retail.first_product", label: "First product added" },
  { value: "retail.first_receiving", label: "First stock received" },
  { value: "retail.first_sale", label: "First completed sale" },
  { value: "retail.expenses_categorized", label: "Expenses fully categorized" },
  { value: "retail.cost_prices_complete", label: "Cost prices complete" },
];

export function verificationLabel(source: string | null): string | null {
  if (!source) return null;
  return VERIFICATION_SOURCES.find((s) => s.value === source)?.label ?? source;
}

/** Hypothesis categories offered in the UI. Free text on the backend — these
 *  are suggestions that keep tenants' data consistent, not a closed enum. */
export const HYPOTHESIS_CATEGORIES: readonly { value: string; label: string }[] = [
  { value: "business_validation", label: "Business validation" },
  { value: "inventory_health", label: "Inventory health" },
  { value: "margin", label: "Margin & pricing" },
  { value: "customer_demand", label: "Customer demand" },
  { value: "operations", label: "Operations" },
];

export function categoryLabel(category: string): string {
  return HYPOTHESIS_CATEGORIES.find((c) => c.value === category)?.label ?? category;
}

/** A hypothesis is settled once a decision has been recorded against it. */
export function isDecided(status: ProgressStatus): boolean {
  return status === "validated" || status === "invalidated";
}

/** Short absolute date — progress records are audit trail, so an exact date
 *  reads better than "3 days ago" when someone is reconstructing what happened. */
export function formatProgressDate(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
