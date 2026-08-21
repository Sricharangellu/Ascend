"use client";

/**
 * HypothesisList — the left rail of the progress loop: every hypothesis this
 * tenant is tracking, plus the form that states a new one.
 *
 * Presentational only (data + callbacks via props) so it can be tested without
 * a network or a provider. Mutations are manager+ — the controls are hidden for
 * everyone else, and the backend enforces the same rule independently. Hiding
 * the UI is convenience, never the guard.
 */

import { useState, type FormEvent } from "react";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Select } from "@/components/Select";
import { Badge } from "@/components/Badge";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/Skeleton";
import type { CreateHypothesisInput, ProgressHypothesis } from "@/api-client/types";
import {
  HYPOTHESIS_CATEGORIES,
  PROGRESS_STATUS_BADGE,
  PROGRESS_STATUS_LABEL,
  categoryLabel,
  formatProgressDate,
} from "@/lib/progress";

interface HypothesisListProps {
  hypotheses: ProgressHypothesis[];
  selectedId: string | null;
  canManage: boolean;
  loading: boolean;
  busy?: boolean;
  onSelect: (id: string) => void;
  onCreate: (input: CreateHypothesisInput) => void | Promise<void>;
}

export function HypothesisList({
  hypotheses,
  selectedId,
  canManage,
  loading,
  busy = false,
  onSelect,
  onCreate,
}: HypothesisListProps) {
  const [statement, setStatement] = useState("");
  const [category, setCategory] = useState(HYPOTHESIS_CATEGORIES[0]?.value ?? "business_validation");
  const [successCriteria, setSuccessCriteria] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = statement.trim();
    if (trimmed.length < 3) {
      setFormError("State the hypothesis in at least 3 characters.");
      return;
    }
    setFormError(null);
    void onCreate({
      statement: trimmed,
      category,
      successCriteria: successCriteria.trim() || null,
    });
    setStatement("");
    setSuccessCriteria("");
  }

  return (
    <Card>
      <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Hypotheses</h2>
      <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">
        What you believe about the business, written down so it can be proven or disproven.
      </p>

      {canManage && (
        <form onSubmit={submit} className="mt-4 space-y-3 border-t border-erp-table-border pt-4">
          <Input
            label="New hypothesis"
            value={statement}
            onChange={(e) => setStatement(e.target.value)}
            placeholder="e.g. Our best sellers run out before the next delivery"
            error={formError ?? undefined}
            maxLength={1000}
          />
          <Select
            id="hypothesis-category"
            label="Category"
            size="lg"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            options={HYPOTHESIS_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))}
          />
          <Input
            label="How you'll know (optional)"
            value={successCriteria}
            onChange={(e) => setSuccessCriteria(e.target.value)}
            placeholder="e.g. Two restock cycles with no stockouts"
            maxLength={2000}
          />
          <Button type="submit" variant="primary" size="lg" loading={busy} fullWidth>
            Add hypothesis
          </Button>
        </form>
      )}

      <div className="mt-4">
        {loading && hypotheses.length === 0 ? (
          <div role="status" aria-label="Loading hypotheses" className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : hypotheses.length === 0 ? (
          <EmptyState
            title="No hypotheses yet"
            description={
              canManage
                ? "Start with something you suspect is true but haven't proven — then attach evidence until you can decide."
                : "A manager can add the first one. Until then there is nothing being tracked."
            }
          />
        ) : (
          <ul className="divide-y divide-erp-table-border">
            {hypotheses.map((h) => {
              const selected = h.id === selectedId;
              return (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(h.id)}
                    aria-current={selected ? "true" : undefined}
                    className={`flex min-h-touch w-full flex-col gap-1 rounded-md px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 ${
                      selected
                        ? "bg-[var(--color-primary-subtle)]"
                        : "hover:bg-[var(--color-surface-subtle)]"
                    }`}
                  >
                    <span className="flex flex-wrap items-start justify-between gap-2">
                      <span className="min-w-[140px] flex-1 text-sm font-medium text-[var(--color-text-primary)]">
                        {h.statement}
                      </span>
                      <Badge variant={PROGRESS_STATUS_BADGE[h.status]} size="sm">
                        {PROGRESS_STATUS_LABEL[h.status]}
                      </Badge>
                    </span>
                    <span className="text-[11px] text-[var(--color-text-secondary)]">
                      {categoryLabel(h.category)} · {formatProgressDate(h.created_at)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}
