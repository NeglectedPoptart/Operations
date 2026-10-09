import { APP_TIMEZONE } from "./dates";
import { norm, type ParsedLotpath } from "./lotpathParse";
import {
  DEFAULT_RESULT_OPTIONS,
  keyFromLabel,
  type DefectCount,
  type PlanConfig,
  type PlanDefect,
  type PlanHeaderField,
  type PlanSampleField,
} from "./qcPlans";

// Turning a parsed LotPath report into HOPS data: a plan to file it under
// (built from the report itself when it doesn't exist yet), and an inspection
// record in that plan's shape.

type Clock = NonNullable<ParsedLotpath["inspection"]>;

// LotPath prints times on the clock of whoever ran the report - Central here.
// Returns the UTC instant for that Central wall-clock time.
export function centralToIso(t: Clock | null): string | null {
  if (!t) return null;
  for (const offsetHours of [5, 6]) {
    const candidate = new Date(Date.UTC(t.y, t.m - 1, t.d, t.h + offsetHours, t.min));
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: APP_TIMEZONE,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      hourCycle: "h23",
    }).formatToParts(candidate);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    if (get("year") === t.y && get("month") === t.m && get("day") === t.d && get("hour") === t.h && get("minute") === t.min) {
      return candidate.toISOString();
    }
  }
  return new Date(Date.UTC(t.y, t.m - 1, t.d, t.h + 6, t.min)).toISOString();
}

const cleanLabel = (label: string) => label.replace(/\.$/, "").trim();

// The plan a report would create if none exists.
export function configFromParsed(p: ParsedLotpath): PlanConfig {
  const headerKeys = new Set<string>();
  const headerFields: PlanHeaderField[] = p.headerFields.map((f) => {
    const label = cleanLabel(f.label);
    const key = keyFromLabel(label, headerKeys);
    headerKeys.add(key);
    return { key, label, type: "text", required: norm(label) === "lotnumber" };
  });

  const defectKeys = new Set<string>();
  const defects: PlanDefect[] = p.defects.map((d) => {
    const key = keyFromLabel(d.name, defectKeys);
    defectKeys.add(key);
    return { key, name: d.name, severity: d.severity };
  });

  const sampleFields: PlanSampleField[] = [];
  const sampleKeys = new Set<string>();
  for (const sample of p.samples) {
    for (const f of sample.fields) {
      const existing = sampleFields.find((s) => norm(s.label) === norm(f.label));
      if (existing) {
        if (existing.type === "number" && f.number === null) existing.type = "text";
        if (!existing.unit && f.unit) existing.unit = f.unit;
        continue;
      }
      const key = keyFromLabel(f.label, sampleKeys);
      sampleKeys.add(key);
      sampleFields.push({ key, label: f.label, type: f.number !== null ? "number" : "text", ...(f.unit ? { unit: f.unit } : {}) });
    }
  }

  return {
    headerFields,
    defaultSampleSize: p.sampleSize,
    defects,
    sampleCount: p.samples.length,
    sampleFields,
    resultOptions: DEFAULT_RESULT_OPTIONS,
  };
}

// An existing plan, grown to hold anything this report has that it doesn't
// (a defect or measurement added since the plan was made) so no data is dropped.
export function extendConfig(config: PlanConfig, p: ParsedLotpath): { config: PlanConfig; added: string[] } {
  const next: PlanConfig = JSON.parse(JSON.stringify(config)) as PlanConfig;
  const added: string[] = [];

  const headerKeys = new Set(next.headerFields.map((f) => f.key));
  for (const f of p.headerFields) {
    const label = cleanLabel(f.label);
    if (next.headerFields.some((h) => norm(h.label) === norm(label))) continue;
    const key = keyFromLabel(label, headerKeys);
    headerKeys.add(key);
    next.headerFields.push({ key, label, type: "text" });
    added.push(`header field "${label}"`);
  }

  const defectKeys = new Set(next.defects.map((d) => d.key));
  for (const d of p.defects) {
    if (next.defects.some((x) => norm(x.name) === norm(d.name))) continue;
    const key = keyFromLabel(d.name, defectKeys);
    defectKeys.add(key);
    next.defects.push({ key, name: d.name, severity: d.severity });
    added.push(`defect "${d.name}"`);
  }

  const sampleKeys = new Set(next.sampleFields.map((f) => f.key));
  for (const sample of p.samples) {
    for (const f of sample.fields) {
      if (next.sampleFields.some((s) => norm(s.label) === norm(f.label))) continue;
      const key = keyFromLabel(f.label, sampleKeys);
      sampleKeys.add(key);
      next.sampleFields.push({ key, label: f.label, type: f.number !== null ? "number" : "text", ...(f.unit ? { unit: f.unit } : {}) });
      added.push(`measurement "${f.label}"`);
    }
  }
  if (p.samples.length > next.sampleCount) {
    next.sampleCount = p.samples.length;
    added.push(`${p.samples.length} samples`);
  }
  return { config: next, added };
}

export interface MappedInspection {
  header: Record<string, string>;
  defects: DefectCount[];
  samples: Record<string, string | number | null>[];
  grower: string | null;
  facility: string | null;
  product_label: string | null;
  lot_number: string | null;
}

// The report's data in the shape of the plan (keyed by the plan's own keys).
export function mapToPlan(config: PlanConfig, p: ParsedLotpath): MappedInspection {
  const header: Record<string, string> = {};
  for (const f of config.headerFields) header[f.key] = "";
  for (const f of p.headerFields) {
    const target = config.headerFields.find((h) => norm(h.label) === norm(f.label));
    if (target) header[target.key] = f.value.trim();
  }

  const defects: DefectCount[] = config.defects.map((d) => ({
    key: d.key,
    name: d.name,
    severity: d.severity,
    count: p.defects.find((x) => norm(x.name) === norm(d.name))?.count ?? 0,
  }));

  const samples = p.samples.map((sample) => {
    const out: Record<string, string | number | null> = {};
    for (const field of config.sampleFields) {
      const found = sample.fields.find((f) => norm(f.label) === norm(field.label));
      if (!found) out[field.key] = null;
      else if (field.type === "number") out[field.key] = found.number ?? (Number.isFinite(Number(found.text)) ? Number(found.text) : null);
      else out[field.key] = found.text;
    }
    return out;
  });

  const byLabel = (...labels: string[]): string | null => {
    for (const f of config.headerFields) {
      if (labels.some((l) => norm(l) === norm(f.label)) && header[f.key]) return header[f.key];
    }
    return null;
  };
  return {
    header,
    defects,
    samples,
    grower: byLabel("Grower"),
    facility: byLabel("Facility"),
    product_label: byLabel("Product Label", "Product Pack Style"),
    lot_number: byLabel("Lot number"),
  };
}
