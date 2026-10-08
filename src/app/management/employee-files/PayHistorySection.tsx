"use client";

import { useEffect, useMemo, useState } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import { formatDate, todayISO } from "@/lib/dates";
import type { EmployeePayEntry, EmployeePayType } from "@/lib/types";
import { addEmployeePay, deleteEmployeePay, getEmployeePay, updateEmployeePay } from "./payActions";

const field = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black";

function money(amount: number): string {
  return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// A salary is entered by the week; what's stored is the yearly total
// (weekly x 52), so the yearly figure is always exact and earlier yearly
// entries keep working.
const WEEKS_PER_YEAR = 52;
const round2 = (n: number) => Math.round(n * 100) / 100;
const weeklyOf = (yearly: number) => round2(yearly / WEEKS_PER_YEAR);
const yearlyOf = (weekly: number) => round2(weekly * WEEKS_PER_YEAR);

function rate(entry: Pick<EmployeePayEntry, "amount" | "pay_type">): string {
  return entry.pay_type === "hourly"
    ? `${money(entry.amount)}/hr`
    : `${money(weeklyOf(entry.amount))}/wk (${money(entry.amount)}/yr)`;
}

// Newest first by effective date (ties: most recently entered first).
function sortEntries(entries: EmployeePayEntry[]): EmployeePayEntry[] {
  return [...entries].sort(
    (a, b) => b.effective_date.localeCompare(a.effective_date) || b.created_at.localeCompare(a.created_at),
  );
}

// What changed from the pay before this one: a raise (or cut) in dollars and
// percent when the pay type is the same, or a note when it switched between
// hourly and salary.
function changeFrom(entry: EmployeePayEntry, previous: EmployeePayEntry | undefined) {
  if (!previous) return null;
  if (previous.pay_type !== entry.pay_type) {
    return { text: `Changed from ${previous.pay_type} to ${entry.pay_type}`, tone: "neutral" as const };
  }
  const salary = entry.pay_type === "salary";
  // Salaries compare by the week, since that's how they're entered.
  const diff = salary ? weeklyOf(entry.amount) - weeklyOf(previous.amount) : round2(entry.amount - previous.amount);
  if (round2(diff) === 0) return { text: "No change", tone: "neutral" as const };
  const pct = previous.amount > 0 ? ((entry.amount - previous.amount) / previous.amount) * 100 : null;
  const sign = diff > 0 ? "+" : "-";
  return {
    text: `${sign}${money(Math.abs(round2(diff)))}${salary ? "/wk" : "/hr"}${pct !== null ? ` (${sign}${Math.abs(pct).toFixed(1)}%)` : ""}`,
    tone: diff > 0 ? ("up" as const) : ("down" as const),
  };
}

export default function PayHistorySection({ employeeId }: { employeeId: string }) {
  const confirm = useConfirm();
  const [entries, setEntries] = useState<EmployeePayEntry[] | null>(null);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [date, setDate] = useState(todayISO());
  const [payType, setPayType] = useState<EmployeePayType>("hourly");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    getEmployeePay(employeeId).then((result) => {
      if (!live) return;
      if ("error" in result) setDenied(true);
      else {
        setEntries(result.entries);
        // New entries default to the same pay type as the latest one.
        if (result.entries[0]) setPayType(result.entries[0].pay_type);
      }
    });
    return () => {
      live = false;
    };
  }, [employeeId]);

  const sorted = useMemo(() => sortEntries(entries ?? []), [entries]);
  // "Current" = the latest pay that has already started (a future-dated raise
  // isn't current yet).
  const today = todayISO();
  const current = sorted.find((e) => e.effective_date <= today) ?? null;
  const upcoming = sorted.filter((e) => e.effective_date > today).slice(-1)[0] ?? null;

  if (denied) return null; // only Admin / Executive / Supreme can see pay
  if (entries === null) return <p className="text-xs text-black/40 dark:text-white/40">Loading pay history...</p>;

  async function add() {
    const value = Number(amount);
    setSaving(true);
    setError(null);
    try {
      const created = await addEmployeePay({
        employeeId,
        effectiveDate: date,
        payType,
        amount: payType === "salary" ? yearlyOf(value) : value,
        note,
      });
      setEntries((prev) => [...(prev ?? []), created]);
      setAmount("");
      setNote("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that - try again.");
    } finally {
      setSaving(false);
    }
  }

  function patchEntry(id: string, patch: Partial<EmployeePayEntry>) {
    setEntries((prev) => (prev ?? []).map((e) => (e.id === id ? { ...e, ...patch } : e)));
    updateEmployeePay(id, patch).catch(() => setError("That change didn't save - try again."));
  }

  async function remove(entry: EmployeePayEntry) {
    if (!(await confirm(`Delete the ${rate(entry)} entry from ${formatDate(entry.effective_date)}?`))) return;
    setEntries((prev) => (prev ?? []).filter((e) => e.id !== entry.id));
    await deleteEmployeePay(entry.id).catch(() => setError("Couldn't delete that - try again."));
  }

  return (
    <div className="space-y-2 rounded-lg border border-black/10 p-3 dark:border-white/10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">Pay History</p>
        <p className="text-xs text-black/50 dark:text-white/50">Only Admin and Executive can see this.</p>
      </div>

      <p className="text-sm">
        {current ? (
          <>
            Current: <span className="font-bold text-green-700 dark:text-green-400">{rate(current)}</span>{" "}
            <span className="text-black/60 dark:text-white/60">since {formatDate(current.effective_date)}</span>
          </>
        ) : (
          <span className="text-black/50 dark:text-white/50">No pay recorded yet.</span>
        )}
        {upcoming && (
          <span className="ml-2 text-xs text-amber-600">
            Next: {rate(upcoming)} on {formatDate(upcoming.effective_date)}
          </span>
        )}
      </p>

      {sorted.length > 0 && (
        <div className="overflow-x-auto rounded border border-black/10 dark:border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-black/5 text-left text-xs dark:bg-white/5">
              <tr>
                <th className="px-2 py-1.5">Effective</th>
                <th className="px-2 py-1.5">Type</th>
                <th className="px-2 py-1.5">Amount</th>
                <th className="px-2 py-1.5">Change</th>
                <th className="px-2 py-1.5">Note</th>
                <th className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((entry, i) => {
                const change = changeFrom(entry, sorted[i + 1]);
                return (
                  <tr key={entry.id} className="border-t border-black/10 align-top dark:border-white/10">
                    <td className="min-w-[8rem] px-1 py-1">
                      <input
                        type="date"
                        defaultValue={entry.effective_date}
                        onBlur={(e) => e.target.value && e.target.value !== entry.effective_date && patchEntry(entry.id, { effective_date: e.target.value })}
                        className={field}
                      />
                    </td>
                    <td className="min-w-[6.5rem] px-1 py-1">
                      <select
                        value={entry.pay_type}
                        onChange={(e) => patchEntry(entry.id, { pay_type: e.target.value as EmployeePayType })}
                        className={field}
                      >
                        <option value="hourly">Hourly</option>
                        <option value="salary">Salary</option>
                      </select>
                    </td>
                    <td className="min-w-[7rem] px-1 py-1">
                      <input
                        key={`${entry.pay_type}:${entry.amount}`}
                        type="number"
                        step="0.01"
                        defaultValue={entry.pay_type === "salary" ? weeklyOf(entry.amount) : entry.amount}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (!Number.isFinite(v) || v <= 0) return;
                          const stored = entry.pay_type === "salary" ? yearlyOf(v) : v;
                          if (stored !== entry.amount) patchEntry(entry.id, { amount: stored });
                        }}
                        className={`${field} font-semibold`}
                      />
                      <span className="text-[11px] text-black/50 dark:text-white/50">
                        {entry.pay_type === "hourly" ? "per hour" : `per week = ${money(entry.amount)}/yr`}
                      </span>
                    </td>
                    <td
                      className={`whitespace-nowrap px-2 py-1.5 text-xs font-semibold ${
                        change?.tone === "up"
                          ? "text-green-600 dark:text-green-400"
                          : change?.tone === "down"
                            ? "text-red-600 dark:text-red-400"
                            : "text-black/50 dark:text-white/50"
                      }`}
                    >
                      {change ? change.text : "Starting pay"}
                    </td>
                    <td className="min-w-[10rem] px-1 py-1">
                      <input
                        defaultValue={entry.note ?? ""}
                        onBlur={(e) => e.target.value !== (entry.note ?? "") && patchEntry(entry.id, { note: e.target.value.trim() || null })}
                        className={field}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <button onClick={() => remove(entry)} className="text-xs font-medium text-red-600 hover:underline">
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[9rem_7rem_8rem_1fr_auto]">
        <label className="text-xs">
          Effective date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${field} mt-0.5`} />
        </label>
        <label className="text-xs">
          Type
          <select value={payType} onChange={(e) => setPayType(e.target.value as EmployeePayType)} className={`${field} mt-0.5`}>
            <option value="hourly">Hourly</option>
            <option value="salary">Salary</option>
          </select>
        </label>
        <label className="text-xs">
          {payType === "hourly" ? "$ per hour" : "$ per week"}
          <input
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={payType === "hourly" ? "18.50" : "1000"}
            className={`${field} mt-0.5`}
          />
          {payType === "salary" && Number(amount) > 0 && (
            <span className="mt-0.5 block font-semibold text-green-700 dark:text-green-400">= {money(yearlyOf(Number(amount)))} per year</span>
          )}
        </label>
        <label className="col-span-2 text-xs sm:col-span-1">
          Note (starting pay, raise, promotion...)
          <input value={note} onChange={(e) => setNote(e.target.value)} className={`${field} mt-0.5`} />
        </label>
        <div className="col-span-2 flex items-end sm:col-span-1">
          <button
            onClick={add}
            disabled={saving || !amount || !date}
            className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Add"}
          </button>
        </div>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
