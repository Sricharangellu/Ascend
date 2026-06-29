"use client";

import { useState, useEffect, useCallback } from "react";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { TableSkeleton } from "@/components/TableSkeleton";
import { apiGet, apiPost, apiPatch } from "@/api-client/client";
import { formatMoney } from "@/lib/money";
import type { EventStatus, EntertainmentEvent, EntertainmentEventsResponse, TicketStatus, EventTicket, EventTicketsResponse } from "@/api-client/types";
import { clsx } from "clsx";

type BadgeVariant = "gray" | "blue" | "yellow" | "green" | "red" | "purple";

const EVENT_STATUS_BADGE: Record<EventStatus, BadgeVariant> = {
  upcoming:   "blue",
  on_sale:    "green",
  sold_out:   "yellow",
  cancelled:  "red",
  completed:  "gray",
};

const EVENT_STATUS_LABEL: Record<EventStatus, string> = {
  upcoming:  "Upcoming",
  on_sale:   "On Sale",
  sold_out:  "Sold Out",
  cancelled: "Cancelled",
  completed: "Completed",
};

interface CreateEventForm { name: string; venue: string; startsAt: string; capacityMax: string; ticketPriceCents: string; }
const EMPTY_EVENT: CreateEventForm = { name: "", venue: "", startsAt: "", capacityMax: "100", ticketPriceCents: "2500" };

export default function EntertainmentTicketsPage() {
  const [events, setEvents] = useState<EntertainmentEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<EntertainmentEvent | null>(null);
  const [tickets, setTickets] = useState<EventTicket[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showSell, setShowSell] = useState(false);
  const [showScan, setShowScan] = useState(false);
  const [eventForm, setEventForm] = useState<CreateEventForm>(EMPTY_EVENT);
  const [sellForm, setSellForm] = useState({ buyerName: "", buyerEmail: "" });
  const [scanQr, setScanQr] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await apiGet<EntertainmentEventsResponse>("/api/v1/entertainment/events");
      setEvents(data.items ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load events"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function loadTickets(event: EntertainmentEvent) {
    setSelectedEvent(event); setTickets([]);
    try {
      const data = await apiGet<EventTicketsResponse>(`/api/v1/entertainment/events/${event.id}/tickets`);
      setTickets(data.items ?? []);
    } catch { setTickets([]); }
  }

  async function createEvent() {
    if (!eventForm.name.trim() || !eventForm.startsAt) return;
    setSaving(true);
    try {
      await apiPost("/api/v1/entertainment/events", {
        name: eventForm.name.trim(),
        venue: eventForm.venue.trim() || undefined,
        startsAt: new Date(eventForm.startsAt).getTime(),
        capacityMax: parseInt(eventForm.capacityMax) || 100,
        ticketPriceCents: Math.round(parseFloat(eventForm.ticketPriceCents) * 100) || 0,
      });
      setShowCreate(false); setEventForm(EMPTY_EVENT); await load();
    } catch (e) { alert(e instanceof Error ? e.message : "Failed"); } finally { setSaving(false); }
  }

  async function sellTicket() {
    if (!selectedEvent || !sellForm.buyerName.trim()) return;
    setSaving(true);
    try {
      await apiPost(`/api/v1/entertainment/events/${selectedEvent.id}/tickets/sell`, {
        buyerName: sellForm.buyerName.trim(),
        buyerEmail: sellForm.buyerEmail.trim() || undefined,
      });
      setShowSell(false); setSellForm({ buyerName: "", buyerEmail: "" });
      await loadTickets(selectedEvent);
    } catch (e) { alert(e instanceof Error ? e.message : "Failed"); } finally { setSaving(false); }
  }

  async function redeemTicket() {
    if (!scanQr.trim()) return;
    setSaving(true);
    try {
      await apiPatch(`/api/v1/entertainment/tickets/redeem`, { qrCode: scanQr.trim() });
      alert("Ticket redeemed successfully!");
      setScanQr("");
      setShowScan(false);
      if (selectedEvent) await loadTickets(selectedEvent);
    } catch (e) { alert(e instanceof Error ? e.message : "Failed to redeem"); } finally { setSaving(false); }
  }

  function formatDt(ts: number) {
    return new Date(ts).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  }

  return (
    <EnterpriseShell active="entertainment-tickets" title="Events & Tickets" subtitle="Event management & ticket sales">
      <div className="flex flex-col gap-6 p-6">
        <div className="grid grid-cols-3 gap-3">
          <Card className="p-4">
            <p className="text-xs text-[rgba(0,0,0,0.45)] uppercase tracking-wide">Total Events</p>
            <p className="mt-1 text-2xl font-bold">{events.length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-[rgba(0,0,0,0.45)] uppercase tracking-wide">On Sale</p>
            <p className="mt-1 text-2xl font-bold text-green-600">{events.filter(e => e.status === "on_sale").length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-[rgba(0,0,0,0.45)] uppercase tracking-wide">Upcoming</p>
            <p className="mt-1 text-2xl font-bold text-blue-600">{events.filter(e => e.status === "upcoming").length}</p>
          </Card>
        </div>

        <div className="flex gap-2 justify-end">
          <Button size="sm" variant="outline" onClick={() => setShowScan(true)}>Scan QR</Button>
          <Button size="sm" onClick={() => setShowCreate(true)}>+ New Event</Button>
        </div>

        {loading && <TableSkeleton rows={4} cols={5} />}
        {error && <p className="text-red-600 text-sm py-4">{error}</p>}

        {!loading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {events.map(ev => (
              <button key={ev.id} type="button" onClick={() => void loadTickets(ev)}
                className="rounded-lg border border-[#E8E8E8] bg-white p-4 text-left hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-[rgba(0,0,0,0.88)]">{ev.name}</h3>
                  <Badge variant={EVENT_STATUS_BADGE[ev.status]} size="sm">{EVENT_STATUS_LABEL[ev.status]}</Badge>
                </div>
                {ev.venue && <p className="text-xs text-[rgba(0,0,0,0.45)]">{ev.venue}</p>}
                <p className="text-xs text-[rgba(0,0,0,0.65)] mt-1">{formatDt(ev.starts_at)}</p>
                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs text-[rgba(0,0,0,0.45)]">{ev.tickets_sold} / {ev.capacity_max} sold</span>
                  <span className="text-xs font-medium">{formatMoney(ev.ticket_price_cents)}</span>
                </div>
                <div className="mt-1 h-1 rounded-full bg-[#F0F0F0] overflow-hidden">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, (ev.tickets_sold / ev.capacity_max) * 100)}%` }} />
                </div>
              </button>
            ))}
            {events.length === 0 && (
              <div className="col-span-full p-12 text-center text-sm text-[rgba(0,0,0,0.45)]">No events yet. Create your first event.</div>
            )}
          </div>
        )}

        {/* Event detail / tickets modal */}
        {selectedEvent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSelectedEvent(null)}>
            <div className="w-full max-w-md rounded-xl bg-white shadow-2xl p-6 overflow-y-auto max-h-[90vh]" onClick={e => e.stopPropagation()}>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold">{selectedEvent.name}</h3>
                  <p className="text-xs text-[rgba(0,0,0,0.45)]">{selectedEvent.venue ? `${selectedEvent.venue} · ` : ""}{formatDt(selectedEvent.starts_at)}</p>
                  <p className="text-xs text-[rgba(0,0,0,0.45)]">{selectedEvent.tickets_sold} / {selectedEvent.capacity_max} tickets sold</p>
                </div>
                <Badge variant={EVENT_STATUS_BADGE[selectedEvent.status]}>{EVENT_STATUS_LABEL[selectedEvent.status]}</Badge>
              </div>

              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold">Tickets</h4>
                  {selectedEvent.status === "on_sale" && (
                    <Button size="sm" variant="outline" onClick={() => setShowSell(true)}>+ Sell Ticket</Button>
                  )}
                </div>
                {tickets.length === 0
                  ? <p className="text-xs text-[rgba(0,0,0,0.35)]">No tickets sold yet.</p>
                  : (
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {tickets.map(t => (
                        <div key={t.id} className="flex items-center justify-between text-xs rounded border border-[#F0F0F0] px-2 py-1.5">
                          <div>
                            <p className="font-medium">{t.buyer_name}</p>
                            <p className="font-mono text-[rgba(0,0,0,0.35)]">{t.qr_code}</p>
                          </div>
                          <Badge variant={t.status === "sold" ? "blue" : t.status === "redeemed" ? "green" : "gray"} size="sm">{t.status}</Badge>
                        </div>
                      ))}
                    </div>
                  )
                }
              </div>

              <button type="button" onClick={() => setSelectedEvent(null)} className="w-full rounded border border-[#D9D9D9] py-1.5 text-xs text-[rgba(0,0,0,0.45)] hover:bg-[#F5F5F5]">Close</button>
            </div>
          </div>
        )}

        {/* Sell ticket modal */}
        {showSell && selectedEvent && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setShowSell(false)}>
            <div className="w-full max-w-sm rounded-xl bg-white shadow-2xl p-6" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-bold mb-4">Sell Ticket — {selectedEvent.name}</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Buyer Name *</label>
                  <input type="text" placeholder="Jane Smith" value={sellForm.buyerName}
                    onChange={e => setSellForm(f => ({ ...f, buyerName: e.target.value }))}
                    className="w-full rounded border border-[#D9D9D9] px-2 py-1 text-sm" autoFocus />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Email</label>
                  <input type="email" placeholder="jane@example.com" value={sellForm.buyerEmail}
                    onChange={e => setSellForm(f => ({ ...f, buyerEmail: e.target.value }))}
                    className="w-full rounded border border-[#D9D9D9] px-2 py-1 text-sm" />
                </div>
                <p className="text-xs text-[rgba(0,0,0,0.45)]">Price: {formatMoney(selectedEvent.ticket_price_cents)}</p>
              </div>
              <div className="mt-4 flex gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={() => setShowSell(false)}>Cancel</Button>
                <Button size="sm" onClick={() => void sellTicket()} loading={saving}>Sell</Button>
              </div>
            </div>
          </div>
        )}

        {/* Scan QR modal */}
        {showScan && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowScan(false)}>
            <div className="w-full max-w-sm rounded-xl bg-white shadow-2xl p-6" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-bold mb-4">Redeem Ticket</h3>
              <div>
                <label className="block text-xs font-medium mb-1">QR Code</label>
                <input type="text" placeholder="TKT-XXXXXXXX" value={scanQr}
                  onChange={e => setScanQr(e.target.value)}
                  className="w-full rounded border border-[#D9D9D9] px-2 py-1 text-sm font-mono" autoFocus />
              </div>
              <div className="mt-4 flex gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={() => setShowScan(false)}>Cancel</Button>
                <Button size="sm" onClick={() => void redeemTicket()} loading={saving}>Redeem</Button>
              </div>
            </div>
          </div>
        )}

        {/* Create event modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowCreate(false)}>
            <div className="w-full max-w-sm rounded-xl bg-white shadow-2xl p-6" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-bold mb-4">New Event</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Event Name *</label>
                  <input type="text" placeholder="Summer Music Festival…" value={eventForm.name}
                    onChange={e => setEventForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full rounded border border-[#D9D9D9] px-2 py-1 text-sm" autoFocus />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Venue</label>
                  <input type="text" placeholder="City Arena, Hall B…" value={eventForm.venue}
                    onChange={e => setEventForm(f => ({ ...f, venue: e.target.value }))}
                    className="w-full rounded border border-[#D9D9D9] px-2 py-1 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Date & Time *</label>
                  <input type="datetime-local" value={eventForm.startsAt}
                    onChange={e => setEventForm(f => ({ ...f, startsAt: e.target.value }))}
                    className="w-full rounded border border-[#D9D9D9] px-2 py-1 text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium mb-1">Capacity</label>
                    <input type="number" min="1" value={eventForm.capacityMax}
                      onChange={e => setEventForm(f => ({ ...f, capacityMax: e.target.value }))}
                      className="w-full rounded border border-[#D9D9D9] px-2 py-1 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Ticket Price ($)</label>
                    <input type="number" min="0" step="0.01" value={(parseInt(eventForm.ticketPriceCents) / 100).toFixed(2)}
                      onChange={e => setEventForm(f => ({ ...f, ticketPriceCents: String(Math.round(parseFloat(e.target.value) * 100)) }))}
                      className="w-full rounded border border-[#D9D9D9] px-2 py-1 text-sm" />
                  </div>
                </div>
              </div>
              <div className="mt-4 flex gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
                <Button size="sm" onClick={() => void createEvent()} loading={saving}>Create</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </EnterpriseShell>
  );
}
