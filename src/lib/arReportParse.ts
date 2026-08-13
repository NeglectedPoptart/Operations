// Parses the "AR Aging Detail by Customer" export (a fixed ERP report,
// pasted as tab-separated text straight from Excel). Per customer it
// interleaves: a customer header row (code + name + credit limit + BB
// rating), one row per open invoice, a subtotal row, a blank separator, and
// a percentage-of-balance row. Only the customer header and invoice rows
// carry data this app cares about - subtotals/percentages/blanks, the
// title/parameters block, the grand Totals row, footnotes, and the GL
// reconciliation lines all get skipped automatically (see the row
// classification below).
//
// Column positions are fixed absolute tab-indices, verified directly
// against a real copy-paste of this report (not just its own header row -
// the "Doc." header label is actually one column to the right of where the
// real invoice number sits in every data row, so anchoring off the header
// text would silently misalign every other column by one).
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

const COL = {
  customerCode: 0,
  doc: 1,
  customerName: 5,
  po: 10,
  invoiceDate: 13,
  dueDate: 15,
  creditLimit: 17,
  docAmount: 20,
  bbRating: 23,
  balance: 24,
  flag: 27,
} as const;

function cell(cells: string[], index: number): string {
  return (cells[index] ?? "").trim();
}

function parseMoney(raw: string): number | null {
  const cleaned = raw.replace(/[$,]/g, "").trim();
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseUsDate(raw: string): string | null {
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  const [, mm, dd, yyyyRaw] = m;
  const yyyy = yyyyRaw.length === 2 ? `20${yyyyRaw}` : yyyyRaw;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

// "*" = partial credit applied; "t" = trouble claim pending; "T" = trouble
// claim posted (per the report's own footnote key) - independent signals
// that can combine on one line ("* T").
function parseFlag(raw: string): { hasPartialCredit: boolean; troubleStatus: "none" | "pending" | "posted" } {
  const hasPartialCredit = raw.includes("*");
  const troubleStatus = raw.includes("T") ? "posted" : raw.toLowerCase().includes("t") ? "pending" : "none";
  return { hasPartialCredit, troubleStatus };
}

export function parseArReportPaste(raw: string): ParseArReportResult {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim() !== "");

  const invoices: ParsedArInvoice[] = [];
  let currentCode = "";
  let currentName = "";
  let currentCreditLimit: number | null = null;
  let currentBbRating: string | null = null;

  for (const line of lines) {
    const cells = line.split("\t");
    const code = cell(cells, COL.customerCode);
    const doc = cell(cells, COL.doc);
    const name = cell(cells, COL.customerName);

    // A customer header row: a code with no doc# but a name alongside it -
    // every subtotal/percentage/blank/footer row in this report is missing
    // one or both of those, so this alone reliably tells them apart.
    if (code !== "" && doc === "" && name !== "") {
      currentCode = code;
      currentName = name;
      currentCreditLimit = parseMoney(cell(cells, COL.creditLimit));
      currentBbRating = cell(cells, COL.bbRating) || null;
      continue;
    }

    if (doc !== "" && currentCode !== "") {
      const { hasPartialCredit, troubleStatus } = parseFlag(cell(cells, COL.flag));
      invoices.push({
        customerCode: currentCode,
        customerName: currentName,
        creditLimit: currentCreditLimit,
        bbRating: currentBbRating,
        invoiceNo: doc,
        po: cell(cells, COL.po) || null,
        invoiceDate: parseUsDate(cell(cells, COL.invoiceDate)),
        dueDate: parseUsDate(cell(cells, COL.dueDate)),
        docAmount: parseMoney(cell(cells, COL.docAmount)),
        balance: parseMoney(cell(cells, COL.balance)) ?? 0,
        hasPartialCredit,
        troubleStatus,
      });
    }
  }

  if (invoices.length === 0) {
    return {
      invoices: [],
      error:
        "Couldn't find any invoice rows - make sure you copied the whole AR Aging Detail by Customer report, including the customer header rows.",
    };
  }

  return { invoices };
}
