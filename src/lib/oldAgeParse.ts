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

function daysBetween(fromIso: string, toIso: string): number {
  const ms = new Date(`${toIso}T00:00:00Z`).getTime() - new Date(`${fromIso}T00:00:00Z`).getTime();
  return Math.round(ms / 86400000);
}

// The PDF's "Parameters:" line carries the report's own run date, e.g.
// "...As Of: 9/2/2026Parameters:". We use this (not wall-clock "today") to
// compute Age, since a PDF uploaded a day after it was generated should
// still show the age as of when the report was actually run.
function parseAsOfDate(text: string): string | null {
  const m = text.match(/As Of:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

// unpdf extracts this report's table with columns glued back together in a
// fixed but visually-scrambled order (not left-to-right reading order), with
// no delimiter between adjacent values - the same quirk as the "Orders
// Summary" sales-order PDF (see salesOrderParse.ts). Reverse-engineered per
// row, left to right as it actually extracts:
//   PStyle  SizeLabelVarComm(glued)  Description(1+ words)  RecQty  QtyBal
//   AgeAndTagNo(glued - and only glued with a partial-ship Qty+LastShip when
//     one exists)  GrowerName(1+ words, last word glued to Grower/Truck/Driver)
//     ReceivedDate  Season  Document(all glued together, in that order)
// We only pull what Old Age actually needs: Document, Received, Description,
// PStyle, a best-effort Size, and Qty Bal (the balance still on hand - this
// is "Qty" for our purposes, same convention as the paste parser above).
// Age is deliberately NOT parsed out of the AgeAndTagNo blob: it's two
// variable-length numbers glued with no separator ("1963" could be age
// 1/qty 963 or age 19/qty 63), so we compute it instead from Received vs.
// the report's own "As Of" date.
function parsePdfRow(line: string): ParsedOldAgeRow | null {
  const tokens = line.trim().split(/\s+/);
  if (tokens.length < 6) return null;

  let pairIndex = -1;
  for (let i = 2; i < tokens.length - 1; i++) {
    if (/^\d+$/.test(tokens[i]) && /^\d+$/.test(tokens[i + 1])) {
      pairIndex = i;
      break;
    }
  }
  if (pairIndex === -1) return null;

  // Everything after Qty Bal - GrowerName, Grower, Truck, Driver, Received,
  // Season, Document - is glued into one or more tokens with no reliable
  // word boundaries, so we join it back into a single blob and pull the
  // LAST date out of it (the Last Ship date, when present, sits earlier in
  // this blob than Received does).
  const tailBlob = tokens.slice(pairIndex + 2).join("");
  const dateMatches = [...tailBlob.matchAll(/\d{1,2}\/\d{1,2}\/\d{4}/g)];
  if (dateMatches.length === 0) return null;
  const lastMatch = dateMatches[dateMatches.length - 1];
  const receivedRaw = lastMatch[0];
  const afterDate = tailBlob.slice(lastMatch.index + receivedRaw.length);
  const document = afterDate.replace(/^(None|\d{4})/, "").trim();
  if (!document) return null;

  return {
    document,
    received_date: parseUsDate(receivedRaw),
    description: tokens.slice(2, pairIndex).join(" ").trim(),
    pack_style: tokens[0],
    size: tokens[1].replace(/\d+$/, ""),
    qty: parseNumber(tokens[pairIndex + 1]),
    age: null,
  };
}

export function parsePdfOldAge(text: string): ParseResult {
  const asOf = parseAsOfDate(text);
  const rows = text
    .split(/\r?\n/)
    .map(parsePdfRow)
    .filter((r): r is ParsedOldAgeRow => r !== null);

  if (rows.length === 0) {
    return { rows: [], error: "Couldn't find any data rows in this PDF." };
  }

  if (asOf) {
    for (const row of rows) {
      row.age = row.received_date ? daysBetween(row.received_date, asOf) : null;
    }
  }

  return { rows: aggregateRows(rows) };
}
