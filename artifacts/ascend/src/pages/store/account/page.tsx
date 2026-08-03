
import { useEffect, useState } from "react";
import { useRouter } from "@/lib/router";
import { useStoreAuth } from "@/contexts/StoreAuthContext";
import { apiGet } from "@/api-client/client";
import { formatMoney } from "@/lib/money";
import { fmtDate } from "@/lib/date";

interface Order {
  id: string;
  so_number: string;
  status: string;
  total_cents: number;
  created_at: number;
}

const STATUS_COLOR: Record<string, string> = {
  pending_approve: "bg-amber-100 text-amber-700",
  confirmed:       "bg-blue-100 text-blue-700",
  invoiced:        "bg-purple-100 text-purple-700",
  fulfilled:       "bg-emerald-100 text-emerald-700",
  cancelled:       "bg-red-100 text-red-700",
};

const STATUS_LABEL: Record<string, string> = {
  pending_approve: "Pending",
  confirmed:       "Confirmed",
  invoiced:        "Invoiced",
  fulfilled:       "Fulfilled",
  cancelled:       "Cancelled",
};

export default function StoreAccountPage() {
  const router = useRouter();
  const { customer, logout, loading } = useStoreAuth();
  const [orders, setOrders]   = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);

  useEffect(() => {
    if (!loading && !customer) { router.replace("/store/login"); return; }
    if (!customer) return;
    apiGet<{ salesOrders: Order[] }>(`/api/v1/ecommerce/portal/${customer.id}/orders`)
      .then((r) => setOrders(r.salesOrders ?? []))
      .catch(() => {})
      .finally(() => setOrdersLoading(false));
  }, [customer, loading, router]);

  const handleLogout = async () => {
    await logout();
    router.replace("/store/login");
  };

  if (loading || !customer) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">

      {/* Account header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--color-text-primary)" }}>My Account</h1>
          <p className="mt-0.5 text-sm" style={{ color: "var(--color-text-muted)" }}>{customer.email}</p>
        </div>
        <button
          type="button"
          onClick={() => void handleLogout()}
          className="rounded-xl px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--color-surface-subtle)]"
          style={{ borderWidth: 1, borderStyle: "solid", borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}
        >
          Sign out
        </button>
      </div>

      {/* Profile card */}
      <div className="mb-6 rounded-2xl p-5 shadow-sm" style={{ borderWidth: 1, borderStyle: "solid", borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-600/10 text-xl font-bold text-brand-600">
            {customer.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-semibold" style={{ color: "var(--color-text-primary)" }}>{customer.name}</p>
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>{customer.email}</p>
            <p className="mt-0.5 text-xs" style={{ color: "var(--color-text-muted)" }}>Member since {fmtDate(customer.created_at)}</p>
          </div>
        </div>
      </div>

      {/* Order history */}
      <div className="rounded-2xl shadow-sm overflow-hidden" style={{ borderWidth: 1, borderStyle: "solid", borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
        <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <h2 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>Order History</h2>
        </div>

        {ordersLoading ? (
          <div className="space-y-2 p-4">{[1,2,3].map((i) => <div key={i} className="h-12 animate-skeleton rounded-lg" />)}</div>
        ) : orders.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>No orders yet.</p>
            <button type="button" onClick={() => router.push("/store")}
              className="mt-2 text-sm font-medium text-brand-600 hover:underline">
              Browse products →
            </button>
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-table-border)]">
            {orders.map((o) => (
              <div key={o.id} className="flex items-center gap-4 px-5 py-3.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>{o.so_number}</p>
                  <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{fmtDate(o.created_at)}</p>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_COLOR[o.status] ?? ""}`}
                  style={STATUS_COLOR[o.status] ? undefined : { backgroundColor: "var(--color-surface-subtle)", color: "var(--color-text-muted)" }}>
                  {STATUS_LABEL[o.status] ?? o.status}
                </span>
                <p className="text-sm font-bold w-20 text-right" style={{ color: "var(--color-text-primary)" }}>{formatMoney(o.total_cents)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6">
        <button type="button" onClick={() => router.push("/store")}
          className="text-sm font-medium transition-colors hover:text-brand-600" style={{ color: "var(--color-text-muted)" }}>
          ← Continue shopping
        </button>
      </div>
    </div>
  );
}
