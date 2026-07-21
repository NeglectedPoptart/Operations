"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatWeekLabel, nextWeekStart, prevWeekStart as prevWeek, currentWeekStart } from "@/lib/dates";
import { computeLaneWeekStats } from "@/lib/laneStats";
import type { Broker, BrokerRateEntry, Lane, RateSubmission } from "@/lib/types";
import { createBroker, createLane, deleteBroker, deleteLane, submitWeek, unlockWeek, upsertRateEntry } from "./actions";

function money(n: number | null): string {
  if (n == null) return "—";
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default function BrokerTrackerClient({
  lanes: initialLanes,
  brokers: initialBrokers,
  initialWeekStart,
  initialEntries,
  initialPrevEntries,
  initialSubmission,
  initialPrevSubmission,
  currentUserEmail,
}: {
  lanes: Lane[];
  brokers: Broker[];
  initialWeekStart: string;
  initialEntries: BrokerRateEntry[];
  initialPrevEntries: BrokerRateEntry[];
  initialSubmission: RateSubmission | null;
  initialPrevSubmission: RateSubmission | null;
  currentUserEmail: string;
}) {
  const [lanes, setLanes] = useState(initialLanes);
  const [brokers, setBrokers] = useState(initialBrokers);
  const [weekStart, setWeekStart] = useState(initialWeekStart);
  const [showManage, setShowManage] = useState(false);
  const [, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);

  // Caches keyed by week_start_date, so navigating back to an already-visited
  // week (including the server-rendered initial week) is just a lookup.
  const [weekCache, setWeekCache] = useState<Record<string, BrokerRateEntry[]>>(() => ({
    [initialWeekStart]: initialEntries,
    [prevWeek(initialWeekStart)]: initialPrevEntries,
  }));
  const [submissionCache, setSubmissionCache] = useState<Record<string, RateSubmission | null>>(() => ({
    [initialWeekStart]: initialSubmission,
    [prevWeek(initialWeekStart)]: initialPrevSubmission,
  }));

  const entries = useMemo(() => weekCache[weekStart] ?? [], [weekCache, weekStart]);
  const prevEntries = useMemo(
    () => weekCache[prevWeek(weekStart)] ?? [],
    [weekCache, weekStart],
  );
  const submission = submissionCache[weekStart];
  const locked = submission != null;

  const needed = [weekStart, prevWeek(weekStart)].filter(
    (w) => !(w in weekCache) || !(w in submissionCache),
  );
  const loading = needed.length > 0;

  useEffect(() => {
    if (needed.length === 0) return;

    let cancelled = false;
    const supabase = createClient();
    Promise.all([
      supabase.from("broker_rate_entries").select("*").in("week_start_date", needed),
      supabase.from("rate_submissions").select("*").in("week_start_date", needed),
    ]).then(([entriesRes, submissionsRes]) => {
      if (cancelled || entriesRes.error || submissionsRes.error) return;
      const allEntries = (entriesRes.data ?? []) as BrokerRateEntry[];
      const allSubmissions = (submissionsRes.data ?? []) as RateSubmission[];
      setWeekCache((prev) => {
        const next = { ...prev };
        for (const w of needed) next[w] = allEntries.filter((e) => e.week_start_date === w);
        return next;
      });
      setSubmissionCache((prev) => {
        const next = { ...prev };
        for (const w of needed) next[w] = allSubmissions.find((s) => s.week_start_date === w) ?? null;
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  const currentStats = useMemo(
    () => computeLaneWeekStats(lanes, brokers, entries),
    [lanes, brokers, entries],
  );
  const prevStats = useMemo(
    () => computeLaneWeekStats(lanes, brokers, prevEntries),
    [lanes, brokers, prevEntries],
  );

  const sortedLanes = useMemo(
    () => [...lanes].sort((a, b) => (a.from_hub + a.destination).localeCompare(b.from_hub + b.destination)),
    [lanes],
  );

  function rateOf(laneId: string, brokerId: string): number | null {
    return entries.find((e) => e.lane_id === laneId && e.broker_id === brokerId)?.rate ?? null;
  }

  function handleRateChange(laneId: string, brokerId: string, value: string) {
    const rate = value.trim() === "" ? null : Number(value);
    if (value.trim() !== "" && !Number.isFinite(rate)) return;

    setWeekCache((prev) => {
      const current = prev[weekStart] ?? [];
      const others = current.filter((e) => !(e.lane_id === laneId && e.broker_id === brokerId));
      return {
        ...prev,
        [weekStart]: [
          ...others,
          { id: `${laneId}-${brokerId}`, lane_id: laneId, broker_id: brokerId, week_start_date: weekStart, rate },
        ],
      };
    });
    startTransition(() => {
      upsertRateEntry(laneId, brokerId, weekStart, rate).catch(() => {});
    });
  }

  async function handleSubmitWeek() {
    setSubmitting(true);
    try {
      await submitWeek(weekStart, currentUserEmail);
      setSubmissionCache((prev) => ({
        ...prev,
        [weekStart]: {
          id: "pending",
          week_start_date: weekStart,
          submitted_by: currentUserEmail,
          submitted_at: new Date().toISOString(),
        },
      }));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUnlockWeek() {
    if (!confirm("Unlock this week's rates for editing?")) return;
    await unlockWeek(weekStart);
    setSubmissionCache((prev) => ({ ...prev, [weekStart]: null }));
  }

  async function handleAddBroker(formData: FormData) {
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return;
    const broker = await createBroker(name);
    setBrokers((prev) => [...prev, broker as Broker].sort((a, b) => a.name.localeCompare(b.name)));
  }

  async function handleAddLane(formData: FormData) {
    const fromHub = String(formData.get("from_hub") ?? "").trim();
    const destination = String(formData.get("destination") ?? "").trim();
    if (!fromHub || !destination) return;
    const lane = await createLane(fromHub, destination);
    setLanes((prev) => [...prev, lane as Lane]);
  }

  async function handleDeleteLane(id: string) {
    if (!confirm("Delete this lane?")) return;
    await deleteLane(id);
    setLanes((prev) => prev.filter((l) => l.id !== id));
  }

  async function handleDeleteBroker(id: string, name: string) {
    if (
      !confirm(
        `Delete ${name}? This removes their rate history and their whole Invoicing list too - it deletes everywhere. Past loads keep showing but lose the broker tag.`,
      )
    ) {
      return;
    }
    await deleteBroker(id);
    setBrokers((prev) => prev.filter((b) => b.id !== id));
  }

  const isCurrentWeek = weekStart === currentWeekStart();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekStart((w) => prevWeek(w))}
            className="rounded-md border border-black/20 px-3 py-1.5 text-sm dark:border-white/20"
          >
            ← Prev Week
          </button>
          <span className="text-sm font-medium">
            {formatWeekLabel(weekStart)} {isCurrentWeek && <span className="text-green-600">(current)</span>}
          </span>
          <button
            onClick={() => setWeekStart((w) => nextWeekStart(w))}
            className="rounded-md border border-black/20 px-3 py-1.5 text-sm dark:border-white/20"
          >
            Next Week →
          </button>
          {!isCurrentWeek && (
            <button
              onClick={() => setWeekStart(currentWeekStart())}
              className="text-sm font-medium text-green-600 hover:underline"
            >
              Back to this week
            </button>
          )}
          {loading && <span className="text-xs text-black/40">loading…</span>}
        </div>
        <button
          onClick={() => setShowManage((s) => !s)}
          className="text-sm font-medium text-green-600 hover:underline"
        >
          {showManage ? "Hide" : "Manage brokers & lanes"}
        </button>
      </div>

      {locked ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
          <span>
            Submitted by <strong>{submission?.submitted_by}</strong> on{" "}
            {submission ? new Date(submission.submitted_at).toLocaleString() : ""}
          </span>
          <button onClick={handleUnlockWeek} className="font-medium text-green-600 hover:underline">
            Unlock to edit
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between rounded-md bg-black/5 px-3 py-2 text-sm dark:bg-white/5">
          <span className="text-black/60 dark:text-white/60">
            Rates for this week aren&apos;t submitted yet.
          </span>
          <button
            onClick={handleSubmitWeek}
            disabled={submitting}
            className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
          >
            {submitting ? "Submitting..." : "Submit this week's rates"}
          </button>
        </div>
      )}

      {showManage && (
        <div className="grid gap-4 rounded-lg border border-black/10 p-3 sm:grid-cols-2 dark:border-white/10">
          <div className="space-y-2">
            <form action={handleAddBroker} className="flex items-end gap-2">
              <div className="flex-1">
                <label className="text-xs font-medium text-black/60 dark:text-white/60">New broker name</label>
                <input name="name" className="w-full rounded-md border border-black/20 px-2 py-1.5 text-sm dark:border-white/20 dark:bg-black/20" />
              </div>
              <button type="submit" className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white">
                Add
              </button>
            </form>
            <div className="flex flex-wrap gap-1.5">
              {brokers.map((b) => (
                <span
                  key={b.id}
                  className="inline-flex items-center gap-1 rounded-full bg-black/5 px-2 py-1 text-xs dark:bg-white/10"
                >
                  {b.name}
                  <button
                    onClick={() => handleDeleteBroker(b.id, b.name)}
                    title={`Delete ${b.name}`}
                    className="font-bold text-red-600 hover:text-red-800"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
          <form action={handleAddLane} className="flex items-end gap-2">
            <div className="flex-1">
              <label className="text-xs font-medium text-black/60 dark:text-white/60">From hub</label>
              <input name="from_hub" className="w-full rounded-md border border-black/20 px-2 py-1.5 text-sm dark:border-white/20 dark:bg-black/20" />
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium text-black/60 dark:text-white/60">Destination</label>
              <input
                name="destination"
                placeholder="Houston, TX"
                className="w-full rounded-md border border-black/20 px-2 py-1.5 text-sm dark:border-white/20 dark:bg-black/20"
              />
            </div>
            <button type="submit" className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white">
              Add
            </button>
          </form>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
        <table className="w-full text-xs">
          <thead className="bg-black/5 text-left dark:bg-white/5">
            <tr>
              <th className="px-2 py-2">Lane</th>
              {brokers.map((b) => (
                <th key={b.id} className="px-1 py-2">
                  {b.name}
                </th>
              ))}
              <th className="px-1.5 py-2">Prev Wk</th>
              <th className="px-1.5 py-2">Curr Wk</th>
              <th className="px-1.5 py-2">Hi</th>
              <th className="px-1.5 py-2">Lo</th>
              {showManage && <th className="px-1.5 py-2" />}
            </tr>
          </thead>
          <tbody>
            {sortedLanes.map((lane) => {
              const stat = currentStats.get(lane.id);
              const prevStat = prevStats.get(lane.id);
              return (
                <tr key={lane.id} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-2 py-1.5 font-medium whitespace-nowrap">
                    {lane.from_hub} → {lane.destination}
                  </td>
                  {brokers.map((broker) => (
                    <td key={broker.id} className="px-0.5 py-1">
                      <input
                        type="number"
                        step="0.01"
                        disabled={locked}
                        defaultValue={rateOf(lane.id, broker.id) ?? ""}
                        onBlur={(e) => handleRateChange(lane.id, broker.id, e.target.value)}
                        className="w-16 rounded border border-gray-300 bg-white px-1 py-1 text-black disabled:bg-gray-100 disabled:text-black/50"
                      />
                    </td>
                  ))}
                  <td className="px-1.5 py-1.5 whitespace-nowrap">{money(prevStat?.avg ?? null)}</td>
                  <td className="px-1.5 py-1.5 whitespace-nowrap font-medium">{money(stat?.avg ?? null)}</td>
                  <td className="px-1.5 py-1.5 whitespace-nowrap">
                    {stat?.hi ? (
                      <>
                        <div>{money(stat.hi.rate)}</div>
                        <div className="text-black/40">{stat.hi.brokerName}</div>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-1.5 py-1.5 whitespace-nowrap">
                    {stat?.lo ? (
                      <>
                        <div>{money(stat.lo.rate)}</div>
                        <div className="text-black/40">{stat.lo.brokerName}</div>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  {showManage && (
                    <td className="px-1.5 py-1.5">
                      <button
                        onClick={() => handleDeleteLane(lane.id)}
                        className="font-medium text-red-600 hover:underline"
                      >
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
            {lanes.length === 0 && (
              <tr>
                <td colSpan={brokers.length + 5} className="px-3 py-4 text-center text-black/40 dark:text-white/40">
                  No lanes yet. Use &quot;Manage brokers &amp; lanes&quot; to add one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
