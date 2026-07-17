export interface ParsedPasFileRow {
  order_no: string;
  po: string;
  customer: string;
  slp: string;
  order_date: string | null;
  ship_date: string | null;
  ship_qty: number | null;
  fob_amt: number | null;
  whse: string;
  status: string;
  order_type: string;
  sales_type: string;
  update_notes: string;
  last_contact: string;
}

export interface ParseResult {
  rows: ParsedPasFileRow[];
  error?: string;
}

function normalizeHeader(cell: string): string {
  return cell.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Match by PREFIX rather than exact equality, same reasoning as Old Age's
// parser - tolerates minor header wording differences. "Ship date"
// normalizes to "shipdate", which does NOT start with "date", so the plain
// "Date" column and "Ship date" column are safely distinguished from each
// other regardless of which appears first.
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

function parseNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/[,$]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// Strips the leading apostrophe Excel adds to force text formatting on
// numeric-looking values like order numbers.
function stripLeadingQuote(raw: string | undefined): string {
  return (raw ?? "").trim().replace(/^'/, "");
}

// Column order/count varies (the export doesn't always match the running
// sheet exactly), so we match by header NAME. "Days" is intentionally never
// read - it's a computed/aging value in the source sheet, and if we imported
// it verbatim it would go stale forever on rows we never touch again (the
// whole point of this list is skipping already-seen rows). We recompute it
// from ship_date at render time instead.
export function parsePastedPasFiles(text: string): ParseResult {
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
    orderNo: findColumn(header, "orderno"),
    customer: findColumn(header, "customer"),
    po: findColumn(header, "po"),
    slp: findColumn(header, "slp"),
    date: findColumn(header, "date"),
    shipDate: findColumn(header, "shipdate"),
    shipQty: findColumn(header, "shipqty"),
    fobAmt: findColumn(header, "fobamt"),
    whse: findColumn(header, "whse"),
    status: findColumn(header, "status"),
    orderType: findColumn(header, "ordertype"),
    salesType: findColumn(header, "salestype"),
    update: findColumn(header, "update"),
    lastContact: findColumn(header, "lastcontact"),
  };

  if (idx.orderNo === -1) {
    return {
      rows: [],
      error: "Couldn't find an \"Order No\" column - make sure you paste including the header row from Excel.",
    };
  }

  const rows = grid
    .slice(1)
    .filter((r) => r.some((c) => c.trim() !== ""))
    .map((r) => ({
      order_no: stripLeadingQuote(r[idx.orderNo]),
      po: idx.po >= 0 ? (r[idx.po]?.trim() ?? "") : "",
      customer: idx.customer >= 0 ? (r[idx.customer]?.trim() ?? "") : "",
      slp: idx.slp >= 0 ? (r[idx.slp]?.trim() ?? "") : "",
      order_date: idx.date >= 0 ? parseUsDate(r[idx.date] ?? "") : null,
      ship_date: idx.shipDate >= 0 ? parseUsDate(r[idx.shipDate] ?? "") : null,
      ship_qty: idx.shipQty >= 0 ? parseNumber(r[idx.shipQty]) : null,
      fob_amt: idx.fobAmt >= 0 ? parseNumber(r[idx.fobAmt]) : null,
      whse: idx.whse >= 0 ? (r[idx.whse]?.trim() ?? "") : "",
      status: idx.status >= 0 ? (r[idx.status]?.trim() ?? "") : "",
      order_type: idx.orderType >= 0 ? (r[idx.orderType]?.trim() ?? "") : "",
      sales_type: idx.salesType >= 0 ? (r[idx.salesType]?.trim() ?? "") : "",
      update_notes: idx.update >= 0 ? (r[idx.update]?.trim() ?? "") : "",
      last_contact: idx.lastContact >= 0 ? (r[idx.lastContact]?.trim() ?? "") : "",
    }))
    .filter((r) => r.order_no !== "");

  if (rows.length === 0) {
    return { rows: [], error: "No data rows found under the header." };
  }

  return { rows };
}

// A row is a PAS (Price As Sale) order if either its PO or Order Type is
// literally marked "PAS" - everything else pasted alongside it is a regular
// order pending invoice, routed to Sales > Pending to Invoice instead.
export function isPasRow(row: ParsedPasFileRow): boolean {
  return row.po.trim().toUpperCase() === "PAS" || row.order_type.trim().toUpperCase() === "PAS";
}
