"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/ConfirmProvider";
import UpdateStatusButton from "@/components/UpdateStatusButton";
import { createClient } from "@/lib/supabase/client";
import { currentWeekStart, formatWeekLabel, nextWeekStart, prevWeekStart, weekNumberOf } from "@/lib/dates";
import { copyOrDownloadPng, renderPriceSheetPng, type CanvasBlock } from "@/lib/fobPricing";
import { parsePastedMxArrivals, type ParsedMxArrivalRow } from "@/lib/mxArrivalsParse";
import {
  MX_ARRIVAL_DAYS,
  MX_ARRIVAL_SECTIONS,
  MX_TRUCK_POSITIONS,
  type LoadOption,
  type MxArrival,
  type MxArrivalDay,
  type MxArrivalSection,
  type MxCommodity,
  type MxGrower,
  type MxGrowerLabel,
  type MxTruckPosition,
} from "@/lib/types";
import { addArrivalRow, clearMxArrivals, deleteArrivalRow, importMxArrivals, updateArrivalRow } from "./actions";

// Compact fields for the dense table view - small enough to sit shoulder to
// shoulder like the source Excel sheet, instead of one field per line.
const cellField = "w-full min-w-0 rounded border border-gray-300 bg-white px-1 py-0.5 text-xs text-black";
const cellFieldSm = `${cellField} w-16`;

// Matches the source sheet's alternating dark green / blue-grey section bands.
const SECTION_COLORS: Record<MxArrivalSection, string> = {
  lettuce: "#2E7D32",
  broccoli: "#33691E",
  peppers_hothouse: "#37474F",
  celery_carrots_cauliflower: "#455A64",
};

// Distinct chip colors for linking manifests that share a truck - cycled by
// hashing the truck_group text, so the same group name always lands on the
// same color without needing to track color assignment anywhere.
const TRUCK_BADGE_CLASSES = [
  "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300",
  "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
  "bg-lime-100 text-lime-800 dark:bg-lime-900/40 dark:text-lime-300",
  "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300",
  "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/40 dark:text-fuchsia-300",
];

function truckBadgeClass(truckGroup: string): string {
  let hash = 0;
  for (let i = 0; i < truckGroup.length; i++) hash = (hash * 31 + truckGroup.charCodeAt(i)) % TRUCK_BADGE_CLASSES.length;
  return TRUCK_BADGE_CLASSES[hash];
}

// A faint tint of each day's own color (see MX_ARRIVAL_DAYS' badgeClass) on
// the row itself - light enough not to fight with the white input fields
// sitting on top of it, just enough to separate one row from the next at a
// glance without reading every Arrival cell.
const ROW_DAY_BG: Record<MxArrivalDay, string> = {
  monday: "bg-blue-50 dark:bg-blue-900/10",
  tuesday: "bg-orange-50 dark:bg-orange-900/10",
  wednesday: "bg-purple-50 dark:bg-purple-900/10",
  thursday: "bg-amber-50 dark:bg-amber-900/10",
  friday: "bg-pink-50 dark:bg-pink-900/10",
  saturday: "bg-teal-50 dark:bg-teal-900/10",
  sunday: "bg-red-50 dark:bg-red-900/10",
};

function dayInfo(day: MxArrivalDay | null) {
  return MX_ARRIVAL_DAYS.find((d) => d.value === day) ?? null;
}

interface WeekData {
  arrivals: MxArrival[];
}

const COMMODITY_SLOT_KEYS = ["commodity_1_id", "commodity_2_id", "commodity_3_id", "commodity_4_id"] as const;

function commodityIdsOf(row: MxArrival): (string | null)[] {
  return COMMODITY_SLOT_KEYS.map((key) => row[key]);
}

function commodityName(id: string | null, commodities: MxCommodity[]): string {
  if (!id) return "";
  return commodities.find((c) => c.id === id)?.name ?? "";
}

const ARRIVAL_HEADERS = [
  "Grower",
  "Origin",
  "Label",
  "Commodity",
  "Bx's Aprox",
  "Price to Grower",
  "Manifesto",
  "Arrival Booking",
  "Notes",
];

function arrivalRowValues(row: MxArrival, growers: MxGrower[], labels: MxGrowerLabel[], commodities: MxCommodity[]): string[] {
  const grower = growers.find((g) => g.id === row.grower_id);
  const label = labels.find((l) => l.id === row.label_id);
  const commodityNames = commodityIdsOf(row)
    .map((id) => commodityName(id, commodities))
    .filter(Boolean);
  return [
    grower?.name ?? "",
    grower?.origin ?? "",
    label?.name ?? "",
    commodityNames.join(" / "),
    row.boxes_approx ?? "",
    row.price_to_grower ?? "",
    row.manifesto ?? "",
    dayInfo(row.arrival_day)?.label ?? "",
    row.notes ?? "",
  ];
}

export default function ArrivalsClient({
  initialWeekStart,
  growers,
  labels,
  commodities,
  initialArrivals,
  loadOptions,
}: {
  initialWeekStart: string;
  growers: MxGrower[];
  labels: MxGrowerLabel[];
  commodities: MxCommodity[];
  initialArrivals: MxArrival[];
  loadOptions: LoadOption[];
}) {
  const confirm = useConfirm();
  const router = useRouter();
  const [weekStart, setWeekStart] = useState(initialWeekStart);
  const [cache, setCache] = useState<Record<string, WeekData>>(() => ({
    [initialWeekStart]: { arrivals: initialArrivals },
  }));
  const [extraSlots, setExtraSlots] = useState<Record<string, number>>({});
  const [imageStatus, setImageStatus] = useState<string | null>(null);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [previewRows, setPreviewRows] = useState<ParsedMxArrivalRow[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  // Which arrival days are checked in the summary strip - empty means no
  // filter (show every day). Multiple days can be checked at once.
  const [dayFilter, setDayFilter] = useState<Set<MxArrivalDay>>(new Set());

  const week = cache[weekStart] ?? { arrivals: [] };
  const loading = !(weekStart in cache);
  const isCurrentWeek = weekStart === currentWeekStart();

  function loadWeek(target: string) {
    setWeekStart(target);
    if (target in cache) return;
    const supabase = createClient();
    supabase
      .from("mx_arrivals")
      .select("*")
      .eq("week_start_date", target)
      .order("position", { ascending: true })
      .then(({ data }) => {
        setCache((prev) => ({ ...prev, [target]: { arrivals: (data ?? []) as MxArrival[] } }));
      });
  }

  function patchWeek(patch: Partial<WeekData>) {
    setCache((prev) => ({ ...prev, [weekStart]: { ...(prev[weekStart] ?? week), ...patch } }));
  }

  async function handleAddRow(section: MxArrivalSection) {
    const sectionRows = week.arrivals.filter((a) => a.section === section);
    const nextPosition = sectionRows.length > 0 ? Math.max(...sectionRows.map((a) => a.position)) + 1 : 1;
    const row = (await addArrivalRow(weekStart, section, nextPosition)) as MxArrival;
    patchWeek({ arrivals: [...week.arrivals, row] });
  }

  function handleRowSave(id: string, patch: Partial<MxArrival>) {
    patchWeek({ arrivals: week.arrivals.map((a) => (a.id === id ? { ...a, ...patch } : a)) });
    updateArrivalRow(id, patch).catch(() => {});
  }

  async function handleRowDelete(id: string) {
    if (!(await confirm("Delete this arrival?"))) return;
    patchWeek({ arrivals: week.arrivals.filter((a) => a.id !== id) });
    await deleteArrivalRow(id).catch(() => {});
  }

  const truckGroupCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of week.arrivals) {
      if (!a.truck_group) continue;
      counts.set(a.truck_group, (counts.get(a.truck_group) ?? 0) + 1);
    }
    return counts;
  }, [week.arrivals]);

  const summary = useMemo(() => {
    const byDay = new Map<MxArrivalDay, number>();
    for (const a of week.arrivals) {
      if (!a.arrival_day) continue;
      byDay.set(a.arrival_day, (byDay.get(a.arrival_day) ?? 0) + 1);
    }
    return {
      total: week.arrivals.length,
      byDay: MX_ARRIVAL_DAYS.map((d) => ({ ...d, count: byDay.get(d.value) ?? 0 })).filter((d) => d.count > 0),
    };
  }, [week.arrivals]);

  function slotsShown(row: MxArrival): number {
    const filledCount = commodityIdsOf(row).filter(Boolean).length;
    return Math.max(1, filledCount, extraSlots[row.id] ?? 0);
  }

  function handleAddCommoditySlot(row: MxArrival) {
    setExtraSlots((prev) => ({ ...prev, [row.id]: Math.min(4, slotsShown(row) + 1) }));
  }

  function toggleDayFilter(day: MxArrivalDay) {
    setDayFilter((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  }

  function handlePreview() {
    const result = parsePastedMxArrivals(pasteText);
    if (result.error) {
      setParseError(result.error);
      setPreviewRows(null);
      return;
    }
    setParseError(null);
    setPreviewRows(result.rows);
  }

  function handleCancelPreview() {
    setPreviewRows(null);
    setParseError(null);
  }

  // Growers/labels/commodities are server-component props, not client
  // state - a router.refresh() re-runs page.tsx's queries so any newly
  // created master data shows up. The arrival rows themselves are
  // re-fetched directly (same query loadWeek uses) since cache is only
  // ever seeded from props on mount, not kept in sync with them afterward.
  async function handleConfirmImport() {
    if (!previewRows) return;
    setImporting(true);
    try {
      await importMxArrivals(weekStart, previewRows);
      setPreviewRows(null);
      setPasteText("");
      setShowPaste(false);
      const supabase = createClient();
      const { data } = await supabase
        .from("mx_arrivals")
        .select("*")
        .eq("week_start_date", weekStart)
        .order("position", { ascending: true });
      patchWeek({ arrivals: (data ?? []) as MxArrival[] });
      router.refresh();
    } finally {
      setImporting(false);
    }
  }

  async function handleClearList() {
    if (week.arrivals.length === 0) return;
    if (!(await confirm(`Clear all ${week.arrivals.length} rows for Week ${weekNumberOf(weekStart)}? This can't be undone.`))) return;
    await clearMxArrivals(weekStart);
    patchWeek({ arrivals: [] });
  }

  async function handleCopyImage() {
    try {
      const blocks: CanvasBlock[] = MX_ARRIVAL_SECTIONS.map((s) => {
        const rows = week.arrivals
          .filter((a) => a.section === s.value)
          .sort((a, b) => a.position - b.position)
          .map((a) => ({ cells: arrivalRowValues(a, growers, labels, commodities) }));
        return {
          title: s.label,
          headerColor: SECTION_COLORS[s.value],
          columnHeaders: ARRIVAL_HEADERS,
          rows: rows.length > 0 ? rows : [{ cells: ["Nothing logged.", ...Array(ARRIVAL_HEADERS.length - 1).fill("")] }],
        };
      });
      const blob = await renderPriceSheetPng({
        title: `Arrivals Report - Week ${weekNumberOf(weekStart)}`,
        message: formatWeekLabel(weekStart),
        blocks,
        direction: "column",
      });
      const result = await copyOrDownloadPng(blob, `arrivals-week-${weekNumberOf(weekStart)}.png`);
      setImageStatus(result === "copied" ? "Image copied!" : "Image downloaded!");
      setTimeout(() => setImageStatus(null), 2500);
    } catch {
      alert("Could not create the image - try again.");
    }
  }

  return (
    // Breaks out of the page's centered max-w container so the dense table
    // below has room before it needs to scroll left/right.
    <div className="relative left-1/2 right-1/2 -mx-[50vw] w-screen lg:mx-[calc(7.5rem-50vw)] lg:w-[calc(100vw-15rem)] px-4 sm:px-8">
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Arrivals</h1>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleCopyImage}
            className="rounded-md bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800"
          >
            {imageStatus ?? "Copy as Image"}
          </button>
          <button
            onClick={() => setShowPaste((s) => !s)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            {showPaste ? "Hide paste box" : "Paste from Excel"}
          </button>
          <button
            onClick={handleClearList}
            disabled={week.arrivals.length === 0}
            className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-40 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            Clear List
          </button>
        </div>
      </div>

      <UpdateStatusButton pageKey="mx-arrivals" />

      {showPaste && (
        <div className="space-y-3 rounded-lg border border-black/10 p-4 dark:border-white/10">
          <p className="text-sm text-black/60 dark:text-white/60">
            Paste the full weekly Arrivals sheet here - all four sections (Lettuce, Broccoli, Bell Peppers/Hot
            House, Celery/Carrots/Other), each with its own LOADS header row. New growers, labels, and
            commodities not already on file get created automatically. This replaces whatever&apos;s already
            logged for the week currently shown above (Week {weekNumberOf(weekStart)}) - not added on top of it.
          </p>
          <textarea
            value={pasteText}
            onChange={(e) => {
              setPasteText(e.target.value);
              setPreviewRows(null);
              setParseError(null);
            }}
            rows={6}
            placeholder="Paste tab-separated rows from Excel here..."
            className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 font-mono text-xs text-black"
          />
          {parseError && <p className="text-sm text-red-600">{parseError}</p>}

          {!previewRows && (
            <button
              onClick={handlePreview}
              disabled={pasteText.trim() === ""}
              className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
            >
              Preview
            </button>
          )}

          {previewRows && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Found {previewRows.length} row{previewRows.length === 1 ? "" : "s"}.</p>
              <div className="max-h-64 overflow-auto rounded border border-black/10 dark:border-white/10">
                <table className="w-full text-xs">
                  <thead className="bg-black/5 text-left dark:bg-white/5">
                    <tr>
                      <th className="px-2 py-1">Section</th>
                      <th className="px-2 py-1">Grower</th>
                      <th className="px-2 py-1">Label</th>
                      <th className="px-2 py-1">Commodity</th>
                      <th className="px-2 py-1">Manifesto</th>
                      <th className="px-2 py-1">Arrival</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((r, i) => (
                      <tr key={i} className="border-t border-black/10 dark:border-white/10">
                        <td className="px-2 py-1">{MX_ARRIVAL_SECTIONS.find((s) => s.value === r.section)?.label}</td>
                        <td className="px-2 py-1">{r.growerName}</td>
                        <td className="px-2 py-1">{r.labelName}</td>
                        <td className="px-2 py-1">{r.commodityNames.join(" / ")}</td>
                        <td className="px-2 py-1">{r.manifesto}</td>
                        <td className="px-2 py-1">{dayInfo(r.arrivalDay)?.label ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleConfirmImport}
                  disabled={importing}
                  className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
                >
                  {importing
                    ? "Importing..."
                    : week.arrivals.length > 0
                      ? `Replace with ${previewRows.length} Row${previewRows.length === 1 ? "" : "s"}`
                      : `Add ${previewRows.length} Row${previewRows.length === 1 ? "" : "s"}`}
                </button>
                <button
                  onClick={handleCancelPreview}
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/10"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => loadWeek(prevWeekStart(weekStart))}
          className="rounded-md border border-black/20 px-3 py-1.5 text-sm dark:border-white/20"
        >
          ← Prev Week
        </button>
        <span className="text-sm font-medium">
          Week {weekNumberOf(weekStart)} - {formatWeekLabel(weekStart)}{" "}
          {isCurrentWeek && <span className="text-green-600">(current)</span>}
        </span>
        <button
          onClick={() => loadWeek(nextWeekStart(weekStart))}
          className="rounded-md border border-black/20 px-3 py-1.5 text-sm dark:border-white/20"
        >
          Next Week →
        </button>
        {!isCurrentWeek && (
          <button onClick={() => loadWeek(currentWeekStart())} className="text-sm font-medium text-green-600 hover:underline">
            Back to current week
          </button>
        )}
        {loading && <span className="text-xs text-black/40">loading...</span>}
      </div>

      <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setDayFilter(new Set())}
            className={`rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-700 transition dark:bg-green-900/40 dark:text-green-300 ${
              dayFilter.size === 0 ? "ring-2 ring-green-500" : "opacity-70 hover:opacity-100"
            }`}
          >
            {summary.total} total load{summary.total === 1 ? "" : "s"}
          </button>
          {summary.byDay.map((d) => (
            <button
              key={d.value}
              onClick={() => toggleDayFilter(d.value)}
              className={`rounded-full px-3 py-1 text-sm font-medium transition ${d.badgeClass} ${
                dayFilter.has(d.value) ? "ring-2 ring-black/50 dark:ring-white/70" : "opacity-70 hover:opacity-100"
              }`}
            >
              {d.count} {d.label}
            </button>
          ))}
          {dayFilter.size > 0 && (
            <button
              onClick={() => setDayFilter(new Set())}
              className="text-xs font-medium text-black/50 hover:underline dark:text-white/50"
            >
              Clear filter
            </button>
          )}
        </div>
      </div>

      {MX_ARRIVAL_SECTIONS.map((section) => {
        const sectionRows = week.arrivals
          .filter((a) => a.section === section.value && (dayFilter.size === 0 || (a.arrival_day && dayFilter.has(a.arrival_day))))
          .sort((a, b) => a.position - b.position);
        const aproxLabel = section.value === "peppers_hothouse" ? "Pallets" : "Bx's Aprox";
        return (
          <section key={section.value} className="space-y-2">
            <h2 className="border-b-2 border-green-600 pb-1 text-lg font-bold text-green-700 dark:text-green-400">
              {section.label}
            </h2>
            {sectionRows.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
                <table className="w-full text-xs">
                  <thead className="bg-black/5 text-left dark:bg-white/5">
                    <tr>
                      <th className="px-1.5 py-1 font-medium">Grower</th>
                      <th className="px-1.5 py-1 font-medium">Origin</th>
                      <th className="px-1.5 py-1 font-medium">Label</th>
                      <th className="px-1.5 py-1 font-medium">Commodity</th>
                      <th className="px-1.5 py-1 font-medium">{aproxLabel}</th>
                      <th className="px-1.5 py-1 font-medium">Price to Grower</th>
                      <th className="px-1.5 py-1 font-medium">Manifesto</th>
                      <th className="px-1.5 py-1 font-medium">Arrival</th>
                      <th className="px-1.5 py-1 font-medium">Notes</th>
                      <th className="px-1.5 py-1 font-medium">Load</th>
                      <th className="px-1.5 py-1 font-medium">Truck</th>
                      <th className="px-1.5 py-1 font-medium">Pos</th>
                      <th className="px-1.5 py-1" />
                    </tr>
                  </thead>
                  <tbody>
                    {sectionRows.map((row) => {
                      const grower = growers.find((g) => g.id === row.grower_id);
                      const day = dayInfo(row.arrival_day);
                      const shownSlots = slotsShown(row);
                      const truckShared = row.truck_group ? (truckGroupCounts.get(row.truck_group) ?? 0) > 1 : false;
                      return (
                        <tr
                          key={row.id}
                          className={`border-t border-black/10 align-top dark:border-white/10 ${
                            row.arrival_day ? ROW_DAY_BG[row.arrival_day] : ""
                          }`}
                        >
                          <td className="min-w-[8rem] px-1.5 py-1">
                            <select
                              value={row.grower_id ?? ""}
                              onChange={(e) => handleRowSave(row.id, { grower_id: e.target.value || null })}
                              className={cellField}
                            >
                              <option value="">--</option>
                              {growers.map((g) => (
                                <option key={g.id} value={g.id}>
                                  {g.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-1.5 py-1">
                            <input value={grower?.origin ?? ""} disabled className={`${cellFieldSm} bg-black/5 dark:bg-white/10`} />
                          </td>
                          <td className="px-1.5 py-1">
                            <select
                              value={row.label_id ?? ""}
                              onChange={(e) => handleRowSave(row.id, { label_id: e.target.value || null })}
                              className={cellField}
                            >
                              <option value="">--</option>
                              {labels.map((l) => (
                                <option key={l.id} value={l.id}>
                                  {l.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="min-w-[9rem] space-y-0.5 px-1.5 py-1">
                            {Array.from({ length: shownSlots }, (_, i) => i).map((i) => (
                              <select
                                key={i}
                                value={row[COMMODITY_SLOT_KEYS[i]] ?? ""}
                                onChange={(e) => handleRowSave(row.id, { [COMMODITY_SLOT_KEYS[i]]: e.target.value || null })}
                                className={cellField}
                              >
                                <option value="">--</option>
                                {commodities.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name}
                                  </option>
                                ))}
                              </select>
                            ))}
                            {shownSlots < 4 && (
                              <button
                                onClick={() => handleAddCommoditySlot(row)}
                                className="block text-[11px] font-medium text-green-700 hover:underline dark:text-green-400"
                              >
                                + another
                              </button>
                            )}
                          </td>
                          <td className="px-1.5 py-1">
                            <input
                              defaultValue={row.boxes_approx ?? ""}
                              onBlur={(e) => handleRowSave(row.id, { boxes_approx: e.target.value })}
                              className={cellFieldSm}
                            />
                          </td>
                          <td className="px-1.5 py-1">
                            <input
                              defaultValue={row.price_to_grower ?? ""}
                              onBlur={(e) => handleRowSave(row.id, { price_to_grower: e.target.value })}
                              className={cellFieldSm}
                            />
                          </td>
                          <td className="min-w-[7rem] px-1.5 py-1">
                            <input
                              defaultValue={row.manifesto ?? ""}
                              onBlur={(e) => handleRowSave(row.id, { manifesto: e.target.value })}
                              className={cellField}
                            />
                          </td>
                          <td className="min-w-[6rem] px-1.5 py-1">
                            <select
                              value={row.arrival_day ?? ""}
                              onChange={(e) => handleRowSave(row.id, { arrival_day: (e.target.value || null) as MxArrivalDay | null })}
                              className={`${cellField} font-medium ${day?.badgeClass ?? ""}`}
                            >
                              <option value="">--</option>
                              {MX_ARRIVAL_DAYS.map((d) => (
                                <option key={d.value} value={d.value}>
                                  {d.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="min-w-[8rem] px-1.5 py-1">
                            <input
                              defaultValue={row.notes ?? ""}
                              onBlur={(e) => handleRowSave(row.id, { notes: e.target.value })}
                              className={cellField}
                            />
                          </td>
                          <td className="min-w-[9rem] px-1.5 py-1">
                            <select
                              value={row.linked_load_id ?? ""}
                              onChange={(e) => handleRowSave(row.id, { linked_load_id: e.target.value || null })}
                              className={cellField}
                            >
                              <option value="">--</option>
                              {loadOptions.map((l) => (
                                <option key={l.id} value={l.id}>
                                  {l.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-1.5 py-1">
                            <div className="flex items-center gap-1">
                              {truckShared && row.truck_group && (
                                <span className={`h-2 w-2 shrink-0 rounded-full ${truckBadgeClass(row.truck_group)}`} />
                              )}
                              <input
                                defaultValue={row.truck_group ?? ""}
                                onBlur={(e) => handleRowSave(row.id, { truck_group: e.target.value || null })}
                                placeholder="e.g. 1"
                                className={cellFieldSm}
                              />
                            </div>
                          </td>
                          <td className="px-1.5 py-1">
                            <select
                              value={row.truck_position ?? ""}
                              onChange={(e) =>
                                handleRowSave(row.id, { truck_position: (e.target.value || null) as MxTruckPosition | null })
                              }
                              className={cellFieldSm}
                            >
                              <option value="">--</option>
                              {MX_TRUCK_POSITIONS.map((p) => (
                                <option key={p.value} value={p.value}>
                                  {p.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-1.5 py-1">
                            <button
                              onClick={() => handleRowDelete(row.id)}
                              className="text-[11px] font-medium text-red-600 hover:underline"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {sectionRows.length === 0 && (
              <p className="rounded-lg border border-dashed border-black/10 p-4 text-center text-sm text-black/40 dark:border-white/10 dark:text-white/40">
                {dayFilter.size > 0 ? "Nothing on the selected day(s)." : "Nothing logged yet."}
              </p>
            )}
            <button
              onClick={() => handleAddRow(section.value)}
              className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
            >
              + Add Row
            </button>
          </section>
        );
      })}
    </div>
    </div>
  );
}
