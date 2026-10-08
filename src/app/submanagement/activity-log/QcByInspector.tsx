"use client";

import { useMemo, useState } from "react";
import CollapsibleSection from "@/components/CollapsibleSection";
import { todayISO } from "@/lib/dates";

export interface QcCountRow {
  entry_date: string | null;
  qc: string | null;
}

type Period = "week" | "month" | "year";

const WEEKS_SHOWN = 12;
const MONTHS_SHOWN = 12;
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "J.D." / " jd " / "JD" all count as the same inspector.
function normalizeInitials(raw: string | null): string {
  return (raw ?? "").toUpperCase().replace(/[^A-Z0-9/&]/g, "");
}

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Weeks run Monday-Sunday; a date maps to the Monday that starts its week.
function weekStart(iso: string): string {
  const d = parseISO(iso);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return toISO(d);
}

function periodKey(iso: string, period: Period): string {
  if (period === "week") return weekStart(iso);
  if (period === "month") return iso.slice(0, 7);
  return iso.slice(0, 4);
}

function periodLabel(key: string, period: Period): string {
  if (period === "year") return key;
  if (period === "month") {
    const [y, m] = key.split("-");
    return `${MONTH_NAMES[Number(m) - 1]} ${y}`;
  }
  const d = parseISO(key);
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

// The periods to show, oldest first, ending with the current one.
function periodKeys(period: Period, today: string, years: string[]): string[] {
  if (period === "year") return years;
  const keys: string[] = [];
  if (period === "week") {
    const current = parseISO(weekStart(today));
    for (let i = WEEKS_SHOWN - 1; i >= 0; i--) {
      const d = new Date(current);
      d.setUTCDate(d.getUTCDate() - i * 7);
      keys.push(toISO(d));
    }
  } else {
    const [y, m] = today.split("-").map(Number);
    for (let i = MONTHS_SHOWN - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(y, m - 1 - i, 1));
      keys.push(toISO(d).slice(0, 7));
    }
  }
  return keys;
}

const tabClass = (active: boolean) =>
  `rounded-md px-3 py-1 text-sm font-medium ${
    active ? "bg-green-600 text-white" : "border border-black/20 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
  }`;

// Totals only: how many inspections each QC initials has on the QC
// Inspections sheet, by week, month or year of the inspection's date.
export default function QcByInspector({ rows }: { rows: QcCountRow[] }) {
  const [period, setPeriod] = useState<Period>("week");
  const today = todayISO();

  const model = useMemo(() => {
    const dated = rows.filter((r): r is { entry_date: string; qc: string | null } => !!r.entry_date);
    const years = [...new Set(dated.map((r) => r.entry_date.slice(0, 4)))].sort();
    const keys = periodKeys(period, today, years.length > 0 ? years : [today.slice(0, 4)]);
    const shown = new Set(keys);

    // initials -> period key -> count, plus an all-time total per initials
    const counts = new Map<string, Map<string, number>>();
    const allTime = new Map<string, number>();
    let noInitials = 0;
    for (const r of dated) {
      const who = normalizeInitials(r.qc);
      if (!who) {
        if (shown.has(periodKey(r.entry_date, period))) noInitials++;
        continue;
      }
      allTime.set(who, (allTime.get(who) ?? 0) + 1);
      const key = periodKey(r.entry_date, period);
      if (!counts.has(who)) counts.set(who, new Map());
      counts.get(who)!.set(key, (counts.get(who)!.get(key) ?? 0) + 1);
    }

    // Everyone with any inspections in the periods shown, busiest first.
    const people = [...counts.keys()]
      .map((who) => ({
        who,
        perKey: keys.map((k) => counts.get(who)?.get(k) ?? 0),
      }))
      .map((p) => ({ ...p, total: p.perKey.reduce((a, b) => a + b, 0) }))
      .filter((p) => p.total > 0)
      .sort((a, b) => b.total - a.total || a.who.localeCompare(b.who));

    const columnTotals = keys.map((_, i) => people.reduce((sum, p) => sum + p.perKey[i], 0));
    return { keys, people, columnTotals, noInitials, grand: people.reduce((s, p) => s + p.total, 0) };
  }, [rows, period, today]);

  const currentKey = periodKey(today, period);
  const heading =
    period === "week" ? `Last ${WEEKS_SHOWN} weeks (weeks start Monday)` : period === "month" ? `Last ${MONTHS_SHOWN} months` : "Each year";

  return (
    <CollapsibleSection id="activity-qc" title="QC Inspections by Inspector">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm text-black/60 dark:text-white/60">
            Inspections logged on the QC Inspections sheet for each person&apos;s initials, counted by the inspection&apos;s
            date. {heading}.
          </p>
        </div>
        <div className="flex gap-2">
          <button className={tabClass(period === "week")} onClick={() => setPeriod("week")}>
            Weekly
          </button>
          <button className={tabClass(period === "month")} onClick={() => setPeriod("month")}>
            Monthly
          </button>
          <button className={tabClass(period === "year")} onClick={() => setPeriod("year")}>
            Yearly
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-black/5 text-left dark:bg-white/5">
            <tr>
              <th className="sticky left-0 bg-gray-100 px-2 py-2 dark:bg-neutral-800">Initials</th>
              {model.keys.map((k) => (
                <th
                  key={k}
                  className={`whitespace-nowrap px-2 py-2 text-right ${k === currentKey ? "text-green-700 dark:text-green-400" : ""}`}
                  title={k === currentKey ? "Current period (so far)" : undefined}
                >
                  {periodLabel(k, period)}
                  {k === currentKey ? " *" : ""}
                </th>
              ))}
              <th className="whitespace-nowrap px-2 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {model.people.map((p) => (
              <tr key={p.who} className="border-t border-black/10 dark:border-white/10">
                <td className="sticky left-0 bg-white px-2 py-1.5 font-semibold dark:bg-neutral-900">{p.who}</td>
                {p.perKey.map((n, i) => (
                  <td key={model.keys[i]} className={`px-2 py-1.5 text-right tabular-nums ${n === 0 ? "text-black/25 dark:text-white/25" : ""}`}>
                    {n === 0 ? "-" : n}
                  </td>
                ))}
                <td className="px-2 py-1.5 text-right font-bold tabular-nums">{p.total}</td>
              </tr>
            ))}
            {model.people.length === 0 && (
              <tr>
                <td colSpan={model.keys.length + 2} className="px-3 py-4 text-center text-black/40 dark:text-white/40">
                  No inspections with initials in this range.
                </td>
              </tr>
            )}
          </tbody>
          {model.people.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-black/20 bg-black/5 font-bold dark:border-white/20 dark:bg-white/5">
                <td className="sticky left-0 bg-gray-100 px-2 py-1.5 dark:bg-neutral-800">All QCs</td>
                {model.columnTotals.map((n, i) => (
                  <td key={model.keys[i]} className="px-2 py-1.5 text-right tabular-nums">
                    {n}
                  </td>
                ))}
                <td className="px-2 py-1.5 text-right tabular-nums">{model.grand}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="text-xs text-black/50 dark:text-white/50">
        * the current {period} so far.
        {model.noInitials > 0 &&
          ` ${model.noInitials} inspection${model.noInitials === 1 ? "" : "s"} in this range ${model.noInitials === 1 ? "has" : "have"} no initials and ${model.noInitials === 1 ? "isn't" : "aren't"} counted above.`}
      </p>
    </CollapsibleSection>
  );
}
