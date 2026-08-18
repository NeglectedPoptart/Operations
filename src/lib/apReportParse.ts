// Parses a paste of the "Accrued Payables by Document" report - grouped by
// GL Account header lines ("GL Account: 230-005 : Acc Payables - Purchase
// Product"), each followed by data rows, then a "Total  for GL Account: ..."
// line (note the double space, straight from the report) and a blank
// spacer before the next group. Column positions below were verified
// against a real clipboard copy of the report, not just guessed from the
// visible header labels - Excel pads merged header cells with extra blank
// columns that don't line up 1:1 with what you'd expect from the labels.
export interface ParsedApPayable {
  vendorCode: string;
  vendorName: string;
  glAccountCode: string;
  glAccountLabel: string;
  docDate: string | null;
  type: string;
  concept: string;
  document: string;
  balance: number;
}

export interface ParseApReportResult {
  payables: ParsedApPayable[];
  error?: string;
}

const COL = {
  date: 3,
  type: 6,
  concept: 9,
  document: 12,
  vendorCode: 14,
  vendorName: 16,
  balance: 23,
};

function cell(cells: string[], i: number): string {
  return (cells[i] ?? "").trim();
}

function parseDate(raw: string): string | null {
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

function parseMoney(raw: string): number | null {
  const cleaned = raw.replace(/[$,]/g, "").trim();
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return isNaN(n) ? null : n;
}

export function parseApReportPaste(raw: string): ParseApReportResult {
  const lines = raw.split(/\r?\n/);
  const payables: ParsedApPayable[] = [];
  let glAccountCode = "";
  let glAccountLabel = "";

  for (const line of lines) {
    if (line.trim() === "") continue;
    const cells = line.split("\t");
    const first = cell(cells, 0);

    if (first.startsWith("GL Account:")) {
      const rest = first.slice("GL Account:".length).trim();
      const sepIdx = rest.indexOf(" : ");
      if (sepIdx >= 0) {
        glAccountCode = rest.slice(0, sepIdx).trim();
        glAccountLabel = rest.slice(sepIdx + 3).trim();
      } else {
        glAccountCode = rest;
        glAccountLabel = "";
      }
      continue;
    }

    // Total-for-group and grand-total lines have every data column blank
    // (document/vendor code included), so they're filtered out below along
    // with the report's title/parameter header lines - no special-casing
    // needed for them specifically.
    const document = cell(cells, COL.document);
    const vendorCode = cell(cells, COL.vendorCode);
    if (!document || !vendorCode) continue;

    const balance = parseMoney(cell(cells, COL.balance));
    if (balance === null) continue;

    // Only purchase-product payables belong here - the report also mixes
    // in AR - Sales rows under other GL accounts, which aren't payables at
    // all and shouldn't show up on this page.
    if (!/purchase product/i.test(glAccountLabel)) continue;

    payables.push({
      vendorCode,
      vendorName: cell(cells, COL.vendorName),
      glAccountCode,
      glAccountLabel,
      docDate: parseDate(cell(cells, COL.date)),
      type: cell(cells, COL.type),
      concept: cell(cells, COL.concept),
      document,
      balance,
    });
  }

  if (payables.length === 0) {
    return { payables: [], error: "Couldn't find any payable rows - check that you pasted the whole report." };
  }
  return { payables };
}
