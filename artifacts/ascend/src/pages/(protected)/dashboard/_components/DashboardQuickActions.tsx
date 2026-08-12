import { Link } from "wouter";

function QuickActionNode({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-[13px] font-medium text-[var(--color-text-primary)] shadow-sm transition-all hover:bg-[var(--color-surface-subtle)] hover:text-brand-600 hover:border-brand-500/30">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-brand-500"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
      {label}
    </Link>
  );
}

export function DashboardQuickActions() {
  return (
    <section>
      <div className="flex items-center gap-3 overflow-x-auto pb-2 hide-scrollbar">
        <QuickActionNode href="/purchasing" label="Create Purchase Order" />
        <QuickActionNode href="/inventory/receive-stock" label="Receive Inventory" />
        <QuickActionNode href="/terminal" label="New Sale" />
        <QuickActionNode href="/customers" label="Add Customer" />
        <QuickActionNode href="/catalog" label="Add Product" />
        <QuickActionNode href="/inventory/pipeline" label="Transfer Inventory" />
        <QuickActionNode href="/invoicing" label="Create Invoice" />
        <QuickActionNode href="/vendors" label="Create Vendor" />
      </div>
    </section>
  );
}
