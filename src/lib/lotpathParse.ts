// Reads a LotPath inspection report PDF (the same layout every time: labels in
// the left column, values in the next, defect counts with a % beside them,
// "Sample N" blocks, then photos) into plain data. Works on text positions
// rather than a flat text dump, because a long defect name or a multi-line note
// wraps onto several lines and only the position tells which line it belongs to.

export interface LotpathCell {
  x: number;
  str: string;
}

// One visual line of the PDF: everything sharing a baseline, in x order.
export interface LotpathRow {
  page: number;
  y: number;
  cells: LotpathCell[];
}

export interface ParsedSample {
  fields: { label: string; text: string; number: number | null; unit: string | null }[];
}

export interface ParsedLotpath {
  planName: string;
  commodity: string;
  controlPoint: string;
  inspectedBy: string;
  inspection: { y: number; m: number; d: number; h: number; min: number } | null;
  sampleTime: { y: number; m: number; d: number; h: number; min: number } | null;
  // Plan-specific header fields (Grower, Lot number, Pack Date...), in order.
  headerFields: { label: string; value: string }[];
  notes1: string;
  notes2: string;
  result: string;
  sampleSize: number | null;
  defects: { name: string; severity: "serious" | "non_serious"; count: number }[];
  samples: ParsedSample[];
  warnings: string[];
}

// Column ranges (the template's columns sit at x = 36 / 171 / 306 / 441 on a
// 612pt page; ranges leave room for small differences).
const COL1_LABEL_MAX = 100;
const COL1_VALUE_MAX = 280;
const COL2_LABEL_MAX = 420;

const BUILTIN_HEADER_LABELS = new Set([
  "commodity name",
  "control point name",
  "inspected by",
  "inspection time",
  "sample time",
  "notes #1",
  "notes #2",
  "final inspection result",
]);

const KNOWN_UNITS = /^(pounds?|lbs?|°\s?[FC]|%|oz|ounces?|kg|g|inch(es)?|in|cm|mm|brix|psi)$/i;

interface Cols {
  label1: string;
  value1: string;
  label2: string;
  value2: string;
}

function columns(row: LotpathRow): Cols {
  const parts: Record<keyof Cols, string[]> = { label1: [], value1: [], label2: [], value2: [] };
  for (const c of [...row.cells].sort((a, b) => a.x - b.x)) {
    const text = c.str.trim();
    if (!text) continue;
    if (c.x < COL1_LABEL_MAX) parts.label1.push(text);
    else if (c.x < COL1_VALUE_MAX) parts.value1.push(text);
    else if (c.x < COL2_LABEL_MAX) parts.label2.push(text);
    else parts.value2.push(text);
  }
  return {
    label1: parts.label1.join(" "),
    value1: parts.value1.join(" "),
    label2: parts.label2.join(" "),
    value2: parts.value2.join(" "),
  };
}

function parseDateTime(text: string): ParsedLotpath["inspection"] {
  const m = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return null;
  let h = Number(m[4]) % 12;
  if (m[6].toUpperCase() === "PM") h += 12;
  return { y: Number(m[3]), m: Number(m[1]), d: Number(m[2]), h, min: Number(m[5]) };
}

// "24.3 Pounds" -> 24.3 / Pounds, "3" -> 3, "ICEBERG CELLO" -> text only.
function parseSampleValue(text: string): { number: number | null; unit: string | null } {
  const m = text.match(/^(-?\d+(?:\.\d+)?)\s*(\S.*)?$/);
  if (!m) return { number: null, unit: null };
  const unit = m[2]?.trim() ?? null;
  if (unit && !KNOWN_UNITS.test(unit)) return { number: null, unit: null };
  return { number: Number(m[1]), unit };
}

// Notes #2 starts with a stray tab character (shown as ??) - drop leading junk.
function cleanNote(text: string): string {
  return text.replace(/^[^A-Za-z0-9(]+/, "").replace(/\s+/g, " ").trim();
}

export function parseLotpathRows(allRows: LotpathRow[]): ParsedLotpath | { error: string } {
  // Page header/footer rows (top and bottom strips of every page) don't belong to the report.
  const rows = allRows.filter((r) => r.y < 735 && r.y > 55);
  if (rows.length === 0) return { error: "No readable text in this PDF." };

  const result: ParsedLotpath = {
    planName: "",
    commodity: "",
    controlPoint: "",
    inspectedBy: "",
    inspection: null,
    sampleTime: null,
    headerFields: [],
    notes1: "",
    notes2: "",
    result: "",
    sampleSize: null,
    defects: [],
    samples: [],
    warnings: [],
  };

  let i = 0;

  // ---- title (the plan name), until the first row that has a value
  const title: string[] = [];
  for (; i < rows.length; i++) {
    const c = columns(rows[i]);
    if (c.value1 || c.label2 || c.label1.toLowerCase() === "commodity name") break;
    if (c.label1) title.push(c.label1);
  }
  result.planName = title.join(" ").trim();
  if (!result.planName) return { error: "This doesn't look like a LotPath inspection report (no title found)." };

  // ---- header block, until Defects / the first Sample / Photos
  const fields: { label: string; value: string }[] = [];
  for (; i < rows.length; i++) {
    const c = columns(rows[i]);
    const head = c.label1.toLowerCase();
    if (!c.value1 && !c.label2 && (head === "defects" || head === "photos" || /^sample \d+$/.test(head))) break;

    if (c.label1 && c.value1) {
      fields.push({ label: c.label1, value: c.value1 });
    } else if (!c.label1 && c.value1) {
      // A wrapped value (long notes) continues the last field.
      if (fields.length > 0) fields[fields.length - 1].value += ` ${c.value1}`;
    }
    if (c.label2 && c.value2) fields.push({ label: c.label2, value: c.value2 });
  }

  for (const f of fields) {
    const key = f.label.trim().toLowerCase();
    const value = f.value.replace(/\s+/g, " ").trim();
    if (key === "commodity name") result.commodity = value;
    else if (key === "control point name") result.controlPoint = value;
    else if (key === "inspected by") result.inspectedBy = value;
    else if (key === "inspection time") result.inspection = parseDateTime(value);
    else if (key === "sample time") result.sampleTime = parseDateTime(value);
    else if (key === "notes #1") result.notes1 = cleanNote(value);
    else if (key === "notes #2") result.notes2 = cleanNote(value);
    else if (key === "final inspection result") result.result = value;
    else if (!BUILTIN_HEADER_LABELS.has(key)) result.headerFields.push({ label: f.label.trim(), value });
  }
  if (!result.inspection) result.warnings.push("Couldn't read the inspection time.");

  // ---- defects
  let totalsSeen: number | null = null;
  if (i < rows.length && columns(rows[i]).label1.toLowerCase() === "defects") {
    i++;
    let severity: "serious" | "non_serious" = "serious";
    for (; i < rows.length; i++) {
      const c = columns(rows[i]);
      const head = c.label1.toLowerCase();
      if (/^sample \d+$/.test(head) || head === "photos") break;
      if (head === "sample size") {
        result.sampleSize = Number(c.value1) > 0 ? Number(c.value1) : null;
      } else if (head === "serious defects" && !c.value1) {
        severity = "serious";
      } else if (head === "non-serious defects" && !c.value1) {
        severity = "non_serious";
      } else if (head === "total defects") {
        totalsSeen = Number(c.value1);
      } else if (head.startsWith("total ")) {
        // per-severity totals are recomputed from the counts instead
      } else if (c.label1 && c.value1 && /^\d+$/.test(c.value1)) {
        result.defects.push({ name: c.label1, severity, count: Number(c.value1) });
      } else if (c.label1 && !c.value1 && result.defects.length > 0) {
        // The rest of a wrapped defect name (the count sits beside its first line).
        const last = result.defects[result.defects.length - 1];
        last.name = `${last.name} ${c.label1}`;
      }
    }
    const sum = result.defects.reduce((s, d) => s + d.count, 0);
    if (totalsSeen !== null && Number.isFinite(totalsSeen) && sum !== totalsSeen) {
      result.warnings.push(`Defect counts add up to ${sum} but the report says ${totalsSeen}.`);
    }
  }

  // ---- samples
  let current: ParsedSample | null = null;
  for (; i < rows.length; i++) {
    const c = columns(rows[i]);
    const head = c.label1.toLowerCase();
    if (head === "photos") break;
    if (/^sample \d+$/.test(head) && !c.value1) {
      current = { fields: [] };
      result.samples.push(current);
    } else if (current && c.label1 && c.value1) {
      const parsed = parseSampleValue(c.value1);
      current.fields.push({ label: c.label1, text: c.value1, number: parsed.number, unit: parsed.unit });
    } else if (current && !c.label1 && c.value1 && current.fields.length > 0) {
      const last = current.fields[current.fields.length - 1];
      last.text += ` ${c.value1}`;
      last.number = null;
      last.unit = null;
    }
  }

  return result;
}

// "BROCCOLI CROWNS" vs "Broccoli Crowns", "Lot number." vs "Lot number": compare on letters/digits only.
export function norm(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

// LotPath writes results in capitals; the app's own spellings are Pass / Slight caution / ...
export function normalizeResult(text: string): string {
  const t = text.trim();
  if (!t) return "";
  const known = ["Pass", "Slight caution", "Caution", "Urgent", "Fail"].find((k) => norm(k) === norm(t));
  return known ?? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}
