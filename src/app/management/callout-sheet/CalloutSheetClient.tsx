"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { addMonths, formatDate, formatMonthLabel, mondayOf, monthEnd, todayISO } from "@/lib/dates";
import type { CalloutApproved, CalloutEntry, PtoRequest } from "@/lib/types";
import LockedCombobox from "@/components/LockedCombobox";
import {
  createCalloutEntry,
  createCalloutType,
  createEmployee,
  createPtoRequest,
  deleteCalloutEntry,
  deletePtoRequest,
  updateCalloutEntry,
  type CalloutEntryInput,
  type PtoRequestInput,
} from "./actions";

const field = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black";

function emptyDraft(defaultDate: string): CalloutEntryInput {
  return {
    employee_name: "",
    entry_date: defaultDate,
    call_out_type: "",
    reason: "",
    notified_at: "",
    approved: null,
    return_date: "",
  };
}

function emptyPtoDraft(defaultDate: string): PtoRequestInput {
  return { employee_name: "", start_date: defaultDate, end_date: defaultDate, notes: "" };
}

function ptoDuration(start: string, end: string): number {
  const ms = new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime();
  return Math.round(ms / 86400000) + 1;
}

function ptoDateRange(start: string, end: string): string {
  return start === end ? formatDate(start) : `${formatDate(start)} - ${formatDate(end)}`;
}

export default function CalloutSheetClient({
  initialMonth,
  initialEntries,
  employeeOptions: initialEmployeeOptions,
  calloutTypeOptions: initialCalloutTypeOptions,
  initialUpcomingPto,
}: {
  initialMonth: string;
  initialEntries: CalloutEntry[];
  employeeOptions: string[];
  calloutTypeOptions: string[];
  initialUpcomingPto: PtoRequest[];
}) {
  const [month, setMonth] = useState(initialMonth);
  const [cache, setCache] = useState<Record<string, CalloutEntry[]>>(() => ({
    [initialMonth]: initialEntries,
  }));
  const [employeeOptions, setEmployeeOptions] = useState(initialEmployeeOptions);
  const [calloutTypeOptions, setCalloutTypeOptions] = useState(initialCalloutTypeOptions);
  const [draft, setDraft] = useState<CalloutEntryInput>(() => emptyDraft(todayISO()));
  const [adding, setAdding] = useState(false);
  const [upcomingPto, setUpcomingPto] = useState(initialUpcomingPto);
  const [ptoDraft, setPtoDraft] = useState<PtoRequestInput>(() => emptyPtoDraft(todayISO()));
  const [addingPto, setAddingPto] = useState(false);

  const entries = useMemo(
    () => [...(cache[month] ?? [])].sort((a, b) => a.entry_date.localeCompare(b.entry_date)),
    [cache, month],
  );
  const loading = !(month in cache);

  const weeks = useMemo(() => {
    const map = new Map<string, CalloutEntry[]>();
    for (const entry of entries) {
      const key = mondayOf(entry.entry_date);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(entry);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [entries]);

  const summary = useMemo(() => {
    const byEmployee = new Map<string, { absences: number; late: number }>();
    let totalAbsences = 0;
    let totalLate = 0;
    for (const entry of entries) {
      const type = entry.call_out_type.trim().toLowerCase();
      if (type !== "absent" && type !== "late") continue;
      const bucket = byEmployee.get(entry.employee_name) ?? { absences: 0, late: 0 };
      if (type === "absent") {
        bucket.absences += 1;
        totalAbsences += 1;
      } else {
        bucket.late += 1;
        totalLate += 1;
      }
      byEmployee.set(entry.employee_name, bucket);
    }
    return {
      totalAbsences,
      totalLate,
      byEmployee: Array.from(byEmployee.entries()).sort(([a], [b]) => a.localeCompare(b)),
    };
  }, [entries]);

  function loadMonth(target: string) {
    setMonth(target);
    if (target in cache) return;

    const supabase = createClient();
    supabase
      .from("callout_entries")
      .select("*")
      .gte("entry_date", target)
      .lte("entry_date", monthEnd(target))
      .order("entry_date", { ascending: true })
      .then(({ data, error }) => {
        if (error) return;
        setCache((prev) => ({ ...prev, [target]: (data ?? []) as CalloutEntry[] }));
      });
  }

  function addEmployeeOption(name: string) {
    setEmployeeOptions((prev) => (prev.includes(name) ? prev : [...prev, name].sort()));
    createEmployee(name).catch(() => {});
  }

  function addCalloutTypeOption(name: string) {
    setCalloutTypeOptions((prev) => (prev.includes(name) ? prev : [...prev, name].sort()));
    createCalloutType(name).catch(() => {});
  }

  function updateLocal(id: string, patch: Partial<CalloutEntry>) {
    setCache((prev) => ({
      ...prev,
      [month]: (prev[month] ?? []).map((e) => (e.id === id ? { ...e, ...patch } : e)),
    }));
  }

  function handleFieldSave(id: string, patch: Partial<CalloutEntryInput>) {
    updateLocal(id, patch as Partial<CalloutEntry>);
    updateCalloutEntry(id, patch).catch(() => {});
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this entry?")) return;
    setCache((prev) => ({ ...prev, [month]: (prev[month] ?? []).filter((e) => e.id !== id) }));
    await deleteCalloutEntry(id).catch(() => {});
  }

  async function handleAddEntry() {
    if (!draft.employee_name.trim() || !draft.call_out_type.trim() || !draft.entry_date) return;
    setAdding(true);
    try {
      const cleaned: CalloutEntryInput = {
        ...draft,
        reason: draft.reason?.trim() || null,
        notified_at: draft.notified_at?.trim() || null,
        return_date: draft.return_date || null,
      };
      const row = await createCalloutEntry(cleaned);
      const rowMonth = (row as CalloutEntry).entry_date.slice(0, 7) + "-01";
      if (rowMonth === month) {
        setCache((prev) => ({ ...prev, [month]: [...(prev[month] ?? []), row as CalloutEntry] }));
      }
      setDraft(emptyDraft(draft.entry_date));
    } finally {
      setAdding(false);
    }
  }

  async function handleAddPto() {
    if (!ptoDraft.employee_name.trim() || !ptoDraft.start_date || !ptoDraft.end_date) return;
    setAddingPto(true);
    try {
      const cleaned: PtoRequestInput = {
        ...ptoDraft,
        end_date: ptoDraft.end_date < ptoDraft.start_date ? ptoDraft.start_date : ptoDraft.end_date,
        notes: ptoDraft.notes?.trim() || null,
      };
      const row = (await createPtoRequest(cleaned)) as PtoRequest;
      setUpcomingPto((prev) => [...prev, row].sort((a, b) => a.start_date.localeCompare(b.start_date)));
      setPtoDraft(emptyPtoDraft(todayISO()));
    } finally {
      setAddingPto(false);
    }
  }

  async function handleDeletePto(id: string) {
    setUpcomingPto((prev) => prev.filter((p) => p.id !== id));
    await deletePtoRequest(id).catch(() => {});
  }

  const isCurrentMonth = month === todayISO().slice(0, 7) + "-01";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <h1 className="text-2xl font-bold">Call Out Sheet</h1>
        <button
          onClick={() => window.print()}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          Print
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <button
          onClick={() => loadMonth(addMonths(month, -1))}
          className="rounded-md border border-black/20 px-3 py-1.5 text-sm dark:border-white/20"
        >
          ← Prev Month
        </button>
        <span className="text-sm font-medium">
          {formatMonthLabel(month)} {isCurrentMonth && <span className="text-green-600">(this month)</span>}
        </span>
        <button
          onClick={() => loadMonth(addMonths(month, 1))}
          className="rounded-md border border-black/20 px-3 py-1.5 text-sm dark:border-white/20"
        >
          Next Month →
        </button>
        {loading && <span className="text-xs text-black/40">loading…</span>}
      </div>

      <h1 className="hidden text-xl font-bold print:block">Call Out Sheet - {formatMonthLabel(month)}</h1>

      <section className="rounded-lg border border-black/10 p-4 dark:border-white/10 print:border-black">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-black/60 dark:text-white/60">
          Upcoming Time Off (Next 30 Days)
        </h2>
        {upcomingPto.length === 0 ? (
          <p className="text-sm text-black/40 dark:text-white/40">Nothing scheduled.</p>
        ) : (
          <table className="w-full max-w-2xl text-sm">
            <thead className="text-left">
              <tr>
                <th className="px-2 py-1">Employee</th>
                <th className="px-2 py-1">Dates</th>
                <th className="px-2 py-1">Duration</th>
                <th className="px-2 py-1">Notes</th>
                <th className="w-16 px-2 py-1 print:hidden" />
              </tr>
            </thead>
            <tbody>
              {upcomingPto.map((pto) => {
                const days = ptoDuration(pto.start_date, pto.end_date);
                return (
                  <tr key={pto.id} className="border-t border-black/10 dark:border-white/10">
                    <td className="px-2 py-1">{pto.employee_name}</td>
                    <td className="px-2 py-1">{ptoDateRange(pto.start_date, pto.end_date)}</td>
                    <td className="px-2 py-1">
                      {days} day{days !== 1 ? "s" : ""}
                    </td>
                    <td className="px-2 py-1">{pto.notes}</td>
                    <td className="px-2 py-1 print:hidden">
                      <button
                        onClick={() => handleDeletePto(pto.id)}
                        className="text-xs font-medium text-red-600 hover:underline"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <div className="mt-3 flex flex-wrap items-end gap-2 print:hidden">
          <div>
            <label className="text-xs text-black/60 dark:text-white/60">Employee</label>
            <LockedCombobox
              value={ptoDraft.employee_name}
              onChange={(v) => setPtoDraft((d) => ({ ...d, employee_name: v }))}
              options={employeeOptions}
              onAddOption={addEmployeeOption}
              className={field}
            />
          </div>
          <div>
            <label className="text-xs text-black/60 dark:text-white/60">Start Date</label>
            <input
              type="date"
              value={ptoDraft.start_date}
              onChange={(e) =>
                setPtoDraft((d) => ({
                  ...d,
                  start_date: e.target.value,
                  end_date: d.end_date < e.target.value ? e.target.value : d.end_date,
                }))
              }
              className={field}
            />
          </div>
          <div>
            <label className="text-xs text-black/60 dark:text-white/60">End Date</label>
            <input
              type="date"
              value={ptoDraft.end_date}
              onChange={(e) => setPtoDraft((d) => ({ ...d, end_date: e.target.value }))}
              className={field}
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-black/60 dark:text-white/60">Notes</label>
            <input
              value={ptoDraft.notes ?? ""}
              onChange={(e) => setPtoDraft((d) => ({ ...d, notes: e.target.value }))}
              className={field}
            />
          </div>
          <button
            onClick={handleAddPto}
            disabled={addingPto}
            className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
          >
            {addingPto ? "Adding..." : "+ Add Time Off"}
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-black/10 p-4 dark:border-white/10 print:border-black">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-black/60 dark:text-white/60">
          Summary
        </h2>
        <div className="mb-3 flex gap-6 text-sm">
          <p>
            Total Absences: <span className="font-semibold">{summary.totalAbsences}</span>
          </p>
          <p>
            Total Late: <span className="font-semibold">{summary.totalLate}</span>
          </p>
        </div>
        {summary.byEmployee.length > 0 && (
          <table className="w-full max-w-md text-sm">
            <thead className="text-left">
              <tr>
                <th className="px-2 py-1">Employee</th>
                <th className="px-2 py-1">Absences</th>
                <th className="px-2 py-1">Late</th>
              </tr>
            </thead>
            <tbody>
              {summary.byEmployee.map(([name, counts]) => (
                <tr key={name} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-2 py-1">{name}</td>
                  <td className="px-2 py-1">{counts.absences}</td>
                  <td className="px-2 py-1">{counts.late}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {weeks.map(([weekStart, weekEntries], weekIndex) => (
        <section key={weekStart} className="space-y-2">
          <h2 className="border-b-2 border-green-600 pb-1 text-lg font-bold text-green-700 dark:text-green-400">
            Week {weekIndex + 1}
          </h2>
          <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10 print:border-black">
            <table className="w-full text-sm">
              <thead className="bg-black/5 text-left dark:bg-white/5 print:bg-transparent">
                <tr>
                  <th className="px-2 py-2">Employee</th>
                  <th className="px-2 py-2">Date</th>
                  <th className="px-2 py-2">Type</th>
                  <th className="px-2 py-2">Reason / Notes</th>
                  <th className="px-2 py-2">Notified At</th>
                  <th className="px-2 py-2">Approved?</th>
                  <th className="px-2 py-2">Return Date</th>
                  <th className="w-16 px-2 py-2 print:hidden" />
                </tr>
              </thead>
              <tbody>
                {weekEntries.map((entry) => (
                  <tr key={entry.id} className="border-t border-black/10 dark:border-white/10">
                    <td className="min-w-[9rem] px-1 py-1">
                      <LockedCombobox
                        value={entry.employee_name}
                        onChange={(v) => handleFieldSave(entry.id, { employee_name: v })}
                        options={employeeOptions}
                        onAddOption={addEmployeeOption}
                        className={field}
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        type="date"
                        defaultValue={entry.entry_date}
                        onBlur={(e) => e.target.value && handleFieldSave(entry.id, { entry_date: e.target.value })}
                        className={field}
                      />
                    </td>
                    <td className="min-w-[8rem] px-1 py-1">
                      <LockedCombobox
                        value={entry.call_out_type}
                        onChange={(v) => handleFieldSave(entry.id, { call_out_type: v })}
                        options={calloutTypeOptions}
                        onAddOption={addCalloutTypeOption}
                        className={field}
                      />
                    </td>
                    <td className="min-w-[10rem] px-1 py-1">
                      <input
                        defaultValue={entry.reason ?? ""}
                        onBlur={(e) => handleFieldSave(entry.id, { reason: e.target.value || null })}
                        className={field}
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        defaultValue={entry.notified_at ?? ""}
                        onBlur={(e) => handleFieldSave(entry.id, { notified_at: e.target.value || null })}
                        className={field}
                      />
                    </td>
                    <td className="px-1 py-1">
                      <select
                        value={entry.approved ?? ""}
                        onChange={(e) =>
                          handleFieldSave(entry.id, { approved: (e.target.value || null) as CalloutApproved | null })
                        }
                        className={field}
                      >
                        <option value="">--</option>
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </select>
                    </td>
                    <td className="px-1 py-1">
                      <input
                        type="date"
                        defaultValue={entry.return_date ?? ""}
                        onBlur={(e) => handleFieldSave(entry.id, { return_date: e.target.value || null })}
                        className={field}
                      />
                    </td>
                    <td className="px-2 py-1.5 print:hidden">
                      <button
                        onClick={() => handleDelete(entry.id)}
                        className="text-xs font-medium text-red-600 hover:underline"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {entries.length === 0 && !loading && (
        <p className="text-sm text-black/40 dark:text-white/40">No call outs logged for this month yet.</p>
      )}

      <section className="space-y-2 rounded-lg border border-black/10 p-4 print:hidden dark:border-white/10">
        <h2 className="text-sm font-bold uppercase tracking-wide text-black/60 dark:text-white/60">
          Add Entry
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div>
            <label className="text-xs text-black/60 dark:text-white/60">Employee</label>
            <LockedCombobox
              value={draft.employee_name}
              onChange={(v) => setDraft((d) => ({ ...d, employee_name: v }))}
              options={employeeOptions}
              onAddOption={addEmployeeOption}
              className={field}
            />
          </div>
          <div>
            <label className="text-xs text-black/60 dark:text-white/60">Date</label>
            <input
              type="date"
              value={draft.entry_date}
              onChange={(e) => setDraft((d) => ({ ...d, entry_date: e.target.value }))}
              className={field}
            />
          </div>
          <div>
            <label className="text-xs text-black/60 dark:text-white/60">Type</label>
            <LockedCombobox
              value={draft.call_out_type}
              onChange={(v) => setDraft((d) => ({ ...d, call_out_type: v }))}
              options={calloutTypeOptions}
              onAddOption={addCalloutTypeOption}
              className={field}
            />
          </div>
          <div>
            <label className="text-xs text-black/60 dark:text-white/60">Reason / Notes</label>
            <input
              value={draft.reason ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, reason: e.target.value }))}
              className={field}
            />
          </div>
          <div>
            <label className="text-xs text-black/60 dark:text-white/60">Notified At</label>
            <input
              value={draft.notified_at ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, notified_at: e.target.value }))}
              className={field}
            />
          </div>
          <div>
            <label className="text-xs text-black/60 dark:text-white/60">Approved?</label>
            <select
              value={draft.approved ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, approved: (e.target.value || null) as CalloutApproved | null }))}
              className={field}
            >
              <option value="">--</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-black/60 dark:text-white/60">Return Date</label>
            <input
              type="date"
              value={draft.return_date ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, return_date: e.target.value }))}
              className={field}
            />
          </div>
        </div>
        <button
          onClick={handleAddEntry}
          disabled={adding}
          className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
        >
          {adding ? "Adding..." : "+ Add Entry"}
        </button>
      </section>
    </div>
  );
}
