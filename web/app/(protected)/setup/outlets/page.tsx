"use client";

/**
 * Outlets & registers (Ponytail Wave 2/3).
 * Former Operations mega-page dissolved: pick/pack → Delivery; stock map →
 * Inventory Locations. Canonical URL is /setup/outlets; /operations redirects here.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { Table } from "@/components/Table";
import { Modal } from "@/components/Modal";
import { Input } from "@/components/Input";
import { Card } from "@/components/Card";
import { Skeleton } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { apiGet, apiPost } from "@/api-client/client";
import type { Register, Outlet } from "@/api-client/types";

const HUB_LINKS = [
  { href: "/inventory/locations", label: "Inventory Locations" },
  { href: "/delivery", label: "Delivery & pick/pack" },
  { href: "/delivery?tab=shipments", label: "Shipments" },
] as const;

export default function OutletsPage() {
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewOutlet, setShowNewOutlet] = useState(false);
  const [newOutlet, setNewOutlet] = useState({ name: "", timezone: "UTC" });
  const [savingOutlet, setSavingOutlet] = useState(false);
  const [addRegisterState, setAddRegisterState] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const outRes = await apiGet<{ items: Outlet[] }>("/api/v1/outlets");
      setOutlets(outRes.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load outlets.");
      setOutlets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreateOutlet = async () => {
    if (!newOutlet.name.trim()) return;
    setSavingOutlet(true);
    try {
      await apiPost("/api/v1/outlets", newOutlet);
      setShowNewOutlet(false);
      setNewOutlet({ name: "", timezone: "UTC" });
      await load();
    } finally {
      setSavingOutlet(false);
    }
  };

  const handleAddRegister = async (outletId: string) => {
    const name = addRegisterState[outletId]?.trim();
    if (!name) return;
    await apiPost(`/api/v1/outlets/${outletId}/registers`, { name });
    setAddRegisterState((prev) => {
      const next = { ...prev };
      delete next[outletId];
      return next;
    });
    await load();
  };

  const registerCols = [
    {
      key: "name",
      header: "Register Name",
      render: (r: Register) => (
        <span className="font-medium text-erp-text-primary">{r.name}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r: Register) => (
        <Badge variant={r.status === "open" ? "green" : "gray"}>{r.status}</Badge>
      ),
    },
  ];

  return (
    <EnterpriseShell
      active="settings"
      title="Outlets"
      subtitle="Store locations and registers for the POS terminal"
      contentClassName="overflow-y-auto"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6">
        <nav className="flex flex-wrap gap-2" aria-label="Related operations tools">
          {HUB_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="inline-flex min-h-touch items-center rounded-lg border border-erp-table-border bg-white px-3 py-1.5 text-sm font-medium text-erp-text-primary transition-colors hover:bg-erp-page focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        {error && (
          <Card role="alert" className="border-danger-100 bg-danger-50 p-3 text-sm text-danger-700">
            {error}
          </Card>
        )}

        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-erp-text-primary">
            Outlets {loading ? "" : `(${outlets.length})`}
          </h2>
          <Button variant="primary" size="sm" onClick={() => setShowNewOutlet(true)}>
            + New Outlet
          </Button>
        </div>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : outlets.length === 0 ? (
          <EmptyState
            title="No outlets yet"
            description="Create a store outlet, then add a register for the POS terminal."
            action={
              <Button variant="primary" onClick={() => setShowNewOutlet(true)}>
                Create outlet
              </Button>
            }
          />
        ) : (
          <div className="space-y-4">
            {outlets.map((outlet) => (
              <Card key={outlet.id} className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-erp-text-primary">{outlet.name}</h3>
                    {outlet.timezone && (
                      <p className="text-xs text-erp-text-secondary">{outlet.timezone}</p>
                    )}
                  </div>
                  <Badge variant="blue">
                    {outlet.registers.length} register
                    {outlet.registers.length !== 1 ? "s" : ""}
                  </Badge>
                </div>
                <Table
                  columns={registerCols}
                  rows={outlet.registers}
                  rowKey={(r) => r.id}
                  emptyMessage="No registers in this outlet."
                />
                {addRegisterState[outlet.id] !== undefined ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-[12rem] flex-1">
                      <Input
                        label="Register name"
                        autoFocus
                        value={addRegisterState[outlet.id]}
                        onChange={(e) =>
                          setAddRegisterState((prev) => ({
                            ...prev,
                            [outlet.id]: e.target.value,
                          }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void handleAddRegister(outlet.id);
                          if (e.key === "Escape") {
                            setAddRegisterState((prev) => {
                              const n = { ...prev };
                              delete n[outlet.id];
                              return n;
                            });
                          }
                        }}
                        placeholder="Register name"
                      />
                    </div>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => void handleAddRegister(outlet.id)}
                    >
                      Add
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        setAddRegisterState((prev) => {
                          const n = { ...prev };
                          delete n[outlet.id];
                          return n;
                        })
                      }
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      setAddRegisterState((prev) => ({ ...prev, [outlet.id]: "" }))
                    }
                  >
                    + Add Register
                  </Button>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={showNewOutlet}
        onClose={() => setShowNewOutlet(false)}
        title="New Outlet"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowNewOutlet(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={savingOutlet}
              disabled={!newOutlet.name.trim()}
              onClick={() => void handleCreateOutlet()}
            >
              Create
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input
            label="Name"
            value={newOutlet.name}
            onChange={(e) => setNewOutlet((p) => ({ ...p, name: e.target.value }))}
            placeholder="Main Store"
            required
          />
          <Input
            label="Timezone"
            value={newOutlet.timezone}
            onChange={(e) => setNewOutlet((p) => ({ ...p, timezone: e.target.value }))}
            placeholder="UTC"
          />
        </div>
      </Modal>
    </EnterpriseShell>
  );
}
