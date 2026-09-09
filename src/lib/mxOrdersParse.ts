import { addDays } from "./dates";

export interface ParsedMxOrderRow {
  customer: string;
  commodity: string;
  plu: string;
  size: string;
  coo: string;
  grade: string;
  qty: number | null;
  qty_unit: string;
  po_number: string;
  reference_number: string;
  loading_date: string | null;
  delivery_date: string | null;
  notes: string;
}

export interface ParseResult {
  rows: ParsedMxOrderRow[];
  error?: string;
}

// Customers that have a dedicated parser below. "other" has none - paste is
// disabled for it and rows are added by hand instead.
export const MX_ORDER_CUSTOMERS = [
  { value: "heb", label: "HEB" },
  { value: "houston_fruitland", label: "Houston Fruitland (Fiesta)" },
  { value: "jetro", label: "Jetro" },
  { value: "delfino", label: "Delfino" },
  { value: "other", label: "Other (no parser yet)" },
] as const;

export type MxOrderCustomer = (typeof MX_ORDER_CUSTOMERS)[number]["value"];

// Every customer here writes dates as bare M/D with no year. Assumes the
// current year, except when that would land more than ~60 days in the past
// (a January order pasted in December, say) - then it's next year instead.
// This is a small trucking company entering near-term orders, never
// something from last year.
function resolveMonthDay(mm: string, dd: string, todayIso: string): string {
  const today = new Date(`${todayIso}T00:00:00Z`);
  const year = today.getUTCFullYear();
  const candidate = `${year}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  const diffDays = (new Date(`${candidate}T00:00:00Z`).getTime() - today.getTime()) / 86400000;
  if (diffDays < -60) {
    return `${year + 1}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  return candidate;
}

function normalizeHeader(cell: string): string {
  return cell.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

// HEB: one line per order -----------------------------------------------------
// "Lettuce // Loading 9/13 - Delivery 9/14 // HEB P2609-038-482857 - HB# 35099"
const HEB_ROW_RE =
  /^(.+?)\s*\/\/\s*Loading\s+(\d{1,2})\/(\d{1,2})\s*-\s*Delivery\s+(\d{1,2})\/(\d{1,2})\s*\/\/\s*HEB\s+(\S+)\s*-\s*HB#\s*(\S+)\s*$/i;

function parseHeb(text: string, todayIso: string): ParseResult {
  const rows: ParsedMxOrderRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = trimmed.match(HEB_ROW_RE);
    if (!m) continue;
    const [, commodity, loadMM, loadDD, delMM, delDD, po, ref] = m;
    rows.push({
      customer: "HEB",
      commodity: commodity.trim(),
      plu: "",
      size: "",
      coo: "",
      grade: "",
      qty: null,
      qty_unit: "",
      po_number: po,
      reference_number: ref,
      loading_date: resolveMonthDay(loadMM, loadDD, todayIso),
      delivery_date: resolveMonthDay(delMM, delDD, todayIso),
      notes: "",
    });
  }
  if (rows.length === 0) {
    return {
      rows: [],
      error:
        'Couldn\'t find any HEB order lines - expected the "<Commodity> // Loading M/D - Delivery M/D // HEB <PO> - HB# <ref>" format.',
    };
  }
  return { rows };
}

// Houston Fruitland (Fiesta): a pasted Excel table, one column per delivery
// date -------------------------------------------------------------------
// Items / PLU / COO / SIZE / GRADE / EACH / SHIPPER / (blank) / <date columns...>
// A non-empty quantity cell under a date column becomes one order row for
// that item on that date. The blank column between SHIPPER and the first
// date is real in the source sheet, not a mistake - columns are found by
// header name, not fixed position, so it doesn't matter either way.
function parseHoustonFruitland(text: string, todayIso: string): ParseResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) {
    return { rows: [], error: "Couldn't find a header row and at least one item row." };
  }

  const header = lines[0].split("\t");
  const normalized = header.map(normalizeHeader);
  const idx = {
    items: normalized.indexOf("items"),
    plu: normalized.indexOf("plu"),
    coo: normalized.indexOf("coo"),
    size: normalized.indexOf("size"),
    grade: normalized.indexOf("grade"),
    each: normalized.indexOf("each"),
  };
  if (idx.items === -1) {
    return { rows: [], error: "Couldn't find an \"Items\" column - make sure you paste the header row too." };
  }

  // Date columns are whatever comes after the last fixed column, keyed by
  // header cell (day name is ignored - only the M/D actually matters).
  const fixedColsEnd = Math.max(idx.items, idx.plu, idx.coo, idx.size, idx.grade, idx.each) + 1;
  const dateColumns: { index: number; date: string }[] = [];
  for (let i = fixedColsEnd; i < header.length; i++) {
    const m = header[i].match(/(\d{1,2})\/(\d{1,2})/);
    if (m) dateColumns.push({ index: i, date: resolveMonthDay(m[1], m[2], todayIso) });
  }
  if (dateColumns.length === 0) {
    return { rows: [], error: "Couldn't find any date columns (e.g. \"Friday 9/11\") in the header row." };
  }

  const rows: ParsedMxOrderRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split("\t");
    const commodity = cells[idx.items]?.trim();
    if (!commodity) continue;
    for (const dc of dateColumns) {
      const raw = cells[dc.index]?.trim();
      if (!raw) continue;
      const qty = Number(raw.replace(/,/g, ""));
      if (!Number.isFinite(qty) || qty === 0) continue;
      rows.push({
        customer: "Houston Fruitland (Fiesta)",
        commodity,
        plu: idx.plu >= 0 ? (cells[idx.plu]?.trim() ?? "") : "",
        size: idx.size >= 0 ? (cells[idx.size]?.trim() ?? "") : "",
        coo: idx.coo >= 0 ? (cells[idx.coo]?.trim() ?? "") : "",
        grade: idx.grade >= 0 ? (cells[idx.grade]?.trim() ?? "") : "",
        qty,
        qty_unit: idx.each >= 0 ? (cells[idx.each]?.trim() ?? "") : "",
        po_number: "",
        reference_number: "",
        loading_date: null,
        delivery_date: dc.date,
        notes: "",
      });
    }
  }
  if (rows.length === 0) {
    return { rows: [], error: "Found the header row but no rows with a quantity under any date column." };
  }
  return { rows };
}

// Delfino: a header line naming one day, then one "<qty><unit> <commodity>"
// line per item ------------------------------------------------------------
// "Contract Items needed for Thursday" / "3p Broccoli" / "4p Celery"
const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

// Nearest occurrence of that weekday on or after today - "needed for
// Thursday" said on a Monday means the Thursday of that same week.
function nextWeekdayOnOrAfter(todayIso: string, weekdayName: string): string | null {
  const idx = WEEKDAY_INDEX[weekdayName.trim().toLowerCase()];
  if (idx === undefined) return null;
  const todayIdx = new Date(`${todayIso}T00:00:00Z`).getUTCDay();
  const diff = (idx - todayIdx + 7) % 7;
  return addDays(todayIso, diff);
}

const DELFINO_ITEM_RE = /^(\d+)\s*([a-zA-Z]*)\s+(.+)$/;

function parseDelfino(text: string, todayIso: string): ParseResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const headerLine = lines.find((l) => /needed for/i.test(l));
  const dayMatch = headerLine?.match(/needed for\s+(\w+)/i);
  const deliveryDate = dayMatch ? nextWeekdayOnOrAfter(todayIso, dayMatch[1]) : null;

  const rows: ParsedMxOrderRow[] = [];
  for (const line of lines) {
    if (line === headerLine) continue;
    const m = line.match(DELFINO_ITEM_RE);
    if (!m) continue;
    const [, qty, unit, commodity] = m;
    rows.push({
      customer: "Delfino",
      commodity: commodity.trim(),
      plu: "",
      size: "",
      coo: "",
      grade: "",
      qty: Number(qty),
      qty_unit: unit || "",
      po_number: "",
      reference_number: "",
      loading_date: null,
      delivery_date: deliveryDate,
      notes: "",
    });
  }
  if (rows.length === 0) {
    return {
      rows: [],
      error: 'Couldn\'t find any item lines - expected "<qty><unit> <commodity>" lines, e.g. "3p Broccoli".',
    };
  }
  return { rows };
}

// Jetro: genuinely free-form prose, e.g. "Load of 24ct cello iceberg for
// Sunday arrival 9/13 or 600 Liner iceberg 24ct needed and 2 pallets of
// Green leaf - Monday loading 9/14" - there's no reliable way to pull
// quantity/size/commodity out of a sentence like that (an "or" can mean two
// alternative asks for the SAME load, not two separate ones). Rather than
// guess wrong silently, this only splits the message into one candidate row
// per " and "-joined clause and pulls out a date (tagged loading vs.
// delivery/arrival by whichever keyword sits closer to it) - the rest of the
// clause is kept verbatim as the commodity/description for the user to
// clean up by hand. Always review every Jetro row before confirming.
function parseJetro(text: string, todayIso: string): ParseResult {
  const clauses = text
    .split(/\s+and\s+/i)
    .map((c) => c.trim())
    .filter(Boolean);

  const rows: ParsedMxOrderRow[] = clauses.map((clause) => {
    const dateMatch = clause.match(/(\d{1,2})\/(\d{1,2})/);
    const date = dateMatch ? resolveMonthDay(dateMatch[1], dateMatch[2], todayIso) : null;

    let loadingDate: string | null = null;
    let deliveryDate: string | null = null;
    if (date && dateMatch) {
      const loadingIdx = clause.toLowerCase().lastIndexOf("load", dateMatch.index);
      const arrivalIdx = Math.max(
        clause.toLowerCase().lastIndexOf("arrival", dateMatch.index),
        clause.toLowerCase().lastIndexOf("delivery", dateMatch.index),
      );
      if (loadingIdx > arrivalIdx) loadingDate = date;
      else deliveryDate = date;
    }

    return {
      customer: "Jetro",
      commodity: clause,
      plu: "",
      size: "",
      coo: "",
      grade: "",
      qty: null,
      qty_unit: "",
      po_number: "",
      reference_number: "",
      loading_date: loadingDate,
      delivery_date: deliveryDate,
      notes: "Auto-split from free text - check quantity/size and clean up the description.",
    };
  });

  if (rows.length === 0) {
    return { rows: [], error: "Nothing pasted." };
  }
  return { rows };
}

export function parseMxOrderText(customer: MxOrderCustomer, text: string, todayIso: string): ParseResult {
  switch (customer) {
    case "heb":
      return parseHeb(text, todayIso);
    case "houston_fruitland":
      return parseHoustonFruitland(text, todayIso);
    case "delfino":
      return parseDelfino(text, todayIso);
    case "jetro":
      return parseJetro(text, todayIso);
    case "other":
      return { rows: [], error: "No automatic format for this customer yet - use + Add Row instead." };
  }
}
