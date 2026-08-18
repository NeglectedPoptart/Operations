"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatTimestamp, formatWeekLabel } from "@/lib/dates";
import type { Broker, BrokerRateEntry, Lane, RateSubmission } from "@/lib/types";
import { upsertMyRate } from "./actions";

export default function BrokerRateEntryClient({
  lanes,
  brokers,
  isBrokerCarrier,
  initialBrokerId,
  initialEntries,
  initialSubmission,
  weekStart,
}: {
  lanes: Lane[];
  brokers: Broker[];
  isBrokerCarrier: boolean;
  initialBrokerId: string | null;
  initialEntries: BrokerRateEntry[];
  initialSubmission: RateSubmission | null;
  weekStart: string;
}) {
  const [brokerId, setBrokerId] = useState(initialBrokerId);

  // Cache keyed by brokerId, same shape as BrokerTrackerClient's weekCache -
  // `loading` is derived from whether the current selection is cached yet
  // rather than an explicit setState at the top of the effect below (which
  // triggers React's "no setState synchronously in an effect body" lint
  // rule), matching that same established pattern.
  const [cache, setCache] = useState<Record<string, { entries: BrokerRateEntry[]; submission: RateSubmission | null }>>(
    () => (initialBrokerId ? { [initialBrokerId]: { entries: initialEntries, submission: initialSubmission } } : {}),
  );

  const sortedLanes = useMemo(
    () =>
      [...lanes].sort((a, b) => {
        const posDiff = (a.position ?? 0) - (b.position ?? 0);
        if (posDiff !== 0) return posDiff;
        return (a.from_hub + a.destination).localeCompare(b.from_hub + b.destination);
      }),
    [lanes],
  );

  const broker = brokers.find((b) => b.id === brokerId) ?? null;
  const cached = brokerId ? cache[brokerId] : undefined;
  const entries = cached?.entries ?? [];
  const submission = cached?.submission ?? null;
  const loading = brokerId !== null && cached === undefined;
  const locked = submission != null;

  // Only staff ever change brokerId (no picker is rendered for a
  // broker_carrier at all), so this only ever fires for them switching who
  // they're viewing to someone not already cached.
  useEffect(() => {
    if (!brokerId || brokerId in cache) return;
    let cancelled = false;
    const supabase = createClient();
    Promise.all([
      supabase.from("broker_rate_entries").select("*").eq("broker_id", brokerId).eq("week_start_date", weekStart),
      supabase.from("rate_submissions").select("*").eq("week_start_date", weekStart).maybeSingle(),
    ]).then(([entriesRes, submissionRes]) => {
      if (cancelled) return;
      setCache((prev) => ({
        ...prev,
        [brokerId]: {
          entries: (entriesRes.data ?? []) as BrokerRateEntry[],
          submission: (submissionRes.data as RateSubmission | null) ?? null,
        },
      }));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brokerId, weekStart]);

  function entryFor(laneId: string): BrokerRateEntry | null {
    return entries.find((e) => e.lane_id === laneId) ?? null;
  }

  async function handleRateChange(laneId: string, value: string) {
    if (!brokerId) return;
    const rate = value.trim() === "" ? null : Number(value);
    if (value.trim() !== "" && !Number.isFinite(rate)) return;

    const now = new Date().toISOString();
    setCache((prev) => {
      const current = prev[brokerId]?.entries ?? [];
      const others = current.filter((e) => e.lane_id !== laneId);
      return {
        ...prev,
        [brokerId]: {
          entries: [
            ...others,
            { id: `${laneId}-${brokerId}`, lane_id: laneId, broker_id: brokerId, week_start_date: weekStart, rate, updated_at: now },
          ],
          submission: prev[brokerId]?.submission ?? null,
        },
      };
    });
    try {
      await upsertMyRate(brokerId, laneId, weekStart, rate);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Couldn't save that rate - try again.");
    }
  }

  if (!brokerId) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Broker Rate Entry</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          {isBrokerCarrier
            ? "Your account isn't linked to a broker/carrier company yet - contact Harvest Best to get set up."
            : "No brokers on file yet."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Broker Rate Entry</h1>
          <p className="text-sm text-black/60 dark:text-white/60">{formatWeekLabel(weekStart)} (current week)</p>
        </div>
        {isBrokerCarrier ? (
          broker && <p className="text-sm font-semibold text-green-700 dark:text-green-400">{broker.name}</p>
        ) : (
          <label className="flex items-center gap-2 text-sm">
            <span className="font-medium">Viewing</span>
            <select
              value={brokerId}
              onChange={(e) => setBrokerId(e.target.value)}
              className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-black"
            >
              {brokers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {locked && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
          This week&apos;s rates have been submitted and are locked - contact Harvest Best if something needs to
          change.
        </p>
      )}

      {loading ? (
        <p className="text-sm text-black/40">Loading…</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-black/5 text-left dark:bg-white/5">
              <tr>
                <th className="px-3 py-2">Lane</th>
                <th className="px-3 py-2">Your Rate</th>
                <th className="px-3 py-2">Last Updated</th>
              </tr>
            </thead>
            <tbody>
              {sortedLanes.map((lane) => {
                const entry = entryFor(lane.id);
                return (
                  // Keyed on brokerId too, not just lane.id - forces the
                  // rate input to remount (and its defaultValue to refresh)
                  // when staff switches which broker they're viewing, since
                  // an uncontrolled input otherwise ignores a changed
                  // defaultValue on re-render.
                  <tr key={`${brokerId}-${lane.id}`} className="border-t border-black/10 dark:border-white/10">
                    <td className="px-3 py-2 font-medium">
                      {lane.from_hub} → {lane.destination}
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="number"
                        step="0.01"
                        disabled={locked}
                        defaultValue={entry?.rate ?? ""}
                        onBlur={(e) => handleRateChange(lane.id, e.target.value)}
                        className="w-24 rounded border border-gray-300 bg-white px-2 py-1 text-black disabled:bg-gray-100 disabled:text-black/50"
                      />
                    </td>
                    <td className="px-3 py-2 text-xs text-black/50 dark:text-white/50">
                      {entry ? formatTimestamp(entry.updated_at) : "—"}
                    </td>
                  </tr>
                );
              })}
              {sortedLanes.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-4 text-center text-black/40 dark:text-white/40">
                    No lanes on file yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
