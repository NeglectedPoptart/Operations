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
// The Slsprsn name can be one or more words, which would make fixed token
// positions unreliable in the middle of the line - so instead this anchors
// only on what's unambiguous: the first two tokens (CustPO, InvcAmt) and
// the last two (a money value glued directly against Ship Date, then Order
// No. alone) - whatever sits between them is never read.
function parseDsvLine(rawLine: string): ParsedInvoiceRow | null {
  const tokens = rawLine.trim().split(/\s+/);
  if (tokens.length < 4) return null;

  const orderNo = tokens[tokens.length - 1];
  if (!/^\d+$/.test(orderNo)) return null;

  const dateToken = tokens[tokens.length - 2];
  const dateMatch = dateToken.match(/(\d{1,2}\/\d{1,2}\/\d{4})$/);
  if (!dateMatch) return null;

  const amount = parseMoney(tokens[1]);
  if (amount === null) return null;

  return {
    invoice_no: orderNo,
    invoice_date: parseUsDateToIso(dateMatch[1]),
    customer_po: tokens[0],
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

// Jear emails an Excel table rather than a PDF - it has no invoice date at
// all, only a Due Date, so invoice_date is backed into as due date minus 30
// days (Jear's standard terms). Supports both a real tab-separated paste
// (Excel) and the flattened one-cell-per-line shape Outlook produces when
// copying an email's table (no tabs survive at all, just Customer/JEAR PO/
// Customer PO/Amount Due/Due Date/Days Past Due repeating in that fixed
// order) - whichever shape the pasted text is actually in.
const JEAR_COLUMNS = ["customer", "jearpo", "customerpo", "amountdue", "duedate", "dayspastdue"] as const;

function jearRowFromCells(cells: string[]): ParsedInvoiceRow | null {
  const [, jearPo, customerPo, amountDue, dueDate] = cells;
  if (!jearPo) return null;
  const dueIso = parseUsDateToIso(dueDate ?? "");
  return {
    invoice_no: jearPo.trim(),
    invoice_date: dueIso ? addDays(dueIso, -30) : null,
    customer_po: (customerPo ?? "").trim(),
    amount: parseMoney(amountDue ?? ""),
  };
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
      .map(jearRowFromCells)
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
