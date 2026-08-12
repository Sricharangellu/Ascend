import { Link } from "wouter";

function PipelineNode({ label, href, active = false }: { label: string; href: string; active?: boolean }) {
  return (
    <Link href={href} className={`relative flex h-12 min-w-[120px] shrink-0 items-center justify-center rounded-lg border px-4 text-[13px] font-semibold transition-all duration-300 hover:-translate-y-1 hover:shadow-md ${
      active 
        ? "border-[var(--color-primary)] bg-[var(--color-primary-subtle)] text-[var(--color-primary)] shadow-sm" 
        : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:border-brand-300 hover:text-[var(--color-text-primary)]"
    }`}>
      {label}
    </Link>
  );
}

function PipelineArrow() {
  return (
    <div className="flex shrink-0 items-center px-1 text-[var(--color-border-strong)]">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="5" y1="12" x2="19" y2="12"></line>
        <polyline points="12 5 19 12 12 19"></polyline>
      </svg>
    </div>
  );
}

export function DashboardPipeline() {
  return (
    <section>
      <h2 className="mb-4 text-lg font-bold tracking-tight text-[var(--color-text-primary)]">Enterprise Workflow</h2>
      
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm overflow-hidden">
        <div className="relative overflow-x-auto pb-4 pt-2 hide-scrollbar">
          <div className="flex w-max items-center">
            <PipelineNode label="Supplier" href="/vendors" />
            <PipelineArrow />
            <PipelineNode label="Purchase Req" href="/purchasing" />
            <PipelineArrow />
            <PipelineNode label="Approval" href="/purchasing" />
            <PipelineArrow />
            <PipelineNode label="PO" href="/purchasing" active />
            <PipelineArrow />
            <PipelineNode label="Receiving" href="/inventory/receive-stock" active />
            <PipelineArrow />
            <PipelineNode label="Warehouse" href="/inventory/locations" />
            <PipelineArrow />
            <PipelineNode label="Inventory" href="/inventory" active />
            <PipelineArrow />
            <PipelineNode label="Sales" href="/sales" active />
            <PipelineArrow />
            <PipelineNode label="Customer" href="/customers" />
            <PipelineArrow />
            <PipelineNode label="Accounting" href="/accounting" />
            <PipelineArrow />
            <PipelineNode label="Analytics" href="/reports" />
          </div>
          
          {/* Subtle animated pipeline flow underneath */}
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-[var(--color-surface-subtle)] rounded-full overflow-hidden">
            <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-brand-400 to-transparent opacity-50 animate-[slideInRight_3s_linear_infinite]" />
          </div>
        </div>
      </div>
    </section>
  );
}
