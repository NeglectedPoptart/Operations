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

function normalizeHeader(cell: string): string {
  return cell.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Matched by exact normalized equality against a list of known synonyms
// (not prefix, unlike PAS Files/Old Age's parsers) - "INV #" normalizes to
// "inv", which would otherwise also prefix-match a column named "Invoice
// Date". Every broker's statement format is a little different, so this
// column list is intentionally generous.
function findColumn(header: string[], synonyms: string[]): number {
  const normalized = synonyms.map(normalizeHeader);
  return header.findIndex((cell) => normalized.includes(cell));
}

function parseUsDate(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
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

  const idx = {
    invoiceNo: findColumn(header, ["inv#", "invno", "invoiceno", "invoicenumber", "invnumber", "invoice"]),
    date: findColumn(header, ["date", "invoicedate", "invdate"]),
    customerPo: findColumn(header, ["customerpo", "custpo", "po", "po#", "reference", "referenceno"]),
    amount: findColumn(header, ["amt", "amount", "invoiceamt", "invoiceamount", "total"]),
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
