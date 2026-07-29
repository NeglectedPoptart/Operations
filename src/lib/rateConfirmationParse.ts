// Parses the plain-text layer of Harvest Best's own outbound "Freight
// Confirmation" PDF (the rate confirmation sent to carriers) into the fields
// needed to pre-fill a new Board load. This is NOT a generic PDF parser - the
// user confirmed this one template is always used, but the underlying PDF
// text extraction still comes out of visual reading order (labels and values
// land in whatever order the PDF's source document drew them in, not the
// order they're printed on the page). Every field below is anchored to a
// fixed, always-present piece of template text specifically because of that -
// never to "the Nth value after some other field", which broke immediately
// when checked against a real extraction. See ParsedRateConfirmation.notes
// for what's deliberately left out because it can't be anchored reliably.
export interface ParsedRateConfirmation {
  orderNumber: string | null;
  poNumber: string | null;
  brokerName: string | null;
  clientName: string | null;
  destinationZip: string | null;
  source: string | null;
  loadingDate: string | null;
  deliveryDate: string | null;
  rate: number | null;
  notes: string | null;
  appointment: string | null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isoDate(month: string, day: string, year: string): string {
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

const DAY_ABBREVIATIONS = new Set([
  "mon", "tue", "tues", "wed", "thu", "thur", "thurs", "fri", "sat", "sun",
]);

// "Delivery PO #: SAT 342236" -> the day-of-week is just noting when it's
// due, not part of the PO itself - "342236" is the actual number.
function stripLeadingDayAbbreviation(value: string): string {
  const parts = value.trim().split(/\s+/);
  if (parts.length > 1 && DAY_ABBREVIATIONS.has(parts[0].toLowerCase().replace(/\.$/, ""))) {
    return parts.slice(1).join(" ");
  }
  return value.trim();
}

export function parseRateConfirmationText(text: string, knownHubs: string[] = []): ParsedRateConfirmation {
  const normalized = text.replace(/\r\n/g, "\n");

  const orderNumber = normalized.match(/Sales Order #:\s*(\S+)/)?.[1]?.replace(/^0+(?=\d)/, "") ?? null;
  const rawPoNumber = normalized.match(/Delivery PO #:\s*([^\n]+)/)?.[1]?.trim() ?? null;
  const poNumber = rawPoNumber ? stripLeadingDayAbbreviation(rawPoNumber) : null;

  let brokerName: string | null = null;
  const brokerBlock = normalized.match(/Truck Driver Phone #:\s*\n([\s\S]*?)\nShip To:/);
  if (brokerBlock) {
    const lines = brokerBlock[1].split("\n").map((l) => l.trim()).filter(Boolean);
    brokerName = lines.find((l) => !l.startsWith("(")) ?? null;
  }

  // Cut off before "Carrier Acceptance" so the Freight Rate match (and the
  // date scan below) can't pick up the $1,000,000/$100,000 insurance figures
  // or any stray text further down in the Terms & Conditions.
  const acceptanceIdx = normalized.indexOf("Carrier Acceptance");
  const bodyText = acceptanceIdx === -1 ? normalized : normalized.slice(0, acceptanceIdx);

  const rateMatch = bodyText.match(/\$[\d,]+(?:\.\d{2})?/);
  const rate = rateMatch ? Number(rateMatch[0].replace(/[$,]/g, "")) : null;

  let clientName: string | null = null;
  let destinationZip: string | null = null;
  if (rateMatch && rateMatch.index !== undefined) {
    const afterRate = normalized.slice(rateMatch.index + rateMatch[0].length);
    const sendInvoiceIdx = afterRate.indexOf("Send Invoice To:");
    const shipToBlock = sendInvoiceIdx === -1 ? afterRate : afterRate.slice(0, sendInvoiceIdx);
    const lines = shipToBlock.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length > 0) {
      clientName = lines[0];
      destinationZip = lines.slice(1).join(" ").match(/\b(\d{5})(?:-\d{4})?\b/)?.[1] ?? null;
    }
  }

  // Order Date <= Pick up Date <= Delivery Date always holds for a real load,
  // so sorting whatever M/D/YYYY dates appear (rather than trusting their
  // position in the jumbled text) reliably picks out Pick up/Delivery as the
  // middle/last one - stable even though Delivery Date's value lands nowhere
  // near its own label in the raw extraction.
  const dateMatches = [...bodyText.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g)];
  const isoDates = Array.from(new Set(dateMatches.map((m) => isoDate(m[1], m[2], m[3])))).sort();
  const loadingDate = isoDates.length >= 2 ? isoDates[isoDates.length - 2] : (isoDates[0] ?? null);
  const deliveryDate = isoDates.length >= 1 ? isoDates[isoDates.length - 1] : null;

  const source =
    knownHubs.find((hub) => {
      const city = hub.split(",")[0]?.trim();
      return city ? new RegExp(`\\b${escapeRegExp(city)}\\b`, "i").test(normalized) : false;
    }) ?? null;

  // The "Instructions:" label is directly adjacent to the load-specific
  // handling notes (Temp, delivery day/time, etc.) and "Order #" always
  // follows right after - unlike everything else on this template, this
  // block's own content never gets split up in the extraction. A separate,
  // always-identical boilerplate paragraph ("Wash out & pre-cool...",
  // "Driver Must Call...", the carrier-notify legal sentence) lives
  // elsewhere in the stream and is deliberately NOT captured here - it's the
  // same on every rate confirmation and isn't load-specific.
  const instructionsBlock = normalized.match(/Instructions:\s*\n([\s\S]*?)\nOrder #/)?.[1] ?? "";
  const noteLines = instructionsBlock
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const notes = noteLines.length > 0 ? noteLines.join("\n") : null;

  // A delivery appointment is often noted here as "Delivery <day/date> -
  // <time>" rather than filled into the template's own (always blank)
  // "Appointment Time:" field - pull the trailing time back out as the
  // appointment value.
  const appointment =
    instructionsBlock.match(/Delivery[^\n]*?(\d{1,4}(?::\d{2})?\s*(?:am|pm))/i)?.[1]?.toLowerCase() ?? null;

  return {
    orderNumber,
    poNumber,
    brokerName,
    clientName,
    destinationZip,
    source,
    loadingDate,
    deliveryDate,
    rate,
    notes,
    appointment,
  };
}
