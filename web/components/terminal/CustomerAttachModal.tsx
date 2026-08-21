"use client";

/**
 * CustomerAttachModal — search and attach a customer to the open POS sale.
 * Pattern mirrors the customers merge-dialog search (debounced /customers/search).
 */

import { useEffect, useState } from "react";
import { apiGet } from "@/api-client/client";
import { Modal } from "@/components/Modal";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
import { Skeleton } from "@/components/Skeleton";

export interface AttachedCustomer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
}

interface CustomerAttachModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (customer: AttachedCustomer) => void;
  currentCustomerId?: string | null;
}

export function CustomerAttachModal({
  open,
  onClose,
  onSelect,
  currentCustomerId,
}: CustomerAttachModalProps) {
  const [query, setQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [results, setResults] = useState<AttachedCustomer[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setDebouncedQ("");
      setResults([]);
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    if (!debouncedQ.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    setError(null);
    apiGet<{ items: AttachedCustomer[] }>(
      `/api/v1/customers/search?q=${encodeURIComponent(debouncedQ.trim())}`,
    )
      .then((r) => {
        if (cancelled) return;
        setResults(r.items ?? []);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setResults([]);
        setError(err instanceof Error ? err.message : "Customer search failed");
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQ, open]);

  return (
    <Modal open={open} onClose={onClose} title="Attach customer" size="md">
      <div className="space-y-4">
        <p className="text-sm text-erp-text-secondary">
          Search by name, email, or phone. Attaching a customer unlocks store credit at tender.
        </p>
        <Input
          label="Search customers"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type to search…"
          autoFocus
        />
        {error && (
          <p role="alert" className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
            {error}
          </p>
        )}
        {searching && (
          <div className="space-y-2" aria-busy="true" aria-label="Searching customers">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        )}
        {!searching && debouncedQ.trim() && results.length === 0 && !error && (
          <p className="py-4 text-sm text-erp-text-secondary">
            No customers found matching “{debouncedQ.trim()}”.
          </p>
        )}
        {results.length > 0 && (
          <ul className="divide-y divide-erp-table-border rounded-md border border-erp-table-border">
            {results.map((customer) => {
              const attached = customer.id === currentCustomerId;
              return (
                <li key={customer.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-erp-text-primary">{customer.name}</p>
                    <p className="truncate text-xs text-erp-text-secondary">
                      {[customer.email, customer.phone].filter(Boolean).join(" · ") || "No contact info"}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant={attached ? "secondary" : "primary"}
                    disabled={attached}
                    onClick={() => {
                      onSelect(customer);
                      onClose();
                    }}
                  >
                    {attached ? "Attached" : "Attach"}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
