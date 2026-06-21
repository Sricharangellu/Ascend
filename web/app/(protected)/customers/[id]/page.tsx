"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { apiGet, apiPost, apiDelete, apiPatch, ApiResponseError } from "@/api-client/client";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { formatMoney } from "@/lib/money";
import { useToast } from "@/components/Toast";
import { getUser } from "@/lib/auth";
import { Badge } from "@/components/Badge";

// ─── Merge Types ──────────────────────────────────────────────────────────────

interface CustomerSearchResult { id: string; name: string; email: string; phone: string; }
type MergeStep = "search" | "confirm";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  points: number;
  tier?: number;
  company?: string;
  dba?: string;
  taxId?: string;
  licenseNo?: string;
  state?: string;
  billingAddress?: string;
  shippingAddress?: string;
  salesRepId?: string;
  status: string;
  verified?: boolean;
  credit_limit_cents?: number;
}

interface CustomerSummary {
  customer: Customer;
  visits: number;
  totalSpentCents: number;
  avgOrderCents: number;
  lastVisitAt: number | null;
  recentOrders: Array<{
    id: string;
    orderNumber: string;
    status: string;
    totalCents: number;
    createdAt: number;
  }>;
}

interface CustomerFinancials {
  openInvoicesCents: number;
  paidInvoicesCents: number;
  storeCredit?: number;
}

type DetailTab = "general" | "transactions" | "financials" | "store-credit" | "contacts" | "addresses";

interface CustomerLoyalty {
  customerId: string;
  currentPoints: number;
  currentTierLevel: number;
  currentTierName: string | null;
  pointMultiplier: number;
  discountPct: number;
  nextTierName: string | null;
  pointsToNextTier: number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const INPUT_CLASS =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-950 focus:ring-2 focus:ring-slate-950 outline-none min-h-[44px]";
const LABEL_CLASS = "block text-xs font-semibold uppercase text-slate-500 mb-1";

function tierLabel(tier?: number): string {
  if (!tier) return "Standard";
  return `Tier ${tier}`;
}

function statusColor(status: string) {
  if (status === "active") return "bg-success-100 text-success-700";
  return "bg-slate-100 text-slate-600";
}

function orderStatusColor(status: string) {
  if (status === "completed") return "bg-success-100 text-success-700";
  if (status === "refunded") return "bg-warning-100 text-warning-700";
  if (status === "voided") return "bg-danger-100 text-danger-700";
  return "bg-slate-100 text-slate-600";
}

function formatDate(ts: number | null): string {
  if (!ts) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(ts));
}

// ─── ReadField ────────────────────────────────────────────────────────────────

function ReadField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className={LABEL_CLASS}>{label}</p>
      <div className="min-h-[40px] rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-950">
        {value || <span className="text-slate-400">—</span>}
      </div>
    </div>
  );
}

// ─── Merge Modal ──────────────────────────────────────────────────────────────

function MergeModal({
  primary,
  onClose,
  onMerged,
}: {
  primary: { id: string; name: string; email: string | null; points: number };
  onClose: () => void;
  onMerged: () => void;
}) {
  const [step, setStep] = useState<MergeStep>("search");
  const [query, setQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [results, setResults] = useState<CustomerSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [duplicate, setDuplicate] = useState<CustomerSearchResult | null>(null);
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!debouncedQ.trim()) { setResults([]); return; }
    setSearching(true);
    apiGet<CustomerSearchResult[]>(`/api/v1/customers/search?q=${encodeURIComponent(debouncedQ)}`)
      .then((r) => setResults(Array.isArray(r) ? r.filter(c => c.id !== primary.id).slice(0, 5) : []))
      .catch(() => setResults([]))
      .finally(() => setSearching(false));
  }, [debouncedQ, primary.id]);

  const handleConfirmMerge = async () => {
    if (!duplicate) return;
    setMerging(true); setMergeError(null);
    try {
      await apiPost(`/api/v1/customers/${primary.id}/merge`, { merge_from_id: duplicate.id });
      onMerged();
      onClose();
    } catch (err) {
      setMergeError(err instanceof ApiResponseError ? err.message : "Merge failed.");
    } finally {
      setMerging(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-md bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-950">Merge duplicate customer</h2>
          <button type="button" onClick={onClose} aria-label="Close merge modal" className="flex h-9 w-9 items-center justify-center rounded-md text-xl leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-600">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {step === "search" && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Search for the duplicate record to merge into <span className="font-semibold text-slate-950">{primary.name}</span>. The primary record&apos;s name and email will be kept; loyalty points will be summed.
              </p>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Search by name or email</label>
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Type to search…"
                  className={INPUT_CLASS}
                  autoFocus
                />
              </div>

              {searching && (
                <p className="text-sm text-slate-400" aria-busy="true">Searching…</p>
              )}

              {!searching && debouncedQ && results.length === 0 && (
                <p className="text-sm text-slate-500">No customers found matching &ldquo;{debouncedQ}&rdquo;.</p>
              )}

              {results.length > 0 && (
                <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
                  {results.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-950">{r.name}</p>
                        <p className="text-xs text-slate-500">{r.email} &middot; {r.phone}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setDuplicate(r); setStep("confirm"); }}
                        className="shrink-0 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Merge into this record
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {step === "confirm" && duplicate && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                You are about to merge <span className="font-semibold text-slate-950">{duplicate.name}</span> into <span className="font-semibold text-slate-950">{primary.name}</span>. This cannot be undone.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md border border-success-200 bg-success-50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-success-700">Kept (Primary)</p>
                  <p className="mt-1 text-sm font-medium text-slate-950">{primary.name}</p>
                  <p className="text-xs text-slate-600">{primary.email ?? "—"}</p>
                  <p className="mt-1 text-xs text-slate-500">Points: {primary.points} + duplicate&apos;s points</p>
                  <p className="text-xs text-slate-500">All orders from duplicate will be reassigned here</p>
                </div>
                <div className="rounded-md border border-danger-200 bg-danger-50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-danger-700">Deleted (Duplicate)</p>
                  <p className="mt-1 text-sm font-medium text-slate-950">{duplicate.name}</p>
                  <p className="text-xs text-slate-600">{duplicate.email}</p>
                  <p className="mt-1 text-xs text-slate-500">{duplicate.phone}</p>
                </div>
              </div>
              {mergeError && (
                <p role="alert" className="rounded-md bg-danger-50 px-3 py-2 text-sm text-danger-700">{mergeError}</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-slate-200 px-5 py-3">
          {step === "confirm" ? (
            <>
              <button type="button" onClick={() => setStep("search")} className="min-h-[40px] rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Back</button>
              <button
                type="button"
                onClick={() => void handleConfirmMerge()}
                disabled={merging}
                className="min-h-[40px] rounded-md bg-danger-600 px-4 py-2 text-sm font-medium text-white hover:bg-danger-700 disabled:opacity-60"
              >
                {merging ? "Merging…" : "Confirm Merge"}
              </button>
            </>
          ) : (
            <button type="button" onClick={onClose} className="min-h-[40px] rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <EnterpriseShell
      active="customers"
      title="Customer"
      subtitle="Loading..."
      contentClassName="overflow-y-auto"
    >
      <div className="mx-auto w-full max-w-5xl px-4 py-6">
        <div className="mb-5 h-4 w-24 animate-pulse rounded bg-slate-200" />
        <div className="mb-3 h-8 w-64 animate-pulse rounded bg-slate-200" />
        <div className="flex gap-2 mb-6">
          <div className="h-6 w-16 animate-pulse rounded bg-slate-200" />
          <div className="h-6 w-16 animate-pulse rounded bg-slate-200" />
        </div>
        <div className="flex gap-1 border-b border-slate-200 mb-6">
          {["General", "Transactions", "Financials", "Store Credit"].map((t) => (
            <div key={t} className="h-10 w-24 animate-pulse rounded-t bg-slate-200 mr-1" />
          ))}
        </div>
        <Card>
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i}>
                <div className="mb-1 h-3 w-20 animate-pulse rounded bg-slate-200" />
                <div className="h-10 animate-pulse rounded-md bg-slate-200" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </EnterpriseShell>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CustomerDetailPage() {
  const params = useParams();
  const customerId = params?.id as string;
  const { addToast } = useToast();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [summary, setSummary] = useState<CustomerSummary | null>(null);
  const [financials, setFinancials] = useState<CustomerFinancials | null>(null);
  const [loyalty, setLoyalty] = useState<CustomerLoyalty | null>(null);
  const [loyaltyLoading, setLoyaltyLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>("general");
  const [editMode, setEditMode] = useState(false);
  const [showMerge, setShowMerge] = useState(false);

  const user = getUser();
  const canEdit = user?.role === "owner" || user?.role === "manager";

  const loadData = useCallback(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoyaltyLoading(true);
    setError(null);

    Promise.all([
      apiGet<Customer>(`/api/v1/customers/${customerId}`, { signal: controller.signal }),
      apiGet<CustomerSummary>(`/api/v1/customers/${customerId}/summary`, {
        signal: controller.signal,
      }).catch(() => null),
      apiGet<CustomerFinancials>(`/api/v1/customers/${customerId}/financials`, {
        signal: controller.signal,
      }).catch(() => null),
    ])
      .then(([cust, sum, fin]) => {
        if (controller.signal.aborted) return;
        setCustomer(cust);
        setSummary(sum);
        setFinancials(fin);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(
          err instanceof ApiResponseError ? err.message : "Could not load customer."
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    // Load loyalty data independently so a missing endpoint doesn't break the page
    apiGet<CustomerLoyalty>(`/api/v1/customers/${customerId}/loyalty`, { signal: controller.signal })
      .then((loy) => { if (!controller.signal.aborted) setLoyalty(loy); })
      .catch(() => { if (!controller.signal.aborted) setLoyalty(null); })
      .finally(() => { if (!controller.signal.aborted) setLoyaltyLoading(false); });

    return controller;
  }, [customerId]);

  useEffect(() => {
    const controller = loadData();
    return () => controller.abort();
  }, [loadData]);

  if (loading) return <Skeleton />;

  if (error || !customer) {
    return (
      <EnterpriseShell
        active="customers"
        title="Customer"
        subtitle="Error"
        contentClassName="overflow-y-auto"
      >
        <div className="p-6">
          <Link
            href="/customers"
            className="inline-flex items-center gap-1 text-sm text-slate-950 hover:underline mb-4"
          >
            <BackIcon /> Back to Customers
          </Link>
          <div
            className="rounded-md border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700"
            role="alert"
          >
            {error ?? "Customer not found."}
          </div>
        </div>
      </EnterpriseShell>
    );
  }

  const tabs: Array<{ key: DetailTab; label: string }> = [
    { key: "general", label: "General" },
    { key: "transactions", label: "Transactions" },
    { key: "financials", label: "Financials" },
    { key: "store-credit", label: "Store Credit" },
    { key: "contacts", label: "Contacts" },
    { key: "addresses", label: "Addresses" },
  ];

  return (
    <EnterpriseShell
      active="customers"
      title={customer.name}
      subtitle="Customer profile"
      contentClassName="overflow-y-auto"
    >
      <div className="mx-auto w-full max-w-5xl flex flex-col gap-5 px-4 py-6">
        {/* Back */}
        <div>
          <Link
            href="/customers"
            className="inline-flex items-center gap-1 text-sm text-slate-950 hover:underline"
          >
            <BackIcon /> Back to Customers
          </Link>
        </div>

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-950">{customer.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex rounded border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-950">
                {tierLabel(customer.tier)}
              </span>
              <span
                className={`inline-flex rounded px-2.5 py-0.5 text-xs font-semibold capitalize ${statusColor(customer.status)}`}
              >
                {customer.status}
              </span>
              {customer.verified && (
                <span className="inline-flex rounded bg-success-100 px-2.5 py-0.5 text-xs font-semibold text-success-700">
                  Verified
                </span>
              )}
            </div>
          </div>

          {canEdit && (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowMerge(true)}
              >
                Merge duplicate
              </Button>
              <Button
                variant={editMode ? "secondary" : "primary"}
                size="sm"
                onClick={() => {
                  setEditMode((prev) => !prev);
                  setActiveTab("general");
                }}
              >
                {editMode ? "Cancel edit" : "Edit"}
              </Button>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-slate-200">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={[
                "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
                activeTab === tab.key
                  ? "border-slate-950 text-slate-950"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300",
              ].join(" ")}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab panels */}
        {activeTab === "general" && (
          <GeneralTab
            customer={customer}
            editMode={editMode}
            onSaved={(updated) => {
              setCustomer(updated);
              setEditMode(false);
              addToast({ title: "Customer saved", variant: "success" });
            }}
            onSaveError={(msg) => {
              addToast({ title: "Save failed", description: msg, variant: "error" });
            }}
            onCancel={() => setEditMode(false)}
          />
        )}
        {activeTab === "transactions" && <TransactionsTab summary={summary} />}
        {activeTab === "financials" && (
          <FinancialsTab customer={customer} summary={summary} financials={financials} />
        )}
        {activeTab === "store-credit" && (
          <StoreCreditTab customer={customer} financials={financials} canEdit={canEdit} />
        )}
        {activeTab === "contacts" && (
          <ContactsTab customerId={customerId} canEdit={canEdit} addToast={addToast} />
        )}
        {activeTab === "addresses" && (
          <AddressesTab customerId={customerId} canEdit={canEdit} addToast={addToast} />
        )}

        {/* Loyalty card + Notes always visible below tabs */}
        {activeTab !== "contacts" && activeTab !== "addresses" && (
          <>
            <LoyaltyCard loyalty={loyalty} loading={loyaltyLoading} />
            <NotesPanel customerId={customerId} canEdit={canEdit} addToast={addToast} />
          </>
        )}
      </div>

      {showMerge && (
        <MergeModal
          primary={{ id: customer.id, name: customer.name, email: customer.email, points: customer.points }}
          onClose={() => setShowMerge(false)}
          onMerged={() => {
            addToast({ title: "Merged successfully. Duplicate record deleted.", variant: "success" });
            loadData();
          }}
        />
      )}
    </EnterpriseShell>
  );
}

// ─── Loyalty Card ─────────────────────────────────────────────────────────────

const TIER_BADGE_COLOR: Record<number, string> = {
  1: "bg-amber-100 text-amber-800",
  2: "bg-slate-100 text-slate-700",
  3: "bg-yellow-100 text-yellow-800",
  4: "bg-violet-100 text-violet-700",
};

function LoyaltyCard({
  loyalty,
  loading,
}: {
  loyalty: CustomerLoyalty | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <Card title="Loyalty">
        <div className="space-y-2">
          <div className="h-4 w-48 animate-pulse rounded bg-slate-100" />
          <div className="h-4 w-32 animate-pulse rounded bg-slate-100" />
        </div>
      </Card>
    );
  }

  if (!loyalty || loyalty.currentTierName === null) {
    return (
      <Card title="Loyalty">
        <p className="text-sm text-slate-500">
          No tier configured — set up loyalty tiers in Settings
        </p>
      </Card>
    );
  }

  const tierBadgeClass =
    TIER_BADGE_COLOR[loyalty.currentTierLevel] ?? "bg-slate-100 text-slate-700";

  const progressPct =
    loyalty.pointsToNextTier !== null && loyalty.currentPoints !== undefined
      ? Math.min(
          100,
          Math.round(
            (loyalty.currentPoints /
              (loyalty.currentPoints + loyalty.pointsToNextTier)) *
              100,
          ),
        )
      : 100;

  return (
    <Card title="Loyalty">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-8">
        {/* Left: tier info */}
        <div className="flex flex-col gap-2">
          <span
            className={`inline-flex w-fit rounded-full px-2.5 py-0.5 text-xs font-semibold ${tierBadgeClass}`}
          >
            {loyalty.currentTierName}
          </span>
          <p className="text-2xl font-bold tabular-nums text-slate-950">
            {loyalty.currentPoints.toLocaleString()}{" "}
            <span className="text-sm font-normal text-slate-500">pts</span>
          </p>
          <p className="text-sm text-slate-500">{loyalty.pointMultiplier}× earn</p>
          {loyalty.discountPct > 0 && (
            <Badge variant="green">{loyalty.discountPct}% discount on purchases</Badge>
          )}
        </div>

        {/* Right: progress to next tier */}
        <div className="flex-1">
          {loyalty.nextTierName !== null && loyalty.pointsToNextTier !== null ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-slate-600">
                <span className="font-semibold text-slate-950">
                  {loyalty.pointsToNextTier.toLocaleString()} pts
                </span>{" "}
                to {loyalty.nextTierName}
              </p>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-2 rounded-full bg-blue-600 transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          ) : (
            <p className="text-sm font-semibold text-violet-700">Top tier 🎉</p>
          )}
        </div>
      </div>
    </Card>
  );
}

// ─── General Tab ─────────────────────────────────────────────────────────────

function GeneralTab({
  customer,
  editMode,
  onSaved,
  onSaveError,
  onCancel,
}: {
  customer: Customer;
  editMode: boolean;
  onSaved: (updated: Customer) => void;
  onSaveError: (msg: string) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    name: customer.name,
    email: customer.email ?? "",
    phone: customer.phone ?? "",
    company: customer.company ?? "",
    dba: customer.dba ?? "",
    taxId: customer.taxId ?? "",
    licenseNo: customer.licenseNo ?? "",
    state: customer.state ?? "",
    tier: customer.tier?.toString() ?? "",
    status: customer.status,
    billingAddress: customer.billingAddress ?? "",
    shippingAddress: customer.shippingAddress ?? "",
    creditLimitDollars: customer.credit_limit_cents != null ? (customer.credit_limit_cents / 100).toFixed(2) : "",
  });
  const [saving, setSaving] = useState(false);

  // Sync form when customer changes externally
  useEffect(() => {
    setForm({
      name: customer.name,
      email: customer.email ?? "",
      phone: customer.phone ?? "",
      company: customer.company ?? "",
      dba: customer.dba ?? "",
      taxId: customer.taxId ?? "",
      licenseNo: customer.licenseNo ?? "",
      state: customer.state ?? "",
      tier: customer.tier?.toString() ?? "",
      status: customer.status,
      billingAddress: customer.billingAddress ?? "",
      shippingAddress: customer.shippingAddress ?? "",
      creditLimitDollars: customer.credit_limit_cents != null ? (customer.credit_limit_cents / 100).toFixed(2) : "",
    });
  }, [customer]);

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const creditLimitCents = form.creditLimitDollars.trim()
        ? Math.round(parseFloat(form.creditLimitDollars) * 100)
        : null;
      const body: Record<string, unknown> = {
        name: form.name || undefined,
        email: form.email || undefined,
        phone: form.phone || undefined,
        company: form.company || undefined,
        dba: form.dba || undefined,
        taxId: form.taxId || undefined,
        licenseNo: form.licenseNo || undefined,
        state: form.state || undefined,
        tier: form.tier ? Number(form.tier) : undefined,
        status: form.status || undefined,
        billingAddress: form.billingAddress || undefined,
        shippingAddress: form.shippingAddress || undefined,
        creditLimitCents: creditLimitCents !== null && !isNaN(creditLimitCents) ? creditLimitCents : undefined,
      };
      const updated = await apiPatch<Customer>(`/api/v1/customers/${customer.id}`, body);
      onSaved(updated);
    } catch (err) {
      onSaveError(err instanceof ApiResponseError ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  if (editMode) {
    return (
      <div className="flex flex-col gap-5">
        {/* Edit actions banner */}
        <div className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-100 px-4 py-3">
          <p className="text-sm font-medium text-slate-800">Editing customer profile</p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={saving}
              onClick={() => void handleSave()}
            >
              Save changes
            </Button>
          </div>
        </div>

        <Card title="Contact information">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={LABEL_CLASS}>Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Phone</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
          </div>
        </Card>

        <Card title="Business information">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS}>Company</label>
              <input
                type="text"
                value={form.company}
                onChange={(e) => update("company", e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>DBA</label>
              <input
                type="text"
                value={form.dba}
                onChange={(e) => update("dba", e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Tax ID</label>
              <input
                type="text"
                value={form.taxId}
                onChange={(e) => update("taxId", e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>License No.</label>
              <input
                type="text"
                value={form.licenseNo}
                onChange={(e) => update("licenseNo", e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>State</label>
              <input
                type="text"
                value={form.state}
                onChange={(e) => update("state", e.target.value)}
                placeholder="e.g. CA"
                className={INPUT_CLASS}
              />
            </div>
          </div>
        </Card>

        <Card title="Account settings">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS}>Tier</label>
              <select
                value={form.tier}
                onChange={(e) => update("tier", e.target.value)}
                className={INPUT_CLASS}
              >
                <option value="">Standard</option>
                <option value="1">Tier 1</option>
                <option value="2">Tier 2</option>
                <option value="3">Tier 3</option>
                <option value="4">Tier 4</option>
                <option value="5">Tier 5</option>
              </select>
            </div>
            <div>
              <label className={LABEL_CLASS}>Status</label>
              <select
                value={form.status}
                onChange={(e) => update("status", e.target.value)}
                className={INPUT_CLASS}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div>
              <label className={LABEL_CLASS}>Credit Limit ($, optional)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.creditLimitDollars}
                onChange={(e) => update("creditLimitDollars", e.target.value)}
                placeholder="No limit"
                className={INPUT_CLASS}
              />
              <p className="mt-1 text-xs text-slate-400">Leave empty for no credit limit (pay-as-you-go).</p>
            </div>
          </div>
        </Card>

        <Card title="Addresses">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS}>Billing Address</label>
              <textarea
                value={form.billingAddress}
                onChange={(e) => update("billingAddress", e.target.value)}
                rows={3}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Shipping Address</label>
              <textarea
                value={form.shippingAddress}
                onChange={(e) => update("shippingAddress", e.target.value)}
                rows={3}
                className={INPUT_CLASS}
              />
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // Display mode
  return (
    <div className="flex flex-col gap-5">
      <Card title="Contact information">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <ReadField label="Name" value={customer.name} />
          </div>
          <ReadField label="Email" value={customer.email} />
          <ReadField label="Phone" value={customer.phone} />
        </div>
      </Card>

      <Card title="Business information">
        <div className="grid gap-4 sm:grid-cols-2">
          <ReadField label="Company" value={customer.company} />
          <ReadField label="DBA" value={customer.dba} />
          <ReadField label="Tax ID" value={customer.taxId} />
          <ReadField label="License No." value={customer.licenseNo} />
          <ReadField label="State" value={customer.state} />
        </div>
      </Card>

      <Card title="Account settings">
        <div className="grid gap-4 sm:grid-cols-2">
          <ReadField label="Tier" value={tierLabel(customer.tier)} />
          <ReadField label="Status" value={customer.status} />
          <ReadField label="Loyalty Points" value={String(customer.points)} />
          {customer.credit_limit_cents !== undefined && (
            <ReadField label="Credit Limit" value={formatMoney(customer.credit_limit_cents)} />
          )}
        </div>
      </Card>

      <Card title="Addresses">
        <div className="grid gap-4 sm:grid-cols-2">
          <ReadField label="Billing Address" value={customer.billingAddress} />
          <ReadField label="Shipping Address" value={customer.shippingAddress} />
        </div>
      </Card>
    </div>
  );
}

// ─── Transactions Tab ─────────────────────────────────────────────────────────

function TransactionsTab({ summary }: { summary: CustomerSummary | null }) {
  if (!summary) {
    return (
      <Card>
        <p className="text-sm text-slate-500">Transaction data unavailable.</p>
      </Card>
    );
  }

  const orders = summary.recentOrders;

  return (
    <div className="flex flex-col gap-5">
      <Card
        title="Recent transactions"
        description="Showing most recent orders for this customer."
      >
        {orders.length === 0 ? (
          <p className="text-sm text-slate-500">No transactions yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Order #</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-right">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {orders.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link
                        href="/sales"
                        className="font-mono text-xs font-semibold text-slate-950 underline-offset-2 hover:underline"
                      >
                        {order.orderNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded px-2 py-0.5 text-xs font-semibold capitalize ${orderStatusColor(order.status)}`}
                      >
                        {order.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-950">
                      {formatMoney(order.totalCents)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500">
                      {formatDate(order.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Financials Tab ───────────────────────────────────────────────────────────

function FinancialsTab({
  customer,
  summary,
  financials,
}: {
  customer: Customer;
  summary: CustomerSummary | null;
  financials: CustomerFinancials | null;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <FinancialMetric
          label="Open invoices"
          value={financials ? formatMoney(financials.openInvoicesCents) : "—"}
          sub="outstanding balance"
        />
        <FinancialMetric
          label="Paid invoices"
          value={financials ? formatMoney(financials.paidInvoicesCents) : "—"}
          sub="total paid"
        />
        <FinancialMetric
          label="Loyalty points"
          value={String(customer.points)}
          sub="redeemable at checkout"
        />
        <FinancialMetric
          label="Avg order value"
          value={summary ? formatMoney(summary.avgOrderCents) : "—"}
          sub="per transaction"
        />
        <FinancialMetric
          label="Total visits"
          value={summary ? String(summary.visits) : "—"}
          sub="all time"
        />
        <FinancialMetric
          label="Total spend"
          value={summary ? formatMoney(summary.totalSpentCents) : "—"}
          sub="lifetime"
        />
        {customer.credit_limit_cents != null && (
          <FinancialMetric
            label="Credit limit"
            value={formatMoney(customer.credit_limit_cents)}
            sub={
              financials && financials.openInvoicesCents > 0
                ? `${Math.round((financials.openInvoicesCents / customer.credit_limit_cents) * 100)}% utilized`
                : "0% utilized"
            }
          />
        )}
      </div>

      {financials === null && (
        <div
          className="rounded-md border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-700"
          role="status"
        >
          Financial data could not be loaded. Showing available summary data only.
        </div>
      )}
    </div>
  );
}

function FinancialMetric({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <Card className="flex flex-col gap-1">
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="text-2xl font-bold text-slate-950">{value}</p>
      <p className="text-xs text-slate-500">{sub}</p>
    </Card>
  );
}

// ─── Store Credit Tab ─────────────────────────────────────────────────────────

function StoreCreditTab({
  customer,
  financials,
  canEdit,
}: {
  customer: Customer;
  financials: CustomerFinancials | null;
  canEdit: boolean;
}) {
  const creditBalance = financials?.storeCredit ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <Card title="Store credit balance">
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-3xl font-bold text-slate-950">{formatMoney(creditBalance)}</p>
            <p className="mt-1 text-sm text-slate-500">
              Available store credit for {customer.name}
            </p>
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            <p className="font-medium text-slate-700">Credit management</p>
            <p className="mt-1">
              Store credit is applied and managed at checkout. To add or redeem credit,
              open a new sale from the{" "}
              <Link href="/terminal" className="text-slate-950 underline underline-offset-2">
                Register
              </Link>{" "}
              and select the customer at the tender screen.
            </p>
          </div>
        </div>
      </Card>

      {canEdit && (
        <Card title="Credit details">
          <div className="grid gap-4 sm:grid-cols-2">
            {customer.credit_limit_cents !== undefined && (
              <div>
                <p className={LABEL_CLASS}>Credit limit</p>
                <p className="text-lg font-bold text-slate-950">
                  {formatMoney(customer.credit_limit_cents)}
                </p>
              </div>
            )}
            <div>
              <p className={LABEL_CLASS}>Current balance</p>
              <p className="text-lg font-bold text-slate-950">{formatMoney(creditBalance)}</p>
            </div>
          </div>
          <p className="mt-4 text-xs text-slate-400">
            Credit management via checkout. Contact support to adjust credit limits.
          </p>
        </Card>
      )}
    </div>
  );
}

// ─── Addresses Sub-panel ──────────────────────────────────────────────────────

interface CustomerAddress {
  id: string;
  address_type: string;
  address_line1: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  is_default: boolean;
}

function AddressesPanel({ customerId, canEdit, addToast }: { customerId: string; canEdit: boolean; addToast: ReturnType<typeof useToast>["addToast"] }) {
  return <AddressesTab customerId={customerId} canEdit={canEdit} addToast={addToast} />;
}

type AddrForm = { address_type: string; address_line1: string; address_line2: string; city: string; state: string; zip: string; country: string; is_default: boolean };
const BLANK_ADDR: AddrForm = { address_type: "billing", address_line1: "", address_line2: "", city: "", state: "", zip: "", country: "US", is_default: false };

function AddressesTab({ customerId, canEdit, addToast }: { customerId: string; canEdit: boolean; addToast: ReturnType<typeof useToast>["addToast"] }) {
  const [items, setItems] = useState<CustomerAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<AddrForm>(BLANK_ADDR);
  const [editTarget, setEditTarget] = useState<CustomerAddress | null>(null);
  const [editForm, setEditForm] = useState<AddrForm>(BLANK_ADDR);
  const [deleteTarget, setDeleteTarget] = useState<CustomerAddress | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    apiGet<{ items: CustomerAddress[] }>(`/api/v1/customers/${customerId}/addresses`)
      .then(r => setItems(r.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!form.address_line1.trim() || !form.city.trim()) return;
    setBusy(true);
    try {
      await apiPost(`/api/v1/customers/${customerId}/addresses`, {
        addressType: form.address_type, addressLine1: form.address_line1.trim(),
        addressLine2: form.address_line2.trim() || null, city: form.city.trim(),
        state: form.state.trim() || null, zip: form.zip.trim() || null,
        country: form.country || "US", isDefault: form.is_default,
      });
      setShowForm(false); setForm(BLANK_ADDR); load();
      addToast({ title: "Address added", variant: "success" });
    } catch (e) {
      addToast({ title: "Failed", description: e instanceof Error ? e.message : "Unknown error", variant: "error" });
    } finally { setBusy(false); }
  };

  const startEdit = (addr: CustomerAddress) => {
    setEditTarget(addr);
    setEditForm({ address_type: addr.address_type, address_line1: addr.address_line1 ?? "", address_line2: addr.address_line2 ?? "", city: addr.city ?? "", state: addr.state ?? "", zip: addr.zip ?? "", country: addr.country ?? "US", is_default: addr.is_default });
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    setBusy(true);
    try {
      await apiPatch(`/api/v1/customers/${customerId}/addresses/${editTarget.id}`, {
        addressType: editForm.address_type, addressLine1: editForm.address_line1.trim() || null,
        addressLine2: editForm.address_line2.trim() || null, city: editForm.city.trim() || null,
        state: editForm.state.trim() || null, zip: editForm.zip.trim() || null,
        country: editForm.country || null, isDefault: editForm.is_default,
      });
      setEditTarget(null); load();
      addToast({ title: "Address updated", variant: "success" });
    } catch (e) {
      addToast({ title: "Failed", description: e instanceof Error ? e.message : "Unknown error", variant: "error" });
    } finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await apiDelete(`/api/v1/customers/${customerId}/addresses/${id}`);
      setDeleteTarget(null); load();
      addToast({ title: "Address removed", variant: "success" });
    } catch (e) {
      addToast({ title: "Failed", description: e instanceof Error ? e.message : "Unknown error", variant: "error" });
    } finally { setBusy(false); }
  };

  return (
    <>
      <ConfirmDialog open={!!deleteTarget} title="Remove address"
        message={`Remove this ${deleteTarget?.address_type ?? ""} address?`}
        confirmLabel="Remove" destructive
        onConfirm={() => deleteTarget && void remove(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)} />

      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setEditTarget(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-slate-900">Edit Address</h2>
            <div className="space-y-3">
              <div className="flex gap-3">
                <select value={editForm.address_type} onChange={e => setEditForm(f => ({ ...f, address_type: e.target.value }))} className="w-36 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-950">
                  <option value="billing">Billing</option>
                  <option value="shipping">Shipping</option>
                </select>
                <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input type="checkbox" checked={editForm.is_default} onChange={e => setEditForm(f => ({ ...f, is_default: e.target.checked }))} className="h-4 w-4 rounded border-slate-300 accent-blue-600" />
                  Default
                </label>
              </div>
              <input value={editForm.address_line1} onChange={e => setEditForm(f => ({ ...f, address_line1: e.target.value }))} placeholder="Address line 1" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-950" />
              <input value={editForm.address_line2} onChange={e => setEditForm(f => ({ ...f, address_line2: e.target.value }))} placeholder="Address line 2" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-950" />
              <div className="flex gap-3">
                <input value={editForm.city} onChange={e => setEditForm(f => ({ ...f, city: e.target.value }))} placeholder="City" className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-950" />
                <input value={editForm.state} onChange={e => setEditForm(f => ({ ...f, state: e.target.value }))} placeholder="State" className="w-20 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-950" />
                <input value={editForm.zip} onChange={e => setEditForm(f => ({ ...f, zip: e.target.value }))} placeholder="ZIP" className="w-24 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-950" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button size="sm" variant="secondary" onClick={() => setEditTarget(null)}>Cancel</Button>
              <Button size="sm" variant="primary" loading={busy} onClick={() => void saveEdit()}>Save</Button>
            </div>
          </div>
        </div>
      )}

      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-950">Addresses</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{items.length}</span>
          </div>
          {canEdit && (
            <Button size="sm" variant="secondary" onClick={() => setShowForm(v => !v)}>
              {showForm ? "Cancel" : "+ Add address"}
            </Button>
          )}
        </div>

        {showForm && canEdit && (
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-4 space-y-3">
            <div className="flex flex-wrap gap-3">
              <select value={form.address_type} onChange={e => setForm(f => ({ ...f, address_type: e.target.value }))} className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-950">
                <option value="billing">Billing</option>
                <option value="shipping">Shipping</option>
              </select>
              <input value={form.address_line1} onChange={e => setForm(f => ({ ...f, address_line1: e.target.value }))} placeholder="Address line 1 (required)" className="flex-1 min-w-48 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-950" />
              <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} placeholder="City (required)" className="w-32 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-950" />
              <input value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} placeholder="State" className="w-20 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-950" />
              <input value={form.zip} onChange={e => setForm(f => ({ ...f, zip: e.target.value }))} placeholder="ZIP" className="w-24 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-950" />
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input type="checkbox" checked={form.is_default} onChange={e => setForm(f => ({ ...f, is_default: e.target.checked }))} className="h-4 w-4 rounded border-slate-300 accent-blue-600" />
                Set as default
              </label>
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => { setShowForm(false); setForm(BLANK_ADDR); }}>Cancel</Button>
                <Button size="sm" variant="primary" loading={busy} disabled={!form.address_line1.trim() || !form.city.trim()} onClick={() => void add()}>Add</Button>
              </div>
            </div>
          </div>
        )}

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Address</th>
              <th className="px-4 py-3">City / State / ZIP</th>
              <th className="px-4 py-3">Default</th>
              {canEdit && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>}
            {!loading && items.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No addresses yet.</td></tr>}
            {items.map(addr => (
              <tr key={addr.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 capitalize text-slate-700">{addr.address_type}</td>
                <td className="px-4 py-3">
                  <p>{addr.address_line1}</p>
                  {addr.address_line2 && <p className="text-xs text-slate-500">{addr.address_line2}</p>}
                </td>
                <td className="px-4 py-3 text-slate-500">{[addr.city, addr.state, addr.zip].filter(Boolean).join(", ")}</td>
                <td className="px-4 py-3">
                  {addr.is_default ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">Default</span> : "—"}
                </td>
                {canEdit && (
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => startEdit(addr)} className="text-xs text-slate-500 hover:text-slate-800 underline">Edit</button>
                      <button onClick={() => setDeleteTarget(addr)} className="text-xs text-red-500 hover:text-red-700 underline">Remove</button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

// ─── Contacts Tab ─────────────────────────────────────────────────────────────

interface CustomerContact {
  id: string;
  contact_name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
}

function ContactsPanel({ customerId, canEdit, addToast }: { customerId: string; canEdit: boolean; addToast: ReturnType<typeof useToast>["addToast"] }) {
  return <ContactsTab customerId={customerId} canEdit={canEdit} addToast={addToast} />;
}

function ContactsTab({ customerId, canEdit, addToast }: { customerId: string; canEdit: boolean; addToast: ReturnType<typeof useToast>["addToast"] }) {
  const [items, setItems] = useState<CustomerContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ contact_name: "", title: "", email: "", phone: "", is_primary: false });
  const [editTarget, setEditTarget] = useState<CustomerContact | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CustomerContact | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    apiGet<{ items: CustomerContact[] }>(`/api/v1/customers/${customerId}/contacts`)
      .then(r => setItems(r.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!form.contact_name.trim()) return;
    setBusy(true);
    try {
      await apiPost(`/api/v1/customers/${customerId}/contacts`, {
        contactName: form.contact_name.trim(),
        title: form.title.trim() || undefined,
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        isPrimary: form.is_primary,
      });
      setShowForm(false);
      setForm({ contact_name: "", title: "", email: "", phone: "", is_primary: false });
      load();
      addToast({ title: "Contact added", variant: "success" });
    } catch (e) {
      addToast({ title: "Failed", description: e instanceof Error ? e.message : "Unknown error", variant: "error" });
    } finally { setBusy(false); }
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    setBusy(true);
    try {
      await apiPatch(`/api/v1/customers/${customerId}/contacts/${editTarget.id}`, {
        contactName: editTarget.contact_name,
        title: editTarget.title || null,
        email: editTarget.email || null,
        phone: editTarget.phone || null,
        isPrimary: editTarget.is_primary,
      });
      setEditTarget(null);
      load();
      addToast({ title: "Contact updated", variant: "success" });
    } catch (e) {
      addToast({ title: "Failed", description: e instanceof Error ? e.message : "Unknown error", variant: "error" });
    } finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await apiDelete(`/api/v1/customers/${customerId}/contacts/${id}`);
      setDeleteTarget(null);
      load();
      addToast({ title: "Contact removed", variant: "success" });
    } catch (e) {
      addToast({ title: "Failed", description: e instanceof Error ? e.message : "Unknown error", variant: "error" });
    } finally { setBusy(false); }
  };

  return (
    <>
      <ConfirmDialog open={!!deleteTarget} title="Remove contact"
        message={`Remove ${deleteTarget?.contact_name ?? "this contact"} from this account?`}
        confirmLabel="Remove" destructive
        onConfirm={() => deleteTarget && void remove(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)} />

      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setEditTarget(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-slate-900">Edit Contact</h2>
            <div className="space-y-3">
              <input value={editTarget.contact_name} onChange={e => setEditTarget(t => t && ({ ...t, contact_name: e.target.value }))} placeholder="Name" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-950" />
              <input value={editTarget.title ?? ""} onChange={e => setEditTarget(t => t && ({ ...t, title: e.target.value }))} placeholder="Title" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-950" />
              <input type="email" value={editTarget.email ?? ""} onChange={e => setEditTarget(t => t && ({ ...t, email: e.target.value }))} placeholder="Email" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-950" />
              <input type="tel" value={editTarget.phone ?? ""} onChange={e => setEditTarget(t => t && ({ ...t, phone: e.target.value }))} placeholder="Phone" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-950" />
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input type="checkbox" checked={editTarget.is_primary} onChange={e => setEditTarget(t => t && ({ ...t, is_primary: e.target.checked }))} className="h-4 w-4 rounded border-slate-300 accent-blue-600" />
                Primary contact
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button size="sm" variant="secondary" onClick={() => setEditTarget(null)}>Cancel</Button>
              <Button size="sm" variant="primary" loading={busy} onClick={() => void saveEdit()}>Save</Button>
            </div>
          </div>
        </div>
      )}

      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-950">Contacts</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{items.length}</span>
          </div>
          {canEdit && (
            <Button size="sm" variant="secondary" onClick={() => setShowForm(v => !v)}>
              {showForm ? "Cancel" : "+ Add contact"}
            </Button>
          )}
        </div>

        {showForm && canEdit && (
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-4 space-y-3">
            <div className="flex flex-wrap gap-3">
              <input value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} placeholder="Name (required)" className="flex-1 min-w-36 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-950" />
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Title" className="w-36 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-950" />
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="Email" className="w-48 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-950" />
              <input type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="Phone" className="w-36 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-950" />
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input type="checkbox" checked={form.is_primary} onChange={e => setForm(f => ({ ...f, is_primary: e.target.checked }))} className="h-4 w-4 rounded border-slate-300 accent-blue-600" />
                Primary contact
              </label>
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => { setShowForm(false); setForm({ contact_name: "", title: "", email: "", phone: "", is_primary: false }); }}>Cancel</Button>
                <Button size="sm" variant="primary" loading={busy} disabled={!form.contact_name.trim()} onClick={() => void add()}>Add</Button>
              </div>
            </div>
          </div>
        )}

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Primary</th>
              {canEdit && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>}
            {!loading && items.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No contacts yet.</td></tr>}
            {items.map(contact => (
              <tr key={contact.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">{contact.contact_name}</td>
                <td className="px-4 py-3 text-slate-500">{contact.title ?? "—"}</td>
                <td className="px-4 py-3 text-slate-500">{contact.email ?? "—"}</td>
                <td className="px-4 py-3 text-slate-500">{contact.phone ?? "—"}</td>
                <td className="px-4 py-3">
                  {contact.is_primary
                    ? <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">Primary</span>
                    : <button onClick={() => { /* promote to primary */ void saveEdit(); }} className="text-xs text-slate-400">—</button>}
                </td>
                {canEdit && (
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setEditTarget({ ...contact })} className="text-xs text-slate-500 hover:text-slate-800 underline">Edit</button>
                      <button onClick={() => setDeleteTarget(contact)} className="text-xs text-red-500 hover:text-red-700 underline">Remove</button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

// ─── Notes Sub-panel ──────────────────────────────────────────────────────────

interface CustomerNote {
  id: string;
  note_type: string;
  content: string;
  created_at: string;
}

const NOTE_TYPE_BADGE: Record<string, string> = {
  general: "bg-gray-100 text-gray-700",
  billing: "bg-blue-100 text-blue-700",
  compliance: "bg-yellow-100 text-yellow-800",
  internal: "bg-purple-100 text-purple-700",
};

function NotesPanel({ customerId, canEdit, addToast }: { customerId: string; canEdit: boolean; addToast: ReturnType<typeof useToast>["addToast"] }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<CustomerNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [content, setContent] = useState("");
  const [noteType, setNoteType] = useState("general");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    apiGet<{ items: CustomerNote[] }>(`/api/v1/customers/${customerId}/notes`)
      .then(r => setItems(r.items ?? []))
      .catch(() => setItems([]))
      .finally(() => { setLoading(false); setLoaded(true); });
  }, [customerId]);

  const toggle = () => {
    setOpen(v => {
      if (!v && !loaded) load();
      return !v;
    });
  };

  const addNote = async () => {
    if (!content.trim()) return;
    setBusy(true);
    try {
      await apiPost(`/api/v1/customers/${customerId}/notes`, { note_type: noteType, content: content.trim() });
      setContent("");
      setNoteType("general");
      load();
      addToast({ title: "Note added", variant: "success" });
    } catch (e) {
      addToast({ title: "Failed", description: e instanceof Error ? e.message : "Unknown error", variant: "error" });
    } finally { setBusy(false); }
  };

  return (
    <Card className="overflow-hidden p-0">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-950">Notes</span>
          {loaded && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{items.length}</span>
          )}
        </div>
        <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-slate-200">
          {loading && <div className="px-4 py-6 text-center text-sm text-slate-400">Loading…</div>}
          {!loading && items.length === 0 && <div className="px-4 py-4 text-sm text-slate-400">No notes yet.</div>}
          {items.length > 0 && (
            <ul className="divide-y divide-slate-100">
              {items.map(note => (
                <li key={note.id} className="flex items-start gap-3 px-4 py-3">
                  <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${NOTE_TYPE_BADGE[note.note_type] ?? "bg-gray-100 text-gray-700"}`}>
                    {note.note_type}
                  </span>
                  <p className="flex-1 text-sm text-slate-700">{note.content}</p>
                  <span className="shrink-0 text-xs text-slate-400">{new Date(note.created_at).toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
          )}
          {canEdit && (
            <div className="border-t border-slate-200 bg-slate-50 px-4 py-4 space-y-3">
              <div className="flex gap-3">
                <select value={noteType} onChange={e => setNoteType(e.target.value)} className="w-36 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-950">
                  <option value="general">General</option>
                  <option value="billing">Billing</option>
                  <option value="compliance">Compliance</option>
                  <option value="internal">Internal</option>
                </select>
                <textarea
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  rows={2}
                  placeholder="Add a note…"
                  className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-950 resize-none"
                />
              </div>
              <div className="flex justify-end">
                <Button size="sm" variant="primary" loading={busy} disabled={!content.trim()} onClick={() => void addNote()}>Add note</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function BackIcon() {
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}
