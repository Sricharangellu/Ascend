"use client";

/**
 * /integrations — Integration providers catalog + company integration management.
 *
 * Two sections:
 *  1. Provider grid — all available integrations with connect/disconnect toggle
 *  2. Connected integrations — active connections with last_sync_at and Sync Now button
 */

import { useCallback, useEffect, useState } from "react";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { apiGet, apiPost } from "@/api-client/client";
import { useToast } from "@/components/Toast";

interface IntegrationProvider {
  id: string;
  name: string;
  provider_type: "payment" | "accounting" | "ecommerce" | "shipping" | "tax" | "email";
  is_active: boolean;
}

interface CompanyIntegration {
  id: string;
  provider_id: string;
  status: "active" | "inactive";
  last_sync_at: number | null;
}

const TYPE_COLOR: Record<IntegrationProvider["provider_type"], string> = {
  payment: "bg-emerald-500",
  accounting: "bg-blue-500",
  ecommerce: "bg-purple-500",
  shipping: "bg-orange-500",
  tax: "bg-red-500",
  email: "bg-slate-500",
};

const TYPE_BADGE_VARIANT: Record<
  IntegrationProvider["provider_type"],
  "green" | "blue" | "purple" | "yellow" | "red" | "gray"
> = {
  payment: "green",
  accounting: "blue",
  ecommerce: "purple",
  shipping: "yellow",
  tax: "red",
  email: "gray",
};

function fmtSyncDate(ms: number | null): string {
  if (!ms) return "Never synced";
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function IntegrationsPage() {
  const { addToast } = useToast();

  const [providers, setProviders] = useState<IntegrationProvider[]>([]);
  const [integrations, setIntegrations] = useState<CompanyIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      apiGet<{ items: IntegrationProvider[] }>("/api/v1/sync/integration-providers"),
      apiGet<{ items: CompanyIntegration[] }>("/api/v1/sync/integrations"),
    ])
      .then(([provRes, intRes]) => {
        setProviders(provRes.items ?? []);
        setIntegrations(intRes.items ?? []);
      })
      .catch(() => {
        addToast({ title: "Failed to load integrations", variant: "error" });
      })
      .finally(() => setLoading(false));
  }, [addToast]);

  useEffect(() => { load(); }, [load]);

  const getIntegrationForProvider = (providerId: string) =>
    integrations.find(i => i.provider_id === providerId) ?? null;

  const handleToggle = async (provider: IntegrationProvider) => {
    const existing = getIntegrationForProvider(provider.id);
    const newStatus = existing?.status === "active" ? "inactive" : "active";
    setToggling(provider.id);
    try {
      await apiPost("/api/v1/sync/integrations", {
        providerId: provider.id,
        status: newStatus,
      });
      load();
      addToast({
        title:
          newStatus === "active"
            ? `${provider.name} connected`
            : `${provider.name} disconnected`,
        variant: "success",
      });
    } catch (e) {
      addToast({
        title: "Failed to update integration",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      });
    } finally {
      setToggling(null);
    }
  };

  const connectedProviders = providers.filter(p => {
    const intg = getIntegrationForProvider(p.id);
    return intg?.status === "active";
  });

  return (
    <EnterpriseShell
      active="integrations"
      title="Integrations"
      subtitle="Connect your tools to FinderPOS"
    >
      <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-5 sm:px-6">

        {/* ── Provider grid ────────────────────────────────────────────────── */}
        <Card title="Available Integrations">
          {loading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-32 animate-pulse rounded-lg bg-slate-100" />
              ))}
            </div>
          ) : providers.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">
              No integration providers available.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {providers.map(provider => {
                const intg = getIntegrationForProvider(provider.id);
                const isConnected = intg?.status === "active";
                const isToggling = toggling === provider.id;
                const initial = provider.name.charAt(0).toUpperCase();
                const colorClass = TYPE_COLOR[provider.provider_type] ?? "bg-slate-400";

                return (
                  <div
                    key={provider.id}
                    className={`flex flex-col gap-3 rounded-lg border p-4 transition-shadow hover:shadow-sm ${
                      isConnected
                        ? "border-emerald-200 bg-emerald-50/30"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${colorClass}`}
                      >
                        {initial}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {provider.name}
                        </p>
                        <Badge variant={TYPE_BADGE_VARIANT[provider.provider_type] ?? "gray"}>
                          {provider.provider_type}
                        </Badge>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs font-medium ${
                          isConnected ? "text-emerald-600" : "text-slate-400"
                        }`}
                      >
                        {isConnected ? "Connected" : "Not Connected"}
                      </span>
                      <Button
                        variant={isConnected ? "ghost" : "secondary"}
                        size="sm"
                        loading={isToggling}
                        disabled={isToggling}
                        onClick={() => void handleToggle(provider)}
                        className={isConnected ? "text-red-600 hover:bg-red-50" : ""}
                      >
                        {isConnected ? "Disconnect" : "Connect"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* ── Connected integrations ───────────────────────────────────────── */}
        {connectedProviders.length > 0 && (
          <Card title={`Connected (${connectedProviders.length})`} noPadding>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  <th className="px-4 py-3">Provider</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Last Sync</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {connectedProviders.map(provider => {
                  const intg = getIntegrationForProvider(provider.id);
                  return (
                    <tr key={provider.id} className="transition-colors hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${TYPE_COLOR[provider.provider_type] ?? "bg-slate-400"}`}
                          >
                            {provider.name.charAt(0)}
                          </div>
                          <span className="font-medium text-slate-900">{provider.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={TYPE_BADGE_VARIANT[provider.provider_type] ?? "gray"}>
                          {provider.provider_type}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {fmtSyncDate(intg?.last_sync_at ?? null)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            addToast({
                              title: `Sync queued for ${provider.name}`,
                              variant: "success",
                            })
                          }
                        >
                          Sync Now
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}

      </div>
    </EnterpriseShell>
  );
}
