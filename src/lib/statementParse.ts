export interface ParsedStatementLine {
  document: string;
  journalStatus: "post" | "open" | null;
  balance: number | null;
}

export interface ParseResult {
  rows: ParsedStatementLine[];
  error?: string;
}

// "#" is mapped to "no" before stripping punctuation so a keyword search for
// "po" still matches a header like "P.O. No" (-> "pono").
function normalizeHeader(cell: string): string {
  return cell.trim().toLowerCase().replace(/#/g, "no").replace(/[^a-z0-9]/g, "");
}

// Matched by keyword SUBSTRING, not exact equality - every accounting
// system's column wording is a little different. Columns are claimed
// left-to-right and removed from further consideration, so once something
// is used for a keyword it can't also satisfy a later one.
function findColumn(header: string[], keywords: string[], claimed: Set<number>): number {
  for (let i = 0; i < header.length; i++) {
    if (claimed.has(i)) continue;
    if (keywords.some((k) => header[i].includes(k))) {
      claimed.add(i);
      return i;
    }
  }
  return -1;
}

// The accounting system always wraps its own literal "INV-" prefix on top
// of whatever we stored ("20496" -> "INV-20496", but also "P-7566" ->
// "INV-P-7566" - some invoice numbers already carry their own meaningful
// letter prefix, e.g. a document-type code, which is NOT an ERP artifact
// and must survive on both sides). Only that specific prefix (abbreviated
// "INV-" or spelled out "Invoice", optionally with a "#") is stripped -
// stripping any/every leading letter run (as this used to do) destroyed
// real prefixes like "P-" and made otherwise-identical numbers compare
// unequal. A row originally imported with the full word "Invoice #2055"
// needs the same reduction to "2055" as the statement's "INV-2055", or
// they silently never match (see Ali-Mat #2055 bug report).
// A PDF export additionally glues an optional 3-letter currency code (e.g.
// "USD") directly in front of that same "INV-" prefix for foreign-currency
// rows ("USDINV-61277") - stripped together as one ERP-added prefix, same
// reasoning as "INV-" itself. The optional group only matches when a literal
// "INV" genuinely follows it, so a real 3-letter-prefixed invoice number
// that happens to start with "INV" (unseen so far, but just in case) still
// reduces correctly via backtracking rather than eating its own prefix.
export function normalizeInvoiceNo(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/^(?:[A-Z]{3})?INV(?:OICE)?\s*#?\s*-?\s*/, "")
    .replace(/[^A-Z0-9]/g, "");
}

// The Journal cell embeds the marker we actually care about, e.g.
// "HB-202607-BE-21 ( Post )" or "HB-202606-BE-72 ( Open )" - the separate
// single-letter Status column (P/W/A) is a different, unrelated code and is
// intentionally never read.
function extractJournalStatus(raw: string): "post" | "open" | null {
  const m = raw.match(/\(\s*(post|open)\s*\)/i);
  if (!m) return null;
  return m[1].toLowerCase() as "post" | "open";
}

function parseBalance(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/[^0-9.-]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function parsePastedStatement(text: string): ParseResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l.trim() !== "");

  if (lines.length === 0) {
    return { rows: [], error: "Nothing pasted." };
  }

  const grid = lines.map((l) => l.split("\t"));
  const header = grid[0].map(normalizeHeader);

  const claimed = new Set<number>();
  const idx = {
    document: findColumn(header, ["document", "inv", "bill"], claimed),
    journal: findColumn(header, ["journal"], claimed),
    balance: findColumn(header, ["balance"], claimed),
  };

  if (idx.document === -1) {
    return {
      rows: [],
      error: "Couldn't find a \"Document\" (invoice) column - make sure you paste including the header row.",
    };
  }
  if (idx.journal === -1) {
    return {
      rows: [],
      error: "Couldn't find a \"Journal\" column - that's where we read Post vs Open from.",
    };
  }

  const rows = grid
    .slice(1)
    .filter((r) => r.some((c) => c.trim() !== ""))
    .map((r) => ({
      document: (r[idx.document] ?? "").trim(),
      journalStatus: extractJournalStatus(r[idx.journal] ?? ""),
      balance: idx.balance >= 0 ? parseBalance(r[idx.balance]) : null,
    }))
    .filter((r) => r.document !== "");

  if (rows.length === 0) {
    return { rows: [], error: "No data rows found under the header." };
  }

  return { rows };
}

// unpdf extracts this report's "Bills" table with columns glued back
// together in a scrambled, non-visual order (the same quirk as every other
// PDF report in this app) - reverse-engineered per row, left to right as it
// actually extracts:
//   Document  Status(single letter, unused)  Amount[Balance]DocDate DueDate  Journal(with Post/Open embedded)
// Amount and, when present, Balance are both glued directly against the two
// trailing dates with no separator at all ("250.00250.0008/13/202607/23/2026").
// We only need Document, the Post/Open marker, and Balance - so rather than
// delimit every column, this finds the two trailing MM/DD/YYYY dates, then
// pulls whatever money-shaped values sit before them: one match means no
// balance shown (fully paid, same as the paste flow's "remove" case), two
// means the second is Balance (Amount always precedes Balance per the
// report's own header order).
function parsePdfBillsLine(rawLine: string): ParsedStatementLine | null {
  const line = rawLine.trim();
  const docMatch = line.match(/^(\S*INV\S*)\s+(.*)$/i);
  if (!docMatch) return null;
  const document = docMatch[1];
  const remainder = docMatch[2];

  const journalStatus = extractJournalStatus(remainder);

  const dateMatches = [...remainder.matchAll(/\d{2}\/\d{2}\/\d{4}/g)];
  if (dateMatches.length < 2) return null;
  const preDateBlob = remainder.slice(0, dateMatches[dateMatches.length - 2].index);

  const moneyMatches = [...preDateBlob.matchAll(/\d[\d,]*\.\d{2}/g)];
  const balance = moneyMatches.length >= 2 ? parseBalance(moneyMatches[moneyMatches.length - 1][0]) : null;

  return { document, journalStatus, balance };
}

export function parsePdfStatement(text: string): ParseResult {
  const rows = text
    .split(/\r?\n/)
    .map(parsePdfBillsLine)
    .filter((r): r is ParsedStatementLine => r !== null);

  if (rows.length === 0) {
    return { rows: [], error: "Couldn't find any bill rows in this PDF - try pasting the text instead." };
  }
  return { rows };
}
