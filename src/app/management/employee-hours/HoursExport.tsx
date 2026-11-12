"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, currentWeekStart, formatDateSlash, todayISO } from "@/lib/dates";
import { detailRows, lastWeek, summaryRows, toCsv, toTsv, totalEmployees, type ExportDay } from "@/lib/hoursExport";
import { decimalHours, hoursMinutes } from "@/lib/timeEntry";
import { getAllEmployeeHours } from "./actions";
import type { EmployeeOption } from "./EmployeeHoursClient";

const btn = "rounded-md border border-black/20 px-3 py-1.5 text-sm font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10";
const dateInput = "mt-0.5 block rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-black";

function download(name: string, text: string) {
  // The BOM makes Excel read the file as UTF-8.
  const blob = new Blob(["﻿", text], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

// Everyone's hours for a week or pay period in one place: see the totals, download them (or every day's times)
// as a spreadsheet file, or copy them to paste into Excel / email.
export default function HoursExport({ employees }: { employees: EmployeeOption[] }) {
  const [open, setOpen] = useState(false);
  const initial = lastWeek(todayISO());
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [days, setDays] = useState<ExportDay[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const token = useRef(0);

  useEffect(() => {
    if (!open || !from || !to || from > to) return;
    const mine = ++token.current;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    getAllEmployeeHours(from, to)
      .then((rows) => mine === token.current && setDays(rows))
      .catch((e) => mine === token.current && setError(e instanceof Error ? e.message : "Couldn't load the hours."))
      .finally(() => mine === token.current && setLoading(false));
  }, [open, from, to]);

  const totals = useMemo(() => (days ? totalEmployees(employees, days) : []), [days, employees]);
  const grand = totals.reduce((s, t) => s + t.minutes, 0);
  const grandOt = totals.reduce((s, t) => s + t.overtimeMinutes, 0);
  const check = totals.reduce((s, t) => s + t.problems, 0);
  const stamp = `${from}_to_${to}`;

  function setWeek(monday: string) {
    setFrom(monday);
    setTo(addDays(monday, 6));
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(toTsv(summaryRows(totals, from, to)));
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      setError("Your browser wouldn't let HOPS copy - use Download instead.");
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={btn}>
        ⬇ Export all employees (payroll)
      </button>
    );
  }

  return (
    <section className="space-y-3 rounded-lg border border-black/15 p-3 dark:border-white/15">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">Export all employees</h2>
          <p className="text-xs text-black/60 dark:text-white/60">Everyone&apos;s hours for the dates you pick. Only employees with hours in that range are listed.</p>
        </div>
        <button onClick={() => setOpen(false)} className="rounded px-2 text-xl leading-none text-black/50 hover:bg-black/10 dark:text-white/50" aria-label="Close">
          ×
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs font-medium">
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={dateInput} />
        </label>
        <label className="text-xs font-medium">
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={dateInput} />
        </label>
        <button className={btn} onClick={() => setWeek(addDays(currentWeekStart(), -7))}>
          Last week
        </button>
        <button className={btn} onClick={() => setWeek(currentWeekStart())}>
          This week
        </button>
        <button className={btn} onClick={() => setWeek(addDays(from, -7))} title="Move the dates back a week">
          ← Week
        </button>
        <button className={btn} onClick={() => setWeek(addDays(from, 7))} title="Move the dates forward a week">
          Week →
        </button>
      </div>
      {from > to && <p className="text-sm text-red-600">The From date is after the To date.</p>}
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>}

      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-black/5 text-left text-xs uppercase dark:bg-white/10">
            <tr>
              <th className="px-3 py-2">Employee</th>
              <th className="px-3 py-2 text-right">Days</th>
              <th className="px-3 py-2 text-right">Total hours</th>
              <th className="px-3 py-2 text-right">Overtime</th>
              <th className="px-3 py-2">Check</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-black/50 dark:text-white/50">
                  Loading...
                </td>
              </tr>
            )}
            {!loading && totals.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-black/50 dark:text-white/50">
                  No hours entered between {formatDateSlash(from)} and {formatDateSlash(to)}.
                </td>
              </tr>
            )}
            {!loading &&
              totals.map((t) => (
                <tr key={t.id} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-3 py-1.5 font-medium">
                    {t.name}
                    {t.status !== "active" && <span className="ml-2 text-xs font-normal text-black/40 dark:text-white/40">no longer here</span>}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{t.daysWorked}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    <b>{decimalHours(t.minutes)}</b> <span className="text-xs text-black/50 dark:text-white/50">({hoursMinutes(t.minutes)})</span>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{t.overtimeMinutes > 0 ? <span className="text-amber-600">{decimalHours(t.overtimeMinutes)}</span> : "-"}</td>
                  <td className="px-3 py-1.5 text-xs text-amber-600">{t.problems > 0 ? `${t.problems} day${t.problems === 1 ? "" : "s"} to check` : ""}</td>
                </tr>
              ))}
          </tbody>
          {!loading && totals.length > 0 && (
            <tfoot className="border-t-2 border-black/20 bg-black/5 font-bold dark:border-white/20 dark:bg-white/10">
              <tr>
                <td className="px-3 py-2">{totals.length} employees</td>
                <td />
                <td className="px-3 py-2 text-right tabular-nums">{decimalHours(grand)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{grandOt > 0 ? decimalHours(grandOt) : "-"}</td>
                <td className="px-3 py-2 text-xs font-normal text-amber-600">{check > 0 ? `${check} to check` : ""}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {check > 0 && <p className="text-xs text-amber-600">Days to check have times that don&apos;t add up (for example a clock in with no clock out). They are not counted in the totals - fix them on the employee&apos;s page first.</p>}
      <p className="text-xs text-black/50 dark:text-white/50">Overtime is anything over 40 hours in a Monday-to-Sunday week. If your dates start or end mid-week, only the days inside the range count toward that week.</p>

      <div className="flex flex-wrap gap-2">
        <button className={btn} disabled={loading || totals.length === 0} onClick={() => download(`employee-hours-${stamp}.csv`, toCsv(summaryRows(totals, from, to)))}>
          ⬇ Download totals (CSV)
        </button>
        <button className={btn} disabled={loading || totals.length === 0} onClick={() => download(`employee-hours-detail-${stamp}.csv`, toCsv(detailRows(totals)))}>
          ⬇ Download every day (CSV)
        </button>
        <button className={btn} disabled={loading || totals.length === 0} onClick={() => void copy()}>
          {copied ? "✓ Copied - paste into Excel" : "Copy totals"}
        </button>
      </div>
    </section>
  );
}
