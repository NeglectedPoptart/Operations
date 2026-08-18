import type { Lane } from "@/lib/types";
import type { LaneWeekStat } from "@/lib/laneStats";

export interface LaneChange {
  lane: Lane;
  prevLo: number;
  currLo: number;
  pctChange: number;
}

// Lanes with a submitted low quote in both weeks, ranked by the biggest
// swing (up or down) so the Home dashboard can surface what moved the most.
export function topChangedLanes(
  lanes: Lane[],
  currentStats: Map<string, LaneWeekStat>,
  prevStats: Map<string, LaneWeekStat>,
  limit: number,
): LaneChange[] {
  const changes: LaneChange[] = [];

  for (const lane of lanes) {
    const curr = currentStats.get(lane.id)?.lo?.rate;
    const prev = prevStats.get(lane.id)?.lo?.rate;
    if (curr == null || prev == null || prev === 0) continue;

    changes.push({
      lane,
      prevLo: prev,
      currLo: curr,
      pctChange: ((curr - prev) / prev) * 100,
    });
  }

  return changes.sort((a, b) => Math.abs(b.pctChange) - Math.abs(a.pctChange)).slice(0, limit);
}
