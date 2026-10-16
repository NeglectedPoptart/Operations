"use client";

import { useMemo, useState } from "react";
import CollapsibleSection from "@/components/CollapsibleSection";
import { useConfirm } from "@/components/ConfirmProvider";
import { addDays, formatDate, todayISO } from "@/lib/dates";
import { PTO_DAYS_PER_YEAR, entryDays, ptoBalance, ptoYearAt, weekdaysBetween } from "@/lib/pto";
import type { PtoRequest } from "@/lib/types";
import { createPtoEntry, deletePtoEntry, updatePtoDays } from "./actions";

export interface PtoEmployee {
  id: string;
  name: string;
  start_date: string | null;
  status: string;
}

const field = "w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-black";

function range(start: string, end: string): string {
  return start === end ? formatDate(start) : `${formatDate(start)} - ${formatDate(end)}`;
}

function dayText(n: number): string {
  return `${Number(n.toFixed(2))} day${n === 1 ? "" : "s"}`;
}

type View = "upcoming" | "past" | "all";

export default function PtoSection({ employees, initialEntries }: { employees: PtoEmployee[]; initialEntries: PtoRequest[] }) {
  const confirm = useConfirm();
  const today = todayISO();
  const [entries, setEntries] = useState(initialEntries);
  const [view, setView] = useState<View>("upcoming");
  const [filterName, setFilterName] = useState("");

  // The add form
  const [name, setName] = useState("");
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [days, setDays] = useState(String(weekdaysBetween(today, today)));
  const [daysEdited, setDaysEdited] = useState(false);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = useMemo(() => employees.filter((e) => e.status === "active"), [employees]);
  const byName = useMemo(() => new Map(employees.map((e) => [e.name.trim().toLowerCase(), e])), [employees]);
  const entriesFor = (n: string) => entries.filter((e) => e.employee_name.trim().toLowerCase() === n.trim().toLowerCase());

  // What the person being entered has left in the PTO year this time off starts in.
  const picked = name ? byName.get(name.trim().toLowerCase()) : undefined;
  const preview = useMemo(() => {
    if (!picked?.start_date) return null;
    const year = ptoYearAt(picked.start_date, start);
    const used = entriesFor(picked.name)
      .filter((e) => e.start_date >= year.start && e.start_date <= year.end)
      .reduce((s, e) => s + entryDays(e), 0);
    return { year, used, left: year.allowance - used };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked, start, entries]);
  const requested = Number(days) || 0;

  function changeDates(nextStart: string, nextEnd: string) {
    const fixedEnd = nextEnd < nextStart ? nextStart : nextEnd;
    setStart(nextStart);
    setEnd(fixedEnd);
    if (!daysEdited) setDays(String(weekdaysBetween(nextStart, fixedEnd)));
  }

  async function add() {
    if (!name || !start || !end || !(requested > 0)) {
      setError("Choose the employee, the dates and how many days.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const row = await createPtoEntry({ employee_name: name, start_date: start, end_date: end, days: requested, notes });
      setEntries((prev) => [...prev, row].sort((a, b) => a.start_date.localeCompare(b.start_date)));
      setNotes("");
      setDaysEdited(false);
      setDays(String(weekdaysBetween(start, end)));
    } catch {
      setError("Couldn't save that - try again.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(e: PtoRequest) {
    if (!(await confirm(`Delete ${e.employee_name}'s time off (${range(e.start_date, e.end_date)})? Their days used go back up.`))) return;
    setEntries((prev) => prev.filter((x) => x.id !== e.id));
    await deletePtoEntry(e.id).catch(() => {});
  }

  function saveDays(e: PtoRequest, value: string) {
    const n = Number(value);
    if (!(n > 0) || n === entryDays(e)) return;
    setEntries((prev) => prev.map((x) => (x.id === e.id ? { ...x, days: n } : x)));
    updatePtoDays(e.id, n).catch(() => {});
  }

  const list = entries.filter((e) => {
    if (filterName && e.employee_name.trim().toLowerCase() !== filterName.trim().toLowerCase()) return false;
    if (view === "upcoming") return e.end_date >= today;
    if (view === "past") return e.end_date < today;
    return true;
  });
  const shown = view === "past" ? [...list].reverse() : list;

  return (
    <CollapsibleSection id="schedules-pto" title="Time Off (PTO)" note={`${entries.filter((e) => e.end_date >= today).length} upcoming`}>
      <p className="text-sm text-black/60 dark:text-white/60">
        Everyone who has been here a year gets {PTO_DAYS_PER_YEAR === 5 ? "one week" : `${PTO_DAYS_PER_YEAR} days`} ({PTO_DAYS_PER_YEAR} working days) per year of
        service, counted from their hire date on Employee Files. Weekends aren&apos;t counted, and a week unused in one year doesn&apos;t carry to the next.
      </p>

      {/* Add time off */}
      <div className="space-y-2 rounded-lg border border-black/10 p-3 dark:border-white/10">
        <p className="text-sm font-bold text-green-700 dark:text-green-400">Add time off</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block text-xs font-medium text-black/60 dark:text-white/60">
            Employee
            <select value={name} onChange={(e) => setName(e.target.value)} className={`${field} mt-1 min-w-[12rem]`}>
              <option value="">Choose...</option>
              {active.map((e) => (
                <option key={e.id} value={e.name}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-black/60 dark:text-white/60">
            From
            <input type="date" value={start} onChange={(e) => changeDates(e.target.value, end)} className={`${field} mt-1`} />
          </label>
          <label className="block text-xs font-medium text-black/60 dark:text-white/60">
            To
            <input type="date" value={end} onChange={(e) => changeDates(start, e.target.value)} className={`${field} mt-1`} />
          </label>
          <label className="block text-xs font-medium text-black/60 dark:text-white/60">
            Days
            <input
              type="number"
              min={0.5}
              step={0.5}
              value={days}
              onChange={(e) => {
                setDays(e.target.value);
                setDaysEdited(true);
              }}
              className={`${field} mt-1 w-20`}
            />
          </label>
          <label className="block min-w-[10rem] flex-1 text-xs font-medium text-black/60 dark:text-white/60">
            Notes
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Vacation, appointment..." className={`${field} mt-1`} />
          </label>
          <button
            onClick={add}
            disabled={saving}
            className="rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
          >
            {saving ? "Adding..." : "+ Add time off"}
          </button>
        </div>
        <p className="text-xs text-black/50 dark:text-white/50">Days fills in as the weekdays between the dates; change it for a half day (0.5) or a short week.</p>
        {picked && !picked.start_date && <p className="text-xs text-amber-600">{picked.name} has no hire date on Employee Files, so their balance can&apos;t be worked out.</p>}
        {preview && (
          <p className={`text-xs ${preview.year.allowance === 0 ? "text-amber-600" : preview.left - requested < 0 ? "text-red-600" : "text-black/60 dark:text-white/60"}`}>
            {preview.year.allowance === 0
              ? `${picked?.name} isn't eligible for paid time off yet - their first year ends ${formatDate(preview.year.end)}.`
              : `${picked?.name} has ${dayText(preview.left)} left in the PTO year ${formatDate(preview.year.start)} - ${formatDate(preview.year.end)}${
                  requested > 0 ? `; after this ${dayText(preview.left - requested)}${preview.left - requested < 0 ? " (over their week)" : ""}.` : "."
                }`}
          </p>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>

      {/* Balances */}
      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-black/5 text-left dark:bg-white/10">
            <tr>
              <th className="px-3 py-2">Employee</th>
              <th className="px-3 py-2">Hired</th>
              <th className="px-3 py-2">This PTO year</th>
              <th className="px-3 py-2 text-right">Allowed</th>
              <th className="px-3 py-2 text-right">Used</th>
              <th className="px-3 py-2 text-right">Left</th>
              <th className="px-3 py-2 text-right">Booked later</th>
            </tr>
          </thead>
          <tbody>
            {active.map((e) => {
              if (!e.start_date) {
                return (
                  <tr key={e.id} className="border-t border-black/10 dark:border-white/10">
                    <td className="px-3 py-2 font-medium">{e.name}</td>
                    <td colSpan={6} className="px-3 py-2 text-xs text-amber-600">
                      No hire date - add it on Employee Files.
                    </td>
                  </tr>
                );
              }
              const b = ptoBalance(e.start_date, entriesFor(e.name), today);
              const eligible = b.year.allowance > 0;
              return (
                <tr key={e.id} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-3 py-2 font-medium">{e.name}</td>
                  <td className="whitespace-nowrap px-3 py-2">{formatDate(e.start_date)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs">
                    {eligible ? `${formatDate(b.year.start)} - ${formatDate(b.year.end)}` : <span className="text-black/50 dark:text-white/50">eligible {formatDate(addDays(b.year.end, 1))}</span>}
                  </td>
                  <td className="px-3 py-2 text-right">{eligible ? b.year.allowance : "-"}</td>
                  <td className="px-3 py-2 text-right">{eligible ? Number(b.used.toFixed(2)) : "-"}</td>
                  <td className={`px-3 py-2 text-right font-semibold ${eligible && b.remaining < 0 ? "text-red-600" : eligible ? "text-green-700 dark:text-green-400" : ""}`}>
                    {eligible ? Number(b.remaining.toFixed(2)) : "-"}
                  </td>
                  <td className="px-3 py-2 text-right">{b.later > 0 ? Number(b.later.toFixed(2)) : ""}</td>
                </tr>
              );
            })}
            {active.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-center text-black/40 dark:text-white/40">
                  No active employees.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* The time off itself */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {(["upcoming", "past", "all"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                view === v ? "bg-black text-white dark:bg-white dark:text-black" : "border border-black/20 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
              }`}
            >
              {v === "upcoming" ? "Upcoming" : v === "past" ? "Past" : "All"}
            </button>
          ))}
          <select value={filterName} onChange={(e) => setFilterName(e.target.value)} className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-black">
            <option value="">Everyone</option>
            {[...new Set(entries.map((e) => e.employee_name))].sort().map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-black/5 text-left dark:bg-white/10">
              <tr>
                <th className="px-3 py-2">Employee</th>
                <th className="px-3 py-2">Dates</th>
                <th className="px-3 py-2">Days</th>
                <th className="px-3 py-2">Notes</th>
                <th className="w-16 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => {
                const soon = e.end_date >= today && e.start_date <= addDays(today, 30);
                return (
                  <tr key={e.id} className={`border-t border-black/10 dark:border-white/10 ${soon ? "bg-green-50/60 dark:bg-green-950/10" : ""}`}>
                    <td className="px-3 py-2 font-medium">{e.employee_name}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {range(e.start_date, e.end_date)}
                      {e.start_date <= today && e.end_date >= today && <span className="ml-2 rounded-full bg-green-600 px-2 py-0.5 text-[10px] font-semibold text-white">out now</span>}
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        type="number"
                        min={0.5}
                        step={0.5}
                        defaultValue={entryDays(e)}
                        onBlur={(ev) => saveDays(e, ev.target.value)}
                        className="w-16 rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black"
                      />
                    </td>
                    <td className="px-3 py-2">{e.notes}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => remove(e)} className="text-xs font-medium text-red-600 hover:underline">
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-black/40 dark:text-white/40">
                    {view === "upcoming" ? "No time off coming up." : view === "past" ? "No past time off." : "No time off entered."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </CollapsibleSection>
  );
}
