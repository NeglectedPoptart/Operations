import type { Lane } from "@/lib/types";
import type { LaneWeekStat } from "@/lib/laneStats";

export interface LaneChange {
  lane: Lane;
  prevAvg: number;
  currAvg: number;
  pctChange: number;
}

// Lanes with a submitted quote average in both weeks, ranked by the biggest
// swing (up or down) so the Home dashboard can surface what moved the most.
export function topChangedLanes(
  lanes: Lane[],
  currentStats: Map<string, LaneWeekStat>,
  prevStats: Map<string, LaneWeekStat>,
  limit: number,
): LaneChange[] {
  const changes: LaneChange[] = [];

  for (const lane of lanes) {
    const curr = currentStats.get(lane.id)?.avg;
    const prev = prevStats.get(lane.id)?.avg;
    if (curr == null || prev == null || prev === 0) continue;

    changes.push({
      lane,
      prevAvg: prev,
      currAvg: curr,
      pctChange: ((curr - prev) / prev) * 100,
    });
  }

  return changes.sort((a, b) => Math.abs(b.pctChange) - Math.abs(a.pctChange)).slice(0, limit);
}
