// Parses the ERP's "Orders Summary" report (pasted as text, or extracted
// from an uploaded PDF via unpdf) for the Weekly Company Call's Operations
// Coordinator breakdown (orders/cases/terms by salesperson).
//
// The report's underlying PDF draws each row's cells in a fixed but
// visually-scrambled order (confirmed against a real export): extracting
// the text layer straight through yields
//   <OrderNo> <Status> <Salesperson> <Delivered|FOB> [Freight] <Shipped> [Truck] <Ordered><CustomerCode - Customer Name>
// with no separator at all between a number and whatever text immediately
// follows it (so "998DELFINO - Delfino..." is genuinely "998" glued to
// "DELFINO..."). Freight/Truck are free text and never contain digits in
// practice, so rather than try to delimit every column, this only pulls
// out what the aggregates actually need: salesperson, terms, and the two
// order-quantity numbers - found as the last one or two digit-runs on the
// line, whatever text sits around them.
export interface SalesOrderRow {
  orderNo: string;
  salesperson: string;
  terms: "Delivered" | "FOB";
  ordered: number;
  shipped: number;
}

export interface ParseSalesOrderResult {
  rows: SalesOrderRow[];
  error?: string;
}

const ROW_RE = /^(\d{5,10})\s+(\S+)\s+(.+?)\s+(Delivered|FOB)\s+(.*)$/;

function parseNum(raw: string): number {
  return Number(raw.replace(/,/g, ""));
}

export function parseSalesOrderText(raw: string): ParseSalesOrderResult {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const rows: SalesOrderRow[] = [];
  for (const line of lines) {
    const match = line.match(ROW_RE);
    if (!match) continue;
    const [, orderNo, , salespersonRaw, terms, remainder] = match;

    const numberMatches = [...remainder.matchAll(/\d[\d,]*/g)];
    let shipped: number | null = null;
    let ordered: number | null = null;

    if (numberMatches.length >= 2) {
      const [shippedMatch, orderedMatch] = numberMatches.slice(-2);
      shipped = parseNum(shippedMatch[0]);
      ordered = parseNum(orderedMatch[0]);
    } else if (numberMatches.length === 1) {
      // Freight and Truck were both blank, so Shipped and Ordered sit
      // glued together with nothing between them at all - split the
      // digits down the middle (the common case: a fully-shipped order
      // has Ordered === Shipped, so this recovers the right answer even
      // when it's a guess about exactly where the split falls).
      const digits = numberMatches[0][0].replace(/,/g, "");
      if (digits.length >= 2 && digits.length % 2 === 0) {
        const half = digits.length / 2;
        shipped = Number(digits.slice(0, half));
        ordered = Number(digits.slice(half));
      } else {
        shipped = ordered = Number(digits);
      }
    }

    if (ordered === null || shipped === null) continue;
    rows.push({ orderNo, salesperson: salespersonRaw.trim(), terms: terms as "Delivered" | "FOB", ordered, shipped });
  }

  if (rows.length === 0) {
    return {
      rows: [],
      error: "Couldn't find any order rows - make sure this is the ERP's \"Orders Summary\" report.",
    };
  }
  return { rows };
}
