"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, currentWeekStart, formatWeekLabel, nextWeekStart, prevWeekStart, todayISO, weekNumberOf } from "@/lib/dates";
import { decimalHours, formatTime, hoursMinutes, parseTimeInput, workedDay, type DayTimes, type TimeField } from "@/lib/timeEntry";
import { getEmployeeHours, saveEmployeeHours, type HoursRow } from "./actions";

export interface EmployeeOption {
  id: string;
  name: string;
  status: string;
}

const COLUMNS: { field: TimeField; label: string }[] = [
  { field: "clock_in", label: "In" },
  { field: "lunch_out", label: "Lunch out" },
  { field: "lunch_in", label: "Lunch in" },
  { field: "clock_out", label: "Out" },
];

const timeInput = "w-24 rounded border border-gray-300 bg-white px-2 py-1.5 text-center text-sm text-black";

// A time you type ("730", "12", "3:30p") and see as 7:30 AM when you leave the box.
function TimeCell({ value, field, onCommit }: { value: string | null; field: TimeField; onCommit: (next: string | null) => void }) {
  const [text, setText] = useState(formatTime(value));
  const [bad, setBad] = useState(false);

  function commit() {
    if (!text.trim()) {
      setBad(false);
      if (value !== null) onCommit(null);
      return;
    }
    const parsed = parseTimeInput(text, field);
    if (!parsed) {
      setBad(true);
      return;
    }
    setBad(false);
    setText(formatTime(parsed));
    if (parsed !== value) onCommit(parsed);
  }

  return (
    <input
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onFocus={(e) => e.target.select()}
      onKeyDown={(e) => {
        // Enter moves to the next box, like Tab.
        if (e.key === "Enter") {
          e.preventDefault();
          const inputs = Array.from(document.querySelectorAll<HTMLInputElement>("[data-hours-cell]"));
          const next = inputs[inputs.indexOf(e.currentTarget) + 1];
          e.currentTarget.blur();
          next?.focus();
        }
      }}
      data-hours-cell=""
      inputMode="text"
      placeholder="--:--"
      aria-label={field}
      className={`${timeInput} ${bad ? "border-red-500 bg-red-50" : ""}`}
    />
  );
}

function DayRow({
  date,
  row,
  isToday,
  onSave,
}: {
  date: string;
  row: HoursRow;
  isToday: boolean;
  onSave: (next: HoursRow) => void;
}) {
  const result = workedDay(row);
  const label = new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "numeric", day: "numeric" });
  const weekend = [0, 6].includes(new Date(`${date}T12:00:00Z`).getUTCDay());

  return (
    <tr className={`border-t border-black/10 dark:border-white/10 ${isToday ? "bg-green-50 dark:bg-green-950/20" : weekend ? "bg-black/[0.03] dark:bg-white/[0.03]" : ""}`}>
      <td className="whitespace-nowrap px-3 py-2 font-medium">
        {label}
        {isToday && <span className="ml-2 text-xs font-normal text-green-700 dark:text-green-400">today</span>}
      </td>
      {COLUMNS.map((c) => (
        <td key={c.field} className="px-1.5 py-1.5 text-center">
          <TimeCell value={row[c.field]} field={c.field} onCommit={(next) => onSave({ ...row, [c.field]: next })} />
        </td>
      ))}
      <td className="whitespace-nowrap px-3 py-2 text-right">
        {result.minutes !== null ? (
          <>
            <span className="font-semibold">{decimalHours(result.minutes)}</span>
            <span className="ml-1 text-xs text-black/50 dark:text-white/50">({hoursMinutes(result.minutes)})</span>
          </>
        ) : (
          <span className="text-black/30 dark:text-white/30">-</span>
        )}
        {result.problem && <span className="block text-[11px] text-amber-600">{result.problem}</span>}
      </td>
      <td className="px-1.5 py-1.5">
        <input
          defaultValue={row.notes ?? ""}
          onBlur={(e) => e.target.value !== (row.notes ?? "") && onSave({ ...row, notes: e.target.value })}
          placeholder="Note"
          className="w-full min-w-[8rem] rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-black"
        />
      </td>
    </tr>
  );
}

export default function EmployeeHoursClient({ employees, initialWeekStart }: { employees: EmployeeOption[]; initialWeekStart: string }) {
  const [employeeId, setEmployeeId] = useState("");
  const [weekStart, setWeekStart] = useState(initialWeekStart);
  const [rows, setRows] = useState<Record<string, HoursRow>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadToken = useRef(0);
  const today = todayISO();

  const active = employees.filter((e) => e.status === "active");
  const former = employees.filter((e) => e.status !== "active");
  const employee = employees.find((e) => e.id === employeeId) ?? null;
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  // Loads the chosen employee's week whenever either changes.
  useEffect(() => {
    if (!employeeId) return;
    const token = ++loadToken.current;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    getEmployeeHours(employeeId, weekStart)
      .then((list) => {
        if (token !== loadToken.current) return;
        setRows(Object.fromEntries(list.map((r) => [r.work_date, r])));
      })
      .catch((e) => token === loadToken.current && setError(e instanceof Error ? e.message : "Couldn't load the hours."))
      .finally(() => token === loadToken.current && setLoading(false));
  }, [employeeId, weekStart]);

  function blank(date: string): HoursRow {
    return { work_date: date, clock_in: null, lunch_out: null, lunch_in: null, clock_out: null, notes: null };
  }

  function save(date: string, next: HoursRow) {
    setRows((prev) => ({ ...prev, [date]: next }));
    saveEmployeeHours(employeeId, next).then((r) => {
      if ("error" in r) setError(`Couldn't save ${date}: ${r.error}`);
      else setError(null);
    });
  }

  const totals = useMemo(() => {
    let minutes = 0;
    let daysWorked = 0;
    for (const d of days) {
      const row = rows[d];
      if (!row) continue;
      const t: DayTimes = row;
      const r = workedDay(t);
      if (r.minutes !== null) {
        minutes += r.minutes;
        daysWorked++;
      }
    }
    return { minutes, daysWorked };
  }, [days, rows]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Employee Hours</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Pick an employee, then type each day&apos;s In, Lunch out, Lunch in and Out. Type it quickly - 730, 12, 12:30, 3:30 - and it fills in
          AM or PM for a normal shift (add a or p to be exact). Everything saves as you move on.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm font-medium">
          Employee
          <select
            value={employeeId}
            onChange={(e) => {
              setRows({});
              setEmployeeId(e.target.value);
            }}
            className="mt-1 block min-w-[16rem] rounded border border-gray-300 bg-white px-2 py-2 text-base text-black"
          >
            <option value="">Choose an employee...</option>
            <optgroup label="Active">
              {active.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </optgroup>
            {former.length > 0 && (
              <optgroup label="No longer here">
                {former.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>

        {employee && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setWeekStart(prevWeekStart(weekStart))}
              className="rounded-md border border-black/20 px-3 py-2 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
            >
              ← Prev week
            </button>
            <span className="text-sm font-medium">
              Week {weekNumberOf(weekStart)} · {formatWeekLabel(weekStart)}
              {weekStart === currentWeekStart() && <span className="ml-1 text-green-700 dark:text-green-400">(this week)</span>}
            </span>
            <button
              onClick={() => setWeekStart(nextWeekStart(weekStart))}
              className="rounded-md border border-black/20 px-3 py-2 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
            >
              Next week →
            </button>
            {weekStart !== currentWeekStart() && (
              <button onClick={() => setWeekStart(currentWeekStart())} className="text-sm font-medium text-green-700 hover:underline dark:text-green-400">
                This week
              </button>
            )}
          </div>
        )}
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>}

      {!employee ? (
        <p className="rounded-lg border border-dashed border-black/20 p-8 text-center text-sm text-black/60 dark:border-white/20 dark:text-white/60">
          Choose an employee above to enter their hours.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
          <div className="flex items-center justify-between bg-green-700 px-3 py-2 text-white">
            <span className="font-bold">{employee.name}</span>
            {loading && <span className="text-xs opacity-80">Loading...</span>}
          </div>
          <table className="w-full text-sm">
            <thead className="bg-black/5 text-left dark:bg-white/10">
              <tr>
                <th className="px-3 py-2">Day</th>
                {COLUMNS.map((c) => (
                  <th key={c.field} className="px-3 py-2 text-center">
                    {c.label}
                  </th>
                ))}
                <th className="px-3 py-2 text-right">Hours</th>
                <th className="px-3 py-2">Note</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <DayRow key={`${employeeId}-${d}-${loading ? "l" : "r"}`} date={d} row={rows[d] ?? blank(d)} isToday={d === today} onSave={(next) => save(d, next)} />
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-black/20 bg-black/5 font-bold dark:border-white/20 dark:bg-white/10">
                <td className="px-3 py-2">Week total</td>
                <td colSpan={4} className="px-3 py-2 text-xs font-normal text-black/60 dark:text-white/60">
                  {totals.daysWorked} day{totals.daysWorked === 1 ? "" : "s"} worked
                  {totals.minutes > 40 * 60 && <span className="ml-2 text-amber-600">{decimalHours(totals.minutes - 40 * 60)} over 40 hours</span>}
                </td>
                <td className="px-3 py-2 text-right">
                  {decimalHours(totals.minutes)}
                  <span className="ml-1 text-xs font-normal text-black/50 dark:text-white/50">({hoursMinutes(totals.minutes)})</span>
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
