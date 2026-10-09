import { cleanNote, parseDateTime, parseSampleValue, type ParsedLotpath, type ParsedSample } from "./lotpathParse";

// LotPath's CSV export of a plan's inspections: ONE ROW PER SAMPLE, with the
// inspection's own details repeated on every row and an InspectionId that ties
// a set of rows together. Defect columns hold the % of the sample size (not a
// count), "Serious Defects (%)" marks where the serious defects end and the
// non-serious begin, and it doesn't say who inspected or what the plan is
// called - the file name and the importer supply those.

// RFC 4180: quoted fields, "" for a quote, commas and newlines allowed inside quotes.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c !== "")) rows.push(row);
  return rows;
}

const HEADER_COLUMNS = ["Facility", "Grower", "Product Label", "Receive Date", "Variety", "Lot number."];
const SIZE_COLUMN = "Defect Sample Size";
const SERIOUS_TOTAL = "Serious Defects (%)";
const NON_SERIOUS_TOTAL = "Non-Serious Defects (%)";
const GRAND_TOTAL = "Total Defects (%)";
const END_COLUMNS = new Set(["SampleIndex", "InspectionId"]);

const pct = (text: string): number => {
  const n = Number(text.replace("%", "").trim());
  return Number.isFinite(n) ? n : 0;
};

export function parseLotpathCsv(
  text: string,
  planName: string,
  inspector: string,
): { inspections: ParsedLotpath[]; warnings: string[] } | { error: string } {
  const table = parseCsv(text);
  if (table.length < 2) return { error: "That CSV has no rows." };
  const header = table[0].map((h) => h.trim());
  const col = (name: string) => header.indexOf(name);

  const timeCol = col("Inspection Date+Time");
  const sizeCol = col(SIZE_COLUMN);
  const grandCol = col(GRAND_TOTAL);
  const idCol = col("InspectionId");
  if (timeCol < 0 || sizeCol < 0 || grandCol < 0) {
    return { error: "This doesn't look like a LotPath inspection export (expected Inspection Date+Time, Defect Sample Size and Total Defects columns)." };
  }

  // Defect columns sit between the sample size and the totals; samples after the grand total.
  const seriousTotalCol = col(SERIOUS_TOTAL);
  const defectCols: { index: number; name: string; severity: "serious" | "non_serious" }[] = [];
  for (let c = sizeCol + 1; c < grandCol; c++) {
    const name = header[c];
    if (name === SERIOUS_TOTAL || name === NON_SERIOUS_TOTAL || !name.endsWith("(%)")) continue;
    defectCols.push({
      index: c,
      name: name.replace(/\s*\(%\)$/, ""),
      severity: seriousTotalCol < 0 || c < seriousTotalCol ? "serious" : "non_serious",
    });
  }
  const sampleCols: { index: number; label: string }[] = [];
  for (let c = grandCol + 1; c < header.length; c++) {
    if (END_COLUMNS.has(header[c]) || !header[c]) continue;
    sampleCols.push({ index: c, label: header[c] });
  }
  const sampleIndexCol = col("SampleIndex");
  const headerCols = HEADER_COLUMNS.map((name) => ({ name, index: col(name) })).filter((h) => h.index >= 0);

  // Group the rows into inspections.
  const groups = new Map<string, string[][]>();
  for (const r of table.slice(1)) {
    const key = idCol >= 0 && r[idCol] ? r[idCol] : `${r[timeCol]}|${r[col("Lot number.")] ?? ""}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  const warnings: string[] = [];
  const inspections: ParsedLotpath[] = [];
  const commodity = planName.split(" - ")[0].trim() || planName;

  for (const rows of groups.values()) {
    const first = rows[0];
    const size = Number(first[sizeCol]);
    const sampleSize = Number.isFinite(size) && size > 0 ? size : null;
    const when = parseDateTime(first[timeCol] ?? "");

    const defects = defectCols.map((d) => ({
      name: d.name,
      severity: d.severity,
      // % of the sample size back to a whole count.
      count: sampleSize ? Math.round((pct(first[d.index] ?? "") / 100) * sampleSize) : 0,
    }));

    const sorted = [...rows].sort((a, b) => Number(a[sampleIndexCol]) - Number(b[sampleIndexCol]));
    const samples: ParsedSample[] = sorted.map((r) => ({
      fields: sampleCols
        .filter((s) => (r[s.index] ?? "").trim() !== "")
        .map((s) => {
          const text = r[s.index].trim();
          const parsed = parseSampleValue(text);
          // A "Notes" column is words even when a row's note happens to be a number.
          const isText = s.label === "Notes";
          return { label: s.label, text, number: isText ? null : parsed.number, unit: isText ? null : parsed.unit };
        }),
    }));

    const parsed: ParsedLotpath = {
      planName,
      commodity,
      controlPoint: "",
      inspectedBy: inspector,
      inspection: when,
      sampleTime: when,
      headerFields: headerCols.map((h) => ({ label: h.name.replace(/\.$/, ""), value: (first[h.index] ?? "").trim() })),
      notes1: cleanNote(first[col("Notes #1")] ?? ""),
      notes2: cleanNote(first[col("Notes #2")] ?? ""),
      result: (first[col("Final inspection result")] ?? "").trim(),
      sampleSize,
      defects,
      samples,
      warnings: [],
    };

    // The export's own total, to catch a column the reader misjudged.
    if (sampleSize) {
      const want = Math.round((pct(first[grandCol] ?? "") / 100) * sampleSize);
      const got = defects.reduce((s, d) => s + d.count, 0);
      if (Math.abs(want - got) > 1) parsed.warnings.push(`Defect counts add up to ${got} but the export's total is about ${want}.`);
    }
    if (!when) parsed.warnings.push("Couldn't read the inspection time.");
    inspections.push(parsed);
  }

  if (seriousTotalCol < 0) warnings.push("The export has no Serious Defects column, so every defect was treated as serious.");
  return { inspections, warnings };
}
