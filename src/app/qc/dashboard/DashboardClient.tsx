"use client";

import { useEffect, useMemo, useState } from "react";
import LineChart from "@/components/LineChart";
import { addDays, todayISO } from "@/lib/dates";
import { MAX_SERIES, buildSeries, metricOptions, resultCounts, type ChartInspection, type GroupBy } from "@/lib/qcCharts";
import type { QcPlan } from "@/lib/qcPlans";
import { getChartData } from "./actions";

const field = "rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-black";

function fmt(n: number | null, unit: string): string {
  if (n === null) return "-";
  return `${Number(n.toFixed(2))}${unit ? ` ${unit}` : ""}`;
}

export default function DashboardClient({ plans }: { plans: QcPlan[] }) {
  const [planId, setPlanId] = useState(plans.find((p) => p.active)?.id ?? plans[0]?.id ?? "");
  const plan = plans.find((p) => p.id === planId) ?? null;
  const metrics = useMemo(() => (plan ? metricOptions(plan.config) : []), [plan]);
  const [metricId, setMetricId] = useState(metrics[0]?.id ?? "defect_total");
  const [from, setFrom] = useState(() => addDays(todayISO(), -90));
  const [to, setTo] = useState(() => todayISO());
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [showEach, setShowEach] = useState(true);
  const [rows, setRows] = useState<ChartInspection[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The plan and dates of the search that is on screen - the export uses these,
  // not whatever has been typed into the boxes since.
  const [applied, setApplied] = useState<{ planId: string; from: string; to: string } | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [withTable, setWithTable] = useState(false);

  const metric = metrics.find((m) => m.id === metricId) ?? metrics[0] ?? null;

  async function load(forPlan = planId, f = from, t = to) {
    if (!forPlan) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getChartData(forPlan, f, t);
      if ("error" in result) {
        setError(result.error);
        setRows([]);
        setApplied(null);
      } else {
        setRows(result.rows);
        setApplied({ planId: forPlan, from: f, to: t });
      }
    } catch {
      setError("Couldn't load the chart data - try again.");
    } finally {
      setLoading(false);
    }
  }

  // Load when the page opens and whenever the plan changes (the dates and
  // chart options take effect with Apply / immediately for options).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(planId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId]);

  function pickPlan(id: string) {
    const next = plans.find((p) => p.id === id);
    setPlanId(id);
    const first = next ? metricOptions(next.config)[0] : null;
    setMetricId(first?.id ?? "defect_total");
    setRows(null);
    setApplied(null);
  }

  const appliedPlan = applied ? plans.find((p) => p.id === applied.planId) ?? null : null;
  const appliedMetrics = useMemo(() => (appliedPlan ? metricOptions(appliedPlan.config) : []), [appliedPlan]);

  function openExport() {
    // The chart on screen starts ticked.
    setPicked(metric && appliedMetrics.some((m) => m.id === metric.id) ? [metric.id] : appliedMetrics.slice(0, 1).map((m) => m.id));
    setExportOpen(true);
  }

  function togglePicked(id: string) {
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function runExport() {
    if (!applied || picked.length === 0) return;
    const order = appliedMetrics.filter((m) => picked.includes(m.id)).map((m) => m.id);
    const q = new URLSearchParams({
      plan: applied.planId,
      from: applied.from,
      to: applied.to,
      group: groupBy,
      dots: showEach ? "1" : "0",
      data: withTable ? "1" : "0",
      metrics: order.join(","),
    });
    // A normal navigation to an attachment downloads the file and stays on this page.
    window.location.href = `/qc/dashboard/export?${q.toString()}`;
    setExportOpen(false);
  }

  const chart = useMemo(() => (rows && metric ? buildSeries(rows, metric.id, groupBy, showEach) : null), [rows, metric, groupBy, showEach]);

  const results = useMemo(() => resultCounts(rows ?? []), [rows]);

  if (plans.length === 0) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Quality Dashboard</h1>
        <p className="text-sm text-black/60 dark:text-white/60">There are no inspection plans yet, so there is nothing to chart.</p>
      </div>
    );
  }

  const specMetrics = metrics.filter((m) => m.group === "Specs");
  const defectMetrics = metrics.filter((m) => m.group === "Defects");
  const unit = metric?.unit ?? "";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Quality Dashboard</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Trends from the inspections done in HOPS. Pick a plan, what to chart, and a date range. Click a point to open
          that inspection&apos;s report.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-black/10 p-3 dark:border-white/10">
        <label className="text-xs font-medium text-black/60 dark:text-white/60">
          Plan
          <select value={planId} onChange={(e) => pickPlan(e.target.value)} className={`${field} mt-0.5 block min-w-[14rem]`}>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {!p.active ? " (inactive)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-black/60 dark:text-white/60">
          Chart
          <select value={metric?.id ?? ""} onChange={(e) => setMetricId(e.target.value)} className={`${field} mt-0.5 block min-w-[14rem]`}>
            {specMetrics.length > 0 && (
              <optgroup label="Specs (average of the samples)">
                {specMetrics.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="Defects (% of sample size)">
              {defectMetrics.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <label className="text-xs font-medium text-black/60 dark:text-white/60">
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${field} mt-0.5 block`} />
        </label>
        <label className="text-xs font-medium text-black/60 dark:text-white/60">
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${field} mt-0.5 block`} />
        </label>
        <label className="text-xs font-medium text-black/60 dark:text-white/60">
          Compare by
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)} className={`${field} mt-0.5 block`}>
            <option value="none">Nothing - one line</option>
            <option value="grower">Grower</option>
            <option value="inspector">Inspector</option>
          </select>
        </label>
        <button
          onClick={() => load()}
          disabled={loading}
          className="rounded-md bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
        >
          {loading ? "Loading..." : "Apply"}
        </button>
        <button
          onClick={openExport}
          disabled={loading || !applied || !rows || rows.length === 0}
          title="Export the charts for the plan and dates you last applied as a PDF"
          className="rounded-md border border-green-600 px-4 py-1.5 text-sm font-medium text-green-700 hover:bg-green-50 disabled:opacity-50 dark:text-green-400 dark:hover:bg-green-900/20"
        >
          Export PDF
        </button>
      </div>

      {exportOpen && applied && appliedPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setExportOpen(false)}>
          <div
            className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-lg bg-white text-black shadow-xl dark:bg-neutral-900 dark:text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-black/10 p-4 dark:border-white/10">
              <h2 className="text-lg font-bold">Export PDF</h2>
              <p className="text-sm text-black/60 dark:text-white/60">
                {appliedPlan.name} · {applied.from} to {applied.to} · {rows?.length ?? 0} inspections
              </p>
              <p className="text-xs text-black/50 dark:text-white/50">Pick the charts to include.</p>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              <div className="flex flex-wrap gap-2 text-xs">
                <button onClick={() => setPicked(appliedMetrics.map((m) => m.id))} className="rounded border border-black/20 px-2 py-1 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10">
                  Select all
                </button>
                <button onClick={() => setPicked(appliedMetrics.filter((m) => m.group === "Specs").map((m) => m.id))} className="rounded border border-black/20 px-2 py-1 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10">
                  All specs
                </button>
                <button
                  onClick={() => setPicked(appliedMetrics.filter((m) => ["defect_total", "defect_serious", "defect_non_serious"].includes(m.id)).map((m) => m.id))}
                  className="rounded border border-black/20 px-2 py-1 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
                >
                  Defect totals
                </button>
                <button onClick={() => setPicked([])} className="rounded border border-black/20 px-2 py-1 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10">
                  Clear
                </button>
              </div>
              {(["Specs", "Defects"] as const).map((g) => {
                const list = appliedMetrics.filter((m) => m.group === g);
                if (list.length === 0) return null;
                return (
                  <div key={g}>
                    <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-green-700 dark:text-green-400">
                      {g === "Specs" ? "Specs (average of the samples)" : "Defects (% of sample size)"}
                    </h3>
                    <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                      {list.map((m) => (
                        <label key={m.id} className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={picked.includes(m.id)} onChange={() => togglePicked(m.id)} />
                          {m.label}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
              <label className="flex items-center gap-2 border-t border-black/10 pt-3 text-sm dark:border-white/10">
                <input type="checkbox" checked={withTable} onChange={(e) => setWithTable(e.target.checked)} />
                Also include a data table (one row per inspection)
              </label>
              <p className="text-xs text-black/50 dark:text-white/50">
                Uses the Compare by setting on screen ({groupBy === "none" ? "one line" : groupBy}).
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-black/10 p-4 dark:border-white/10">
              <button onClick={() => setExportOpen(false)} className="rounded-md border border-black/20 px-4 py-1.5 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10">
                Cancel
              </button>
              <button
                onClick={runExport}
                disabled={picked.length === 0}
                className="rounded-md bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                Export {picked.length} chart{picked.length === 1 ? "" : "s"}
              </button>
            </div>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {metric && (
        <section className="space-y-3 rounded-lg border border-black/10 p-4 dark:border-white/10">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold">
              {plan?.name} <span className="font-normal text-black/60 dark:text-white/60">({metric.label})</span>
            </h2>
            {groupBy === "none" && specMetrics.some((m) => m.id === metric.id) && (
              <label className="flex items-center gap-1.5 text-xs">
                <input type="checkbox" checked={showEach} onChange={(e) => setShowEach(e.target.checked)} />
                Show each sample as a dot
              </label>
            )}
          </div>

          {rows === null ? (
            <p className="py-10 text-center text-sm text-black/40 dark:text-white/40">Loading...</p>
          ) : (
            chart && <LineChart series={chart.series} unit={unit} fromZero={metric.fromZero} />
          )}

          {chart && chart.groupCount > MAX_SERIES && (
            <p className="text-xs text-amber-600">Showing the {MAX_SERIES} with the most inspections out of {chart.groupCount}.</p>
          )}

          {chart && (
            <div className="grid grid-cols-2 gap-3 border-t border-black/10 pt-3 text-sm dark:border-white/10 sm:grid-cols-5">
              <div>
                <span className="block text-xs text-black/50 dark:text-white/50">Inspections charted</span>
                <span className="text-lg font-bold">{chart.stats.count}</span>
              </div>
              <div>
                <span className="block text-xs text-black/50 dark:text-white/50">Average</span>
                <span className="text-lg font-bold">{fmt(chart.stats.average, unit)}</span>
              </div>
              <div>
                <span className="block text-xs text-black/50 dark:text-white/50">Lowest</span>
                <span className="text-lg font-bold">{fmt(chart.stats.min, unit)}</span>
              </div>
              <div>
                <span className="block text-xs text-black/50 dark:text-white/50">Highest</span>
                <span className="text-lg font-bold">{fmt(chart.stats.max, unit)}</span>
              </div>
              <div>
                <span className="block text-xs text-black/50 dark:text-white/50">Most recent</span>
                <span className="text-lg font-bold">{fmt(chart.stats.latest, unit)}</span>
              </div>
            </div>
          )}
        </section>
      )}

      {rows && rows.length > 0 && (
        <section className="space-y-2 rounded-lg border border-black/10 p-4 dark:border-white/10">
          <h2 className="text-sm font-bold text-green-700 dark:text-green-400">Results in this range ({rows.length} inspections)</h2>
          <div className="flex flex-wrap gap-2">
            {results.map(([name, n]) => (
              <span key={name} className="rounded-md bg-black/5 px-2.5 py-1 text-sm dark:bg-white/10">
                {name}: <span className="font-bold">{n}</span>
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
