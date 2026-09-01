"use client";

import { useMemo, useState } from "react";
import { addDays, formatDate, todayISO } from "@/lib/dates";
import { QC_RESULT_SCORE, QC_RESULTS, type QcInspection } from "@/lib/types";

// QC's "product" field is closer to a SKU than a plain commodity name (pack
// codes, grades, sizes tacked on: "BROCCOLI FCR/FCG", "CELERY NKD 30 & 24"),
// so grouping by the raw string would split one commodity into a dozen
// near-duplicate rows. This is deliberately its own normalizer rather than
// reusing priceSheetParse's classify()/CATEGORY_KEYWORDS - that one is tuned
// for vendor price-sheet text and shared with FOB vendor comparison, a
// different vocabulary with its own risk of collisions if changed here.
//
// A few varieties don't share a first word at all but are tracked as one
// commodity by the business - listed explicitly since there's no way to
// infer that from the text itself.
const COMMODITY_GROUPS: Record<string, string> = {
  "GREEN LEAF": "Leaf Lettuce",
  "RED LEAF": "Leaf Lettuce",
  ROMAINE: "Leaf Lettuce",
};

// Multi-word commodity names where the first word alone would be misleading
// on its own (e.g. "Green" reads as unrelated to the Leaf Lettuce group
// above) - everything else falls back to just its first word.
const MULTI_WORD_COMMODITIES = ["BELL PEPPERS", "GREEN BEANS"];

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function normalizeCommodity(raw: string | null): string {
  const upper = raw?.trim().toUpperCase() ?? "";
  if (!upper) return "(unspecified)";
  if (COMMODITY_GROUPS[upper]) return COMMODITY_GROUPS[upper];
  const multiWord = MULTI_WORD_COMMODITIES.find((c) => upper.startsWith(c));
  if (multiWord) return titleCase(multiWord);
  return titleCase(upper.split(/\s+/)[0]);
}

// Averaging the 0/25/50/75/100 scores and reading the number back out
// doesn't mean anything on its own (a "68%" isn't a QC flag) - so the
// average is always mapped back to whichever of the five result labels its
// numeric score is closest to (ties round toward the better label, since
// QC_RESULTS is ordered best-to-worst and this keeps the first match).
function nearestQcResultLabel(avgScore: number): string {
  let best = QC_RESULTS[0];
  let bestDiff = Math.abs(avgScore - best.score);
  for (const r of QC_RESULTS) {
    const diff = Math.abs(avgScore - r.score);
    if (diff < bestDiff) {
      best = r;
      bestDiff = diff;
    }
  }
  return best.label;
}

const QC_LABEL_CLASS: Record<string, string> = {
  Pass: "text-green-600 dark:text-green-400",
  "Slight caution": "text-yellow-600 dark:text-yellow-400",
  Caution: "text-orange-600 dark:text-orange-400",
  Urgent: "text-red-600 dark:text-red-400",
  Fail: "text-red-800 dark:text-red-300",
};

function isUrgentOrFail(result: string | null): boolean {
  return result === "Urgent" || result === "Fail";
}

function OperationsCoordinatorsSection({ items }: { items: QcInspection[] }) {
  const stats = useMemo(() => {
    const totalLoads = items.length;

    const scored = items
      .map((i) => (i.result ? QC_RESULT_SCORE[i.result] : undefined))
      .filter((score): score is number => score !== undefined);
    const avgQuality = scored.length > 0 ? nearestQcResultLabel(scored.reduce((sum, s) => sum + s, 0) / scored.length) : null;
    const urgentFailCount = items.filter((i) => isUrgentOrFail(i.result)).length;

    const byCommodity = new Map<string, { count: number; scores: number[]; urgentFailCount: number }>();
    for (const i of items) {
      const commodity = normalizeCommodity(i.product);
      const entry = byCommodity.get(commodity) ?? { count: 0, scores: [], urgentFailCount: 0 };
      entry.count += 1;
      const score = i.result ? QC_RESULT_SCORE[i.result] : undefined;
      if (score !== undefined) entry.scores.push(score);
      if (isUrgentOrFail(i.result)) entry.urgentFailCount += 1;
      byCommodity.set(commodity, entry);
    }
    const commodityRows = Array.from(byCommodity.entries())
      .map(([commodity, { count, scores, urgentFailCount }]) => ({
        commodity,
        count,
        urgentFailCount,
        avgQuality: scores.length > 0 ? nearestQcResultLabel(scores.reduce((sum, s) => sum + s, 0) / scores.length) : null,
      }))
      .sort((a, b) => b.count - a.count);

    return { totalLoads, avgQuality, urgentFailCount, commodityRows };
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
          <p className="text-xs text-black/60 dark:text-white/60">Average Quality (overall)</p>
          <p className={`text-2xl font-bold ${stats.avgQuality ? QC_LABEL_CLASS[stats.avgQuality] : ""}`}>
            {stats.avgQuality ?? "—"}
          </p>
        </div>
        <div className="rounded-md bg-black/5 p-3 dark:bg-white/5">
          <p className="text-xs text-black/60 dark:text-white/60">Commodities</p>
          <p className="text-2xl font-bold">{stats.commodityRows.length}</p>
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-black/60 dark:text-white/60">Quality by Commodity</p>
        {stats.commodityRows.length === 0 ? (
          <p className="text-sm text-black/40 dark:text-white/40">No QC inspections in this date range.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-black/10 dark:border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-black/5 text-left dark:bg-white/5">
                <tr>
                  <th className="px-3 py-1.5">Commodity</th>
                  <th className="px-3 py-1.5 text-right">Loads</th>
                  <th className="px-3 py-1.5 text-right">Average Quality</th>
                  <th className="px-3 py-1.5 text-right">Urgent/Fail</th>
                </tr>
              </thead>
              <tbody>
                {stats.commodityRows.map((row) => (
                  <tr key={row.commodity} className="border-t border-black/10 dark:border-white/10">
                    <td className="px-3 py-1.5">{row.commodity}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{row.count}</td>
                    <td
                      className={`px-3 py-1.5 text-right font-medium tabular-nums ${
                        row.avgQuality ? QC_LABEL_CLASS[row.avgQuality] : ""
                      }`}
                    >
                      {row.avgQuality ?? "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {row.urgentFailCount > 0 ? (
                        <span className="font-semibold text-red-600 dark:text-red-400">{row.urgentFailCount}</span>
                      ) : (
                        0
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export interface LaneRateRow {
  id: string;
  fromHub: string;
  destination: string;
  toTruck: number | null;
}

function money(n: number | null): string {
  return n === null ? "—" : `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

// Split into two side-by-side tables rather than one long list - same
// lane count, roughly half the vertical space, so this section reads at
// about the same height as Operations Coordinators above it.
function DirectorOperationsSection({ rows }: { rows: LaneRateRow[] }) {
  const mid = Math.ceil(rows.length / 2);
  const columns = [rows.slice(0, mid), rows.slice(mid)];

  return (
    <div className="space-y-4 rounded-lg border border-black/10 p-4 shadow-sm dark:border-white/10">
      <h2 className="text-lg font-bold text-green-700 dark:text-green-400">Director of Operations</h2>
      <p className="text-sm text-black/60 dark:text-white/60">
        This week&apos;s lowest broker rate per lane. Price to Truck (grey) is the number the truck actually gets
        paid - never read that one out loud. Price to Sales (highlighted) adds $200 and is what goes to Sales.
      </p>

      {rows.length === 0 ? (
        <p className="text-sm text-black/40 dark:text-white/40">No lanes configured yet - add some on Freight Rates.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {columns.map((col, colIdx) => (
            <div key={colIdx} className="overflow-x-auto rounded-md border border-black/10 dark:border-white/10">
              <table className="w-full text-sm">
                <thead className="bg-black/5 text-left dark:bg-white/5">
                  <tr>
                    <th className="px-3 py-1.5">Source</th>
                    <th className="px-3 py-1.5">Destination</th>
                    <th className="px-3 py-1.5 text-right">To Truck</th>
                    <th className="px-3 py-1.5 text-right">To Sales</th>
                  </tr>
                </thead>
                <tbody>
                  {col.map((row) => (
                    <tr key={row.id} className="border-t border-black/10 dark:border-white/10">
                      <td className="px-3 py-1.5 whitespace-nowrap">{row.fromHub}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap">→ {row.destination}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-black/40 dark:text-white/40">
                        {money(row.toTruck)}
                      </td>
                      <td className="bg-amber-100 px-3 py-1.5 text-right font-bold tabular-nums text-amber-900 dark:bg-amber-900/30 dark:text-amber-300">
                        {row.toTruck === null ? "—" : money(row.toTruck + 200)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function WeeklyCompanyCallClient({
  qcInspections,
  laneRates,
}: {
  qcInspections: QcInspection[];
  laneRates: LaneRateRow[];
}) {
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

      <DirectorOperationsSection rows={laneRates} />
    </div>
  );
}
