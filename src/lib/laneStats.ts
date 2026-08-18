import type { Broker, BrokerRateEntry, Lane } from "@/lib/types";

export interface LaneWeekStat {
  avg: number | null;
  hi: { rate: number; brokerName: string } | null;
  lo: { rate: number; brokerName: string } | null;
}

export function computeLaneWeekStats(
  lanes: Lane[],
  brokers: Broker[],
  entries: BrokerRateEntry[],
): Map<string, LaneWeekStat> {
  const brokerNameById = new Map(brokers.map((b) => [b.id, b.name]));
  const byLane = new Map<string, { rate: number; brokerName: string }[]>();

  for (const entry of entries) {
    if (entry.rate == null) continue;
    // A broker missing from the list (e.g. filtered out as local) is
    // excluded entirely, not just shown with an unknown name - otherwise
    // their rate would still silently count toward the average.
    const brokerName = brokerNameById.get(entry.broker_id);
    if (brokerName === undefined) continue;
    const list = byLane.get(entry.lane_id) ?? [];
    list.push({ rate: entry.rate, brokerName });
    byLane.set(entry.lane_id, list);
  }

  const result = new Map<string, LaneWeekStat>();
  for (const lane of lanes) {
    const list = byLane.get(lane.id) ?? [];
    if (list.length === 0) {
      result.set(lane.id, { avg: null, hi: null, lo: null });
      continue;
    }
    const avg = list.reduce((sum, r) => sum + r.rate, 0) / list.length;
    const hi = list.reduce((a, b) => (b.rate > a.rate ? b : a));
    const lo = list.reduce((a, b) => (b.rate < a.rate ? b : a));
    result.set(lane.id, { avg, hi, lo });
  }
  return result;
}
