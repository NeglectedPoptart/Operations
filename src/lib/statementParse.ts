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
// and must survive on both sides). Only that specific "INV" prefix is
// stripped - stripping any/every leading letter run (as this used to do)
// destroyed real prefixes like "P-" and made otherwise-identical numbers
// compare unequal.
export function normalizeInvoiceNo(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/^INV-?/, "")
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
