"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { addDays, formatDate, todayISO } from "@/lib/dates";
import { AM_HOLDOVER_STATUSES, type AmHoldover, type AmHoldoverStatus } from "@/lib/types";
import { addHoldoverRow, deleteHoldoverRow, updateHoldoverRow } from "./actions";

export default function AmHoldoversClient({
  initialDate,
  initialEntries,
}: {
  initialDate: string;
  initialEntries: AmHoldover[];
}) {
  const [date, setDate] = useState(initialDate);
  const [cache, setCache] = useState<Record<string, AmHoldover[]>>(() => ({
    [initialDate]: initialEntries,
  }));
  const [adding, setAdding] = useState(false);

  const entries = useMemo(
    () => [...(cache[date] ?? [])].sort((a, b) => a.position - b.position),
    [cache, date],
  );
  const loading = !(date in cache);

  function loadDate(target: string) {
    setDate(target);
    if (target in cache) return;

    const supabase = createClient();
    supabase
      .from("am_holdovers")
      .select("*")
      .eq("entry_date", target)
      .order("position", { ascending: true })
      .then(({ data, error }) => {
        if (error) return;
        setCache((prev) => ({ ...prev, [target]: (data ?? []) as AmHoldover[] }));
      });
  }

  async function handleAddRow() {
    setAdding(true);
    try {
      const nextPosition = entries.length > 0 ? Math.max(...entries.map((e) => e.position)) + 1 : 1;
      const row = await addHoldoverRow(date, nextPosition);
      setCache((prev) => ({ ...prev, [date]: [...(prev[date] ?? []), row as AmHoldover] }));
    } finally {
      setAdding(false);
    }
  }

  function updateLocal(id: string, patch: Partial<AmHoldover>) {
    setCache((prev) => ({
      ...prev,
      [date]: (prev[date] ?? []).map((e) => (e.id === id ? { ...e, ...patch } : e)),
    }));
  }

  async function handleFieldSave(id: string, patch: { po_lot_number?: string; notes?: string }) {
    await updateHoldoverRow(id, patch).catch(() => {});
  }

  async function handleStatusChange(id: string, status: AmHoldoverStatus) {
    updateLocal(id, { status });
    await updateHoldoverRow(id, { status }).catch(() => {});
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this row?")) return;
    setCache((prev) => ({ ...prev, [date]: (prev[date] ?? []).filter((e) => e.id !== id) }));
    await deleteHoldoverRow(id).catch(() => {});
  }

  const isToday = date === todayISO();
  const field =
    "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <h1 className="text-2xl font-bold">AM Holdovers</h1>
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
          <button
            onClick={() => loadDate(todayISO())}
            className="text-sm font-medium text-green-600 hover:underline"
          >
            Back to today
          </button>
        )}
        {loading && <span className="text-xs text-black/40">loading…</span>}
      </div>

      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10 print:border-black">
        <table className="w-full text-sm">
          <thead className="bg-black/5 text-left dark:bg-white/5 print:bg-transparent">
            <tr>
              <th className="w-10 px-2 py-2">#</th>
              <th className="px-2 py-2">PO/Lot #</th>
              <th className="px-2 py-2">Status</th>
              <th className="px-2 py-2">Notes / Follow-up</th>
              <th className="w-16 px-2 py-2 print:hidden" />
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, i) => (
              <tr key={entry.id} className="border-t border-black/10 dark:border-white/10">
                <td className="px-2 py-1.5 text-black/50 dark:text-white/50">{i + 1}</td>
                <td className="px-1 py-1">
                  <input
                    defaultValue={entry.po_lot_number ?? ""}
                    onBlur={(e) => handleFieldSave(entry.id, { po_lot_number: e.target.value })}
                    className={field}
                  />
                </td>
                <td className="px-1 py-1">
                  <select
                    value={entry.status}
                    onChange={(e) => handleStatusChange(entry.id, e.target.value as AmHoldoverStatus)}
                    className={field}
                  >
                    {AM_HOLDOVER_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-1 py-1">
                  <input
                    defaultValue={entry.notes ?? ""}
                    onBlur={(e) => handleFieldSave(entry.id, { notes: e.target.value })}
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
            {entries.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-black/40 dark:text-white/40">
                  No holdovers logged for this day yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <button
        onClick={handleAddRow}
        disabled={adding}
        className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60 print:hidden"
      >
        {adding ? "Adding..." : "+ Add Row"}
      </button>
    </div>
  );
}
