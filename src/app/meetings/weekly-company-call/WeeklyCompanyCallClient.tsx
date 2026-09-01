"use client";

import { useMemo, useState } from "react";
import HorizontalBarChart, { type BarDatum } from "@/components/HorizontalBarChart";
import { addDays, formatDate, todayISO } from "@/lib/dates";
import { parseSalesOrderText, type SalesOrderRow } from "@/lib/salesOrderParse";
import { QC_RESULT_SCORE, QC_RESULTS, type QcInspection } from "@/lib/types";
import { extractPdfText } from "./actions";

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

function LeadQualityControlSection({ items }: { items: QcInspection[] }) {
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
      <h2 className="text-lg font-bold text-green-700 dark:text-green-400">Lead Quality Control</h2>

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

interface SalesRepStats {
  salesperson: string;
  orderCount: number;
  casesSold: number;
  delivered: number;
  fob: number;
}

function summarizeSalesOrders(rows: SalesOrderRow[]): SalesRepStats[] {
  const byRep = new Map<string, SalesRepStats>();
  for (const r of rows) {
    const entry = byRep.get(r.salesperson) ?? {
      salesperson: r.salesperson,
      orderCount: 0,
      casesSold: 0,
      delivered: 0,
      fob: 0,
    };
    entry.orderCount += 1;
    entry.casesSold += r.shipped;
    if (r.terms === "Delivered") entry.delivered += 1;
    else entry.fob += 1;
    byRep.set(r.salesperson, entry);
  }
  return Array.from(byRep.values());
}

// Not persisted anywhere - this is a per-meeting, paste-in-fresh-each-week
// tool (the user re-uploads the prior Tuesday-to-Tuesday report each time),
// so there's nothing to sync against and no history to keep.
function SalesOrdersSection() {
  const [pasteText, setPasteText] = useState("");
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<SalesOrderRow[] | null>(null);

  function handleAnalyze(text: string) {
    const result = parseSalesOrderText(text);
    if (result.error) {
      setError(result.error);
      setRows(null);
      return;
    }
    setError(null);
    setRows(result.rows);
  }

  async function handlePdfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingPdf(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await extractPdfText(formData);
      if ("error" in result) {
        setError(`Couldn't read that PDF (${result.error}) - try pasting the text instead.`);
        return;
      }
      setPasteText(result.text);
      handleAnalyze(result.text);
    } finally {
      setUploadingPdf(false);
    }
  }

  const repStats = useMemo(() => (rows ? summarizeSalesOrders(rows) : []), [rows]);

  const orderCountChart: BarDatum[] = [...repStats]
    .sort((a, b) => b.orderCount - a.orderCount)
    .map((r) => ({ label: r.salesperson, value: r.orderCount }));
  const casesSoldChart: BarDatum[] = [...repStats]
    .sort((a, b) => b.casesSold - a.casesSold)
    .map((r) => ({ label: r.salesperson, value: r.casesSold }));

  const deliveredByRep = [...repStats].filter((r) => r.delivered > 0).sort((a, b) => b.delivered - a.delivered);
  const fobByRep = [...repStats].filter((r) => r.fob > 0).sort((a, b) => b.fob - a.fob);
  const totalDelivered = repStats.reduce((sum, r) => sum + r.delivered, 0);
  const totalFob = repStats.reduce((sum, r) => sum + r.fob, 0);

  return (
    <div className="space-y-4 rounded-lg border border-black/10 p-4 shadow-sm dark:border-white/10">
      <h2 className="text-lg font-bold text-green-700 dark:text-green-400">Operations Coordinator</h2>
      <p className="text-sm text-black/60 dark:text-white/60">
        Upload (or paste) the ERP&apos;s &quot;Orders Summary&quot; report for the prior Tuesday-to-Tuesday to see
        orders, cases sold, and terms broken down by salesperson.
      </p>

      <div className="space-y-2">
        <textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          rows={4}
          placeholder="Paste the Orders Summary report text here..."
          className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 font-mono text-xs text-black"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleAnalyze(pasteText)}
            disabled={pasteText.trim() === ""}
            className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
          >
            Analyze
          </button>
          <label className="cursor-pointer rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10">
            {uploadingPdf ? "Reading PDF..." : "Or upload a PDF"}
            <input type="file" accept="application/pdf" onChange={handlePdfUpload} disabled={uploadingPdf} className="hidden" />
          </label>
        </div>
      </div>

      {rows && (
        <div className="space-y-4">
          <p className="text-sm text-black/60 dark:text-white/60">
            {rows.length} order{rows.length === 1 ? "" : "s"} across {repStats.length} salesperson
            {repStats.length === 1 ? "" : "s"}.
          </p>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="space-y-2 rounded-md bg-black/5 p-3 dark:bg-white/5">
              <p className="text-sm font-medium">Total Orders by Salesperson</p>
              <HorizontalBarChart data={orderCountChart} />
            </div>
            <div className="space-y-2 rounded-md bg-black/5 p-3 dark:bg-white/5">
              <p className="text-sm font-medium">Cases Sold by Salesperson</p>
              <HorizontalBarChart data={casesSoldChart} formatValue={(v) => v.toLocaleString()} />
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-black/60 dark:text-white/60">
              Orders by Terms - {totalDelivered} Delivered, {totalFob} FOB
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="overflow-x-auto rounded-md border border-black/10 dark:border-white/10">
                <table className="w-full text-sm">
                  <thead className="bg-black/5 text-left dark:bg-white/5">
                    <tr>
                      <th className="px-3 py-1.5">Delivered</th>
                      <th className="px-3 py-1.5 text-right">Orders</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deliveredByRep.map((r) => (
                      <tr key={r.salesperson} className="border-t border-black/10 dark:border-white/10">
                        <td className="px-3 py-1.5">{r.salesperson}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{r.delivered}</td>
                      </tr>
                    ))}
                    {deliveredByRep.length === 0 && (
                      <tr>
                        <td colSpan={2} className="px-3 py-3 text-center text-black/40 dark:text-white/40">
                          No Delivered orders.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="overflow-x-auto rounded-md border border-black/10 dark:border-white/10">
                <table className="w-full text-sm">
                  <thead className="bg-black/5 text-left dark:bg-white/5">
                    <tr>
                      <th className="px-3 py-1.5">FOB</th>
                      <th className="px-3 py-1.5 text-right">Orders</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fobByRep.map((r) => (
                      <tr key={r.salesperson} className="border-t border-black/10 dark:border-white/10">
                        <td className="px-3 py-1.5">{r.salesperson}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{r.fob}</td>
                      </tr>
                    ))}
                    {fobByRep.length === 0 && (
                      <tr>
                        <td colSpan={2} className="px-3 py-3 text-center text-black/40 dark:text-white/40">
                          No FOB orders.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export interface LaneRateRow {
  id: string;
  fromHub: string;
  destination: string;
  toTruck: number | null;
  lastWeekToTruck: number | null;
}

function money(n: number | null): string {
  return n === null ? "—" : `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

// This week's lowest broker rate vs last week's - never the sales price,
// which is always exactly +$200 and so never has a different % change of
// its own to show. Up = the truck rate got more expensive (red); down =
// cheaper (green) - a rate move reads the opposite of a stock chart.
function LaneChangeCell({ current, previous }: { current: number | null; previous: number | null }) {
  if (current === null || previous === null || previous === 0) {
    return <span className="text-black/30 dark:text-white/30">—</span>;
  }
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 0.05) {
    return <span className="text-black/40 dark:text-white/40">No change</span>;
  }
  const up = pct > 0;
  return (
    <span className={`font-semibold ${up ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
      {up ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
    </span>
  );
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
                    <th className="px-3 py-1.5 text-right">vs Last Wk</th>
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
                      <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">
                        <LaneChangeCell current={row.toTruck} previous={row.lastWeekToTruck} />
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

      <LeadQualityControlSection items={itemsInRange} />

      <SalesOrdersSection />

      <DirectorOperationsSection rows={laneRates} />
    </div>
  );
}
