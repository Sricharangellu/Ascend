import { useCallback, useEffect, useState } from "react";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { apiGet, apiPost, ApiResponseError } from "@/api-client/client";
import type { StoreLocation, StoreMap, ProductLocation } from "@/api-client/types";

// ── helpers ───────────────────────────────────────────────────────────────────

const AISLE_COLORS: Record<string, string> = {
  A: "bg-blue-50 border-blue-200",
  B: "bg-amber-50 border-amber-200",
  C: "bg-emerald-50 border-emerald-200",
  D: "bg-purple-50 border-purple-200",
  Freezer: "bg-cyan-50 border-cyan-200",
};
function aisleColor(aisle: string): string {
  return AISLE_COLORS[aisle] ?? "border-[var(--color-border)]";
}

// ── CreateLocationModal ───────────────────────────────────────────────────────

interface CreateForm { aisle: string; shelf: string; bin: string; description: string; }
const EMPTY_CREATE: CreateForm = { aisle: "", shelf: "", bin: "", description: "" };

function CreateLocationModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<CreateForm>(EMPTY_CREATE);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const f = (k: keyof CreateForm, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setErr(null);
    try {
      await apiPost("/api/v1/store-locations", {
        aisle: form.aisle.trim(), shelf: form.shelf.trim(), bin: form.bin.trim(),
        description: form.description.trim() || null,
      });
      onSaved();
    } catch (ex) { setErr(ex instanceof ApiResponseError ? ex.message : "Failed to create location."); }
    finally { setSaving(false); }
  };

  const inputCls = "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
  const inputStyle = { borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl shadow-xl"
        style={{ backgroundColor: "var(--color-surface)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--color-border)" }}>
          <h2 className="text-base font-semibold" style={{ color: "var(--color-text-primary)" }}>Add Store Location</h2>
          <button onClick={onClose} className="text-xl" style={{ color: "var(--color-text-muted)" }}>&times;</button>
        </div>
        <form id="create-loc-form" onSubmit={(e) => void handleSubmit(e)} className="px-5 py-4 space-y-4">
          {err && <p className="text-sm text-red-600">{err}</p>}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>Aisle <span className="text-red-500">*</span></label>
              <input required value={form.aisle} onChange={(e) => f("aisle", e.target.value)}
                placeholder="A" className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>Shelf</label>
              <input value={form.shelf} onChange={(e) => f("shelf", e.target.value)}
                placeholder="1" className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>Bin</label>
              <input value={form.bin} onChange={(e) => f("bin", e.target.value)}
                placeholder="A" className={inputCls} style={inputStyle} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>Description</label>
            <input value={form.description} onChange={(e) => f("description", e.target.value)}
              placeholder="e.g. Beverages — water & soda"
              className={inputCls} style={inputStyle} />
          </div>
          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Label will be auto-generated: <strong>{[form.aisle, form.shelf, form.bin].filter(Boolean).join("-").toUpperCase() || "—"}</strong></p>
        </form>
        <div className="flex justify-end gap-2 border-t px-5 py-3" style={{ borderColor: "var(--color-border)" }}>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="create-loc-form" disabled={saving}>
            {saving ? "Saving…" : "Create Location"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── BulkAssignModal ───────────────────────────────────────────────────────────

function BulkAssignModal({ locations, onClose, onSaved }: {
  locations: StoreLocation[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [entries, setEntries] = useState([{ sku: "", location_id: "" }]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const addRow = () => setEntries((e) => [...e, { sku: "", location_id: "" }]);
  const removeRow = (i: number) => setEntries((e) => e.filter((_, idx) => idx !== i));
  const updateRow = (i: number, k: "sku" | "location_id", v: string) =>
    setEntries((e) => e.map((row, idx) => idx === i ? { ...row, [k]: v } : row));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const valid = entries.filter(r => r.sku.trim() && r.location_id);
    if (!valid.length) { setErr("Add at least one SKU and location."); return; }
    setSaving(true); setErr(null);
    try {
      await apiPost("/api/v1/product-locations/bulk", {
        assignments: valid.map(r => ({ product_id: r.sku.trim(), location_id: r.location_id })),
      });
      onSaved();
    } catch (ex) { setErr(ex instanceof ApiResponseError ? ex.message : "Failed to assign locations."); }
    finally { setSaving(false); }
  };

  const inputCls = "rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
  const inputStyle = { borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-xl shadow-xl flex flex-col max-h-[85vh]"
        style={{ backgroundColor: "var(--color-surface)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--color-border)" }}>
          <div>
            <h2 className="text-base font-semibold" style={{ color: "var(--color-text-primary)" }}>Bulk Product Location Assignment</h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>Assign multiple products to store locations at once</p>
          </div>
          <button onClick={onClose} className="text-xl" style={{ color: "var(--color-text-muted)" }}>&times;</button>
        </div>
        <form id="bulk-form" onSubmit={(e) => void handleSubmit(e)} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {err && <p className="text-sm text-red-600">{err}</p>}
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
            <span>Product SKU / UPC</span><span>Location</span><span />
          </div>
          {entries.map((row, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
              <input value={row.sku} onChange={(e) => updateRow(i, "sku", e.target.value)}
                placeholder="SKU or UPC" className={inputCls} style={inputStyle} />
              <select value={row.location_id} onChange={(e) => updateRow(i, "location_id", e.target.value)}
                className={inputCls} style={inputStyle}>
                <option value="">— Select —</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.label} {l.description ? `· ${l.description}` : ""}</option>
                ))}
              </select>
              <button type="button" onClick={() => removeRow(i)}
                className="px-2 py-1 text-lg leading-none hover:text-red-500" style={{ color: "var(--color-text-muted)" }}>&times;</button>
            </div>
          ))}
          <button type="button" onClick={addRow}
            className="text-sm text-blue-600 hover:underline">+ Add row</button>
        </form>
        <div className="flex justify-end gap-2 border-t px-5 py-3" style={{ borderColor: "var(--color-border)" }}>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="bulk-form" disabled={saving}>
            {saving ? "Assigning…" : `Assign ${entries.filter(r => r.sku && r.location_id).length} Product(s)`}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type ViewMode = "map" | "list";

export default function InventoryLocationsPage() {
  const [map, setMap] = useState<StoreMap | null>(null);
  const [locations, setLocations] = useState<StoreLocation[]>([]);
  const [productLocs, setProductLocs] = useState<ProductLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("map");
  const [showCreate, setShowCreate] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [expandedAisle, setExpandedAisle] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [mapData, locsData, plData] = await Promise.all([
        apiGet<StoreMap>("/api/v1/store-locations/map"),
        apiGet<{ items: StoreLocation[] }>("/api/v1/store-locations"),
        apiGet<{ items: ProductLocation[] }>("/api/v1/product-locations"),
      ]);
      setMap(mapData);
      setLocations(locsData.items);
      setProductLocs(plData.items);
      if (mapData.aisles.length > 0) setExpandedAisle(mapData.aisles[0].name);
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : "Failed to load store locations.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filteredLocs = productLocs.filter((pl) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return pl.product_name.toLowerCase().includes(q) || pl.product_sku.toLowerCase().includes(q) || pl.label.toLowerCase().includes(q);
  });

  const totalProducts = productLocs.length;
  const totalLocations = locations.length;
  const assignedLocations = new Set(productLocs.map((pl) => pl.location_id)).size;

  return (
    <EnterpriseShell active="inventory-locations" title="Store Locations" subtitle="Map your store — aisles, shelves, bins — and assign products"
      contentClassName="overflow-y-auto">
      <div className="mx-auto w-full max-w-7xl space-y-5 px-4 py-5 sm:px-6">
        {error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

        {/* Stats + toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>{totalLocations}</p>
              <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Locations</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-700">{assignedLocations}</p>
              <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>In Use</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-emerald-700">{totalProducts}</p>
              <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Assignments</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div
              className="flex rounded-lg border p-1"
              style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}
            >
              {(["map", "list"] as const).map((v) => (
                <button key={v} onClick={() => setView(v)}
                  className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors ${view === v ? "bg-blue-600 text-white" : "hover:bg-[var(--color-surface-subtle)]"}`}
                  style={view !== v ? { color: "var(--color-text-secondary)" } : undefined}>
                  {v === "map" ? "Store Map" : "Product List"}
                </button>
              ))}
            </div>
            <Button variant="secondary" onClick={() => setShowBulk(true)}>Bulk Assign</Button>
            <Button variant="primary" onClick={() => setShowCreate(true)}>+ Add Location</Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-sm" style={{ color: "var(--color-text-muted)" }}>Loading store map…</div>
        ) : view === "map" ? (
          /* ── Store Map View ── */
          <div className="space-y-3">
            {map?.aisles.length === 0 && (
              <Card className="py-16 text-center">
                <p className="text-sm font-medium" style={{ color: "var(--color-text-secondary)" }}>No locations yet</p>
                <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>Add your first aisle, shelf, and bin to build your store map.</p>
              </Card>
            )}
            {map?.aisles.map((aisle) => (
              <Card key={aisle.name} className={`overflow-hidden border ${aisleColor(aisle.name)} p-0`}>
                <button
                  onClick={() => setExpandedAisle(expandedAisle === aisle.name ? null : aisle.name)}
                  className="flex w-full items-center justify-between px-5 py-3 text-left"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm shadow-sm"
                      style={{ backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }}
                    >
                      {aisle.name.substring(0, 2)}
                    </div>
                    <div>
                      <p className="font-semibold" style={{ color: "var(--color-text-primary)" }}>Aisle {aisle.name}</p>
                      <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{aisle.shelves.length} shelf/shelves · {aisle.shelves.reduce((s, sh) => s + sh.bins.length, 0)} bins</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="gray">{aisle.shelves.reduce((s, sh) => s + sh.bins.reduce((ss, b) => ss + b.products.length, 0), 0)} products</Badge>
                    <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>{expandedAisle === aisle.name ? "▲" : "▼"}</span>
                  </div>
                </button>

                {expandedAisle === aisle.name && (
                  <div className="border-t border-current/10 px-5 py-4 space-y-4">
                    {aisle.shelves.map((shelf) => (
                      <div key={shelf.name}>
                        <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--color-text-muted)" }}>
                          Shelf {shelf.name || "(none)"}
                        </p>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                          {shelf.bins.map((binSlot) => (
                            <div
                              key={binSlot.location.id}
                              className="rounded-lg border p-3 shadow-sm"
                              style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-bold font-mono" style={{ color: "var(--color-text-secondary)" }}>{binSlot.location.label}</span>
                                {binSlot.location.bin && (
                                  <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>bin {binSlot.location.bin}</span>
                                )}
                              </div>
                              {binSlot.location.description && (
                                <p className="text-[11px] mb-2 leading-tight" style={{ color: "var(--color-text-muted)" }}>{binSlot.location.description}</p>
                              )}
                              {binSlot.products.length === 0 ? (
                                <p className="text-[11px] italic" style={{ color: "var(--color-text-muted)" }}>Empty</p>
                              ) : (
                                <ul className="space-y-1">
                                  {binSlot.products.slice(0, 3).map((p) => (
                                    <li key={p.id} className="text-[11px] flex justify-between" style={{ color: "var(--color-text-secondary)" }}>
                                      <span className="truncate">{p.product_name}</span>
                                      <span className="ml-1 shrink-0" style={{ color: "var(--color-text-muted)" }}>×{p.qty_at_location}</span>
                                    </li>
                                  ))}
                                  {binSlot.products.length > 3 && (
                                    <li className="text-[11px] text-blue-500">+{binSlot.products.length - 3} more</li>
                                  )}
                                </ul>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </div>
        ) : (
          /* ── Product List View ── */
          <div className="space-y-3">
            <input
              type="search"
              placeholder="Search by product name, SKU, or location…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full max-w-md rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }}
            />
            <Card className="overflow-hidden p-0">
              {filteredLocs.length === 0 ? (
                <div className="py-16 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>No products assigned to locations yet.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead style={{ borderBottom: "1px solid var(--color-table-border)", backgroundColor: "var(--color-table-header)" }}>
                    <tr>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Product</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>SKU</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Location</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Aisle</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Shelf</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Bin</th>
                      <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Qty Here</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-[var(--color-table-border)]" style={{ borderColor: "var(--color-table-border)" }}>
                    {filteredLocs.map((pl) => (
                      <tr
                        key={pl.id}
                        className="hover:bg-[var(--color-surface-subtle)]"
                        style={{ borderBottom: "1px solid var(--color-table-border)" }}
                      >
                        <td className="px-5 py-3 font-medium" style={{ color: "var(--color-text-primary)" }}>{pl.product_name}</td>
                        <td className="px-5 py-3 font-mono text-xs" style={{ color: "var(--color-text-secondary)" }}>{pl.product_sku}</td>
                        <td className="px-5 py-3"><Badge variant="blue">{pl.label}</Badge></td>
                        <td className="px-5 py-3" style={{ color: "var(--color-text-secondary)" }}>{pl.aisle}</td>
                        <td className="px-5 py-3" style={{ color: "var(--color-text-secondary)" }}>{pl.shelf || "—"}</td>
                        <td className="px-5 py-3" style={{ color: "var(--color-text-secondary)" }}>{pl.bin || "—"}</td>
                        <td className="px-5 py-3 text-right font-mono" style={{ color: "var(--color-text-secondary)" }}>{pl.qty_at_location}</td>
                        <td className="px-5 py-3 text-xs" style={{ color: "var(--color-text-muted)" }}>{pl.notes ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>
        )}
      </div>

      {showCreate && (
        <CreateLocationModal onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); void load(); }} />
      )}
      {showBulk && (
        <BulkAssignModal locations={locations} onClose={() => setShowBulk(false)} onSaved={() => { setShowBulk(false); void load(); }} />
      )}
    </EnterpriseShell>
  );
}
