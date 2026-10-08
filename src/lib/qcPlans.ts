// Lot Inspections: what an inspection PLAN is, what a recorded inspection looks
// like, and the maths shared by the form, the history log and the report.

export type PlanFieldType = "text" | "date" | "select";

export interface PlanHeaderField {
  key: string;
  label: string;
  type: PlanFieldType;
  options?: string[];
  required?: boolean;
}

export type DefectSeverity = "serious" | "non_serious";

export interface PlanDefect {
  key: string;
  name: string;
  severity: DefectSeverity;
}

export type SampleFieldType = "number" | "text" | "select";

export interface PlanSampleField {
  key: string;
  label: string;
  type: SampleFieldType;
  unit?: string;
  options?: string[];
}

export interface PlanConfig {
  headerFields: PlanHeaderField[];
  defaultSampleSize: number | null;
  defects: PlanDefect[];
  sampleCount: number;
  sampleFields: PlanSampleField[];
  resultOptions: string[];
}

export interface QcPlan {
  id: string;
  name: string;
  commodity: string;
  control_point: string;
  active: boolean;
  position: number;
  config: PlanConfig;
  created_at: string;
  updated_at: string;
}

export const DEFAULT_RESULT_OPTIONS = ["Pass", "Slight caution", "Caution", "Urgent", "Fail"];

export function emptyPlanConfig(): PlanConfig {
  return {
    headerFields: [{ key: "lot_number", label: "Lot number", type: "text", required: true }],
    defaultSampleSize: null,
    defects: [],
    sampleCount: 3,
    sampleFields: [
      { key: "box_weight", label: "Box Weight", type: "number", unit: "Pounds" },
      { key: "temperature", label: "Temperature", type: "number", unit: "°F" },
    ],
    resultOptions: DEFAULT_RESULT_OPTIONS,
  };
}

// A stable key from a label: "Hollow stem/ Tallo hueco" -> "hollow_stem_tallo_hueco".
export function keyFromLabel(label: string, taken: Set<string>): string {
  const base =
    label
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "field";
  let key = base;
  for (let n = 2; taken.has(key); n++) key = `${base}_${n}`;
  return key;
}

export interface DefectCount {
  key: string;
  name: string;
  severity: DefectSeverity;
  count: number;
}

export interface QcLotInspection {
  id: string;
  plan_id: string | null;
  plan_snapshot: { name: string; commodity: string; control_point: string; config: PlanConfig };
  plan_name: string;
  commodity: string;
  control_point: string | null;
  inspector_id: string | null;
  inspector_name: string | null;
  inspector_initials: string | null;
  inspection_time: string;
  sample_time: string | null;
  grower: string | null;
  facility: string | null;
  product_label: string | null;
  lot_number: string | null;
  header: Record<string, string>;
  sample_size: number | null;
  defects: DefectCount[];
  samples: Record<string, string | number | null>[];
  notes_1: string | null;
  notes_2: string | null;
  result: string | null;
  created_at: string;
}

export interface QcLotPhoto {
  id: string;
  inspection_id: string;
  storage_path: string;
  position: number;
}

// "3.95%" / "8.7%" / "0%" - two decimals at most, trailing zeros dropped, like
// the LotPath reports.
export function percentText(count: number, sampleSize: number | null): string {
  if (!sampleSize || sampleSize <= 0) return "";
  return `${Number(((count / sampleSize) * 100).toFixed(2))}%`;
}

export interface DefectTotals {
  serious: number;
  nonSerious: number;
  total: number;
}

export function defectTotals(defects: { severity: DefectSeverity; count: number }[]): DefectTotals {
  let serious = 0;
  let nonSerious = 0;
  for (const d of defects) {
    if (d.severity === "serious") serious += d.count;
    else nonSerious += d.count;
  }
  return { serious, nonSerious, total: serious + nonSerious };
}

// Initials from a person's name or email: "Edgar Cantu" -> "EC", "ecantu@x.com" -> "EC".
export function initialsFor(name: string | null, email: string | null): string {
  const fromName = (name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
  if (fromName.length >= 2) return fromName.slice(0, 3);
  const handle = (email ?? "").split("@")[0].toUpperCase().replace(/[^A-Z]/g, "");
  return handle.slice(0, 2) || fromName || "";
}

// What the history sheet shows in its Product column.
export function productText(commodity: string, label: string | null): string {
  return [commodity, label].filter(Boolean).join(" - ");
}

export function sampleValueText(field: PlanSampleField, value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  return field.unit ? `${value} ${field.unit}` : String(value);
}
