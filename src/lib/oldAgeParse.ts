export interface ParsedOldAgeRow {
  document: string;
  received_date: string | null;
  description: string;
  pack_style: string;
  size: string;
  qty: number | null;
  age: number | null;
}

export interface ParseResult {
  rows: ParsedOldAgeRow[];
  error?: string;
}

function normalizeHeader(cell: string): string {
  return cell.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

// The real sheet's headers don't match our field names exactly ("Qty Bal"
// instead of "Qty", "Age da" instead of "Age", "Seaso"/"Season" variants),
// so match by PREFIX rather than exact equality. First match wins, left to
// right - that's what makes "Qty Bal" win over the later plain "Qty" column,
// since it appears first in the sheet.
function findColumn(header: string[], prefix: string): number {
  const normalizedPrefix = normalizeHeader(prefix);
  return header.findIndex((cell) => cell.startsWith(normalizedPrefix));
}

// Excel gives dates as MM/DD/YYYY when copied as plain text.
function parseUsDate(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

function parseNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/,/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// The source report now breaks a lot down by individual tag number - one line
// per pallet tag instead of one line per lot. Rows that share the same
// Document (lot/PO), Description (commodity), Pack Style, and Size are the
// same lot split across tags, so we collapse them into a single row and sum
// their quantities. Received date and age are taken from the first tag seen
// in the group (all tags of one lot share the same receiving day).
function groupKey(row: ParsedOldAgeRow): string {
  return [row.document, row.description, row.pack_style, row.size]
    .map((v) => v.trim().toLowerCase())
    .join("|");
}

function aggregateRows(rows: ParsedOldAgeRow[]): ParsedOldAgeRow[] {
  const groups = new Map<string, ParsedOldAgeRow>();
  for (const row of rows) {
    const key = groupKey(row);
    const existing = groups.get(key);
    if (existing) {
      existing.qty = (existing.qty ?? 0) + (row.qty ?? 0);
    } else {
      groups.set(key, { ...row });
    }
  }
  return Array.from(groups.values());
}

// Column order/count varies (hidden columns, extra blanks), so we match by
// header NAME rather than a fixed position - the first row must be the
// Excel header row (Document, Received, Description, PStyle, Size, Qty, Age,
// plus whatever else - anything not one of those seven is ignored). "Qty"
// appears twice in the source sheet; we intentionally take the first
// occurrence (the main quantity), not the second (partial-pull quantity).
export function parsePastedOldAge(text: string): ParseResult {
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
    document: findColumn(header, "document"),
    received: findColumn(header, "received"),
    description: findColumn(header, "description"),
    pstyle: findColumn(header, "pstyle"),
    size: findColumn(header, "size"),
    qty: findColumn(header, "qty"),
    age: findColumn(header, "age"),
  };

  if (idx.document === -1 || idx.description === -1) {
    return {
      rows: [],
      error:
        "Couldn't find \"Document\" and \"Description\" columns - make sure you paste including the header row from Excel.",
    };
  }

  const rows = grid
    .slice(1)
    .filter((r) => r.some((c) => c.trim() !== ""))
    .map((r) => ({
      document: r[idx.document]?.trim() ?? "",
      received_date: idx.received >= 0 ? parseUsDate(r[idx.received] ?? "") : null,
      description: r[idx.description]?.trim() ?? "",
      pack_style: idx.pstyle >= 0 ? (r[idx.pstyle]?.trim() ?? "") : "",
      size: idx.size >= 0 ? (r[idx.size]?.trim() ?? "") : "",
      qty: idx.qty >= 0 ? parseNumber(r[idx.qty]) : null,
      age: idx.age >= 0 ? parseNumber(r[idx.age]) : null,
    }))
    .filter((r) => r.document !== "");

  if (rows.length === 0) {
    return { rows: [], error: "No data rows found under the header." };
  }

  return { rows: aggregateRows(rows) };
}
