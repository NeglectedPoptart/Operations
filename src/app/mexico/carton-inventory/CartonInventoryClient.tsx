"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { todayISO } from "@/lib/dates";
import type { CartonBalance, CartonLocation, CartonType, MxGrower } from "@/lib/types";
import {
  addCartons,
  reorderCartonLocations,
  setCartonCounts,
  setCartonLocationInactive,
  transferCartons,
  type TransferLine,
} from "./actions";

const field = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black";

function locationLabel(location: CartonLocation, growerById: Map<string, MxGrower>): string {
  if (location.kind === "homebase") return location.name ?? "Homebase";
  const grower = location.grower_id ? growerById.get(location.grower_id) : undefined;
  if (!grower) return "Unknown grower";
  const place = [grower.city, grower.state].filter(Boolean).join(", ");
  return place ? `${grower.name} - ${place}` : grower.name;
}

function sortLocations(locations: CartonLocation[], growerById: Map<string, MxGrower>): CartonLocation[] {
  return [...locations].sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position;
    if (a.kind !== b.kind) return a.kind === "homebase" ? -1 : 1;
    return locationLabel(a, growerById).localeCompare(locationLabel(b, growerById));
  });
}

interface TransferLineDraft {
  cartonTypeId: string;
  qty: string;
  toLocationId: string;
}

export default function CartonInventoryClient({
  initialLocations,
  cartonTypes,
  initialBalances,
  growers,
}: {
  initialLocations: CartonLocation[];
  cartonTypes: CartonType[];
  initialBalances: CartonBalance[];
  growers: MxGrower[];
}) {
  const growerById = useMemo(() => new Map(growers.map((g) => [g.id, g])), [growers]);
  // Active tiles keep a drag-arranged order (saved as `position`); inactive
  // ones (growers who ship to us but do not use our cartons) sit in their
  // own non-reorderable list below, sorted by name.
  const [order, setOrder] = useState(() => sortLocations(initialLocations.filter((l) => !l.inactive), growerById));
  const [inactiveList, setInactiveList] = useState(() =>
    [...initialLocations.filter((l) => l.inactive)].sort((a, b) => locationLabel(a, growerById).localeCompare(locationLabel(b, growerById))),
  );
  const [editMode, setEditMode] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const dragStartOrder = useRef<CartonLocation[] | null>(null);
  const [, startTransition] = useTransition();
  const locations = useMemo(() => [...order, ...inactiveList], [order, inactiveList]);
  const [balances, setBalances] = useState(initialBalances);
  const [showAddCartons, setShowAddCartons] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showCounts, setShowCounts] = useState(false);

  const [addCartonTypeId, setAddCartonTypeId] = useState(cartonTypes[0]?.id ?? "");
  const [addQty, setAddQty] = useState("");
  const [addDate, setAddDate] = useState(todayISO());
  const [addNotes, setAddNotes] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Dropdowns: every location can have its count set, but only active ones
  // take part in transfers.
  const sortedLocations = locations;
  const activeLocations = order;
  const cartonTypeById = useMemo(() => new Map(cartonTypes.map((c) => [c.id, c])), [cartonTypes]);
  const homebase = useMemo(() => locations.find((l) => l.kind === "homebase") ?? null, [locations]);

  const balancesByLocation = useMemo(() => {
    const map = new Map<string, { cartonTypeId: string; qty: number }[]>();
    for (const b of balances) {
      if (b.qty === 0) continue;
      if (!map.has(b.location_id)) map.set(b.location_id, []);
      map.get(b.location_id)!.push({ cartonTypeId: b.carton_type_id, qty: b.qty });
    }
    for (const rows of map.values()) {
      rows.sort((a, b) => (cartonTypeById.get(a.cartonTypeId)?.position ?? 0) - (cartonTypeById.get(b.cartonTypeId)?.position ?? 0));
    }
    return map;
  }, [balances, cartonTypeById]);

  function applyLocalBalance(cartonTypeId: string, locationId: string, delta: number) {
    setBalances((prev) => {
      const idx = prev.findIndex((b) => b.carton_type_id === cartonTypeId && b.location_id === locationId);
      if (idx === -1) {
        return [...prev, { carton_type_id: cartonTypeId, location_id: locationId, qty: delta, updated_at: new Date().toISOString() }];
      }
      const next = [...prev];
      next[idx] = { ...next[idx], qty: next[idx].qty + delta };
      return next;
    });
  }

  async function handleAddCartons() {
    const qty = Number(addQty);
    if (!addCartonTypeId || !Number.isFinite(qty) || qty <= 0 || !homebase) return;
    setAdding(true);
    setAddError(null);
    try {
      await addCartons(addCartonTypeId, qty, addDate, addNotes.trim() || null);
      applyLocalBalance(addCartonTypeId, homebase.id, qty);
      setAddQty("");
      setAddNotes("");
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Couldn't add cartons - try again.");
    } finally {
      setAdding(false);
    }
  }

  // Tile layout ----------------------------------------------------------

  function handleInactiveToggle(location: CartonLocation, nextInactive: boolean) {
    const sortInactive = (list: CartonLocation[]) =>
      [...list].sort((a, b) => locationLabel(a, growerById).localeCompare(locationLabel(b, growerById)));
    if (nextInactive) {
      setOrder((prev) => prev.filter((l) => l.id !== location.id));
      setInactiveList((prev) => sortInactive([...prev, { ...location, inactive: true }]));
    } else {
      setInactiveList((prev) => prev.filter((l) => l.id !== location.id));
      setOrder((prev) => [...prev, { ...location, inactive: false }]);
    }
    startTransition(async () => {
      try {
        await setCartonLocationInactive(location.id, nextInactive);
      } catch {
        if (nextInactive) {
          setInactiveList((prev) => prev.filter((l) => l.id !== location.id));
          setOrder((prev) => [...prev, { ...location, inactive: false }]);
        } else {
          setOrder((prev) => prev.filter((l) => l.id !== location.id));
          setInactiveList((prev) => sortInactive([...prev, { ...location, inactive: true }]));
        }
      }
    });
  }

  function handleDragStart(index: number) {
    dragStartOrder.current = order;
    setDraggedIndex(index);
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    setOrder((prev) => {
      const next = [...prev];
      const [moved] = next.splice(draggedIndex, 1);
      next.splice(index, 0, moved);
      return next;
    });
    setDraggedIndex(index);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const previous = dragStartOrder.current;
    const finalOrder = order;
    setDraggedIndex(null);
    dragStartOrder.current = null;
    if (!previous || previous.map((l) => l.id).join() === finalOrder.map((l) => l.id).join()) return;
    startTransition(async () => {
      try {
        await reorderCartonLocations(finalOrder.map((l) => l.id));
      } catch {
        setOrder(previous);
      }
    });
  }

  function handleDragEnd() {
    setDraggedIndex(null);
    dragStartOrder.current = null;
  }

  // Set counts -----------------------------------------------------------

  const [countLocationId, setCountLocationId] = useState("");
  const [countDate, setCountDate] = useState(todayISO());
  const [countValues, setCountValues] = useState<Record<string, string>>({});
  const [savingCounts, setSavingCounts] = useState(false);
  const [countError, setCountError] = useState<string | null>(null);

  function onHandAt(locationId: string, cartonTypeId: string): number {
    return balances.find((b) => b.location_id === locationId && b.carton_type_id === cartonTypeId)?.qty ?? 0;
  }

  async function handleSaveCounts() {
    if (!countLocationId) {
      setCountError("Pick a location.");
      return;
    }
    const lines = Object.entries(countValues)
      .filter(([, v]) => v.trim() !== "")
      .map(([cartonTypeId, v]) => ({ cartonTypeId, qty: Number(v) }));
    if (lines.length === 0) {
      setCountError("Enter at least one count.");
      return;
    }
    if (lines.some((l) => !Number.isInteger(l.qty) || l.qty < 0)) {
      setCountError("Counts must be whole numbers, 0 or more.");
      return;
    }
    setSavingCounts(true);
    setCountError(null);
    try {
      await setCartonCounts(countLocationId, lines, countDate);
      for (const l of lines) {
        applyLocalBalance(l.cartonTypeId, countLocationId, l.qty - onHandAt(countLocationId, l.cartonTypeId));
      }
      setCountValues({});
    } catch (err) {
      setCountError(err instanceof Error ? err.message : "Could not save the counts - try again.");
    } finally {
      setSavingCounts(false);
    }
  }

  // Transfer -------------------------------------------------------------

  const [fromLocationId, setFromLocationId] = useState("");
  const [transferDate, setTransferDate] = useState(todayISO());
  const [transferNotes, setTransferNotes] = useState("");
  const [transferLines, setTransferLines] = useState<TransferLineDraft[]>([{ cartonTypeId: "", qty: "", toLocationId: "" }]);
  const [transferring, setTransferring] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);

  const fromBalances = fromLocationId ? (balancesByLocation.get(fromLocationId) ?? []) : [];

  function updateLine(index: number, patch: Partial<TransferLineDraft>) {
    setTransferLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function addTransferLine() {
    setTransferLines((prev) => [...prev, { cartonTypeId: "", qty: "", toLocationId: "" }]);
  }

  function removeTransferLine(index: number) {
    setTransferLines((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleTransfer() {
    if (!fromLocationId) {
      setTransferError("Pick a from-location.");
      return;
    }
    const parsedLines: TransferLine[] = [];
    for (const l of transferLines) {
      const qty = Number(l.qty);
      if (!l.cartonTypeId || !l.toLocationId || !Number.isFinite(qty) || qty <= 0) continue;
      const available = fromBalances.find((b) => b.cartonTypeId === l.cartonTypeId)?.qty ?? 0;
      if (qty > available) {
        setTransferError(`Only ${available} available for that carton type at the from-location.`);
        return;
      }
      parsedLines.push({ cartonTypeId: l.cartonTypeId, qty, toLocationId: l.toLocationId });
    }
    if (parsedLines.length === 0) {
      setTransferError("Add at least one complete line.");
      return;
    }
    setTransferring(true);
    setTransferError(null);
    try {
      await transferCartons(fromLocationId, parsedLines, transferDate, transferNotes.trim() || null);
      for (const l of parsedLines) {
        applyLocalBalance(l.cartonTypeId, fromLocationId, -l.qty);
        applyLocalBalance(l.cartonTypeId, l.toLocationId, l.qty);
      }
      setTransferLines([{ cartonTypeId: "", qty: "", toLocationId: "" }]);
      setTransferNotes("");
      setShowTransfer(false);
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : "Couldn't complete the transfer - try again.");
    } finally {
      setTransferring(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Carton Inventory</h1>
          <p className="text-sm text-black/60 dark:text-white/60">
            Cartons on hand at Homebase (PCA, Texas) and each grower in Mexico.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              setShowAddCartons((v) => !v);
              setShowTransfer(false);
              setShowCounts(false);
            }}
            className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
          >
            {showAddCartons ? "Hide" : "+ Add Cartons"}
          </button>
          <button
            onClick={() => {
              setShowTransfer((v) => !v);
              setShowAddCartons(false);
              setShowCounts(false);
            }}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            {showTransfer ? "Hide" : "+ Transfer"}
          </button>
          <button
            onClick={() => {
              setShowCounts((v) => !v);
              setShowAddCartons(false);
              setShowTransfer(false);
            }}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            {showCounts ? "Hide" : "Set Counts"}
          </button>
        </div>
      </div>

      {showAddCartons && (
        <div className="space-y-3 rounded-lg border border-black/10 p-4 dark:border-white/10">
          <p className="text-sm text-black/60 dark:text-white/60">New cartons from PCA - always added to Homebase.</p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs font-medium">
              Carton Type
              <select value={addCartonTypeId} onChange={(e) => setAddCartonTypeId(e.target.value)} className={`${field} mt-1 w-56`}>
                {cartonTypes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium">
              Qty
              <input
                type="number"
                min="1"
                value={addQty}
                onChange={(e) => setAddQty(e.target.value)}
                className={`${field} mt-1 w-24`}
              />
            </label>
            <label className="text-xs font-medium">
              Date
              <input type="date" value={addDate} onChange={(e) => setAddDate(e.target.value)} className={`${field} mt-1`} />
            </label>
            <label className="text-xs font-medium">
              Notes
              <input value={addNotes} onChange={(e) => setAddNotes(e.target.value)} className={`${field} mt-1 w-48`} />
            </label>
            <button
              onClick={handleAddCartons}
              disabled={adding || cartonTypes.length === 0}
              className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
            >
              {adding ? "Adding..." : "Add"}
            </button>
          </div>
          {addError && <p className="text-sm text-red-600">{addError}</p>}
        </div>
      )}

      {showCounts && (
        <div className="space-y-3 rounded-lg border border-black/10 p-4 dark:border-white/10">
          <p className="text-sm text-black/60 dark:text-white/60">
            Set what a location actually has on hand right now - for loading starting inventory or correcting a count.
            Enter the counted number for each carton type (leave blank to leave it alone); the difference is recorded
            automatically.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs font-medium">
              Location
              <select
                value={countLocationId}
                onChange={(e) => {
                  setCountLocationId(e.target.value);
                  setCountValues({});
                  setCountError(null);
                }}
                className={`${field} mt-1 w-64`}
              >
                <option value="">--</option>
                {sortedLocations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {locationLabel(l, growerById)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium">
              Count date
              <input type="date" value={countDate} onChange={(e) => setCountDate(e.target.value)} className={`${field} mt-1`} />
            </label>
          </div>
          {countLocationId && (
            <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
              <table className="w-full text-sm">
                <thead className="bg-black/5 text-left dark:bg-white/5">
                  <tr>
                    <th className="px-2 py-2">Carton Type</th>
                    <th className="px-2 py-2 text-right">On hand now</th>
                    <th className="px-2 py-2">Counted</th>
                  </tr>
                </thead>
                <tbody>
                  {cartonTypes.map((c) => (
                    <tr key={c.id} className="border-t border-black/10 dark:border-white/10">
                      <td className="px-2 py-1.5">{c.name}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{onHandAt(countLocationId, c.id).toLocaleString()}</td>
                      <td className="px-1 py-1">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={countValues[c.id] ?? ""}
                          onChange={(e) => setCountValues((prev) => ({ ...prev, [c.id]: e.target.value }))}
                          className={`${field} w-28`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {countError && <p className="text-sm text-red-600">{countError}</p>}
          <button
            onClick={handleSaveCounts}
            disabled={savingCounts || !countLocationId}
            className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
          >
            {savingCounts ? "Saving..." : "Save Counts"}
          </button>
        </div>
      )}

      {showTransfer && (
        <div className="space-y-3 rounded-lg border border-black/10 p-4 dark:border-white/10">
          <p className="text-sm text-black/60 dark:text-white/60">
            Move cartons from one location to another - between growers, or back to Homebase.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs font-medium">
              From
              <select
                value={fromLocationId}
                onChange={(e) => {
                  setFromLocationId(e.target.value);
                  setTransferLines([{ cartonTypeId: "", qty: "", toLocationId: "" }]);
                }}
                className={`${field} mt-1 w-56`}
              >
                <option value="">-- Select --</option>
                {activeLocations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {locationLabel(l, growerById)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium">
              Date
              <input type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} className={`${field} mt-1`} />
            </label>
            <label className="text-xs font-medium">
              Notes
              <input value={transferNotes} onChange={(e) => setTransferNotes(e.target.value)} className={`${field} mt-1 w-48`} />
            </label>
          </div>

          {fromLocationId && (
            <div className="space-y-2">
              {fromBalances.length === 0 && (
                <p className="text-sm text-black/40 dark:text-white/40">Nothing available at this location.</p>
              )}
              {transferLines.map((line, i) => (
                <div key={i} className="flex flex-wrap items-end gap-2">
                  <label className="text-xs font-medium">
                    Carton Type
                    <select
                      value={line.cartonTypeId}
                      onChange={(e) => updateLine(i, { cartonTypeId: e.target.value })}
                      className={`${field} mt-1 w-56`}
                    >
                      <option value="">-- Select --</option>
                      {fromBalances.map((b) => (
                        <option key={b.cartonTypeId} value={b.cartonTypeId}>
                          {cartonTypeById.get(b.cartonTypeId)?.name ?? "?"} ({b.qty} available)
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-medium">
                    Qty
                    <input
                      type="number"
                      min="1"
                      value={line.qty}
                      onChange={(e) => updateLine(i, { qty: e.target.value })}
                      className={`${field} mt-1 w-24`}
                    />
                  </label>
                  <label className="text-xs font-medium">
                    To
                    <select
                      value={line.toLocationId}
                      onChange={(e) => updateLine(i, { toLocationId: e.target.value })}
                      className={`${field} mt-1 w-56`}
                    >
                      <option value="">-- Select --</option>
                      {activeLocations
                        .filter((l) => l.id !== fromLocationId)
                        .map((l) => (
                          <option key={l.id} value={l.id}>
                            {locationLabel(l, growerById)}
                          </option>
                        ))}
                    </select>
                  </label>
                  {transferLines.length > 1 && (
                    <button onClick={() => removeTransferLine(i)} className="text-xs font-medium text-red-600 hover:underline">
                      Remove
                    </button>
                  )}
                </div>
              ))}
              <button onClick={addTransferLine} className="text-xs font-medium text-green-700 hover:underline dark:text-green-400">
                + Add Line
              </button>
            </div>
          )}

          {transferError && <p className="text-sm text-red-600">{transferError}</p>}
          <button
            onClick={handleTransfer}
            disabled={transferring || !fromLocationId}
            className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
          >
            {transferring ? "Transferring..." : "Submit Transfer"}
          </button>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setEditMode((v) => !v)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              editMode
                ? "bg-green-600 text-white hover:bg-green-700"
                : "border border-black/20 text-black/70 hover:border-green-600 hover:text-green-700 dark:border-white/20 dark:text-white/70"
            }`}
          >
            {editMode ? "Done arranging" : "Edit layout"}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {order.map((location, index) => {
            const rows = balancesByLocation.get(location.id) ?? [];
            const body = (
              <>
                <h2 className="truncate text-sm font-bold text-green-700 dark:text-green-400">
                  {locationLabel(location, growerById)}
                </h2>
                {rows.length === 0 ? (
                  <p className="mt-1 text-xs text-black/40 dark:text-white/40">Nothing here yet.</p>
                ) : (
                  <ul className="mt-1 space-y-0.5">
                    {rows.map((r) => (
                      <li key={r.cartonTypeId} className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate text-black/70 dark:text-white/70">
                          {cartonTypeById.get(r.cartonTypeId)?.name ?? "?"}
                        </span>
                        <span className={`shrink-0 font-semibold tabular-nums ${r.qty < 0 ? "text-red-600 dark:text-red-400" : ""}`}>
                          {r.qty.toLocaleString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            );
            const cardClasses = "flex flex-col gap-2 rounded-lg border border-black/10 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-white/[0.03]";

            if (editMode) {
              return (
                <div
                  key={location.id}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDrop={handleDrop}
                  onDragEnd={handleDragEnd}
                  className={`${cardClasses} cursor-grab select-none active:cursor-grabbing ${draggedIndex === index ? "opacity-40" : ""}`}
                >
                  <div className="flex items-start gap-2">
                    <span aria-hidden className="shrink-0 text-lg leading-none text-black/30 dark:text-white/30">
                      ⠿
                    </span>
                    <div className="min-w-0 flex-1">{body}</div>
                  </div>
                </div>
              );
            }

            return (
              <div key={location.id} className={cardClasses}>
                <div className="min-w-0 flex-1">{body}</div>
                {location.kind === "grower" && (
                  <label className="flex items-center gap-1.5 border-t border-black/10 pt-2 text-xs text-black/50 dark:border-white/10 dark:text-white/50">
                    <input type="checkbox" checked={false} onChange={() => handleInactiveToggle(location, true)} />
                    Inactive (does not use our cartons)
                  </label>
                )}
              </div>
            );
          })}
        </div>

        {inactiveList.length > 0 && (
          <div className="space-y-2 border-t border-black/10 pt-4 dark:border-white/10">
            <h2 className="text-sm font-semibold text-black/50 dark:text-white/50">
              Not Using Our Cartons ({inactiveList.length})
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {inactiveList.map((location) => {
                const rows = balancesByLocation.get(location.id) ?? [];
                return (
                  <div
                    key={location.id}
                    className="flex flex-col gap-2 rounded-lg border border-black/10 bg-black/[0.03] p-3 opacity-60 grayscale transition hover:opacity-80 dark:border-white/10 dark:bg-white/[0.03]"
                  >
                    <h2 className="truncate text-sm font-bold">{locationLabel(location, growerById)}</h2>
                    {rows.length > 0 && (
                      <ul className="space-y-0.5">
                        {rows.map((r) => (
                          <li key={r.cartonTypeId} className="flex items-baseline justify-between gap-2 text-sm">
                            <span className="min-w-0 truncate">{cartonTypeById.get(r.cartonTypeId)?.name ?? "?"}</span>
                            <span className="shrink-0 font-semibold tabular-nums">{r.qty.toLocaleString()}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <label className="flex items-center gap-1.5 border-t border-black/10 pt-2 text-xs dark:border-white/10">
                      <input type="checkbox" checked onChange={() => handleInactiveToggle(location, false)} />
                      Inactive - uncheck to bring back
                    </label>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {locations.length === 0 && (
          <p className="text-sm text-black/40 dark:text-white/40">No locations yet - add a grower to get started.</p>
        )}
      </div>
    </div>
  );
}
