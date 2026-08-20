"use client";

import { useMemo, useState } from "react";
import { addDays, formatDate, todayISO } from "@/lib/dates";
import { QC_RESULT_SCORE, type QcInspection } from "@/lib/types";

function OperationsCoordinatorsSection({ items }: { items: QcInspection[] }) {
  const stats = useMemo(() => {
    const totalLoads = items.length;

    const scored = items
      .map((i) => (i.result ? QC_RESULT_SCORE[i.result] : undefined))
      .filter((score): score is number => score !== undefined);
    const avgQuality = scored.length > 0 ? scored.reduce((sum, s) => sum + s, 0) / scored.length : null;

    const byCommodity = new Map<string, number>();
    for (const i of items) {
      const commodity = i.product?.trim() || "(unspecified)";
      byCommodity.set(commodity, (byCommodity.get(commodity) ?? 0) + 1);
    }
    const commodityCounts = Array.from(byCommodity.entries()).sort((a, b) => b[1] - a[1]);

    return { totalLoads, avgQuality, commodityCounts };
  }, [items]);

  return (
    <div className="space-y-4 rounded-lg border border-black/10 p-4 shadow-sm dark:border-white/10">
      <h2 className="text-lg font-bold text-green-700 dark:text-green-400">Operations Coordinators</h2>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-md bg-black/5 p-3 dark:bg-white/5">
          <p className="text-xs text-black/60 dark:text-white/60">Total Loads</p>
          <p className="text-2xl font-bold">{stats.totalLoads}</p>
        </div>
        <div className="rounded-md bg-black/5 p-3 dark:bg-white/5">
          <p className="text-xs text-black/60 dark:text-white/60">Average Quality</p>
          <p className="text-2xl font-bold">{stats.avgQuality === null ? "—" : `${Math.round(stats.avgQuality)}%`}</p>
        </div>
        <div className="rounded-md bg-black/5 p-3 dark:bg-white/5">
          <p className="text-xs text-black/60 dark:text-white/60">Commodities</p>
          <p className="text-2xl font-bold">{stats.commodityCounts.length}</p>
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-black/60 dark:text-white/60">Loads per Commodity</p>
        {stats.commodityCounts.length === 0 ? (
          <p className="text-sm text-black/40 dark:text-white/40">No QC inspections in this date range.</p>
        ) : (
          <div className="divide-y divide-black/10 rounded-md border border-black/10 dark:divide-white/10 dark:border-white/10">
            {stats.commodityCounts.map(([commodity, count]) => (
              <div key={commodity} className="flex items-center justify-between px-3 py-1.5 text-sm">
                <span>{commodity}</span>
                <span className="font-medium tabular-nums">{count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function WeeklyCompanyCallClient({ qcInspections }: { qcInspections: QcInspection[] }) {
  const [startDate, setStartDate] = useState(() => addDays(todayISO(), -6));
  const [endDate, setEndDate] = useState(() => todayISO());

  const itemsInRange = useMemo(
    () => qcInspections.filter((i) => i.entry_date !== null && i.entry_date >= startDate && i.entry_date <= endDate),
    [qcInspections, startDate, endDate],
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Weekly Company Call</h1>
      <p className="text-sm text-black/60 dark:text-white/60">
        Prep for the Tuesday 8am company-wide call - pick the date range to review, and each section below pulls
        its own numbers from it.
      </p>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-black/10 p-3 dark:border-white/10">
        <label className="text-sm">
          <span className="block text-xs font-medium text-black/60 dark:text-white/60">Start</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="mt-0.5 rounded border border-gray-300 bg-white px-2 py-1 text-black"
          />
        </label>
        <label className="text-sm">
          <span className="block text-xs font-medium text-black/60 dark:text-white/60">End</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="mt-0.5 rounded border border-gray-300 bg-white px-2 py-1 text-black"
          />
        </label>
        <p className="text-sm text-black/50 dark:text-white/50">
          {formatDate(startDate)} - {formatDate(endDate)}
        </p>
      </div>

      <OperationsCoordinatorsSection items={itemsInRange} />
    </div>
  );
}
