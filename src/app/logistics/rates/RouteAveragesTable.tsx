import { formatWeekLabel } from "@/lib/dates";
import { computeLaneWeekStats } from "@/lib/laneStats";
import type { BookedStat } from "@/lib/rateAverages";
import type { Broker, BrokerRateEntry, Lane } from "@/lib/types";

function money(n: number | null): string {
  if (n == null) return "—";
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default function RouteAveragesTable({
  lanes,
  brokers,
  currentEntries,
  prevEntries,
  bookedStats,
  currentWeekStart,
  prevWeekStart,
}: {
  lanes: Lane[];
  brokers: Broker[];
  currentEntries: BrokerRateEntry[];
  prevEntries: BrokerRateEntry[];
  bookedStats: Map<string, BookedStat>;
  currentWeekStart: string;
  prevWeekStart: string;
}) {
  const currentStats = computeLaneWeekStats(lanes, brokers, currentEntries);
  const prevStats = computeLaneWeekStats(lanes, brokers, prevEntries);

  const sortedLanes = [...lanes].sort((a, b) => {
    const posDiff = (a.position ?? 0) - (b.position ?? 0);
    if (posDiff !== 0) return posDiff;
    return (a.from_hub + a.destination).localeCompare(b.from_hub + b.destination);
  });

  return (
    <div className="space-y-2">
      <p className="text-sm text-black/60 dark:text-white/60">
        Lowest quoted rate per lane (average shown below it), based on the quotes submitted on
        the Broker Tracker. Lanes highlighted in amber have no quote yet this week. The footnote
        shows what actually got booked on the Board this week for comparison.
      </p>
      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
        <table className="w-full min-w-[640px] text-xs">
          <thead className="bg-black/5 text-left dark:bg-white/5">
            <tr>
              <th className="px-2 py-1.5">Lane</th>
              <th className="px-2 py-1.5">Prev Week ({formatWeekLabel(prevWeekStart)})</th>
              <th className="px-2 py-1.5">Current Week ({formatWeekLabel(currentWeekStart)})</th>
            </tr>
          </thead>
          <tbody>
            {sortedLanes.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-2 py-3 text-center text-black/40 dark:text-white/40">
                  No lanes yet. Add some in the Broker Tracker tab.
                </td>
              </tr>
            ) : (
              sortedLanes.map((lane) => {
                const curr = currentStats.get(lane.id);
                const prev = prevStats.get(lane.id);
                const booked = bookedStats.get(lane.id);
                const noQuote = !curr || curr.lo == null;
                const prevLo = prev?.lo?.rate ?? null;
                const currLo = curr?.lo?.rate ?? null;
                const pctChange =
                  prevLo != null && currLo != null && prevLo !== 0 ? ((currLo - prevLo) / prevLo) * 100 : null;
                const up = pctChange != null && pctChange > 0;
                return (
                  <tr
                    key={lane.id}
                    className={`border-t border-black/10 dark:border-white/10 ${
                      noQuote ? "bg-amber-50 dark:bg-amber-900/20" : ""
                    }`}
                  >
                    <td className="px-2 py-1 font-medium">
                      {lane.from_hub} → {lane.destination}
                    </td>
                    <td className="px-2 py-1">
                      {money(prevLo)}
                      {prev?.avg != null && (
                        <p className="text-[11px] text-black/50 dark:text-white/50">avg {money(prev.avg)}</p>
                      )}
                    </td>
                    <td className="px-2 py-1">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          {noQuote ? (
                            <span className="font-medium text-amber-700 dark:text-amber-400">No quote yet</span>
                          ) : (
                            money(currLo)
                          )}
                          {!noQuote && curr?.avg != null && (
                            <p className="text-[11px] text-black/50 dark:text-white/50">avg {money(curr.avg)}</p>
                          )}
                          {booked && (
                            <p className="text-[11px] text-black/50 dark:text-white/50">
                              {booked.count} {booked.count === 1 ? "load" : "loads"} booked, avg{" "}
                              {money(booked.avgRate)}
                            </p>
                          )}
                        </div>
                        {pctChange != null && (
                          <div
                            className={`shrink-0 text-xs font-bold ${
                              up ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
                            }`}
                          >
                            {up ? "↑" : "↓"} {Math.abs(pctChange).toFixed(1)}%
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
