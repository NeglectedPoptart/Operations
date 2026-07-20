export interface ParsedStatementLine {
  document: string;
  journalStatus: "post" | "open" | null;
  balance: number | null;
}

export interface ParseResult {
  rows: ParsedStatementLine[];
  error?: string;
}

function normalizeHeader(cell: string): string {
  return cell.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findColumn(header: string[], synonyms: string[]): number {
  const normalized = synonyms.map(normalizeHeader);
  return header.findIndex((cell) => normalized.includes(cell));
}

// Our invoice numbers are stored bare ("20496"); the accounting system
// prefixes them ("INV-20496") - strip any leading letters/dashes so the two
// sides compare equal regardless of which format either one uses.
export function normalizeInvoiceNo(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/^[A-Z]+-?/, "")
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

  const idx = {
    document: findColumn(header, ["document", "invoice", "invoiceno", "invoice#", "inv", "bill", "billno"]),
    journal: findColumn(header, ["journal"]),
    balance: findColumn(header, ["balance"]),
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
