export interface ParsedInvoiceRow {
  invoice_no: string;
  invoice_date: string | null;
  customer_po: string;
  amount: number | null;
}

export interface ParseResult {
  rows: ParsedInvoiceRow[];
  error?: string;
}

// "#" is mapped to "no" before stripping punctuation so a keyword search for
// "po" still matches a header like "P.O. No" (-> "pono").
function normalizeHeader(cell: string): string {
  return cell.trim().toLowerCase().replace(/#/g, "no").replace(/[^a-z0-9]/g, "");
}

// Matched by keyword SUBSTRING, not exact equality - every carrier's
// statement header wording is a little different ("Invoice #" vs
// "Invoice/CM #", "Customer PO" vs "P.O. No"), and an exact-match synonym
// list keeps missing real-world variants one at a time. Columns are
// claimed left-to-right and removed from further consideration, so once
// something is used for a keyword it can't also satisfy a later one.
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

// Accepts both 2-digit and 4-digit years ("5/18/26" and "5/18/2026") - some
// carrier statements use a 2-digit year, which previously failed to match
// at all and silently left invoice_date (and therefore Age) blank.
function parseUsDate(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  const [, mm, dd, yyyyRaw] = m;
  const yyyy = yyyyRaw.length === 2 ? `20${yyyyRaw}` : yyyyRaw;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

function parseNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/[,$]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// Age is intentionally never read from the pasted statement (some carriers
// include their own "Age" column) - it's always computed from invoice_date
// at render/copy time via daysSince(), so it stays accurate for rows that
// sit untouched for weeks (the whole point of an aging list).
export function parsePastedInvoices(text: string): ParseResult {
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
    invoiceNo: findColumn(header, ["inv", "bill"], claimed),
    date: findColumn(header, ["date"], claimed),
    customerPo: findColumn(header, ["po", "reference"], claimed),
    amount: findColumn(header, ["amount", "amt", "total", "balance"], claimed),
  };

  if (idx.invoiceNo === -1) {
    return {
      rows: [],
      error: "Couldn't find an \"Invoice #\" column - make sure you paste including the header row.",
    };
  }

  const rows = grid
    .slice(1)
    .filter((r) => r.some((c) => c.trim() !== ""))
    .map((r) => ({
      invoice_no: (r[idx.invoiceNo] ?? "").trim(),
      invoice_date: idx.date >= 0 ? parseUsDate(r[idx.date] ?? "") : null,
      customer_po: idx.customerPo >= 0 ? (r[idx.customerPo]?.trim() ?? "") : "",
      amount: idx.amount >= 0 ? parseNumber(r[idx.amount]) : null,
    }))
    .filter((r) => r.invoice_no !== "");

  if (rows.length === 0) {
    return { rows: [], error: "No data rows found under the header." };
  }

  return { rows };
}
