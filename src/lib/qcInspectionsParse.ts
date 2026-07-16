export interface ParsedQcInspectionRow {
  entry_date: string | null;
  po: string;
  lot: string;
  product: string;
  qc: string;
  chat: boolean;
  report: boolean;
  mail: boolean;
  status: string;
  result: string;
  notes: string;
}

export interface ParseResult {
  rows: ParsedQcInspectionRow[];
  error?: string;
}

function normalizeHeader(cell: string): string {
  return cell.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findColumn(header: string[], prefix: string): number {
  const normalizedPrefix = normalizeHeader(prefix);
  return header.findIndex((cell) => cell.startsWith(normalizedPrefix));
}

function parseUsDate(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

// The tracker's Date column reads "Saturday, June 27, 2026" - strip the
// optional leading weekday, then match "Month D, YYYY" by name rather than
// relying on the Date constructor's locale-dependent string parsing.
function parseLongDate(raw: string): string | null {
  const withoutWeekday = raw.trim().replace(/^[A-Za-z]+,\s*/, "");
  const m = withoutWeekday.match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  if (!m) return null;
  const [, monthName, day, year] = m;
  const monthIndex = MONTHS.indexOf(monthName.toLowerCase());
  if (monthIndex === -1) return null;
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function parseAnyDate(raw: string | undefined): string | null {
  if (!raw) return null;
  return parseUsDate(raw) ?? parseLongDate(raw);
}

// Chat/Report/Mail are just marked with an "*" (or any mark) when done, so
// any non-empty cell counts as checked.
function parseCheck(raw: string | undefined): boolean {
  return (raw ?? "").trim() !== "";
}

// Column order/count varies, so we match by header NAME. Date and Product
// are the only columns required to exist - individual rows (e.g. a
// "No MX Inbound" day) can otherwise be mostly blank.
export function parsePastedQcInspections(text: string): ParseResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l.trim() !== "");

  if (lines.length === 0) {
    return { rows: [], error: "Nothing pasted." };
  }

  const grid = lines.map((l) => l.split("\t"));
  const header = grid[0].map(normalizeHeader);

  const idx = {
    date: findColumn(header, "date"),
    po: findColumn(header, "po"),
    lot: findColumn(header, "lot"),
    product: findColumn(header, "product"),
    qc: findColumn(header, "qc"),
    chat: findColumn(header, "chat"),
    report: findColumn(header, "report"),
    mail: findColumn(header, "mail"),
    status: findColumn(header, "status"),
    result: findColumn(header, "result"),
    notes: findColumn(header, "notes"),
  };

  if (idx.date === -1 || idx.product === -1) {
    return {
      rows: [],
      error: "Couldn't find \"Date\" and \"Product\" columns - make sure you paste including the header row from Excel.",
    };
  }

  const rows = grid
    .slice(1)
    .filter((r) => r.some((c) => c.trim() !== ""))
    .map((r) => ({
      entry_date: parseAnyDate(r[idx.date]),
      po: idx.po >= 0 ? (r[idx.po]?.trim() ?? "") : "",
      lot: idx.lot >= 0 ? (r[idx.lot]?.trim() ?? "") : "",
      product: r[idx.product]?.trim() ?? "",
      qc: idx.qc >= 0 ? (r[idx.qc]?.trim() ?? "") : "",
      chat: idx.chat >= 0 ? parseCheck(r[idx.chat]) : false,
      report: idx.report >= 0 ? parseCheck(r[idx.report]) : false,
      mail: idx.mail >= 0 ? parseCheck(r[idx.mail]) : false,
      status: idx.status >= 0 ? (r[idx.status]?.trim() ?? "") : "",
      result: idx.result >= 0 ? (r[idx.result]?.trim() ?? "") : "",
      notes: idx.notes >= 0 ? (r[idx.notes]?.trim() ?? "") : "",
    }));

  if (rows.length === 0) {
    return { rows: [], error: "No data rows found under the header." };
  }

  return { rows };
}
