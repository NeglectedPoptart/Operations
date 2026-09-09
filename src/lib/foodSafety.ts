import type { FoodSafetyDocument, FoodSafetyReportType, GrowerGrade } from "./types";

// Best-effort only: scans for a date immediately following a common
// expiration-related phrase. Real certs vary wildly in layout and wording,
// so this often won't find anything - when it doesn't, the uploader just
// types the date in by hand instead (see the always-editable expiration
// field in FoodSafetyClient).
const DATE_PATTERN = "(\\d{1,2}[\\/\\-]\\d{1,2}[\\/\\-]\\d{2,4}|\\d{4}-\\d{2}-\\d{2}|[A-Za-z]{3,9}\\.?\\s+\\d{1,2},?\\s+\\d{4})";
const EXPIRATION_RE = new RegExp(`(?:expir\\w*|valid\\s+(?:until|through)|good\\s+through)\\D{0,15}${DATE_PATTERN}`, "i");

function parseFlexibleDate(raw: string): string | null {
  const slashMatch = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slashMatch) {
    const [, mm, dd, rawYear] = slashMatch;
    const yyyy = rawYear.length === 2 ? `20${rawYear}` : rawYear;
    const d = new Date(`${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

// Scans PDF-extracted text for something that looks like an expiration
// date. Returns null (never throws) when nothing matches or the matched
// text isn't a parseable date.
export function detectExpirationDate(text: string): string | null {
  const match = text.match(EXPIRATION_RE);
  if (!match) return null;
  return parseFlexibleDate(match[1].trim());
}

export function daysUntil(dateIso: string, todayIso: string): number {
  const ms = new Date(`${dateIso}T00:00:00Z`).getTime() - new Date(`${todayIso}T00:00:00Z`).getTime();
  return Math.round(ms / 86400000);
}

// Discrete buckets, not a gradient - matches the rest of the app's
// proximity-to-date coloring conventions (e.g. Invoicing's "checked
// recently" flag): a fixed few thresholds, not a computed color scale.
export function expirationToneClasses(dateIso: string | null, todayIso: string): string {
  if (!dateIso) return "text-black/40 dark:text-white/40";
  const days = daysUntil(dateIso, todayIso);
  if (days <= 7) return "font-semibold text-red-600 dark:text-red-400";
  if (days <= 30) return "font-semibold text-amber-600 dark:text-amber-400";
  return "text-green-700 dark:text-green-400";
}

export function expirationLabel(dateIso: string | null, todayIso: string): string {
  if (!dateIso) return "No expiration set";
  const days = daysUntil(dateIso, todayIso);
  if (days < 0) return `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago`;
  if (days === 0) return "Expires today";
  return `Expires in ${days} day${days === 1 ? "" : "s"}`;
}

const GRADE_TILE_CLASSES: Record<GrowerGrade, string> = {
  A: "border-green-500 bg-green-50 dark:border-green-700 dark:bg-green-950/30",
  B: "border-lime-500 bg-lime-50 dark:border-lime-700 dark:bg-lime-950/30",
  C: "border-yellow-500 bg-yellow-50 dark:border-yellow-700 dark:bg-yellow-950/30",
  D: "border-orange-500 bg-orange-50 dark:border-orange-700 dark:bg-orange-950/30",
  F: "border-red-500 bg-red-50 dark:border-red-700 dark:bg-red-950/30",
  "N/A": "border-black/10 dark:border-white/10",
};

const GRADE_BADGE_CLASSES: Record<GrowerGrade, string> = {
  A: "bg-green-600 text-white",
  B: "bg-lime-600 text-white",
  C: "bg-yellow-500 text-black",
  D: "bg-orange-500 text-white",
  F: "bg-red-600 text-white",
  "N/A": "bg-black/20 text-black/60 dark:bg-white/20 dark:text-white/60",
};

export function gradeTileClasses(grade: GrowerGrade): string {
  return GRADE_TILE_CLASSES[grade];
}

export function gradeBadgeClasses(grade: GrowerGrade): string {
  return GRADE_BADGE_CLASSES[grade];
}

// A required report type is "satisfied" for a grower if there's at least
// one document on file for it that isn't expired - no expiration date at
// all counts as "doesn't expire", so it satisfies too. A grower with no
// required types configured yet isn't gradeable ("N/A") rather than
// defaulting to a free A.
export function computeGrowerGrade(
  growerId: string,
  reportTypes: FoodSafetyReportType[],
  documents: FoodSafetyDocument[],
  todayIso: string,
): { grade: GrowerGrade; satisfied: number; total: number } {
  const required = reportTypes.filter((t) => t.required);
  if (required.length === 0) return { grade: "N/A", satisfied: 0, total: 0 };

  const growerDocs = documents.filter((d) => d.grower_id === growerId);
  let satisfied = 0;
  for (const type of required) {
    const hasValid = growerDocs.some(
      (d) => d.report_type_id === type.id && (!d.expiration_date || daysUntil(d.expiration_date, todayIso) >= 0),
    );
    if (hasValid) satisfied += 1;
  }

  const pct = satisfied / required.length;
  let grade: GrowerGrade;
  if (pct >= 1) grade = "A";
  else if (pct >= 0.8) grade = "B";
  else if (pct >= 0.6) grade = "C";
  else if (pct >= 0.4) grade = "D";
  else grade = "F";

  return { grade, satisfied, total: required.length };
}
