"use client";

/**
 * /progress — Ascend's truth-tracking surface.
 *
 * The dashboard's ProgressPanel covers the middle of the loop (tasks, evidence,
 * "verify with data"). This page covers the two ends that had backend routes
 * but no UI at all: stating a hypothesis, and closing it out with a decision
 * that has to be backed by evidence.
 *
 * `Hypothesis → Plan → Task → Evidence → Verified Result → Decision`
 *
 * Access is gated on the same `progress` feature the sidebar entry uses, so a
 * deep link shows exactly what the nav would have offered — rather than on the
 * three-value role hierarchy, which denies any role outside `owner | manager |
 * cashier` and would hide the page from a role the backend serves happily.
 * `usePermissions` fails closed while identity is loading or after it fails;
 * the backend enforces the real rules regardless of what this renders.
 */

import { EnterpriseShell } from "@/components/EnterpriseShell";
import { Card } from "@/components/Card";
import { Skeleton } from "@/components/Skeleton";
import { usePermissions } from "@/contexts/PermissionsContext";
import ProgressLoop from "./_components/ProgressLoop";

export default function ProgressPage() {
  const { hasFeature, loading, error } = usePermissions();

  return (
    <EnterpriseShell
      active="progress"
      title="Progress"
      subtitle="Turn what you believe about the business into something you can prove"
      contentClassName="overflow-y-auto"
    >
      <div className="mx-auto w-full max-w-7xl space-y-5 px-4 py-5 sm:px-6">
        {loading ? (
          <Card>
            <div role="status" aria-label="Checking access">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="mt-3 h-32 w-full" />
            </div>
          </Card>
        ) : error ? (
          <Card>
            <p role="alert" className="text-sm text-[var(--color-text-primary)]">
              We couldn&apos;t confirm your permissions, so Progress is hidden for now. Reload the
              page, or sign in again if this keeps happening.
            </p>
          </Card>
        ) : hasFeature("progress") ? (
          <ProgressLoop />
        ) : (
          <Card>
            <p role="alert" className="text-sm text-[var(--color-text-primary)]">
              You don&apos;t have access to Progress. Ask an owner or manager to grant the
              &ldquo;Progress &amp; Proof&rdquo; permission.
            </p>
          </Card>
        )}
      </div>
    </EnterpriseShell>
  );
}
