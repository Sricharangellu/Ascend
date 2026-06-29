"use client";

import { useState, useEffect, useCallback } from "react";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { TableSkeleton } from "@/components/TableSkeleton";
import { apiGet, apiPost, apiPatch } from "@/api-client/client";
import type { Patient, PatientsResponse, Prescription, PrescriptionsResponse } from "@/api-client/types";
import { clsx } from "clsx";

interface PatientForm { firstName: string; lastName: string; dob: string; phone: string; email: string; }
const EMPTY_FORM: PatientForm = { firstName: "", lastName: "", dob: "", phone: "", email: "" };

export default function HealthcarePatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Patient | null>(null);
  const [rxList, setRxList] = useState<Prescription[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showRx, setShowRx] = useState(false);
  const [rxForm, setRxForm] = useState({ drug: "", doseInstructions: "", refills: "0" });
  const [form, setForm] = useState<PatientForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await apiGet<PatientsResponse>("/api/v1/healthcare/patients");
      setPatients(data.items ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load patients"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function loadRx(patient: Patient) {
    setSelected(patient); setRxList([]);
    try {
      const data = await apiGet<PrescriptionsResponse>(`/api/v1/healthcare/patients/${patient.id}/prescriptions`);
      setRxList(data.items ?? []);
    } catch { setRxList([]); }
  }

  async function createPatient() {
    if (!form.firstName.trim() || !form.lastName.trim()) return;
    setSaving(true);
    try {
      await apiPost("/api/v1/healthcare/patients", {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        dob: form.dob || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
      });
      setShowCreate(false); setForm(EMPTY_FORM); await load();
    } catch (e) { alert(e instanceof Error ? e.message : "Failed"); } finally { setSaving(false); }
  }

  async function addPrescription() {
    if (!selected || !rxForm.drug.trim() || !rxForm.doseInstructions.trim()) return;
    setSaving(true);
    try {
      await apiPost(`/api/v1/healthcare/patients/${selected.id}/prescriptions`, {
        drug: rxForm.drug.trim(),
        doseInstructions: rxForm.doseInstructions.trim(),
        refillsRemaining: parseInt(rxForm.refills) || 0,
      });
      setShowRx(false); setRxForm({ drug: "", doseInstructions: "", refills: "0" });
      await loadRx(selected);
    } catch (e) { alert(e instanceof Error ? e.message : "Failed"); } finally { setSaving(false); }
  }

  async function refillRx(rxId: string) {
    if (!selected) return;
    try {
      await apiPatch(`/api/v1/healthcare/prescriptions/${rxId}/refill`, {});
      await loadRx(selected);
    } catch (e) { alert(e instanceof Error ? e.message : "Failed"); }
  }

  const filtered = patients.filter(p =>
    search === "" || `${p.first_name} ${p.last_name}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <EnterpriseShell active="healthcare-patients" title="Patients" subtitle="Patient records & prescription management">
      <div className="flex flex-col gap-6 p-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card className="p-4">
            <p className="text-xs text-[rgba(0,0,0,0.45)] uppercase tracking-wide">Total Patients</p>
            <p className="mt-1 text-2xl font-bold">{patients.length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-[rgba(0,0,0,0.45)] uppercase tracking-wide">Active</p>
            <p className="mt-1 text-2xl font-bold text-green-600">{patients.filter(p => p.status === "active").length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-[rgba(0,0,0,0.45)] uppercase tracking-wide">Inactive</p>
            <p className="mt-1 text-2xl font-bold text-[rgba(0,0,0,0.45)]">{patients.filter(p => p.status === "inactive").length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-[rgba(0,0,0,0.45)] uppercase tracking-wide">Deceased</p>
            <p className="mt-1 text-2xl font-bold text-[rgba(0,0,0,0.25)]">{patients.filter(p => p.status === "deceased").length}</p>
          </Card>
        </div>

        <div className="flex items-center gap-3">
          <input type="text" placeholder="Search patients…" value={search} onChange={e => setSearch(e.target.value)}
            className="flex-1 rounded border border-[#D9D9D9] px-3 py-1.5 text-sm" />
          <Button size="sm" onClick={() => setShowCreate(true)}>+ Add Patient</Button>
        </div>

        {loading && <TableSkeleton rows={6} cols={5} />}
        {error && <p className="text-red-600 text-sm py-4">{error}</p>}

        {!loading && (
          <div className="overflow-hidden rounded-lg border border-[#E8E8E8] bg-white">
            {filtered.length === 0 ? (
              <div className="p-12 text-center text-sm text-[rgba(0,0,0,0.45)]">No patients found.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#F0F0F0] bg-[#FAFAFA]">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[rgba(0,0,0,0.45)] uppercase">Patient</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[rgba(0,0,0,0.45)] uppercase">DOB</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[rgba(0,0,0,0.45)] uppercase">Phone</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[rgba(0,0,0,0.45)] uppercase">Email</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[rgba(0,0,0,0.45)] uppercase">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => (
                    <tr key={p.id} className="border-b border-[#F0F0F0] cursor-pointer hover:bg-[#FAFAFA]" onClick={() => void loadRx(p)}>
                      <td className="px-4 py-3 font-medium text-[rgba(0,0,0,0.88)]">{p.first_name} {p.last_name}</td>
                      <td className="px-4 py-3 text-[rgba(0,0,0,0.65)]">{p.dob ?? "—"}</td>
                      <td className="px-4 py-3 text-[rgba(0,0,0,0.65)]">{p.phone ?? "—"}</td>
                      <td className="px-4 py-3 text-[rgba(0,0,0,0.65)]">{p.email ?? "—"}</td>
                      <td className="px-4 py-3">
                        <Badge variant={p.status === "active" ? "green" : p.status === "deceased" ? "gray" : "yellow"} size="sm">
                          {p.status.charAt(0).toUpperCase() + p.status.slice(1)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Patient detail / Rx modal */}
        {selected && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSelected(null)}>
            <div className="w-full max-w-md rounded-xl bg-white shadow-2xl p-6 overflow-y-auto max-h-[90vh]" onClick={e => e.stopPropagation()}>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold">{selected.first_name} {selected.last_name}</h3>
                  <p className="text-xs text-[rgba(0,0,0,0.45)]">{selected.dob ? `DOB: ${selected.dob}` : "No DOB"}{selected.phone ? ` · ${selected.phone}` : ""}</p>
                </div>
                <Badge variant={selected.status === "active" ? "green" : "gray"}>{selected.status}</Badge>
              </div>

              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold">Prescriptions</h4>
                  <Button size="sm" variant="outline" onClick={() => setShowRx(true)}>+ Add Rx</Button>
                </div>
                {rxList.length === 0
                  ? <p className="text-xs text-[rgba(0,0,0,0.35)]">No prescriptions on record.</p>
                  : (
                    <div className="space-y-2">
                      {rxList.map(rx => (
                        <div key={rx.id} className="rounded border border-[#E8E8E8] p-3">
                          <div className="flex items-center justify-between">
                            <p className="font-medium text-sm">{rx.drug}</p>
                            <Badge variant={rx.status === "active" ? "green" : "gray"} size="sm">{rx.status}</Badge>
                          </div>
                          <p className="text-xs text-[rgba(0,0,0,0.65)] mt-1">{rx.dose_instructions}</p>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-xs text-[rgba(0,0,0,0.45)]">{rx.refills_remaining} refill{rx.refills_remaining !== 1 ? "s" : ""} remaining</span>
                            {rx.status === "active" && rx.refills_remaining > 0 && (
                              <button type="button" onClick={() => void refillRx(rx.id)}
                                className="text-xs text-brand-600 hover:underline">Refill</button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                }
              </div>
              <button type="button" onClick={() => setSelected(null)} className="w-full rounded border border-[#D9D9D9] py-1.5 text-xs text-[rgba(0,0,0,0.45)] hover:bg-[#F5F5F5]">Close</button>
            </div>
          </div>
        )}

        {/* Add Rx modal */}
        {showRx && selected && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setShowRx(false)}>
            <div className="w-full max-w-sm rounded-xl bg-white shadow-2xl p-6" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-bold mb-4">Add Prescription — {selected.first_name}</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Drug / Medication *</label>
                  <input type="text" placeholder="Amoxicillin 500mg…" value={rxForm.drug}
                    onChange={e => setRxForm(f => ({ ...f, drug: e.target.value }))}
                    className="w-full rounded border border-[#D9D9D9] px-2 py-1 text-sm" autoFocus />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Dosage Instructions *</label>
                  <input type="text" placeholder="Take 1 tablet twice daily…" value={rxForm.doseInstructions}
                    onChange={e => setRxForm(f => ({ ...f, doseInstructions: e.target.value }))}
                    className="w-full rounded border border-[#D9D9D9] px-2 py-1 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Refills</label>
                  <input type="number" min="0" max="12" value={rxForm.refills}
                    onChange={e => setRxForm(f => ({ ...f, refills: e.target.value }))}
                    className="w-full rounded border border-[#D9D9D9] px-2 py-1 text-sm" />
                </div>
              </div>
              <div className="mt-4 flex gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={() => setShowRx(false)}>Cancel</Button>
                <Button size="sm" onClick={() => void addPrescription()} loading={saving}>Add</Button>
              </div>
            </div>
          </div>
        )}

        {/* Create patient modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowCreate(false)}>
            <div className="w-full max-w-sm rounded-xl bg-white shadow-2xl p-6" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-bold mb-4">Add Patient</h3>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">First Name *</label>
                    <input type="text" placeholder="Jane" value={form.firstName}
                      onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                      className="w-full rounded border border-[#D9D9D9] px-2 py-1 text-sm" autoFocus />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Last Name *</label>
                    <input type="text" placeholder="Smith" value={form.lastName}
                      onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
                      className="w-full rounded border border-[#D9D9D9] px-2 py-1 text-sm" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Date of Birth</label>
                  <input type="date" value={form.dob} onChange={e => setForm(f => ({ ...f, dob: e.target.value }))}
                    className="w-full rounded border border-[#D9D9D9] px-2 py-1 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Phone</label>
                  <input type="tel" placeholder="+1 555 000 0000" value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    className="w-full rounded border border-[#D9D9D9] px-2 py-1 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Email</label>
                  <input type="email" placeholder="jane@example.com" value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full rounded border border-[#D9D9D9] px-2 py-1 text-sm" />
                </div>
              </div>
              <div className="mt-4 flex gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
                <Button size="sm" onClick={() => void createPatient()} loading={saving}>Create</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </EnterpriseShell>
  );
}
