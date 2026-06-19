"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { apiGet, apiPost, ApiResponseError } from "@/api-client/client";

interface SyncStatusReport {
  online: boolean;
  pending: number;
  synced: number;
  failed: number;
}

interface SyncRow {
  id: number;
  event_type: string;
  status: "pending" | "synced" | "failed";
  attempts: number;
  created_at: number;
  last_attempted_at: number | null;
}

interface Provider {
  id: string;
  name: string;
  provider_type: string;
  is_active?: boolean;
}

interface CompanyIntegration {
  id: string;
  provider_id: string;
  provider_name: string;
  provider_type: string;
  status: string;
  settings: string | null;
  created_at: number;
  updated_at: number;
}

interface WebhookSubscription {
  id: string;
  url: string;
  event_types: string;
  active: boolean;
  created_at: number;
}

interface WebhookDelivery {
  id: string;
  subscription_id: string;
  event_type: string;
  status: "delivered" | "failed" | string;
  status_code: number;
  created_at: number;
}

function fmtDate(ms: number | null) {
  if (!ms) return "-";
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function IntegrationsPage() {
  const [status, setStatus] = useState<SyncStatusReport | null>(null);
  const [queue, setQueue] = useState<SyncRow[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [integrations, setIntegrations] = useState<CompanyIntegration[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookSubscription[]>([]);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [providerId, setProviderId] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statusRes, queueRes, providerRes, integrationRes, webhookRes, deliveryRes] = await Promise.all([
        apiGet<SyncStatusReport>("/api/v1/sync/status"),
        apiGet<{ items: SyncRow[] }>("/api/v1/sync/queue?limit=25"),
        apiGet<{ items: Provider[] }>("/api/v1/sync/integration-providers").catch(() => ({ items: [] as Provider[] })),
        apiGet<{ items: CompanyIntegration[] }>("/api/v1/sync/integrations").catch(() => ({ items: [] as CompanyIntegration[] })),
        apiGet<{ items: WebhookSubscription[] }>("/api/v1/webhooks").catch(() => ({ items: [] as WebhookSubscription[] })),
        apiGet<{ items: WebhookDelivery[] }>("/api/v1/webhooks/deliveries").catch(() => ({ items: [] as WebhookDelivery[] })),
      ]);
      setStatus(statusRes);
      setQueue(queueRes.items ?? []);
      setProviders(providerRes.items ?? []);
      setIntegrations(integrationRes.items ?? []);
      setWebhooks(webhookRes.items ?? []);
      setDeliveries(deliveryRes.items ?? []);
      setProviderId((current) => current || providerRes.items?.[0]?.id || "");
    } catch (err) {
      setError(err instanceof ApiResponseError ? err.message : "Could not load integration health.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const connectedProviderIds = new Set(integrations.map((item) => item.provider_id));
  const availableProviders = providers.filter((provider) => !connectedProviderIds.has(provider.id));
  const summary = useMemo(() => ({
    activeIntegrations: integrations.filter((item) => item.status === "active").length,
    inactiveIntegrations: integrations.filter((item) => item.status !== "active").length,
    failedDeliveries: deliveries.filter((item) => item.status === "failed").length,
    failedQueue: queue.filter((item) => item.status === "failed").length,
  }), [deliveries, integrations, queue]);

  const connectProvider = async () => {
    if (!providerId) return;
    setConnecting(true);
    setError(null);
    try {
      await apiPost("/api/v1/sync/integrations", { providerId, status: "active" });
      await load();
    } catch (err) {
      setError(err instanceof ApiResponseError ? err.message : "Could not connect provider.");
    } finally {
      setConnecting(false);
    }
  };

  const pushQueue = async () => {
    setConnecting(true);
    setError(null);
    try {
      await apiPost("/api/v1/sync/push", {});
      await load();
    } catch (err) {
      setError(err instanceof ApiResponseError ? err.message : "Could not push sync queue.");
    } finally {
      setConnecting(false);
    }
  };

  return (
    <EnterpriseShell active="integrations" title="Integrations" subtitle="Provider connections, webhooks, and sync queue health" contentClassName="overflow-y-auto">
      <div className="mx-auto w-full max-w-7xl space-y-5 px-4 py-5 sm:px-6">
        {error && (
          <div className="rounded-md border border-danger-100 bg-danger-50 px-4 py-3 text-sm text-danger-700" role="alert">
            {error}
          </div>
        )}

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <Metric label="Connectivity" value={status?.online ? "Online" : "Offline"} helper="Sync engine" tone={status?.online ? "success" : "warning"} />
          <Metric label="Pending queue" value={status?.pending ?? 0} helper="Awaiting push" tone={(status?.pending ?? 0) > 0 ? "warning" : "neutral"} />
          <Metric label="Failed queue" value={status?.failed ?? 0} helper={`${summary.failedQueue} visible`} tone={(status?.failed ?? 0) > 0 ? "danger" : "success"} />
          <Metric label="Connected" value={summary.activeIntegrations} helper={`${summary.inactiveIntegrations} inactive`} tone="brand" />
          <Metric label="Webhooks" value={webhooks.length} helper={`${summary.failedDeliveries} failed deliveries`} tone={summary.failedDeliveries > 0 ? "warning" : "neutral"} />
          <Metric label="Providers" value={providers.length} helper={`${availableProviders.length} available`} tone="neutral" />
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <Card className="overflow-hidden p-0">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div>
                <h2 className="text-base font-semibold text-slate-950">Company Integrations</h2>
                <p className="text-sm text-slate-500">Configured provider connections and statuses.</p>
              </div>
              <Button variant="secondary" size="sm" disabled={connecting} onClick={() => void pushQueue()}>
                Push queue
              </Button>
            </div>

            {loading ? (
              <div className="px-4 py-12 text-center text-sm text-slate-500" aria-busy="true">Loading integrations...</div>
            ) : integrations.length === 0 ? (
              <div className="px-4 py-12 text-center text-sm text-slate-500">No integrations connected yet.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {integrations.map((item) => (
                  <div key={item.id} className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-slate-950">{item.provider_name}</p>
                        <Badge variant={item.status === "active" ? "green" : "gray"}>{item.status}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{item.provider_type} · updated {fmtDate(item.updated_at)}</p>
                    </div>
                    <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">{item.provider_id}</span>
                    <span className="text-xs text-slate-500">{item.settings ? "settings saved" : "no settings"}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <div className="space-y-5">
            <Card title="Connect Provider">
              {availableProviders.length === 0 ? (
                <p className="text-sm text-slate-500">No inactive providers are available.</p>
              ) : (
                <div className="space-y-3">
                  <label className="block">
                    <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Provider</span>
                    <select
                      value={providerId}
                      onChange={(event) => setProviderId(event.target.value)}
                      className="mt-1 min-h-[40px] w-full rounded-md border border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                    >
                      {availableProviders.map((provider) => (
                        <option key={provider.id} value={provider.id}>{provider.name} · {provider.provider_type}</option>
                      ))}
                    </select>
                  </label>
                  <Button variant="primary" size="sm" fullWidth disabled={connecting || !providerId} onClick={() => void connectProvider()}>
                    Connect provider
                  </Button>
                </div>
              )}
            </Card>

            <Card title="Webhook Subscriptions" noPadding>
              {webhooks.length === 0 ? (
                <p className="px-5 py-4 text-sm text-slate-500">No webhook subscriptions.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {webhooks.slice(0, 6).map((hook) => (
                    <div key={hook.id} className="px-5 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-slate-950">{hook.url}</p>
                        <Badge variant={hook.active ? "green" : "gray"}>{hook.active ? "active" : "inactive"}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{hook.event_types} · {fmtDate(hook.created_at)}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <ActivityCard title="Sync Queue" empty="No sync queue rows.">
            {queue.slice(0, 10).map((row) => (
              <ActivityItem
                key={row.id}
                title={`#${row.id} · ${row.event_type}`}
                subtitle={`${row.attempts} attempts · last ${fmtDate(row.last_attempted_at)}`}
                meta={row.status}
              />
            ))}
          </ActivityCard>
          <ActivityCard title="Webhook Deliveries" empty="No webhook deliveries.">
            {deliveries.slice(0, 10).map((delivery) => (
              <ActivityItem
                key={delivery.id}
                title={delivery.event_type}
                subtitle={`${delivery.subscription_id} · HTTP ${delivery.status_code || "-"}`}
                meta={delivery.status}
              />
            ))}
          </ActivityCard>
        </section>
      </div>
    </EnterpriseShell>
  );
}

function Metric({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: string | number;
  helper: string;
  tone: "neutral" | "success" | "warning" | "brand" | "danger";
}) {
  const toneClass = {
    neutral: "border-slate-200 bg-white",
    success: "border-success-200 bg-success-50",
    warning: "border-warning-200 bg-warning-50",
    brand: "border-brand-200 bg-brand-50",
    danger: "border-danger-200 bg-danger-50",
  }[tone];
  return (
    <div className={`rounded-md border p-4 shadow-sm ${toneClass}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-slate-950">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{helper}</p>
    </div>
  );
}

function ActivityCard({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <Card title={title} noPadding>
      {children.length === 0 ? <p className="px-5 py-4 text-sm text-slate-500">{empty}</p> : <div className="divide-y divide-slate-100">{children}</div>}
    </Card>
  );
}

function ActivityItem({ title, subtitle, meta }: { title: string; subtitle: string; meta: string }) {
  const variant = meta === "failed" ? "red" : meta === "pending" ? "yellow" : meta === "delivered" || meta === "synced" ? "green" : "gray";
  return (
    <div className="flex items-start justify-between gap-3 px-5 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-950">{title}</p>
        <p className="mt-1 truncate text-xs text-slate-500">{subtitle}</p>
      </div>
      <Badge variant={variant}>{meta}</Badge>
    </div>
  );
}
