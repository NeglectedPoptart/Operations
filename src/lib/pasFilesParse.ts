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
//   OrderNo [flag] Slp Date ShipDate Status OrderType SalesType(glued)ShipQty
//   Whse(glued)FobAmt Customer [ CODE ] Days(glued)PO
// with no separator at all between values that aren't genuinely
// whitespace-separated in the source sheet. A one-letter flag (e.g. "t")
// can sit between the order number and the salesperson.
//
// Days is glued straight onto the front of PO, so a PO that starts with
// digits (e.g. "389903") is indistinguishable from more days digits by
// shape alone. Days is simply the report's run date minus the row's ship
// date though, so it is recomputed here and stripped off exactly.
const PDF_ROW_RE =
  /^(\d{5,10})(?:\s+[A-Za-z](?=\s+\S{2,}\s+\d{1,2}\/))?\s+(\S+)\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+([A-Za-z]+)\s+([A-Za-z]+)\s+([A-Za-z]+)(\d[\d,]*)\s+(\d{2}(?:,\s*\d{2})*)([\d,]+\.\d{2})(.*)$/;

// The header line "10/5/2026 1:06:14PM" - when the report was run.
const RUN_DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+\d{1,2}:\d{2}:\d{2}\s*[AP]M$/;

function findRunDateUtc(lines: string[]): number | null {
  for (const line of lines) {
    const m = line.trim().match(RUN_DATE_RE);
    if (m) return Date.UTC(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
  }
  return null;
}

function expectedDays(runDateUtc: number | null, shipDateIso: string | null): string | null {
  if (runDateUtc === null || !shipDateIso) return null;
  const [y, m, d] = shipDateIso.split("-").map(Number);
  return String(Math.round((runDateUtc - Date.UTC(y, m - 1, d)) / 86400000));
}

function splitCustomerAndPo(remainder: string, days: string | null): { customer: string; po: string } {
  const bracketEnd = remainder.indexOf("]");
  if (bracketEnd !== -1 && days !== null) {
    const tail = remainder.slice(bracketEnd + 1).trim();
    if (tail.startsWith(days)) {
      return { customer: remainder.slice(0, bracketEnd + 1).trim(), po: tail.slice(days.length).trim() };
    }
  }
  // Fallback (no run date / unexpected shape): treat the first digit run as
  // the days and drop it - the old behaviour.
  const m = remainder.match(/^(\D*)(\d+)(.*)$/);
  return { customer: (m ? m[1] : remainder).trim(), po: m ? m[3].trim() : "" };
}

function parsePdfRow(line: string, runDateUtc: number | null): ParsedPasFileRow | null {
  const match = line.trim().match(PDF_ROW_RE);
  if (!match) return null;
  const [, orderNo, slp, date, shipDate, status, orderType, salesType, shipQty, whse, fobAmt, remainder] = match;

  const shipDateIso = parseUsDate(shipDate);
  const { customer, po } = splitCustomerAndPo(remainder, expectedDays(runDateUtc, shipDateIso));

  return {
    order_no: orderNo,
    po,
    customer,
    slp,
    order_date: parseUsDate(date),
    ship_date: shipDateIso,
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
  const lines = text.split(/\r?\n/);
  const runDateUtc = findRunDateUtc(lines);
  const rows = lines.map((l) => parsePdfRow(l, runDateUtc)).filter((r): r is ParsedPasFileRow => r !== null);

  if (rows.length === 0) {
    return {
      rows: [],
      error: "Couldn't find any order rows in this PDF - make sure it's the \"Orders Pending to Invoice\" export.",
    };
  }
  return { rows };
}
