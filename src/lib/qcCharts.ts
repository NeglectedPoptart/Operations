import type { DefectCount, PlanConfig } from "./qcPlans";

// What the Quality Dashboard can chart for an inspection plan, and how each
// metric is worked out from a recorded inspection.

export interface ChartInspection {
  id: string;
  inspection_time: string;
  grower: string | null;
  lot_number: string | null;
  inspector_name: string | null;
  product_label: string | null;
  sample_size: number | null;
  defects: DefectCount[];
  samples: Record<string, string | number | null>[];
  result: string | null;
}

export interface MetricOption {
  id: string;
  label: string;
  group: "Specs" | "Defects";
  unit: string;
  // true = the axis starts at 0 (percentages); false = zoom to the data (weights, temperatures).
  fromZero: boolean;
}

export function metricOptions(config: PlanConfig): MetricOption[] {
  const specs: MetricOption[] = config.sampleFields
    .filter((f) => f.type === "number")
    .map((f) => ({ id: `spec:${f.key}`, label: f.label, group: "Specs", unit: f.unit ?? "", fromZero: false }));
  const defects: MetricOption[] = [
    { id: "defect_total", label: "Total defects", group: "Defects", unit: "%", fromZero: true },
    { id: "defect_serious", label: "Serious defects", group: "Defects", unit: "%", fromZero: true },
    { id: "defect_non_serious", label: "Non-serious defects", group: "Defects", unit: "%", fromZero: true },
    ...config.defects.map(
      (d): MetricOption => ({ id: `defect:${d.key}`, label: d.name, group: "Defects", unit: "%", fromZero: true }),
    ),
  ];
  return [...specs, ...defects];
}

function numbers(values: (string | number | null | undefined)[]): number[] {
  return values
    .map((v) => (v === null || v === undefined || v === "" ? NaN : Number(v)))
    .filter((n) => Number.isFinite(n));
}

export interface MetricValue {
  // One number per inspection: the average of its samples for a spec, or the % of the sample size for a defect.
  value: number;
  // Each individual sample's value (specs only), for the dots behind the line.
  each: number[];
}

export function metricValue(inspection: ChartInspection, metricId: string): MetricValue | null {
  if (metricId.startsWith("spec:")) {
    const key = metricId.slice(5);
    const each = numbers(inspection.samples.map((s) => s[key]));
    if (each.length === 0) return null;
    return { value: each.reduce((a, b) => a + b, 0) / each.length, each };
  }
  const size = inspection.sample_size;
  if (!size || size <= 0) return null;
  let count: number;
  if (metricId === "defect_total") count = inspection.defects.reduce((s, d) => s + d.count, 0);
  else if (metricId === "defect_serious") count = inspection.defects.filter((d) => d.severity === "serious").reduce((s, d) => s + d.count, 0);
  else if (metricId === "defect_non_serious") count = inspection.defects.filter((d) => d.severity === "non_serious").reduce((s, d) => s + d.count, 0);
  else count = inspection.defects.find((d) => d.key === metricId.slice(7))?.count ?? 0;
  return { value: (count / size) * 100, each: [] };
}

export type GroupBy = "none" | "grower" | "inspector";

export function groupName(inspection: ChartInspection, groupBy: GroupBy): string {
  if (groupBy === "grower") return (inspection.grower ?? "").trim() || "(no grower)";
  if (groupBy === "inspector") return (inspection.inspector_name ?? "").trim() || "(unknown)";
  return "All inspections";
}

// A tidy axis: ~5 round tick values covering [min, max].
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1;
    min -= pad;
    max += pad;
  }
  const rough = (max - min) / count;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const frac = rough / pow;
  const step = (frac < 1.5 ? 1 : frac < 3 ? 2 : frac < 7 ? 5 : 10) * pow;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.999; v += step) ticks.push(Number(v.toFixed(10)));
  return ticks;
}

export const SERIES_COLORS = ["#16a34a", "#2563eb", "#dc2626", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#4b5563"];

export interface SummaryStats {
  count: number;
  average: number | null;
  min: number | null;
  max: number | null;
  latest: number | null;
}

export function summarize(values: { t: number; y: number }[]): SummaryStats {
  if (values.length === 0) return { count: 0, average: null, min: null, max: null, latest: null };
  const ys = values.map((v) => v.y);
  const latest = [...values].sort((a, b) => b.t - a.t)[0].y;
  return {
    count: values.length,
    average: ys.reduce((a, b) => a + b, 0) / ys.length,
    min: Math.min(...ys),
    max: Math.max(...ys),
    latest,
  };
}
