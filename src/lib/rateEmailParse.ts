import type { Lane } from "./types";

// Parses pasted lane/rate text from a broker's pricing email - three input
// shapes are supported, auto-detected line by line:
//
//  A) The original recurring block format:
//       HUB NAME       (all caps - starts a new origin)
//       City
//       ST  $rate
//       City
//       ST  $rate
//  B) A same-line variant of A, one lane per line under a hub header:
//       HUB NAME
//       City ST: $rate
//       City ST $rate
//  C) A tab-separated table with an explicit hub per row (e.g. copy-pasted
//     straight from this app's own Route Averages table):
//       Source City<TAB>Destination<TAB>Rate
//       Pharr, TX<TAB>Chicago, IL<TAB>$4,300
//     Rows with no rate (blank third column) are skipped - nothing to
//     apply. The destination column is kept whole rather than split into
//     city/state, since multi-drop labels like "Houston, TX (2 Drop)" or
//     "Jessup, MD & Bronx, NY" aren't a single city/state pair.
//
// Header lines ("From"/"To"/"State"/"Source City") and blank rows are
// discarded naturally - a line only ever becomes a result once it matches
// one of the three shapes above.
//
// One quirk (format A/B): some all-caps destinations (e.g. "MD/PA" for a
// split-state pool load) look identical in casing to a hub name. Those are
// disambiguated by checking against destination cities already on file for
// any hub - so an all-caps line is only treated as a new hub if it isn't
// already a known destination city.
export interface ParsedRateLine {
  hub: string;
  destination: string;
  rate: number;
}

function isAllCapsToken(s: string): boolean {
  return /[A-Z]/.test(s) && !/[a-z]/.test(s);
}

// Format A's second line: just a state code (or "MD/PA" style split) then
// $rate, nothing else.
const STATE_ONLY_RATE_RE = /^([A-Za-z/]+)\s*\$\s*([\d,]+(?:\.\d+)?)\s*$/;

// Format B: "City ST: $rate" or "City ST $rate" all on one line - the city
// is whatever's left once a trailing "<2-letter state> <$rate>" is peeled
// off (non-greedy + backtracking handles multi-word cities like "South
// Plainfield" correctly, since the state/rate suffix has to match in full).
const CITY_STATE_RATE_RE = /^(.+?)\s+([A-Za-z]{2})\s*:?\s*\$\s*([\d,]+(?:\.\d+)?)\s*$/;

// Format C's hub column always looks like "City, ST" - used both to split
// out the hub and to reject non-data rows (a "Source City" header has no
// comma, so it never matches and is left for the caller to skip).
const HUB_PREFIX_RE = /^([A-Za-z .]+,\s*[A-Za-z]{2})\s*(.+)$/;
const HUB_SHAPE_RE = /^[A-Za-z .]+,\s*[A-Za-z]{2}$/;
const TRAILING_RATE_RE = /\$\s*([\d,]+(?:\.\d+)?)\s*$/;

function parseTableRow(line: string): ParsedRateLine | null {
  let hub: string;
  let rest: string;
  if (line.includes("\t")) {
    const parts = line.split("\t");
    hub = parts[0].trim();
    rest = parts.slice(1).join(" ").trim();
  } else {
    const m = line.match(HUB_PREFIX_RE);
    if (!m) return null;
    hub = m[1].trim();
    rest = m[2].trim();
  }
  if (!HUB_SHAPE_RE.test(hub) || !rest) return null;

  const rateMatch = rest.match(TRAILING_RATE_RE);
  if (!rateMatch || rateMatch.index === undefined) return null; // no rate on this row - nothing to apply
  const destination = rest.slice(0, rateMatch.index).trim();
  if (!destination) return null;

  return { hub, destination, rate: parseFloat(rateMatch[1].replace(/,/g, "")) };
}

export function parseRateEmail(raw: string, existingLanes: Lane[]): ParsedRateLine[] {
  const knownDestinationCities = new Set(
    existingLanes.map((l) => l.destination.split(",")[0].trim().toUpperCase()),
  );

  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const results: ParsedRateLine[] = [];
  let currentHub = "";
  let pendingCity: string | null = null;

  for (const line of lines) {
    const tableRow = parseTableRow(line);
    if (tableRow) {
      results.push(tableRow);
      pendingCity = null;
      continue;
    }

    const stateRateMatch = line.match(STATE_ONLY_RATE_RE);
    if (stateRateMatch) {
      if (pendingCity && currentHub) {
        results.push({
          hub: currentHub,
          destination: `${pendingCity}, ${stateRateMatch[1].toUpperCase()}`,
          rate: parseFloat(stateRateMatch[2].replace(/,/g, "")),
        });
      }
      pendingCity = null;
      continue;
    }

    const cityStateRateMatch = line.match(CITY_STATE_RATE_RE);
    if (cityStateRateMatch && currentHub) {
      results.push({
        hub: currentHub,
        destination: `${cityStateRateMatch[1].trim()}, ${cityStateRateMatch[2].toUpperCase()}`,
        rate: parseFloat(cityStateRateMatch[3].replace(/,/g, "")),
      });
      pendingCity = null;
      continue;
    }

    if (isAllCapsToken(line) && !knownDestinationCities.has(line.toUpperCase())) {
      currentHub = line;
      pendingCity = null;
    } else {
      pendingCity = line;
    }
  }

  return results;
}

export interface MatchedRateLine extends ParsedRateLine {
  lane: Lane | null;
}

function norm(s: string): string {
  return s.trim().toUpperCase();
}

// Matches each parsed line to an existing lane (case/whitespace-insensitive
// on both hub and destination); a line with no match will need a new lane
// created for it before its rate can be saved.
export function matchRateLines(parsed: ParsedRateLine[], lanes: Lane[]): MatchedRateLine[] {
  return parsed.map((p) => {
    const lane =
      lanes.find((l) => norm(l.from_hub) === norm(p.hub) && norm(l.destination) === norm(p.destination)) ?? null;
    return { ...p, lane };
  });
}
