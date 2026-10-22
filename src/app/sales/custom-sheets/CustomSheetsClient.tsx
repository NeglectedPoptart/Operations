"use client";

import { useEffect, useState } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import { copyOrDownloadPng, groupFobItems } from "@/lib/fobPricing";
import { buildCategoryBlocks, renderBrandedPriceSheetPng } from "@/lib/fobPriceSheetImage";
import {
  DEFAULT_FOOTER_DELIVERED,
  DEFAULT_FOOTER_FOB,
  PALLETS_PER_TRUCK,
  deliveredPrice,
  freightPerPallet,
  itemKey,
  type Destination,
  type FreightMode,
  type SavedSheet,
} from "@/lib/customSheets";
import type { FobItem, FobSection } from "@/lib/types";
import { deleteCustomSheet, saveCustomSheet } from "./actions";

const SECTIONS: { key: FobSection; label: string }[] = [
  { key: "western_veg", label: "Western Veg" },
  { key: "hot_house", label: "Hot House" },
];

const field = "rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-black placeholder:text-black/40";
const btn = "rounded-md border border-black/20 px-3 py-1.5 text-sm font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10";
const btnGreen = "rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50";

let destCounter = 0;
const newDestination = (): Destination => ({ id: `d${Date.now().toString(36)}${destCounter++}`, location: "", mode: "truck", amount: null });

function itemLabel(item: FobItem): string {
  const size = [item.unit_per !== null ? String(item.unit_per) : null, item.size].filter(Boolean).join(" / ");
  return [item.variety?.trim(), size].filter(Boolean).join(" - ") || "-";
}

const money = (n: number) => `$${n.toFixed(2)}`;

export default function CustomSheetsClient({
  today,
  items,
  initialSheets,
  savingReady,
}: {
  today: string;
  items: FobItem[];
  initialSheets: SavedSheet[];
  savingReady: boolean;
}) {
  const confirm = useConfirm();
  const [title, setTitle] = useState("Price Sheet");
  const [summary, setSummary] = useState("");
  const [footer, setFooter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [delivered, setDelivered] = useState(false);
  const [destinations, setDestinations] = useState<Destination[]>([newDestination()]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [sheets, setSheets] = useState(initialSheets);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [saveName, setSaveName] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const priced = (item: FobItem) => item.fob !== null;
  const term = search.trim().toLowerCase();

  // The destinations that are filled in enough to quote.
  const readyDestinations = delivered ? destinations.filter((d) => d.location.trim() && freightPerPallet(d) !== null) : [];
  const needsDestination = delivered && readyDestinations.length === 0;
  const chosen = items.filter((i) => selected.has(itemKey(i)) && priced(i));
  const missingNow = [...selected].length - chosen.length;

  function flash(text: string) {
    setStatus(text);
    setTimeout(() => setStatus(null), 3000);
  }

  // The picture of the sheet - used for the preview, Copy and Download.
  async function buildBlob(): Promise<Blob> {
    const priceColumns = delivered ? readyDestinations.map((d) => d.location.trim()) : ["FOB"];
    const priceValues = (item: FobItem) =>
      delivered
        ? readyDestinations.map((d) => {
            const p = deliveredPrice(item, freightPerPallet(d));
            return p === null ? "CALL" : money(p);
          })
        : [item.fob === null ? "CALL" : money(item.fob)];
    const blocks = SECTIONS.flatMap((s) => buildCategoryBlocks(groupFobItems(chosen, s.key), priceValues));
    const baseColumns = priceColumns.length >= 3 ? 2 : 3;
    return renderBrandedPriceSheetPng({
      subheaderText: title.trim() || "Price Sheet",
      priceColumns,
      subtitle: summary.trim() || undefined,
      footerNote: footer.trim() || (delivered ? DEFAULT_FOOTER_DELIVERED : DEFAULT_FOOTER_FOB),
      columns: Math.max(1, Math.min(baseColumns, blocks.length)),
      blocks,
    });
  }

  // Keep the preview in step with the choices (a moment after the last change).
  useEffect(() => {
    if (chosen.length === 0 || needsDestination) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPreviewUrl(null);
      return;
    }
    let cancelled = false;
    let url: string | null = null;
    const t = setTimeout(async () => {
      try {
        const blob = await buildBlob();
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        setPreviewError(null);
      } catch {
        if (!cancelled) setPreviewError("Could not draw the preview.");
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
      if (url) URL.revokeObjectURL(url);
    };
    // buildBlob reads exactly these values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, title, summary, footer, delivered, destinations, items]);

  async function copyImage() {
    try {
      const result = await copyOrDownloadPng(await buildBlob(), `${(title.trim() || "price-sheet").replace(/[^A-Za-z0-9]+/g, "-")}.png`);
      flash(result === "copied" ? "Image copied!" : "Image downloaded!");
    } catch {
      alert("Could not create the image - try again.");
    }
  }

  // ---- picking what to quote
  function toggleKeys(keys: string[], on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const k of keys) {
        if (on) next.add(k);
        else next.delete(k);
      }
      return next;
    });
  }

  function toggleOpen(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ---- delivered locations
  function patchDestination(id: string, patch: Partial<Destination>) {
    setDestinations((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }

  // ---- saved sheets
  function loadSheet(id: string) {
    if (!id) {
      setCurrentId(null);
      return;
    }
    const s = sheets.find((x) => x.id === id);
    if (!s) return;
    setCurrentId(s.id);
    setSaveName(s.name);
    setTitle(s.title);
    setSummary(s.summary);
    setFooter(s.footer);
    setSelected(new Set(s.selection));
    setDelivered(s.destinations.length > 0);
    setDestinations(s.destinations.length > 0 ? s.destinations : [newDestination()]);
  }

  async function save(asNew: boolean) {
    const result = await saveCustomSheet({
      id: asNew ? undefined : currentId ?? undefined,
      name: saveName,
      title,
      summary,
      footer,
      selection: [...selected],
      destinations: delivered ? destinations.filter((d) => d.location.trim() || d.amount !== null) : [],
    });
    if ("error" in result) {
      alert(result.error);
      return;
    }
    const saved = result.sheet;
    setSheets((prev) => [...prev.filter((s) => s.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name)));
    setCurrentId(saved.id);
    flash(`Saved "${saved.name}".`);
  }

  async function removeSheet() {
    const s = sheets.find((x) => x.id === currentId);
    if (!s) return;
    if (!(await confirm(`Delete the saved sheet "${s.name}"?`))) return;
    const result = await deleteCustomSheet(s.id);
    if ("error" in result) {
      alert(result.error);
      return;
    }
    setSheets((prev) => prev.filter((x) => x.id !== s.id));
    setCurrentId(null);
  }

  return (
    <div className="relative left-1/2 right-1/2 -mx-[50vw] w-screen px-4 sm:px-8 lg:mx-[calc(7.5rem-50vw)] lg:w-[calc(100vw-15rem)]">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold">Custom Price Sheets</h1>
            <p className="text-sm text-black/60 dark:text-white/60">Build a price sheet from today&apos;s FOB prices ({today}) - pick what to quote, and optionally price it delivered.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {status && <span className="text-sm font-medium text-green-700 dark:text-green-400">{status}</span>}
            <button onClick={copyImage} disabled={!previewUrl} className={btnGreen}>
              Copy as Image
            </button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {/* ---- the builder */}
          <div className="space-y-4">
            <section className="space-y-2 rounded-lg border border-black/10 p-3 dark:border-white/10">
              <h2 className="text-sm font-bold text-green-700 dark:text-green-400">Saved sheets</h2>
              {!savingReady && <p className="text-xs text-amber-600">Saving isn&apos;t set up yet (ask the admin to run migration 154) - you can still build and copy sheets.</p>}
              <div className="flex flex-wrap items-center gap-2">
                <select value={currentId ?? ""} onChange={(e) => loadSheet(e.target.value)} className={`${field} min-w-[12rem]`}>
                  <option value="">{sheets.length === 0 ? "No saved sheets yet" : "Open a saved sheet..."}</option>
                  {sheets.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="Name to save as" className={`${field} w-44`} />
                {currentId && (
                  <button onClick={() => void save(false)} disabled={!saveName.trim() || !savingReady} className={btn}>
                    Save changes
                  </button>
                )}
                <button onClick={() => void save(true)} disabled={!saveName.trim() || !savingReady} className={btn}>
                  Save as new
                </button>
                {currentId && (
                  <button onClick={() => void removeSheet()} className={`${btn} text-red-600`}>
                    Delete
                  </button>
                )}
              </div>
            </section>

            <section className="space-y-2 rounded-lg border border-black/10 p-3 dark:border-white/10">
              <h2 className="text-sm font-bold text-green-700 dark:text-green-400">1. Title and summary</h2>
              <label className="block text-xs font-medium text-black/60 dark:text-white/60">
                Title (the bar at the top of the sheet)
                <input value={title} onChange={(e) => setTitle(e.target.value)} className={`${field} mt-1 w-full`} />
              </label>
              <label className="block text-xs font-medium text-black/60 dark:text-white/60">
                Summary (optional - shown under the title)
                <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} className={`${field} mt-1 w-full`} />
              </label>
            </section>

            <section className="space-y-2 rounded-lg border border-black/10 p-3 dark:border-white/10">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-green-700 dark:text-green-400">2. What to quote ({chosen.length} selected)</h2>
                <div className="flex gap-2">
                  <button className={btn} onClick={() => toggleKeys(items.filter(priced).map(itemKey), true)}>
                    Select all priced
                  </button>
                  <button className={btn} onClick={() => setSelected(new Set())}>
                    Clear
                  </button>
                </div>
              </div>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search commodity or size..." className={`${field} w-full`} />
              {missingNow > 0 && <p className="text-xs text-amber-600">{missingNow} saved item{missingNow === 1 ? " has" : "s have"} no FOB price today, so {missingNow === 1 ? "it is" : "they are"} left off.</p>}

              <div className="max-h-[28rem] space-y-3 overflow-y-auto pr-1">
                {SECTIONS.map((section) => {
                  const groups = groupFobItems(items, section.key)
                    .map((g) => ({ ...g, rows: g.rows.filter((r) => !term || `${g.name} ${itemLabel(r)}`.toLowerCase().includes(term)) }))
                    .filter((g) => g.rows.length > 0);
                  if (groups.length === 0) return null;
                  return (
                    <div key={section.key}>
                      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-black/50 dark:text-white/50">{section.label}</p>
                      <div className="space-y-1">
                        {groups.map((g) => {
                          const pricedRows = g.rows.filter(priced);
                          const keys = pricedRows.map(itemKey);
                          const picked = keys.filter((k) => selected.has(k)).length;
                          const id = `${section.key}|${g.name}`;
                          const isOpen = open.has(id) || !!term;
                          return (
                            <div key={id} className="rounded border border-black/10 dark:border-white/10">
                              <div className="flex items-center gap-2 px-2 py-1.5">
                                <input
                                  type="checkbox"
                                  checked={keys.length > 0 && picked === keys.length}
                                  ref={(el) => {
                                    if (el) el.indeterminate = picked > 0 && picked < keys.length;
                                  }}
                                  disabled={keys.length === 0}
                                  onChange={(e) => toggleKeys(keys, e.target.checked)}
                                  title="Quote every size of this commodity"
                                />
                                <button onClick={() => toggleOpen(id)} className="flex flex-1 items-center justify-between text-left text-sm font-medium">
                                  <span>{g.name}</span>
                                  <span className="text-xs font-normal text-black/50 dark:text-white/50">
                                    {picked}/{keys.length} {isOpen ? "▾" : "▸"}
                                  </span>
                                </button>
                              </div>
                              {isOpen && (
                                <ul className="border-t border-black/10 px-2 py-1 dark:border-white/10">
                                  {g.rows.map((r) => {
                                    const k = itemKey(r);
                                    const ok = priced(r);
                                    return (
                                      <li key={r.id}>
                                        <label className={`flex items-center gap-2 py-0.5 text-sm ${ok ? "" : "opacity-50"}`}>
                                          <input type="checkbox" disabled={!ok} checked={ok && selected.has(k)} onChange={(e) => toggleKeys([k], e.target.checked)} />
                                          <span className="flex-1">{itemLabel(r)}</span>
                                          <span className="text-xs text-black/50 dark:text-white/50">{ok ? money(r.fob!) : "no price today"}</span>
                                        </label>
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="space-y-2 rounded-lg border border-black/10 p-3 dark:border-white/10">
              <label className="flex items-center gap-2 text-sm font-bold text-green-700 dark:text-green-400">
                <input type="checkbox" checked={delivered} onChange={(e) => setDelivered(e.target.checked)} />
                3. Make it a delivered sheet (add a location and freight)
              </label>
              {delivered ? (
                <div className="space-y-2">
                  <p className="text-xs text-black/60 dark:text-white/60">
                    Delivered price = FOB + freight per pallet ÷ cases per pallet, rounded up to the nearest $0.05. Each location becomes a price column.
                  </p>
                  {destinations.map((d) => {
                    const per = freightPerPallet(d);
                    return (
                      <div key={d.id} className="flex flex-wrap items-end gap-2 rounded border border-black/10 p-2 dark:border-white/10">
                        <label className="text-xs font-medium text-black/60 dark:text-white/60">
                          Location
                          <input value={d.location} onChange={(e) => patchDestination(d.id, { location: e.target.value })} placeholder="e.g. Atlanta, GA" className={`${field} mt-1 block w-44`} />
                        </label>
                        <label className="text-xs font-medium text-black/60 dark:text-white/60">
                          Freight
                          <select value={d.mode} onChange={(e) => patchDestination(d.id, { mode: e.target.value as FreightMode })} className={`${field} mt-1 block`}>
                            <option value="truck">FTL - total truck price (÷ {PALLETS_PER_TRUCK} pallets)</option>
                            <option value="pallet">FTL - price per pallet</option>
                          </select>
                        </label>
                        <label className="text-xs font-medium text-black/60 dark:text-white/60">
                          {d.mode === "truck" ? "Truck total $" : "Per pallet $"}
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={d.amount ?? ""}
                            onChange={(e) => patchDestination(d.id, { amount: e.target.value === "" ? null : Number(e.target.value) })}
                            className={`${field} mt-1 block w-28`}
                          />
                        </label>
                        <span className="pb-2 text-xs text-black/60 dark:text-white/60">{per !== null ? `= ${money(per)} per pallet` : ""}</span>
                        {destinations.length > 1 && (
                          <button onClick={() => setDestinations((prev) => prev.filter((x) => x.id !== d.id))} className="pb-2 text-xs text-red-600 hover:underline">
                            Remove
                          </button>
                        )}
                      </div>
                    );
                  })}
                  <button onClick={() => setDestinations((prev) => [...prev, newDestination()])} disabled={destinations.length >= 5} className={btn}>
                    + Add another location
                  </button>
                </div>
              ) : (
                <p className="text-xs text-black/60 dark:text-white/60">Off: the sheet quotes today&apos;s FOB prices.</p>
              )}
            </section>

            <section className="space-y-2 rounded-lg border border-black/10 p-3 dark:border-white/10">
              <label className="block text-xs font-medium text-black/60 dark:text-white/60">
                Fine print at the bottom (leave empty for the standard wording)
                <textarea value={footer} onChange={(e) => setFooter(e.target.value)} rows={2} placeholder={delivered ? DEFAULT_FOOTER_DELIVERED : DEFAULT_FOOTER_FOB} className={`${field} mt-1 w-full`} />
              </label>
            </section>
          </div>

          {/* ---- the sheet */}
          <div className="lg:sticky lg:top-2 lg:self-start">
            <div className="rounded-lg border border-black/10 p-3 dark:border-white/10">
              <h2 className="mb-2 text-sm font-bold text-green-700 dark:text-green-400">Preview</h2>
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="Price sheet preview" className="w-full rounded border border-black/10 bg-white" />
              ) : (
                <p className="rounded border border-dashed border-black/20 p-8 text-center text-sm text-black/50 dark:border-white/20 dark:text-white/50">
                  {needsDestination ? "Add a location and a freight amount to see the delivered prices." : "Tick the commodities and sizes you want to quote - the sheet shows up here."}
                </p>
              )}
              {previewError && <p className="mt-2 text-xs text-red-600">{previewError}</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
