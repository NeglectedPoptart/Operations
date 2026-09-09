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
  type MxArrival,
  type MxArrivalDay,
  type MxArrivalSection,
  type MxCommodity,
  type MxGrower,
  type MxGrowerLabel,
  type MxTruckPosition,
} from "@/lib/types";
import { addArrivalRow, deleteArrivalRow, importMxArrivals, updateArrivalRow } from "./actions";

const field = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black";

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
}: {
  initialWeekStart: string;
  growers: MxGrower[];
  labels: MxGrowerLabel[];
  commodities: MxCommodity[];
  initialArrivals: MxArrival[];
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
        </div>
      </div>

      <UpdateStatusButton pageKey="mx-arrivals" />

      {showPaste && (
        <div className="space-y-3 rounded-lg border border-black/10 p-4 dark:border-white/10">
          <p className="text-sm text-black/60 dark:text-white/60">
            Paste the full weekly Arrivals sheet here - all four sections (Lettuce, Broccoli, Bell Peppers/Hot
            House, Celery/Carrots/Other), each with its own LOADS header row. New growers, labels, and
            commodities not already on file get created automatically. Rows are added to whichever week is
            currently shown above (Week {weekNumberOf(weekStart)}).
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
                  {importing ? "Importing..." : `Add ${previewRows.length} Row${previewRows.length === 1 ? "" : "s"}`}
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
          <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-700 dark:bg-green-900/40 dark:text-green-300">
            {summary.total} total load{summary.total === 1 ? "" : "s"}
          </span>
          {summary.byDay.map((d) => (
            <span key={d.value} className={`rounded-full px-3 py-1 text-sm font-medium ${d.badgeClass}`}>
              {d.count} {d.label}
            </span>
          ))}
        </div>
      </div>

      {MX_ARRIVAL_SECTIONS.map((section) => {
        const sectionRows = week.arrivals.filter((a) => a.section === section.value).sort((a, b) => a.position - b.position);
        return (
          <section key={section.value} className="space-y-2">
            <h2 className="border-b-2 border-green-600 pb-1 text-lg font-bold text-green-700 dark:text-green-400">
              {section.label}
            </h2>
            <div className="space-y-3">
              {sectionRows.map((row) => {
                const grower = growers.find((g) => g.id === row.grower_id);
                const day = dayInfo(row.arrival_day);
                const shownSlots = slotsShown(row);
                const truckShared = row.truck_group ? (truckGroupCounts.get(row.truck_group) ?? 0) > 1 : false;
                return (
                  <div key={row.id} className="space-y-3 rounded-lg border border-black/10 p-4 dark:border-white/10">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {truckShared && row.truck_group ? (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${truckBadgeClass(row.truck_group)}`}>
                          🚚 {row.truck_group}
                          {row.truck_position && ` - ${MX_TRUCK_POSITIONS.find((p) => p.value === row.truck_position)?.label}`}
                        </span>
                      ) : (
                        <span />
                      )}
                      <button onClick={() => handleRowDelete(row.id)} className="text-xs font-medium text-red-600 hover:underline">
                        Delete
                      </button>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <label className="text-xs font-medium">
                        Grower
                        <select
                          value={row.grower_id ?? ""}
                          onChange={(e) => handleRowSave(row.id, { grower_id: e.target.value || null })}
                          className={`${field} mt-1`}
                        >
                          <option value="">--</option>
                          {growers.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs font-medium">
                        Origin
                        <input value={grower?.origin ?? ""} disabled className={`${field} mt-1 bg-black/5 dark:bg-white/10`} />
                      </label>
                      <label className="text-xs font-medium">
                        Label
                        <select
                          value={row.label_id ?? ""}
                          onChange={(e) => handleRowSave(row.id, { label_id: e.target.value || null })}
                          className={`${field} mt-1`}
                        >
                          <option value="">--</option>
                          {labels.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs font-medium">
                        Arrival Booking
                        <select
                          value={row.arrival_day ?? ""}
                          onChange={(e) => handleRowSave(row.id, { arrival_day: (e.target.value || null) as MxArrivalDay | null })}
                          className={`${field} mt-1 font-medium ${day?.badgeClass ?? ""}`}
                        >
                          <option value="">--</option>
                          {MX_ARRIVAL_DAYS.map((d) => (
                            <option key={d.value} value={d.value}>
                              {d.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      {Array.from({ length: shownSlots }, (_, i) => i).map((i) => (
                        <label key={i} className="text-xs font-medium">
                          Commodity {i + 1}
                          <select
                            value={row[COMMODITY_SLOT_KEYS[i]] ?? ""}
                            onChange={(e) => handleRowSave(row.id, { [COMMODITY_SLOT_KEYS[i]]: e.target.value || null })}
                            className={`${field} mt-1`}
                          >
                            <option value="">--</option>
                            {commodities.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                      {shownSlots < 4 && (
                        <div className="flex items-end pb-1">
                          <button
                            onClick={() => handleAddCommoditySlot(row)}
                            className="text-xs font-medium text-green-700 hover:underline dark:text-green-400"
                          >
                            + Add another commodity
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <label className="text-xs font-medium">
                        Bx&apos;s Aprox
                        <input
                          defaultValue={row.boxes_approx ?? ""}
                          onBlur={(e) => handleRowSave(row.id, { boxes_approx: e.target.value })}
                          className={`${field} mt-1`}
                        />
                      </label>
                      <label className="text-xs font-medium">
                        Price to Grower
                        <input
                          defaultValue={row.price_to_grower ?? ""}
                          onBlur={(e) => handleRowSave(row.id, { price_to_grower: e.target.value })}
                          className={`${field} mt-1`}
                        />
                      </label>
                      <label className="text-xs font-medium">
                        Manifesto
                        <input
                          defaultValue={row.manifesto ?? ""}
                          onBlur={(e) => handleRowSave(row.id, { manifesto: e.target.value })}
                          className={`${field} mt-1`}
                        />
                      </label>
                      <label className="text-xs font-medium">
                        Notes
                        <input
                          defaultValue={row.notes ?? ""}
                          onBlur={(e) => handleRowSave(row.id, { notes: e.target.value })}
                          className={`${field} mt-1`}
                        />
                      </label>
                    </div>

                    <details className="text-xs">
                      <summary className="cursor-pointer font-medium text-black/50 hover:text-black/70 dark:text-white/50 dark:hover:text-white/70">
                        Same truck as another manifest?
                      </summary>
                      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="text-xs font-medium">
                          Truck Group
                          <input
                            defaultValue={row.truck_group ?? ""}
                            onBlur={(e) => handleRowSave(row.id, { truck_group: e.target.value || null })}
                            placeholder="e.g. Truck 1"
                            className={`${field} mt-1`}
                          />
                        </label>
                        <label className="text-xs font-medium">
                          Position in Truck
                          <select
                            value={row.truck_position ?? ""}
                            onChange={(e) =>
                              handleRowSave(row.id, { truck_position: (e.target.value || null) as MxTruckPosition | null })
                            }
                            className={`${field} mt-1`}
                          >
                            <option value="">--</option>
                            {MX_TRUCK_POSITIONS.map((p) => (
                              <option key={p.value} value={p.value}>
                                {p.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </details>
                  </div>
                );
              })}
              {sectionRows.length === 0 && (
                <p className="rounded-lg border border-dashed border-black/10 p-4 text-center text-sm text-black/40 dark:border-white/10 dark:text-white/40">
                  Nothing logged yet.
                </p>
              )}
            </div>
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
  );
}
