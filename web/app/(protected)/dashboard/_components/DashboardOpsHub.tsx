"use client";

import type { ReactNode } from "react";
import Link from "next/link";

function IconBox() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
      <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
      <line x1="12" y1="22.08" x2="12" y2="12"></line>
    </svg>
  );
}
function IconCart() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="9" cy="21" r="1"></circle>
      <circle cx="20" cy="21" r="1"></circle>
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
    </svg>
  );
}
function IconTag() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
      <line x1="7" y1="7" x2="7.01" y2="7"></line>
    </svg>
  );
}
function IconTerminal() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
      <line x1="8" y1="21" x2="16" y2="21"></line>
      <line x1="12" y1="17" x2="12" y2="21"></line>
    </svg>
  );
}
function IconDollar() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="1" x2="12" y2="23"></line>
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
    </svg>
  );
}
function IconUsers() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
      <circle cx="9" cy="7" r="4"></circle>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
    </svg>
  );
}
function IconChart() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="20" x2="18" y2="10"></line>
      <line x1="12" y1="20" x2="12" y2="4"></line>
      <line x1="6" y1="20" x2="6" y2="14"></line>
    </svg>
  );
}
function IconSettings() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3"></circle>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
    </svg>
  );
}

interface OpsCardProps {
  title: string;
  icon: ReactNode;
  href: string;
  metrics: { label: string; value: string | number; accent?: "danger" | "warning" }[];
}

function OpsCard({ title, icon, href, metrics }: OpsCardProps) {
  return (
    <Link
      href={href}
      className="group relative overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-brand-500/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    >
      <div className="flex items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-4 py-3 transition-colors group-hover:bg-[var(--color-primary-subtle)]">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-surface)] text-brand-600 shadow-sm ring-1 ring-[var(--color-border)] transition-transform group-hover:scale-110">
          {icon}
        </div>
        <h3 className="font-semibold tracking-tight text-[var(--color-text-primary)]">{title}</h3>
      </div>

      <div className="px-4 py-4">
        {metrics.length > 0 ? (
          <ul className="space-y-2.5">
            {metrics.map((m, i) => (
              <li key={i} className="flex items-center justify-between text-[13px]">
                <span className="text-[var(--color-text-secondary)]">{m.label}</span>
                <span
                  className={`font-semibold ${
                    m.accent === "danger"
                      ? "text-[var(--color-danger-text)]"
                      : m.accent === "warning"
                        ? "text-[var(--color-warning-text)]"
                        : "text-[var(--color-text-primary)]"
                  }`}
                >
                  {m.value}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex h-full min-h-[68px] items-center justify-center text-[13px] text-[var(--color-text-muted)]">
            Open module →
          </div>
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 h-0.5 bg-brand-500 opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  );
}

export function DashboardOpsHub({
  inventoryStats,
  industry,
  view,
}: {
  inventoryStats: { warehouses: number; skus: number; lowStock: number; expiringSoon: number };
  industry: string;
  view: string;
}) {
  const cards = [
    {
      id: "inventory",
      title: "Inventory",
      icon: <IconBox />,
      href: "/inventory",
      metrics: [
        { label: "Warehouses", value: inventoryStats.warehouses },
        { label: "SKUs", value: inventoryStats.skus },
        { label: "Low Stock", value: inventoryStats.lowStock, accent: inventoryStats.lowStock > 0 ? ("warning" as const) : undefined },
        { label: "Expiring Soon", value: inventoryStats.expiringSoon, accent: inventoryStats.expiringSoon > 0 ? ("danger" as const) : undefined },
      ],
    },
    {
      id: "purchasing",
      title: "Purchasing",
      icon: <IconCart />,
      href: "/purchasing",
      metrics: [
        { label: "Open POs", value: "View" },
        { label: "Pending Approvals", value: "View" },
      ],
    },
    {
      id: "sales",
      title: "Sales",
      icon: <IconTag />,
      href: "/sales",
      metrics: [
        { label: "Open Orders", value: "View" },
        { label: "Quotations", value: "View" },
      ],
    },
    {
      id: "pos",
      title: "POS",
      icon: <IconTerminal />,
      href: "/terminal",
      metrics: [{ label: "Active Registers", value: "View" }],
    },
    {
      id: "finance",
      title: "Finance",
      icon: <IconDollar />,
      href: "/finance",
      metrics: [
        { label: "Open Bills", value: "View" },
        { label: "Invoices", value: "View" },
      ],
    },
    {
      id: "crm",
      title: "CRM",
      icon: <IconUsers />,
      href: "/customers",
      metrics: [{ label: "Total Customers", value: "View" }],
    },
    {
      id: "analytics",
      title: "Analytics",
      icon: <IconChart />,
      href: "/reports",
      metrics: [],
    },
    {
      id: "admin",
      title: "Administration",
      icon: <IconSettings />,
      href: "/settings",
      metrics: [],
    },
  ];

  let order = ["inventory", "purchasing", "sales", "pos", "finance", "crm", "analytics", "admin"];
  if (view === "Finance") {
    order = ["finance", "analytics", "sales", "inventory", "purchasing", "crm", "pos", "admin"];
  } else if (industry === "Wholesale" || industry === "Distribution") {
    order = ["inventory", "purchasing", "finance", "sales", "crm", "analytics", "pos", "admin"];
  } else if (industry === "E-commerce") {
    order = ["sales", "inventory", "crm", "analytics", "finance", "purchasing", "pos", "admin"];
  }

  const sortedCards = order.map((id) => cards.find((c) => c.id === id)!).filter(Boolean);

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold tracking-tight text-[var(--color-text-primary)]">Business Operations Hub</h2>
        <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-text-muted)]">
          Optimized for {industry}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {sortedCards.map((c) => (
          <OpsCard key={c.id} {...c} />
        ))}
      </div>
    </section>
  );
}
