"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import { createClient } from "@/lib/supabase/client";
import { formatWeekLabel, nextWeekStart, prevWeekStart as prevWeek, currentWeekStart } from "@/lib/dates";
import { computeLaneWeekStats } from "@/lib/laneStats";
import { matchRateLines, parseRateEmail, type MatchedRateLine } from "@/lib/rateEmailParse";
import type { Broker, BrokerRateEntry, Lane, RateSubmission } from "@/lib/types";
import {
  createBroker,
  createLane,
  deleteBroker,
  deleteLane,
  reorderLanes,
  submitWeek,
  unlockWeek,
  updateBrokerIsLocal,
  updateLane,
  upsertRateEntry,
} from "./actions";

function money(n: number | null): string {
  if (n == null) return "—";
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function RateEmailPanel({
  lanes,
  brokers,
  onApply,
}: {
  lanes: Lane[];
  brokers: Broker[];
  onApply: (brokerId: string, lines: MatchedRateLine[]) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [brokerId, setBrokerId] = useState("");
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<MatchedRateLine[] | null>(null);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);

  function handlePreview() {
    const parsed = parseRateEmail(text, lanes);
    setPreview(matchRateLines(parsed, lanes));
    setApplied(false);
  }

  async function handleConfirm() {
    if (!preview || !brokerId) return;
    setApplying(true);
    try {
      await onApply(brokerId, preview);
      setApplied(true);
    } finally {
      setApplying(false);
    }
  }

  function handleCancel() {
    setText("");
    setPreview(null);
    setApplied(false);
  }

  const newLaneCount = preview?.filter((p) => !p.lane).length ?? 0;

  return (
    <div className="space-y-3 rounded-lg border border-black/10 p-3 dark:border-white/10">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-green-700 dark:text-green-400">Paste Pricing Email</h3>
        <button
          onClick={() => setOpen((o) => !o)}
          className="rounded-md border border-black/20 px-3 py-1.5 text-sm dark:border-white/20"
        >
          {open ? "Hide" : "Paste from Email"}
        </button>
      </div>
      {open && (
        <div className="space-y-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Broker these rates are from</span>
            <select
              value={brokerId}
              onChange={(e) => {
                setBrokerId(e.target.value);
                setApplied(false);
              }}
              className="w-full max-w-xs rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-black"
            >
              <option value="">-- select broker --</option>
              {brokers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <p className="text-sm text-black/60 dark:text-white/60">
            Paste the lane/rate email below. Lanes matching an existing hub + destination update in
            place for the selected broker and week; anything new gets added as a new lane.
          </p>
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setPreview(null);
              setApplied(false);
            }}
            rows={8}
            placeholder="Paste the pricing email text here..."
            className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 font-mono text-xs text-black"
          />
          {!preview && (
            <button
              onClick={handlePreview}
              disabled={text.trim() === ""}
              className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
            >
              Preview
            </button>
          )}
          {preview && (
            <div className="space-y-3">
              <p className="text-sm font-medium">
                {preview.length} rate{preview.length === 1 ? "" : "s"} parsed
                {newLaneCount > 0
                  ? ` - ${newLaneCount} new lane${newLaneCount === 1 ? "" : "s"} will be created`
                  : ""}
                .
              </p>
              <div className="max-h-72 overflow-auto rounded border border-black/10 dark:border-white/10">
                <table className="w-full text-xs">
                  <thead className="bg-black/5 text-left dark:bg-white/5">
                    <tr>
                      <th className="px-2 py-1">Hub</th>
                      <th className="px-2 py-1">Destination</th>
                      <th className="px-2 py-1">Rate</th>
                      <th className="px-2 py-1">Lane</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((p, i) => (
                      <tr key={i} className="border-t border-black/10 dark:border-white/10">
                        <td className="px-2 py-1">{p.hub}</td>
                        <td className="px-2 py-1">{p.destination}</td>
                        <td className="px-2 py-1">{money(p.rate)}</td>
                        <td className="px-2 py-1">
                          {p.lane ? (
                            <span className="text-black/40 dark:text-white/40">existing lane</span>
                          ) : (
                            <span className="text-green-600 dark:text-green-400">new lane</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleConfirm}
                  disabled={!brokerId || applying || applied}
                  className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
                >
                  {applied
                    ? "Applied!"
                    : applying
                      ? "Applying..."
                      : `Apply ${preview.length} rate${preview.length === 1 ? "" : "s"}`}
                </button>
                <button
                  onClick={handleCancel}
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/10"
                >
                  {applied ? "Close" : "Cancel"}
                </button>
              </div>
              {!brokerId && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Select a broker above before applying.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
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
  const confirm = useConfirm();
  const [lanes, setLanes] = useState(initialLanes);
  const [brokers, setBrokers] = useState(initialBrokers);
  const [weekStart, setWeekStart] = useState(initialWeekStart);
  const [showManage, setShowManage] = useState(false);
  const [editingLaneId, setEditingLaneId] = useState<string | null>(null);
  const [editFromHub, setEditFromHub] = useState("");
  const [editDestination, setEditDestination] = useState("");
  const [draggedLaneIndex, setDraggedLaneIndex] = useState<number | null>(null);
  const dragStartLaneOrder = useRef<Lane[] | null>(null);
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

  // Local brokers/carriers don't belong on the Freight Rates page at all -
  // local hauls aren't the long-haul lanes this page tracks - so the rate
  // grid, its stats, and the "Broker these rates are from" dropdown all
  // use this OTR-only subset. The full `brokers` list (including local
  // ones) is still used for the Manage panel below, since that's where
  // Local/OTR gets toggled and brokers get added/removed.
  const otrBrokers = useMemo(() => brokers.filter((b) => !b.is_local), [brokers]);

  const currentStats = useMemo(
    () => computeLaneWeekStats(lanes, otrBrokers, entries),
    [lanes, otrBrokers, entries],
  );
  const prevStats = useMemo(
    () => computeLaneWeekStats(lanes, otrBrokers, prevEntries),
    [lanes, otrBrokers, prevEntries],
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
          {
            id: `${laneId}-${brokerId}`,
            lane_id: laneId,
            broker_id: brokerId,
            week_start_date: weekStart,
            rate,
            updated_at: new Date().toISOString(),
          },
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
    if (!(await confirm("Unlock this week's rates for editing?"))) return;
    await unlockWeek(weekStart);
    setSubmissionCache((prev) => ({ ...prev, [weekStart]: null }));
  }

  async function handleApplyEmailRates(brokerId: string, lines: MatchedRateLine[]) {
    for (const line of lines) {
      let laneId = line.lane?.id;
      if (!laneId) {
        const newLane = (await createLane(line.hub, line.destination)) as Lane;
        setLanes((prev) => [...prev, newLane]);
        laneId = newLane.id;
      }
      handleRateChange(laneId, brokerId, String(line.rate));
    }
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
    if (!(await confirm("Delete this lane?"))) return;
    try {
      await deleteLane(id);
      setLanes((prev) => prev.filter((l) => l.id !== id));
    } catch (err) {
      alert(err instanceof Error ? `Couldn't delete lane: ${err.message}` : "Couldn't delete lane - try again.");
    }
  }

  function handleStartEditLane(lane: Lane) {
    setEditingLaneId(lane.id);
    setEditFromHub(lane.from_hub);
    setEditDestination(lane.destination);
  }

  async function handleSaveEditLane() {
    const fromHub = editFromHub.trim();
    const destination = editDestination.trim();
    const id = editingLaneId;
    if (!id || !fromHub || !destination) {
      setEditingLaneId(null);
      return;
    }
    setEditingLaneId(null);
    try {
      const updated = (await updateLane(id, fromHub, destination)) as Lane;
      setLanes((prev) => prev.map((l) => (l.id === id ? updated : l)));
    } catch (err) {
      alert(err instanceof Error ? `Couldn't update lane: ${err.message}` : "Couldn't update lane - try again.");
    }
  }

  function handleLaneDragStart(index: number) {
    dragStartLaneOrder.current = sortedLanes;
    setDraggedLaneIndex(index);
  }

  // Reassigns every lane's position to match the dragged-over order, not
  // just the array order - sortedLanes re-sorts by position on every
  // render, so a plain array reorder here would get silently undone by
  // that sort as soon as this state update takes effect.
  function handleLaneDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    if (draggedLaneIndex === null || draggedLaneIndex === index) return;
    const reordered = [...sortedLanes];
    const [moved] = reordered.splice(draggedLaneIndex, 1);
    reordered.splice(index, 0, moved);
    const positionById = new Map(reordered.map((l, i) => [l.id, i]));
    setLanes((prev) => prev.map((l) => (positionById.has(l.id) ? { ...l, position: positionById.get(l.id)! } : l)));
    setDraggedLaneIndex(index);
  }

  function handleLaneDrop(e: React.DragEvent) {
    e.preventDefault();
    const previous = dragStartLaneOrder.current;
    const finalOrder = sortedLanes;
    setDraggedLaneIndex(null);
    dragStartLaneOrder.current = null;
    if (!previous || previous.map((l) => l.id).join() === finalOrder.map((l) => l.id).join()) return;
    const orderedIds = finalOrder.map((l) => l.id);
    startTransition(() => {
      reorderLanes(orderedIds).catch(() => {
        setLanes((prev) => {
          const byId = new Map(prev.map((l) => [l.id, l]));
          return previous.map((l) => byId.get(l.id) ?? l);
        });
      });
    });
  }

  function handleLaneDragEnd() {
    setDraggedLaneIndex(null);
    dragStartLaneOrder.current = null;
  }

  function handleToggleBrokerLocal(id: string, isLocal: boolean) {
    setBrokers((prev) => prev.map((b) => (b.id === id ? { ...b, is_local: isLocal } : b)));
    updateBrokerIsLocal(id, isLocal).catch(() => {});
  }

  async function handleDeleteBroker(id: string, name: string) {
    if (
      !(await confirm(
        `Delete ${name}? This removes their rate history and their whole Invoicing list too - it deletes everywhere. Past loads keep showing but lose the broker tag.`,
      ))
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

      <RateEmailPanel lanes={lanes} brokers={otrBrokers} onApply={handleApplyEmailRates} />

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
            <p className="text-xs text-black/40 dark:text-white/40">
              Local brokers/carriers are dropped from the rate grid below and the pricing-email
              dropdown - they still show up everywhere else (Invoicing, Board, etc.) same as any
              other broker.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {brokers.map((b) => (
                <span
                  key={b.id}
                  className="inline-flex items-center gap-1 rounded-full bg-black/5 px-2 py-1 text-xs dark:bg-white/10"
                >
                  {b.name}
                  <button
                    onClick={() => handleToggleBrokerLocal(b.id, !b.is_local)}
                    title={b.is_local ? "Local - click to mark OTR" : "OTR - click to mark Local"}
                    className={`rounded px-1 text-[10px] font-semibold ${
                      b.is_local
                        ? "bg-amber-200 text-amber-900 dark:bg-amber-900/50 dark:text-amber-300"
                        : "bg-black/10 text-black/50 dark:bg-white/10 dark:text-white/50"
                    }`}
                  >
                    {b.is_local ? "Local" : "OTR"}
                  </button>
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
          <div className="space-y-2">
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
            <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
              {sortedLanes.map((lane, index) =>
                editingLaneId === lane.id ? (
                  <span
                    key={lane.id}
                    className="inline-flex items-center gap-1 rounded-full bg-black/10 px-2 py-1 text-xs dark:bg-white/20"
                  >
                    <input
                      autoFocus
                      value={editFromHub}
                      onChange={(e) => setEditFromHub(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveEditLane();
                        if (e.key === "Escape") setEditingLaneId(null);
                      }}
                      className="w-20 rounded border border-black/20 bg-white px-1 py-0.5 text-xs dark:border-white/20 dark:bg-black/40"
                    />
                    →
                    <input
                      value={editDestination}
                      onChange={(e) => setEditDestination(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveEditLane();
                        if (e.key === "Escape") setEditingLaneId(null);
                      }}
                      className="w-28 rounded border border-black/20 bg-white px-1 py-0.5 text-xs dark:border-white/20 dark:bg-black/40"
                    />
                    <button
                      onClick={handleSaveEditLane}
                      title="Save"
                      className="font-bold text-green-600 hover:text-green-800"
                    >
                      ✓
                    </button>
                    <button
                      onClick={() => setEditingLaneId(null)}
                      title="Cancel"
                      className="font-bold text-black/40 hover:text-black/60 dark:text-white/40 dark:hover:text-white/60"
                    >
                      ×
                    </button>
                  </span>
                ) : (
                  <span
                    key={lane.id}
                    draggable
                    onDragStart={() => handleLaneDragStart(index)}
                    onDragOver={(e) => handleLaneDragOver(e, index)}
                    onDrop={handleLaneDrop}
                    onDragEnd={handleLaneDragEnd}
                    className={`inline-flex cursor-grab items-center gap-1 rounded-full bg-black/5 px-2 py-1 text-xs select-none active:cursor-grabbing dark:bg-white/10 ${
                      draggedLaneIndex === index ? "opacity-40" : ""
                    }`}
                  >
                    <span aria-hidden className="text-black/30 dark:text-white/30">
                      ⠿
                    </span>
                    <button
                      onClick={() => handleStartEditLane(lane)}
                      title={`Edit ${lane.from_hub} → ${lane.destination}`}
                      className="hover:underline"
                    >
                      {lane.from_hub} → {lane.destination}
                    </button>
                    <button
                      onClick={() => handleDeleteLane(lane.id)}
                      title={`Delete ${lane.from_hub} → ${lane.destination}`}
                      className="font-bold text-red-600 hover:text-red-800"
                    >
                      ×
                    </button>
                  </span>
                ),
              )}
              {sortedLanes.length === 0 && (
                <p className="text-xs text-black/40 dark:text-white/40">No lanes yet.</p>
              )}
            </div>
            <p className="text-xs text-black/40 dark:text-white/40">
              Drag ⠿ to reorder lanes (this also reorders the rate grid below). Click a lane name to edit it.
            </p>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
        <table className="w-full text-xs">
          <thead className="bg-black/5 text-left dark:bg-white/5">
            <tr>
              <th className="sticky left-0 z-10 bg-black/5 px-2 py-2 dark:bg-neutral-900">Lane</th>
              {otrBrokers.map((b) => (
                <th key={b.id} className="px-1 py-2">
                  {b.name}
                </th>
              ))}
              <th className="px-1 py-2">Prev Wk</th>
              <th className="px-1 py-2">Curr Wk</th>
              <th className="px-1 py-2">Hi</th>
              <th className="px-1 py-2">Lo</th>
              {showManage && <th className="px-1 py-2" />}
            </tr>
          </thead>
          <tbody>
            {sortedLanes.map((lane) => {
              const stat = currentStats.get(lane.id);
              const prevStat = prevStats.get(lane.id);
              return (
                <tr key={lane.id} className="border-t border-black/10 dark:border-white/10">
                  <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-2 py-1.5 font-medium dark:bg-neutral-950">
                    {lane.from_hub} → {lane.destination}
                  </td>
                  {otrBrokers.map((broker) => (
                    <td key={broker.id} className="px-0.5 py-1">
                      <input
                        type="number"
                        step="0.01"
                        disabled={locked}
                        defaultValue={rateOf(lane.id, broker.id) ?? ""}
                        onBlur={(e) => handleRateChange(lane.id, broker.id, e.target.value)}
                        className="w-14 rounded border border-gray-300 bg-white px-1 py-1 text-black disabled:bg-gray-100 disabled:text-black/50"
                      />
                    </td>
                  ))}
                  <td className="px-1 py-1.5 whitespace-nowrap">{money(prevStat?.avg ?? null)}</td>
                  <td className="px-1 py-1.5 whitespace-nowrap font-medium">{money(stat?.avg ?? null)}</td>
                  <td className="px-1 py-1.5">
                    {stat?.hi ? (
                      <>
                        <div className="whitespace-nowrap">{money(stat.hi.rate)}</div>
                        <div className="text-black/40">{stat.hi.brokerName}</div>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-1 py-1.5">
                    {stat?.lo ? (
                      <>
                        <div className="whitespace-nowrap">{money(stat.lo.rate)}</div>
                        <div className="text-black/40">{stat.lo.brokerName}</div>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  {showManage && (
                    <td className="px-1 py-1.5">
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
                <td colSpan={otrBrokers.length + 5} className="px-3 py-4 text-center text-black/40 dark:text-white/40">
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
