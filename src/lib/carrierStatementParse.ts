// Format-specific parsers for the three carriers whose own raw aging/
// outstanding reports we now import directly, instead of hand-retyping
// them into the generic tab-separated shape parsePastedInvoices expects
// first. Each carrier's own accounting software has a fixed, unchanging
// layout, so these are hand-mapped per carrier the same way fobEmailParse's
// resolveTargets is hand-mapped per pricing-email category.
import { addDays } from "./dates";
import type { ParsedInvoiceRow, ParseResult } from "./invoicingParse";

function parseUsDateToIso(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  const [, mm, dd, yyyyRaw] = m;
  const yyyy = yyyyRaw.length === 2 ? `20${yyyyRaw}` : yyyyRaw;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

function parseMoney(raw: string): number | null {
  const cleaned = raw.trim().replace(/[$,]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// DSV's "Detail of Outstanding By Date" PDF - unpdf extracts each data row
// with its columns glued back in a scrambled, non-visual order (the same
// quirk documented in statementParse.ts's parsePdfBillsLine), verified
// directly against a real export:
//   CustPO InvcAmt RcptAmt Balance {0-7} {8-14} {22-28} Later {Credit}{Hold}{Slsprsn...} {15-21}{ShipDate} OrderNo
// Cust PO is free text and can itself contain spaces - two POs written as
// "34585 / 34600", a comma-separated pair like "35067, 35064", or even
// unrelated text like "PU#RICHARD - HARVEST" - so it can't be assumed to
// be exactly one token the way the fixed numeric/date fields can (a real
// invoice missing #35722 turned out to have exactly this shape). Instead
// this anchors on Invc Amt itself: the first token that's a genuine
// nonzero money value (a zero field always renders as the bare ".00" this
// report uses for every $0 column, never "0.00", so requiring a leading
// digit rules those out) - everything before it, however many tokens that
// takes, is Cust PO. The Slsprsn name can also be one or more words, which
// is why the end is anchored the same "don't assume a fixed token count"
// way: the last token alone (Order No.) and a money value glued directly
// against Ship Date just before it.
function parseDsvLine(rawLine: string): ParsedInvoiceRow | null {
  const tokens = rawLine.trim().split(/\s+/);
  if (tokens.length < 4) return null;

  const orderNo = tokens[tokens.length - 1];
  if (!/^\d+$/.test(orderNo)) return null;

  const dateToken = tokens[tokens.length - 2];
  const dateMatch = dateToken.match(/(\d{1,2}\/\d{1,2}\/\d{4})$/);
  if (!dateMatch) return null;

  const amountIdx = tokens.findIndex((t) => /^\d[\d,]*\.\d{2}$/.test(t));
  if (amountIdx === -1) return null;
  const amount = parseMoney(tokens[amountIdx]);
  if (amount === null) return null;

  return {
    invoice_no: orderNo,
    invoice_date: parseUsDateToIso(dateMatch[1]),
    customer_po: tokens.slice(0, amountIdx).join(" "),
    amount,
  };
}

export function parseDsvPdfText(text: string): ParseResult {
  const rows = text
    .split(/\r?\n/)
    .map(parseDsvLine)
    .filter((r): r is ParsedInvoiceRow => r !== null);

  if (rows.length === 0) {
    return { rows: [], error: "Couldn't find any invoice rows in this DSV statement - try pasting the text instead." };
  }
  return { rows };
}

// Griffith's "Invoice Aging Report" PDF - unpdf extracts this one in normal
// reading order, one data row per line, always for customer "HARVEST BEST
// INC" - used as a fixed anchor to find where the PO#/BOL# block ends
// (both can themselves contain embedded spaces, e.g. "0034138/ 0034140" or
// "per bol", so they can't be split apart by token position alone). Only
// the first token of that block is kept as PO# - good enough for the common
// single-value case; a rare multi-value PO# is truncated to its first
// value rather than guessed at.
const GRIFFITH_LINE_RE =
  /^(\d{2}\/\d{2}\/\d{4})\s+\d{2}\/\d{2}\/\d{4}\s+(#\S+)\s+#\S+\s+(.+?)\s+HARVEST BEST INC\s+(?:\$[\d,]+\.\d{2}\s+){5}\$([\d,]+\.\d{2})\s*$/;

function parseGriffithLine(rawLine: string): ParsedInvoiceRow | null {
  const m = rawLine.trim().match(GRIFFITH_LINE_RE);
  if (!m) return null;
  const [, invOn, invNo, poBlock, balanceDue] = m;
  const poFirstToken = poBlock.trim().split(/\s+/)[0] ?? "";

  return {
    // Keeps the "#" prefix (unlike DSV/Jear's plain digits) - every Griffith
    // invoice already on file was imported that way (matching the "#" the
    // source PDF itself displays), so dropping it here would silently
    // duplicate every invoice already tracked instead of recognizing it as
    // already imported.
    invoice_no: invNo,
    invoice_date: parseUsDateToIso(invOn),
    customer_po: poFirstToken.replace(/^#/, ""),
    amount: parseMoney(balanceDue),
  };
}

export function parseGriffithPdfText(text: string): ParseResult {
  const rows = text
    .split(/\r?\n/)
    .map(parseGriffithLine)
    .filter((r): r is ParsedInvoiceRow => r !== null);

  if (rows.length === 0) {
    return {
      rows: [],
      error: "Couldn't find any invoice rows in this Griffith statement - try pasting the text instead.",
    };
  }
  return { rows };
}

// Jerue's "Account Statement" PDF - unpdf extracts this one in normal
// reading order too, one data row per line:
//   Invoice#  PO#  ShipDate  Inv.Date  DaysOpen  Amount  Paid/Credits  BalanceDue
// PO# is always a single token here (no embedded spaces like Griffith's),
// so this can anchor on the fixed token shape directly rather than needing
// a named end-anchor. Amount (the original invoiced amount) is read, not
// Balance Due (which nets out payments/credits) - matching what was asked
// for.
const JERUE_LINE_RE =
  /^(\S+)\s+(\S+)\s+\d{1,2}\/\d{1,2}\/\d{4}\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+\d+\s+([\d,]+\.\d{2})\s+[\d,]+\.\d{2}\s+[\d,]+\.\d{2}\s*$/;

function parseJerueLine(rawLine: string): ParsedInvoiceRow | null {
  const m = rawLine.trim().match(JERUE_LINE_RE);
  if (!m) return null;
  const [, invoiceNo, po, invDate, amount] = m;
  return {
    invoice_no: invoiceNo,
    invoice_date: parseUsDateToIso(invDate),
    customer_po: po,
    amount: parseMoney(amount),
  };
}

export function parseJeruePdfText(text: string): ParseResult {
  const rows = text
    .split(/\r?\n/)
    .map(parseJerueLine)
    .filter((r): r is ParsedInvoiceRow => r !== null);

  if (rows.length === 0) {
    return { rows: [], error: "Couldn't find any invoice rows in this Jerue statement - try pasting the text instead." };
  }
  return { rows };
}

// Jear emails an Excel table rather than a PDF - it has no invoice date at
// all, only a Due Date, so invoice_date is backed into as due date minus 30
// days (Jear's standard terms). Supports both a real tab-separated paste
// (Excel) and the flattened one-cell-per-line shape Outlook produces when
// copying an email's table (no tabs survive at all, just Customer/JEAR PO/
// Customer PO/Amount Due/Due Date/Days Past Due repeating in that fixed
// order) - whichever shape the pasted text is actually in.
const JEAR_COLUMNS = ["customer", "jearpo", "customerpo", "amountdue", "duedate", "dayspastdue"] as const;

function jearRowFromCells(cells: string[], dueDateOffsetDays = -30): ParsedInvoiceRow | null {
  const [, jearPo, customerPo, amountDue, dueDate] = cells;
  if (!jearPo) return null;
  const dueIso = parseUsDateToIso(dueDate ?? "");
  return {
    invoice_no: jearPo.trim(),
    invoice_date: dueIso ? addDays(dueIso, dueDateOffsetDays) : null,
    customer_po: (customerPo ?? "").trim(),
    amount: parseMoney(amountDue ?? ""),
  };
}

// Minimal RFC4180-ish CSV line splitter - handles quoted fields (embedded
// commas, escaped "" quotes), the one thing a plain split(",") can't. Kept
// separate from parseJearPastedTable's tab/flattened-paste splitting since
// this is a genuinely different input channel (a file, not a paste).
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cells.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

// Jear's "Weekly SOA" CSV export (Upload Statement, separate from the Paste
// Statement flow above) - same six columns, but its own due-date-to-
// invoice-date offset (21 days, not 30) since the user asked to keep this
// upload path independent of the paste flow's existing terms rather than
// changing parseJearPastedTable's behavior.
export function parseJearStatementCsv(raw: string): ParseResult {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "");
  if (lines.length === 0) {
    return { rows: [], error: "That file looks empty." };
  }

  const grid = lines.map(splitCsvLine);
  const startIdx = grid[0][0]?.toLowerCase() === "customer" ? 1 : 0;

  const rows: ParsedInvoiceRow[] = grid
    .slice(startIdx)
    .filter((r) => r.some((c) => c !== ""))
    .map((cells) => jearRowFromCells(cells, -21))
    .filter((r): r is ParsedInvoiceRow => r !== null);

  if (rows.length === 0) {
    return { rows: [], error: "Couldn't find any invoice rows - make sure this is Jear's Weekly SOA export." };
  }
  return { rows };
}

export function parseJearPastedTable(raw: string): ParseResult {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "");

  if (lines.length === 0) {
    return { rows: [], error: "Nothing pasted." };
  }

  let rows: ParsedInvoiceRow[];
  if (lines.some((l) => l.includes("\t"))) {
    const grid = lines.map((l) => l.split("\t").map((c) => c.trim()));
    const startIdx = grid[0][0]?.toLowerCase() === "customer" ? 1 : 0;
    rows = grid
      .slice(startIdx)
      .filter((r) => r.some((c) => c !== ""))
      .map((cells) => jearRowFromCells(cells))
      .filter((r): r is ParsedInvoiceRow => r !== null);
  } else {
    const startIdx = lines[0].toLowerCase() === "customer" ? JEAR_COLUMNS.length : 0;
    const dataLines = lines.slice(startIdx);
    rows = [];
    for (let i = 0; i + JEAR_COLUMNS.length - 1 < dataLines.length; i += JEAR_COLUMNS.length) {
      const row = jearRowFromCells(dataLines.slice(i, i + JEAR_COLUMNS.length));
      if (row) rows.push(row);
    }
  }

  if (rows.length === 0) {
    return {
      rows: [],
      error: "Couldn't find any invoice rows - paste the whole emailed table, including its header row.",
    };
  }
  return { rows };
}

// PGTrans's own "Open Invoices" export (a QuickBooks-style report, pasted
// as tab-separated text - a spreadsheet .xls export copy-pastes the same
// way, no upload needed). Columns are fixed by position (Date, Type, No.,
// Customer, Memo, Amount, Status) rather than keyword-matched like
// parsePastedInvoices, since "No." doesn't contain either of that parser's
// invoice-number keywords ("inv", "bill") and would otherwise go
// unrecognized. There's no Customer PO column at all in this format.
const PGTRANS_COL = { date: 0, invoiceNo: 2, amount: 5 } as const;

export function parsePgtransPastedTable(raw: string): ParseResult {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l.trim() !== "");

  if (lines.length === 0) {
    return { rows: [], error: "Nothing pasted." };
  }

  const grid = lines.map((l) => l.split("\t"));
  // Skips the report's own "Type: All transactions Status: Open ..."
  // parameter line above the real header, wherever it appears.
  const headerIdx = grid.findIndex((r) => (r[0] ?? "").trim().toLowerCase() === "date");
  const dataRows = headerIdx >= 0 ? grid.slice(headerIdx + 1) : grid;

  const rows: ParsedInvoiceRow[] = dataRows
    .filter((r) => (r[PGTRANS_COL.date] ?? "").trim() !== "" && (r[PGTRANS_COL.invoiceNo] ?? "").trim() !== "")
    .map((r) => ({
      invoice_no: (r[PGTRANS_COL.invoiceNo] ?? "").trim(),
      invoice_date: parseUsDateToIso((r[PGTRANS_COL.date] ?? "").trim()),
      customer_po: "",
      amount: parseMoney(r[PGTRANS_COL.amount] ?? ""),
    }));

  if (rows.length === 0) {
    return {
      rows: [],
      error: "Couldn't find any invoice rows - paste the whole export, including its header row.",
    };
  }
  return { rows };
}

// AMP's ("A.M.P. Carriers, LLC") "A/R Aging QuickZoom" PDF - a QuickBooks
// report wide enough that printing it to PDF splits it across two pages:
// Type/Date/Num/P.O. #/Name/Aging on page 1, Open Balance alone on page 2,
// in the same row order. unpdf extracts both pages in normal reading order
// one after the other (verified directly against a real export - no column
// scrambling like DSV's PDF), so each invoice row is matched to its amount
// positionally: the Nth invoice line pairs with the Nth dollar amount after
// the "Open Balance" header. P.O. # is anchored the same way Griffith's is
// (against the literal "Harvest Best Inc" customer name) since it can
// itself contain a space, e.g. "34933 B".
const AMP_LINE_RE = /^Invoice\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+(\S+)\s+(.+?)\s+Harvest Best Inc\s+\d+\s*$/;

export function parseAmpPdfText(text: string): ParseResult {
  const lines = text.split(/\r?\n/).map((l) => l.trim());

  const invoiceRows = lines
    .map((line) => line.match(AMP_LINE_RE))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => ({
      invoice_no: m[2],
      invoice_date: parseUsDateToIso(m[1]),
      customer_po: m[3].trim(),
    }));

  if (invoiceRows.length === 0) {
    return { rows: [], error: "Couldn't find any invoice rows in this AMP statement - try pasting the text instead." };
  }

  const balanceHeaderIdx = lines.findIndex((l) => l === "Open Balance");
  if (balanceHeaderIdx === -1) {
    return {
      rows: [],
      error: "Couldn't find the Open Balance column in this AMP statement - try pasting the text instead.",
    };
  }
  const amounts = lines
    .slice(balanceHeaderIdx + 1)
    .filter((l) => /^[\d,]+\.\d{2}$/.test(l))
    .slice(0, invoiceRows.length)
    .map(parseMoney);

  if (amounts.length !== invoiceRows.length) {
    return {
      rows: [],
      error: "Couldn't match every invoice to an Open Balance amount - try pasting the text instead.",
    };
  }

  const rows: ParsedInvoiceRow[] = invoiceRows.map((r, i) => ({ ...r, amount: amounts[i] }));
  return { rows };
}

// Ali-Mat Logistics LLC's own statement PDF - unpdf extracts it in normal
// reading order, one row per line:
//   Date  "Invoice #NNNN: Due MM/DD/YYYY."  Amount  Open Amount
// The invoice number is embedded inside the Description text rather than
// its own column, and the due date repeated in that same text is dropped -
// neither is needed on this list. No Customer PO column exists in this
// format. Amount and Open Amount happen to always match on this statement,
// but Amount (the original invoiced amount) is read, same choice as
// Jerue's parser above.
const ALIMAT_LINE_RE =
  /^(\d{1,2}\/\d{1,2}\/\d{4})\s+Invoice #(\d+):\s+Due\s+\d{1,2}\/\d{1,2}\/\d{4}\.\s+([\d,]+\.\d{2})\s+[\d,]+\.\d{2}\s*$/;

function parseAlimatLine(rawLine: string): ParsedInvoiceRow | null {
  const m = rawLine.trim().match(ALIMAT_LINE_RE);
  if (!m) return null;
  const [, date, invoiceNo, amount] = m;
  return {
    invoice_no: invoiceNo,
    invoice_date: parseUsDateToIso(date),
    customer_po: "",
    amount: parseMoney(amount),
  };
}

export function parseAlimatPdfText(text: string): ParseResult {
  const rows = text
    .split(/\r?\n/)
    .map(parseAlimatLine)
    .filter((r): r is ParsedInvoiceRow => r !== null);

  if (rows.length === 0) {
    return { rows: [], error: "Couldn't find any invoice rows in this Ali-Mat statement - try pasting the text instead." };
  }
  return { rows };
}
