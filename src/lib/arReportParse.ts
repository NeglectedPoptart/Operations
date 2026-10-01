// Parses the "AR Aging Detail by Customer" PDF export. Per customer it
// interleaves: a customer header line (code + name + credit limit), one
// line per open invoice, a subtotal line, and a percentage-of-balance line.
// Only the customer header and invoice lines carry data this app cares
// about - subtotals/percentages, the title/parameters block, the grand
// Totals line, footnotes, and the GL reconciliation lines all get skipped.
//
// unpdf extracts this report with columns glued back together wherever two
// cells happen to have zero visual gap between them (the same quirk as
// every other ERP PDF export in this app - see buyersListParse.ts/
// pasFilesParse.ts) - reverse-engineered against a real export and verified
// by summing every parsed invoice's balance against the report's own
// "Totals [USD]" line (they match to the cent).
export interface ParsedArInvoice {
  customerCode: string;
  customerName: string;
  creditLimit: number | null;
  bbRating: string | null;
  invoiceNo: string;
  po: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  docAmount: number | null;
  balance: number;
  hasPartialCredit: boolean;
  troubleStatus: "none" | "pending" | "posted";
}

export interface ParseArReportResult {
  invoices: ParsedArInvoice[];
  error?: string;
}

function parseMoney(raw: string): number {
  return Number(raw.replace(/,/g, ""));
}

function parseUsDate(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  const [, mm, dd, yyyyRaw] = m;
  const yyyy = yyyyRaw.length === 2 ? `20${yyyyRaw}` : yyyyRaw;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

// "*" = partial credit applied; "t" = trouble claim pending; "T" = trouble
// claim posted (per the report's own footnote key) - independent signals
// that can combine on one line.
function parseFlags(raw: string): { hasPartialCredit: boolean; troubleStatus: "none" | "pending" | "posted" } {
  const hasPartialCredit = raw.includes("*");
  const troubleStatus = raw.includes("T") ? "posted" : raw.toLowerCase().includes("t") ? "pending" : "none";
  return { hasPartialCredit, troubleStatus };
}

const NON_DATA_LINE_RE =
  /^(ARAging:|AR Aging Detail|tcamph|Harvest Best|Customer$|1 - 20|Credit Limit|Doc\. Amount|BB Rating|Due$|USDCurrency|Currency:\s*USD|Totals\b|GL vs AR|GL balance|\* = Document|t = Trouble)/;
const PAGE_NUMBER_RE = /^\d+\/\d+$/;
const PERCENT_ROW_RE = /^-?\d+\.\d+%/;
// A subtotal line starts directly with a money figure (no leading word
// token) - every real data line (invoice or customer header) starts with a
// non-numeric token instead.
const SUBTOTAL_ROW_RE = /^-?[\d,]+\.\d{2}(\s|$)/;

// Doc Amount, Balance, Current, 1-20, 21-40, 41-60 come through as 6 plainly
// space-separated numbers; the 61-+ bucket is always glued directly to the
// invoice date with no separator (verified against a real export - this
// glue is 100% consistent regardless of the date's own digits), and
// whatever follows (PO, optional flags, due date) is free-form text handled
// separately by parseInvoiceTail since PO can itself contain spaces (e.g.
// "THU 385188").
const INVOICE_LINE_RE =
  /^(\S+)\s+([\d,]+\.\d{2})\s+(-?[\d,]+\.\d{2})\s+(-?[\d,]+\.\d{2})\s+(-?[\d,]+\.\d{2})\s+(-?[\d,]+\.\d{2})\s+(-?[\d,]+\.\d{2})\s+(-?[\d,]+\.\d{2})(\d{1,2}\/\d{1,2}\/\d{4})(.*)$/;

// Splits the tail into PO + flags + Due Date. PO is free text that can
// itself contain spaces, so this works backward from the end instead of
// forward: the trailing date is always the Due Date, then up to two single-
// character flag tokens ("*", "t", "T") immediately before it are peeled
// off, and whatever's left is the PO.
function parseInvoiceTail(tail: string): { po: string | null; dueDate: string | null; flags: string } {
  const trimmed = tail.trim();
  const dateMatch = trimmed.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s*$/);
  if (!dateMatch) return { po: trimmed || null, dueDate: null, flags: "" };

  const dueDate = dateMatch[1];
  const tokens = trimmed
    .slice(0, dateMatch.index)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const flags: string[] = [];
  while (tokens.length > 0 && /^(\*|[tT])$/.test(tokens[tokens.length - 1])) {
    flags.unshift(tokens.pop()!);
  }
  return { po: tokens.join(" ") || null, dueDate, flags: flags.join("") };
}

// A multi-letter all-caps code glued directly to a Title-Case name with no
// space at all (a rare PDF-extraction quirk - happens when the code text
// spans the full column width, leaving no visual gap before the name) -
// split right before the capital that starts the new word. A single
// leading capital (ordinary Title Case, e.g. a code that's just
// "Northstar") must NOT trigger this, so it requires at least 2 consecutive
// uppercase letters immediately before the lowercase one.
function splitGluedCustomerCode(token: string): { code: string; name: string } | null {
  for (let i = 1; i < token.length - 1; i++) {
    if (/[A-Z]/.test(token[i]) && /[A-Z]/.test(token[i - 1]) && /[a-z]/.test(token[i + 1])) {
      return { code: token.slice(0, i), name: token.slice(i) };
    }
  }
  return null;
}

// Credit limit, when present, is glued directly to the customer name with
// no separator but is unambiguous (a fixed money format) and anchors the
// split reliably regardless of the code's own casing. Without a credit
// limit, a real space between code and name is the normal case; only when
// neither is present (see splitGluedCustomerCode) does the Title-Case
// fallback kick in.
function parseCustomerHeader(line: string): { code: string; name: string; creditLimit: number | null } {
  const withLimit = line.match(/^(\S+)\s+([\d,]+\.\d{2})(.+)$/);
  if (withLimit) {
    return { code: withLimit[1], creditLimit: parseMoney(withLimit[2]), name: withLimit[3].trim() };
  }

  const spaceIdx = line.indexOf(" ");
  const firstToken = spaceIdx === -1 ? line : line.slice(0, spaceIdx);
  const restOfLine = spaceIdx === -1 ? "" : line.slice(spaceIdx + 1).trim();
  const glued = splitGluedCustomerCode(firstToken);
  if (glued) {
    return { code: glued.code, creditLimit: null, name: `${glued.name} ${restOfLine}`.trim() };
  }
  return { code: firstToken, creditLimit: null, name: restOfLine };
}

export function parsePdfArReport(raw: string): ParseArReportResult {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "");

  const invoices: ParsedArInvoice[] = [];
  let currentCode = "";
  let currentName = "";
  let currentCreditLimit: number | null = null;

  for (const line of lines) {
    if (NON_DATA_LINE_RE.test(line) || PAGE_NUMBER_RE.test(line) || PERCENT_ROW_RE.test(line)) continue;

    if (line.startsWith("I-")) {
      const m = line.match(INVOICE_LINE_RE);
      if (!m || currentCode === "") continue;
      const [, docNo, docAmount, balance, , , , , b4plus, invDate, tail] = m;
      const { po, dueDate, flags } = parseInvoiceTail(tail);
      const { hasPartialCredit, troubleStatus } = parseFlags(flags);
      invoices.push({
        customerCode: currentCode,
        customerName: currentName,
        creditLimit: currentCreditLimit,
        // Never seen populated in a real export (always blank under "BB
        // Rating") - no real sample to reverse-engineer its position from.
        bbRating: null,
        invoiceNo: docNo,
        po,
        invoiceDate: parseUsDate(invDate),
        dueDate: parseUsDate(dueDate),
        docAmount: parseMoney(docAmount),
        balance: parseMoney(balance),
        hasPartialCredit,
        troubleStatus,
      });
      continue;
    }

    if (SUBTOTAL_ROW_RE.test(line)) continue;

    const header = parseCustomerHeader(line);
    currentCode = header.code;
    currentName = header.name;
    currentCreditLimit = header.creditLimit;
  }

  if (invoices.length === 0) {
    return {
      invoices: [],
      error: "Couldn't find any invoice rows in this PDF - make sure it's the \"AR Aging Detail by Customer\" export.",
    };
  }

  return { invoices };
}
