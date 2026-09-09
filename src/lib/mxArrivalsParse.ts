import type { MxArrivalDay, MxArrivalSection } from "./types";

export interface ParsedMxArrivalRow {
  section: MxArrivalSection;
  growerName: string;
  contact: string;
  state: string;
  labelName: string;
  commodityNames: string[];
  boxesApprox: string;
  priceToGrower: string;
  manifesto: string;
  arrivalDay: MxArrivalDay | null;
  notes: string;
}

export interface ParseResult {
  rows: ParsedMxArrivalRow[];
  error?: string;
}

function normalizeHeader(cell: string): string {
  return cell.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findColumn(header: string[], prefix: string): number {
  const normalizedPrefix = normalizeHeader(prefix);
  return header.findIndex((cell) => cell.startsWith(normalizedPrefix));
}

// The sheet's own section banners, matched loosely since "Bell Peppers / Hot
// Peppers / Tomatillos / Cucumbers" and "Celery / Cauliflower / Carrots /
// Other" are long and could be reworded slightly between weeks.
function matchSection(label: string): MxArrivalSection | null {
  const norm = label.trim().toUpperCase();
  if (norm === "LETTUCE") return "lettuce";
  if (norm === "BROCCOLI") return "broccoli";
  if (norm.includes("PEPPER")) return "peppers_hothouse";
  if (norm.includes("CELERY")) return "celery_carrots_cauliflower";
  return null;
}

const ARRIVAL_DAY_VALUES: MxArrivalDay[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

// The sheet sometimes books a load across two days ("SATURDAY / SUNDAY",
// "THURSDAY / FRIDAY") - the app can only hold one arrival_day per row, so we
// take the first day and keep the original combined text as a note instead
// of silently dropping half of it.
function parseArrivalDay(raw: string): { day: MxArrivalDay | null; extra: string | null } {
  const trimmed = raw.trim();
  if (!trimmed) return { day: null, extra: null };
  const parts = trimmed.split("/").map((p) => p.trim());
  const day = ARRIVAL_DAY_VALUES.find((d) => d === parts[0].toLowerCase()) ?? null;
  const extra = parts.length > 1 ? `Arrival: ${trimmed}` : null;
  return { day, extra };
}

// The sheet has three columns (Sale Price, PO #, Customer) that the Arrivals
// table has no field for - rather than lose them on import, they're folded
// into Notes as labeled fragments alongside whatever was actually typed in
// the Notes column itself.
function buildNotes(rawNotes: string, extras: (string | null)[]): string {
  return [rawNotes.trim(), ...extras.filter((e): e is string => Boolean(e))].filter(Boolean).join(" - ");
}

interface ColumnIndex {
  grower: number;
  contact: number;
  state: number;
  label: number;
  commodity: number;
  aprox: number;
  priceToGrower: number;
  salePrice: number;
  po: number;
  manifesto: number;
  arrivalBooking: number;
  notes: number;
  customer: number;
}

// unpdf/paste both aside, this is a straight Excel paste (real tab
// separators, no column-order scrambling) - the only quirks are that it's
// FOUR reports stacked in one paste (one per commodity section, each with
// its own repeated "LOADS ..." header row) and that "Bx's Aprox" becomes
// "Pallets Aprox" on the Bell Peppers/Hot House section only - matched here
// by the word "Aprox" alone, shared by both spellings.
export function parsePastedMxArrivals(text: string): ParseResult {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+$/, ""));

  let currentSection: MxArrivalSection | null = null;
  let idx: ColumnIndex | null = null;
  const rows: ParsedMxArrivalRow[] = [];

  for (const line of lines) {
    if (line.trim() === "") continue;
    const cells = line.split("\t");
    const firstCell = cells[0].trim();

    const section = matchSection(firstCell);
    if (section) {
      currentSection = section;
      idx = null;
      continue;
    }

    if (normalizeHeader(firstCell) === "loads") {
      const header = cells.map(normalizeHeader);
      idx = {
        grower: findColumn(header, "growercompany"),
        contact: findColumn(header, "contact"),
        state: findColumn(header, "state"),
        label: findColumn(header, "label"),
        commodity: findColumn(header, "commodity"),
        aprox: header.findIndex((h) => h.includes("aprox")),
        priceToGrower: findColumn(header, "pricetogrower"),
        salePrice: findColumn(header, "saleprice"),
        po: findColumn(header, "po"),
        manifesto: findColumn(header, "manifiesto"),
        arrivalBooking: findColumn(header, "arrivalbooking"),
        notes: findColumn(header, "notes"),
        customer: findColumn(header, "customer"),
      };
      continue;
    }

    // A row's LOADS cell is just a running sequence number - not read for
    // anything, just used (via this check) to tell a real data row apart
    // from a stray blank/spacer line.
    if (!currentSection || !idx || !/^\d+$/.test(firstCell)) continue;

    const cell = (i: number) => (i >= 0 ? (cells[i] ?? "").trim() : "");

    const growerName = cell(idx.grower);
    if (!growerName) continue;

    // Multiple commodities riding one truck are written as one cell joined
    // by "/" (e.g. "Broccoli #1 / #2") - matches the app's own multi-slot
    // commodity design (up to 4 per row) for exactly this case. A part after
    // the first that doesn't start with a letter (e.g. "#2") is shorthand
    // for "<same commodity> #2", not a standalone commodity name, so it
    // borrows the first part's leading word.
    const commodityParts = cell(idx.commodity)
      .split("/")
      .map((c) => c.trim())
      .filter(Boolean);
    const commodityLead = commodityParts[0]?.split(/\s+/)[0] ?? "";
    const commodityNames = commodityParts
      .map((c, i) => (i > 0 && /^[^A-Za-z]/.test(c) ? `${commodityLead} ${c}` : c))
      .slice(0, 4);

    const boxesRaw = cell(idx.aprox);
    const boxesApprox = boxesRaw && currentSection === "peppers_hothouse" ? `${boxesRaw} pallets` : boxesRaw;

    const { day, extra: dayExtra } = parseArrivalDay(cell(idx.arrivalBooking));
    const customer = cell(idx.customer);
    const salePrice = cell(idx.salePrice);
    const po = cell(idx.po);

    rows.push({
      section: currentSection,
      growerName,
      contact: cell(idx.contact),
      state: cell(idx.state),
      labelName: cell(idx.label),
      commodityNames,
      boxesApprox,
      priceToGrower: cell(idx.priceToGrower),
      manifesto: cell(idx.manifesto),
      arrivalDay: day,
      notes: buildNotes(cell(idx.notes), [
        dayExtra,
        customer ? `Customer: ${customer}` : null,
        salePrice ? `Sale Price: ${salePrice}` : null,
        po ? `PO#: ${po}` : null,
      ]),
    });
  }

  if (rows.length === 0) {
    return {
      rows: [],
      error:
        "Couldn't find any arrival rows - make sure you paste the full report, including each section's name (Lettuce, Broccoli, ...) and its own LOADS header row.",
    };
  }
  return { rows };
}
