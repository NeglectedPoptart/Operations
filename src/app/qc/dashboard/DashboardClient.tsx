"use client";

import { useEffect, useMemo, useState } from "react";
import LineChart, { type ChartSeries } from "@/components/LineChart";
import { addDays, todayISO } from "@/lib/dates";
import {
  SERIES_COLORS,
  groupName,
  metricOptions,
  metricValue,
  summarize,
  type ChartInspection,
  type GroupBy,
} from "@/lib/qcCharts";
import type { QcPlan } from "@/lib/qcPlans";
import { getChartData } from "./actions";

const field = "rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-black";
const MAX_SERIES = 8;

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
      } else {
        setRows(result.rows);
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
  }

  const chart = useMemo(() => {
    if (!rows || !metric) return null;
    const groups = new Map<string, ChartSeries>();
    const flat: { t: number; y: number }[] = [];
    for (const r of rows) {
      const v = metricValue(r, metric.id);
      if (!v) continue;
      const t = new Date(r.inspection_time).getTime();
      flat.push({ t, y: v.value });
      const name = groupName(r, groupBy);
      if (!groups.has(name)) groups.set(name, { name, color: "", points: [], dots: [] });
      const s = groups.get(name)!;
      s.points.push({
        t,
        y: v.value,
        href: `/qc/inspections/${r.id}/report`,
        label: [
          new Date(r.inspection_time).toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "numeric", day: "numeric", year: "numeric" }),
          r.lot_number,
          r.grower,
          r.result,
        ]
          .filter(Boolean)
          .join(" · "),
      });
      if (showEach && groupBy === "none") for (const y of v.each) s.dots!.push({ t, y });
    }
    // Most inspections first when there are too many groups to read.
    const series = [...groups.values()].sort((a, b) => b.points.length - a.points.length).slice(0, MAX_SERIES);
    series.forEach((s, i) => (s.color = SERIES_COLORS[i % SERIES_COLORS.length]));
    return { series, stats: summarize(flat), groupCount: groups.size };
  }, [rows, metric, groupBy, showEach]);

  const results = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows ?? []) {
      const k = r.result?.trim() || "(no result)";
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

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
      </div>

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
