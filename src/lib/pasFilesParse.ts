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

// A row is a PAS (Price As Sale) order if its PO mentions "PAS" anywhere
// (e.g. "0555593 PAS", "PAS Eric 6/25", "PASNeed" - PO is a free-typed
// field, not a fixed code, so this has to be a substring match) or its
// Order Type is literally marked "PAS". Everything else pasted alongside
// it is a regular order pending invoice, routed to Sales > Pending to
// Invoice instead.
export function isPasRow(row: ParsedPasFileRow): boolean {
  return row.po.trim().toUpperCase().includes("PAS") || row.order_type.trim().toUpperCase() === "PAS";
}

// unpdf extracts the "Orders Pending to Invoice" report with columns glued
// back together in a fixed but visually-scrambled order (the same quirk as
// the other ERP PDF exports - see salesOrderParse.ts / oldAgeParse.ts).
// Reverse-engineered against a real export, each row prints as:
//   OrderNo Slp Date ShipDate Status OrderType SalesType(glued)ShipQty
//   Whse(glued)FobAmt Customer(glued)Days(glued)PO
// with no separator at all between values that aren't genuinely
// whitespace-separated in the source sheet. Days (a computed aging value
// recomputed from ship_date at render time, never imported) is glued
// directly onto PO with nothing between them, so we split on the first
// digit run in that combined blob
// and discard it - this is only ambiguous when PO itself starts with a
// bare digit, which never happens on a real PAS order (its PO always
// carries the word "PAS" or a person's name, e.g. "PAS 6/9", "Eric PAS
// 8/21") - only on the non-PAS invoice numbers this page doesn't care
// about matching exactly.
const PDF_ROW_RE =
  /^(\d{5,10})\s+(\S+)\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+([A-Za-z]+)\s+([A-Za-z]+)\s+([A-Za-z]+)(\d[\d,]*)\s+(\d{2}(?:,\s*\d{2})*)([\d,]+\.\d{2})(.*)$/;

function parsePdfRow(line: string): ParsedPasFileRow | null {
  const match = line.trim().match(PDF_ROW_RE);
  if (!match) return null;
  const [, orderNo, slp, date, shipDate, status, orderType, salesType, shipQty, whse, fobAmt, remainder] = match;

  const remainderMatch = remainder.match(/^(\D*)(\d+)(.*)$/);
  const customer = (remainderMatch ? remainderMatch[1] : remainder).trim();
  const po = remainderMatch ? remainderMatch[3].trim() : "";

  return {
    order_no: orderNo,
    po,
    customer,
    slp,
    order_date: parseUsDate(date),
    ship_date: parseUsDate(shipDate),
    ship_qty: parseNumber(shipQty),
    fob_amt: parseNumber(fobAmt),
    whse,
    status,
    order_type: orderType,
    sales_type: salesType,
    update_notes: "",
    last_contact: "",
  };
}

export function parsePdfPasFiles(text: string): ParseResult {
  const rows = text
    .split(/\r?\n/)
    .map(parsePdfRow)
    .filter((r): r is ParsedPasFileRow => r !== null);

  if (rows.length === 0) {
    return {
      rows: [],
      error: "Couldn't find any order rows in this PDF - make sure it's the \"Orders Pending to Invoice\" export.",
    };
  }
  return { rows };
}
