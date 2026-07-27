import type { Lane } from "./types";

// Parses the recurring lane-rate email: repeating blocks of
//   HUB NAME       (all caps - a new origin)
//   City
//   ST  $rate
//   City
//   ST  $rate
//   ...
// Header lines ("From"/"To"/"State") and blank rows are discarded naturally,
// since a line only becomes a result once it's a city immediately followed
// by a "$rate" line - anything else (a lone header word, a stray line) is
// just dropped as an orphaned pending city.
//
// One quirk: some all-caps destinations (e.g. "MD/PA" for a split-state pool
// load) look identical in casing to a hub name. Those are disambiguated by
// checking against destination cities already on file for any hub - so an
// all-caps line is only treated as a new hub if it isn't already a known
// destination city.
export interface ParsedRateLine {
  hub: string;
  city: string;
  state: string;
  rate: number;
}

function isAllCapsToken(s: string): boolean {
  return /[A-Z]/.test(s) && !/[a-z]/.test(s);
}

const STATE_RATE_RE = /^([A-Za-z/]+)\s*\$\s*([\d,]+(?:\.\d+)?)/;

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
    const rateMatch = line.match(STATE_RATE_RE);
    if (rateMatch) {
      if (pendingCity && currentHub) {
        results.push({
          hub: currentHub,
          city: pendingCity,
          state: rateMatch[1].toUpperCase(),
          rate: parseFloat(rateMatch[2].replace(/,/g, "")),
        });
      }
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
  destination: string;
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
    const destination = `${p.city}, ${p.state}`;
    const lane =
      lanes.find((l) => norm(l.from_hub) === norm(p.hub) && norm(l.destination) === norm(destination)) ?? null;
    return { ...p, destination, lane };
  });
}
