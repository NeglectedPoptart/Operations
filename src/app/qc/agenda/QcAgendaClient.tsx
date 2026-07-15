"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { addDays, formatDate, todayISO } from "@/lib/dates";
import {
  QC_INBOUND_STATUSES,
  type QcAgendaFloorAging,
  type QcAgendaInbound,
  type QcAgendaMeta,
  type QcAgendaRepack,
  type QcInboundStatus,
} from "@/lib/types";
import {
  addFloorAgingRow,
  addInboundRow,
  addRepackRow,
  deleteFloorAgingRow,
  deleteInboundRow,
  deleteRepackRow,
  pullOldAgeIntoFloorAging,
  saveQcAgendaMeta,
  updateFloorAgingRow,
  updateInboundRow,
  updateRepackRow,
} from "./actions";

const field = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black";

interface DayData {
  meta: QcAgendaMeta | null;
  inbounds: QcAgendaInbound[];
  floorAging: QcAgendaFloorAging[];
  repack: QcAgendaRepack[];
}

export default function QcAgendaClient({
  initialDate,
  initialMeta,
  initialInbounds,
  initialFloorAging,
  initialRepack,
}: {
  initialDate: string;
  initialMeta: QcAgendaMeta | null;
  initialInbounds: QcAgendaInbound[];
  initialFloorAging: QcAgendaFloorAging[];
  initialRepack: QcAgendaRepack[];
}) {
  const [date, setDate] = useState(initialDate);
  const [cache, setCache] = useState<Record<string, DayData>>(() => ({
    [initialDate]: {
      meta: initialMeta,
      inbounds: initialInbounds,
      floorAging: initialFloorAging,
      repack: initialRepack,
    },
  }));
  const [pulling, setPulling] = useState(false);

  const day = cache[date] ?? { meta: null, inbounds: [], floorAging: [], repack: [] };
  const loading = !(date in cache);
  const isToday = date === todayISO();

  function loadDate(target: string) {
    setDate(target);
    if (target in cache) return;

    const supabase = createClient();
    Promise.all([
      supabase.from("qc_agenda_meta").select("*").eq("entry_date", target).maybeSingle(),
      supabase.from("qc_agenda_inbounds").select("*").eq("entry_date", target).order("position", { ascending: true }),
      supabase.from("qc_agenda_floor_aging").select("*").eq("entry_date", target).order("position", { ascending: true }),
      supabase.from("qc_agenda_repack").select("*").eq("entry_date", target).order("position", { ascending: true }),
    ]).then(([metaRes, inboundsRes, floorAgingRes, repackRes]) => {
      setCache((prev) => ({
        ...prev,
        [target]: {
          meta: (metaRes.data ?? null) as QcAgendaMeta | null,
          inbounds: (inboundsRes.data ?? []) as QcAgendaInbound[],
          floorAging: (floorAgingRes.data ?? []) as QcAgendaFloorAging[],
          repack: (repackRes.data ?? []) as QcAgendaRepack[],
        },
      }));
    });
  }

  function patchDay(patch: Partial<DayData>) {
    setCache((prev) => ({ ...prev, [date]: { ...(prev[date] ?? day), ...patch } }));
  }

  function handleMetaSave(patch: { prepared_by?: string; qc1?: string; qc2?: string }) {
    patchDay({ meta: { ...(day.meta ?? { id: "", entry_date: date, prepared_by: null, qc1: null, qc2: null, created_at: "", updated_at: "" }), ...patch } });
    saveQcAgendaMeta(date, patch).catch(() => {});
  }

  async function handleAddInbound() {
    const nextPosition = day.inbounds.length > 0 ? Math.max(...day.inbounds.map((r) => r.position)) + 1 : 1;
    const row = await addInboundRow(date, nextPosition);
    patchDay({ inbounds: [...day.inbounds, row as QcAgendaInbound] });
  }

  function handleInboundSave(id: string, patch: Partial<QcAgendaInbound>) {
    patchDay({ inbounds: day.inbounds.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
    updateInboundRow(id, patch).catch(() => {});
  }

  async function handleInboundDelete(id: string) {
    if (!confirm("Delete this row?")) return;
    patchDay({ inbounds: day.inbounds.filter((r) => r.id !== id) });
    await deleteInboundRow(id).catch(() => {});
  }

  async function handlePullOldAge() {
    setPulling(true);
    try {
      const newRows = await pullOldAgeIntoFloorAging(date);
      if (newRows.length > 0) {
        patchDay({ floorAging: [...day.floorAging, ...(newRows as QcAgendaFloorAging[])] });
      }
    } finally {
      setPulling(false);
    }
  }

  async function handleAddFloorAging() {
    const nextPosition = day.floorAging.length > 0 ? Math.max(...day.floorAging.map((r) => r.position)) + 1 : 1;
    const row = await addFloorAgingRow(date, nextPosition);
    patchDay({ floorAging: [...day.floorAging, row as QcAgendaFloorAging] });
  }

  function handleFloorAgingSave(id: string, patch: Partial<QcAgendaFloorAging>) {
    patchDay({ floorAging: day.floorAging.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
    updateFloorAgingRow(id, patch).catch(() => {});
  }

  async function handleFloorAgingDelete(id: string) {
    patchDay({ floorAging: day.floorAging.filter((r) => r.id !== id) });
    await deleteFloorAgingRow(id).catch(() => {});
  }

  async function handleAddRepack() {
    const nextPosition = day.repack.length > 0 ? Math.max(...day.repack.map((r) => r.position)) + 1 : 1;
    const row = await addRepackRow(date, nextPosition);
    patchDay({ repack: [...day.repack, row as QcAgendaRepack] });
  }

  function handleRepackSave(id: string, patch: Partial<QcAgendaRepack>) {
    patchDay({ repack: day.repack.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
    updateRepackRow(id, patch).catch(() => {});
  }

  async function handleRepackDelete(id: string) {
    if (!confirm("Delete this row?")) return;
    patchDay({ repack: day.repack.filter((r) => r.id !== id) });
    await deleteRepackRow(id).catch(() => {});
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <h1 className="text-2xl font-bold">QC Agenda</h1>
        <button
          onClick={() => window.print()}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          Print
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <button
          onClick={() => loadDate(addDays(date, -1))}
          className="rounded-md border border-black/20 px-3 py-1.5 text-sm dark:border-white/20"
        >
          ← Prev Day
        </button>
        <span className="text-sm font-medium">
          {formatDate(date)} {isToday && <span className="text-green-600">(today)</span>}
        </span>
        <button
          onClick={() => loadDate(addDays(date, 1))}
          className="rounded-md border border-black/20 px-3 py-1.5 text-sm dark:border-white/20"
        >
          Next Day →
        </button>
        {!isToday && (
          <button onClick={() => loadDate(todayISO())} className="text-sm font-medium text-green-600 hover:underline">
            Back to today
          </button>
        )}
        {loading && <span className="text-xs text-black/40">loading…</span>}
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-lg border border-black/10 p-4 sm:grid-cols-3 dark:border-white/10 print:border-black">
        <div>
          <p className="text-xs font-medium text-black/60 dark:text-white/60">Date</p>
          <p className="text-sm font-semibold">{formatDate(date)}</p>
        </div>
        <div>
          <label className="text-xs font-medium text-black/60 dark:text-white/60">Prepared By</label>
          <input
            key={`prepared-${date}`}
            defaultValue={day.meta?.prepared_by ?? ""}
            onBlur={(e) => handleMetaSave({ prepared_by: e.target.value })}
            className={field}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-black/60 dark:text-white/60">QC 1</label>
          <input
            key={`qc1-${date}`}
            defaultValue={day.meta?.qc1 ?? ""}
            onBlur={(e) => handleMetaSave({ qc1: e.target.value })}
            className={field}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-black/60 dark:text-white/60">QC 2</label>
          <input
            key={`qc2-${date}`}
            defaultValue={day.meta?.qc2 ?? ""}
            onBlur={(e) => handleMetaSave({ qc2: e.target.value })}
            className={field}
          />
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="border-b-2 border-green-600 pb-1 text-lg font-bold text-green-700 dark:text-green-400">
          Inbounds
        </h2>
        <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10 print:border-black">
          <table className="w-full text-sm">
            <thead className="bg-black/5 text-left dark:bg-white/5 print:bg-transparent">
              <tr>
                <th className="px-2 py-2">Vendor / Origin</th>
                <th className="px-2 py-2">Commodity / SKU</th>
                <th className="px-2 py-2">PO / Load #</th>
                <th className="px-2 py-2">Carrier</th>
                <th className="px-2 py-2">ETA</th>
                <th className="px-2 py-2">Photo/Report</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Notes</th>
                <th className="w-16 px-2 py-2 print:hidden" />
              </tr>
            </thead>
            <tbody>
              {day.inbounds.map((row) => (
                <tr key={row.id} className="border-t border-black/10 dark:border-white/10">
                  <td className="min-w-[7rem] px-1 py-1">
                    <input
                      defaultValue={row.vendor_origin ?? ""}
                      onBlur={(e) => handleInboundSave(row.id, { vendor_origin: e.target.value })}
                      className={field}
                    />
                  </td>
                  <td className="min-w-[8rem] px-1 py-1">
                    <input
                      defaultValue={row.commodity_sku ?? ""}
                      onBlur={(e) => handleInboundSave(row.id, { commodity_sku: e.target.value })}
                      className={field}
                    />
                  </td>
                  <td className="min-w-[7rem] px-1 py-1">
                    <input
                      defaultValue={row.po_load_number ?? ""}
                      onBlur={(e) => handleInboundSave(row.id, { po_load_number: e.target.value })}
                      className={field}
                    />
                  </td>
                  <td className="min-w-[7rem] px-1 py-1">
                    <input
                      defaultValue={row.carrier ?? ""}
                      onBlur={(e) => handleInboundSave(row.id, { carrier: e.target.value })}
                      className={field}
                    />
                  </td>
                  <td className="min-w-[6rem] px-1 py-1">
                    <input
                      defaultValue={row.eta ?? ""}
                      onBlur={(e) => handleInboundSave(row.id, { eta: e.target.value })}
                      className={field}
                    />
                  </td>
                  <td className="min-w-[7rem] px-1 py-1">
                    <input
                      defaultValue={row.photo_report ?? ""}
                      onBlur={(e) => handleInboundSave(row.id, { photo_report: e.target.value })}
                      className={field}
                    />
                  </td>
                  <td className="min-w-[8rem] px-1 py-1">
                    <select
                      value={row.status ?? ""}
                      onChange={(e) => handleInboundSave(row.id, { status: (e.target.value || null) as QcInboundStatus | null })}
                      className={field}
                    >
                      <option value="">--</option>
                      {QC_INBOUND_STATUSES.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="min-w-[10rem] px-1 py-1">
                    <input
                      defaultValue={row.notes ?? ""}
                      onBlur={(e) => handleInboundSave(row.id, { notes: e.target.value })}
                      className={field}
                    />
                  </td>
                  <td className="px-2 py-1.5 print:hidden">
                    <button onClick={() => handleInboundDelete(row.id)} className="text-xs font-medium text-red-600 hover:underline">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {day.inbounds.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-4 text-center text-black/40 dark:text-white/40">
                    No inbounds logged yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <button
          onClick={handleAddInbound}
          className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 print:hidden"
        >
          + Add Row
        </button>
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-green-600 pb-1">
          <h2 className="text-lg font-bold text-green-700 dark:text-green-400">Floor Aging Check (Product at Day Threshold)</h2>
          <button
            onClick={handlePullOldAge}
            disabled={pulling}
            className="rounded-md border border-green-600 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-50 disabled:opacity-60 print:hidden dark:text-green-400 dark:hover:bg-green-900/20"
          >
            {pulling ? "Pulling..." : "Pull Info from Old Age"}
          </button>
        </div>
        <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10 print:border-black">
          <table className="w-full text-sm">
            <thead className="bg-black/5 text-left dark:bg-white/5 print:bg-transparent">
              <tr>
                <th className="px-2 py-2">Commodity / SKU</th>
                <th className="px-2 py-2">Lot #</th>
                <th className="px-2 py-2">Date Received</th>
                <th className="px-2 py-2">Days on Floor</th>
                <th className="px-2 py-2">Action Needed</th>
                <th className="w-16 px-2 py-2 print:hidden" />
              </tr>
            </thead>
            <tbody>
              {day.floorAging.map((row) => (
                <tr key={row.id} className="border-t border-black/10 dark:border-white/10">
                  <td className="min-w-[8rem] px-1 py-1">
                    <input
                      defaultValue={row.commodity_sku ?? ""}
                      onBlur={(e) => handleFloorAgingSave(row.id, { commodity_sku: e.target.value })}
                      className={field}
                    />
                  </td>
                  <td className="min-w-[6rem] px-1 py-1">
                    <input
                      defaultValue={row.lot_number ?? ""}
                      onBlur={(e) => handleFloorAgingSave(row.id, { lot_number: e.target.value })}
                      className={field}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      type="date"
                      defaultValue={row.received_date ?? ""}
                      onBlur={(e) => handleFloorAgingSave(row.id, { received_date: e.target.value || null })}
                      className={field}
                    />
                  </td>
                  <td className="min-w-[5rem] px-1 py-1">
                    <input
                      type="number"
                      defaultValue={row.days_on_floor ?? ""}
                      onBlur={(e) => handleFloorAgingSave(row.id, { days_on_floor: e.target.value ? Number(e.target.value) : null })}
                      className={field}
                    />
                  </td>
                  <td className="min-w-[10rem] px-1 py-1">
                    <input
                      defaultValue={row.action_needed ?? ""}
                      onBlur={(e) => handleFloorAgingSave(row.id, { action_needed: e.target.value })}
                      className={field}
                    />
                  </td>
                  <td className="px-2 py-1.5 print:hidden">
                    <button onClick={() => handleFloorAgingDelete(row.id)} className="text-xs font-medium text-red-600 hover:underline">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {day.floorAging.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-center text-black/40 dark:text-white/40">
                    Nothing pulled in yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <button
          onClick={handleAddFloorAging}
          className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 print:hidden"
        >
          + Add Row
        </button>
      </section>

      <section className="space-y-2">
        <h2 className="border-b-2 border-green-600 pb-1 text-lg font-bold text-green-700 dark:text-green-400">
          Repack Management & Supply Needs
        </h2>
        <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10 print:border-black">
          <table className="w-full text-sm">
            <thead className="bg-black/5 text-left dark:bg-white/5 print:bg-transparent">
              <tr>
                <th className="px-2 py-2">Reference</th>
                <th className="px-2 py-2">Pack Format</th>
                <th className="px-2 py-2">Priority</th>
                <th className="px-2 py-2">Notes</th>
                <th className="w-16 px-2 py-2 print:hidden" />
              </tr>
            </thead>
            <tbody>
              {day.repack.map((row) => (
                <tr key={row.id} className="border-t border-black/10 dark:border-white/10">
                  <td className="min-w-[6rem] px-1 py-1">
                    <input
                      defaultValue={row.reference ?? ""}
                      onBlur={(e) => handleRepackSave(row.id, { reference: e.target.value })}
                      className={field}
                    />
                  </td>
                  <td className="min-w-[8rem] px-1 py-1">
                    <input
                      defaultValue={row.pack_format ?? ""}
                      onBlur={(e) => handleRepackSave(row.id, { pack_format: e.target.value })}
                      className={field}
                    />
                  </td>
                  <td className="min-w-[5rem] px-1 py-1">
                    <input
                      defaultValue={row.priority ?? ""}
                      onBlur={(e) => handleRepackSave(row.id, { priority: e.target.value })}
                      className={field}
                    />
                  </td>
                  <td className="min-w-[10rem] px-1 py-1">
                    <input
                      defaultValue={row.notes ?? ""}
                      onBlur={(e) => handleRepackSave(row.id, { notes: e.target.value })}
                      className={field}
                    />
                  </td>
                  <td className="px-2 py-1.5 print:hidden">
                    <button onClick={() => handleRepackDelete(row.id)} className="text-xs font-medium text-red-600 hover:underline">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {day.repack.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-black/40 dark:text-white/40">
                    Nothing logged yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <button
          onClick={handleAddRepack}
          className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 print:hidden"
        >
          + Add Row
        </button>
      </section>
    </div>
  );
}
