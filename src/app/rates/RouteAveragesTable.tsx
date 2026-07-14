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

  const sortedLanes = [...lanes].sort((a, b) =>
    (a.from_hub + a.destination).localeCompare(b.from_hub + b.destination),
  );

  return (
    <div className="space-y-2">
      <p className="text-sm text-black/60 dark:text-white/60">
        Average rate per lane, based on the quotes submitted on the Broker Tracker. Lanes
        highlighted in amber have no quote yet this week. The footnote shows what actually got
        booked on the Board this week for comparison.
      </p>
      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-black/5 text-left dark:bg-white/5">
            <tr>
              <th className="px-3 py-2">Lane</th>
              <th className="px-3 py-2">Prev Week ({formatWeekLabel(prevWeekStart)})</th>
              <th className="px-3 py-2">Current Week ({formatWeekLabel(currentWeekStart)})</th>
            </tr>
          </thead>
          <tbody>
            {sortedLanes.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-4 text-center text-black/40 dark:text-white/40">
                  No lanes yet. Add some in the Broker Tracker tab.
                </td>
              </tr>
            ) : (
              sortedLanes.map((lane) => {
                const curr = currentStats.get(lane.id);
                const prev = prevStats.get(lane.id);
                const booked = bookedStats.get(lane.id);
                const noQuote = !curr || curr.avg == null;
                return (
                  <tr
                    key={lane.id}
                    className={`border-t border-black/10 dark:border-white/10 ${
                      noQuote ? "bg-amber-50 dark:bg-amber-900/20" : ""
                    }`}
                  >
                    <td className="px-3 py-2 font-medium">
                      {lane.from_hub} → {lane.destination}
                    </td>
                    <td className="px-3 py-2">{money(prev?.avg ?? null)}</td>
                    <td className="px-3 py-2">
                      {noQuote ? (
                        <span className="font-medium text-amber-700 dark:text-amber-400">No quote yet</span>
                      ) : (
                        money(curr.avg)
                      )}
                      {booked && (
                        <p className="mt-0.5 text-xs text-black/50 dark:text-white/50">
                          {booked.count} {booked.count === 1 ? "load" : "loads"} booked, avg{" "}
                          {money(booked.avgRate)}
                        </p>
                      )}
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
