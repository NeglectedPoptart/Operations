import { destinationLabel, normalizeForMatch } from "@/lib/laneLabel";
import type { Lane } from "@/lib/types";

export interface BookedStat {
  count: number;
  avgRate: number;
}

interface LoadForBookedStats {
  source: string | null;
  rate: number | null;
  loading_date: string | null;
  load_stops: { destination_city: string | null; destination_state: string | null; position: number }[];
}

// Matches each load to the lane it corresponds to (same label-building logic
// used for lane auto-creation, see src/lib/laneLabel.ts) and returns how many
// loads booked against that lane this week, and their average total rate.
export function computeBookedStatsByLane(
  loads: LoadForBookedStats[],
  lanes: Lane[],
  weekStart: string,
  weekEndDate: string,
): Map<string, BookedStat> {
  const laneKey = (fromHub: string, destination: string) =>
    `${normalizeForMatch(fromHub)}|${normalizeForMatch(destination)}`;

  const lanesByKey = new Map(lanes.map((l) => [laneKey(l.from_hub, l.destination), l]));

  const rawByLane = new Map<string, number[]>();
  for (const load of loads) {
    if (load.rate == null || !load.loading_date) continue;
    if (load.loading_date < weekStart || load.loading_date > weekEndDate) continue;
    if (!load.source) continue;

    const label = destinationLabel(load.load_stops);
    if (!label) continue;

    const lane = lanesByKey.get(laneKey(load.source, label));
    if (!lane) continue;

    const list = rawByLane.get(lane.id) ?? [];
    list.push(load.rate);
    rawByLane.set(lane.id, list);
  }

  const result = new Map<string, BookedStat>();
  for (const [laneId, rates] of rawByLane) {
    result.set(laneId, {
      count: rates.length,
      avgRate: rates.reduce((a, b) => a + b, 0) / rates.length,
    });
  }
  return result;
}
