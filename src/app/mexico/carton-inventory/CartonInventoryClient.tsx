"use client";

import { useMemo, useState } from "react";
import { todayISO } from "@/lib/dates";
import type { CartonBalance, CartonLocation, CartonType, MxGrower } from "@/lib/types";
import { addCartons, transferCartons, type TransferLine } from "./actions";

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
  const [locations] = useState(initialLocations);
  const [balances, setBalances] = useState(initialBalances);
  const [showAddCartons, setShowAddCartons] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);

  const [addCartonTypeId, setAddCartonTypeId] = useState(cartonTypes[0]?.id ?? "");
  const [addQty, setAddQty] = useState("");
  const [addDate, setAddDate] = useState(todayISO());
  const [addNotes, setAddNotes] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const growerById = useMemo(() => new Map(growers.map((g) => [g.id, g])), [growers]);
  const sortedLocations = useMemo(() => sortLocations(locations, growerById), [locations, growerById]);
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
            }}
            className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
          >
            {showAddCartons ? "Hide" : "+ Add Cartons"}
          </button>
          <button
            onClick={() => {
              setShowTransfer((v) => !v);
              setShowAddCartons(false);
            }}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            {showTransfer ? "Hide" : "+ Transfer"}
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
                {sortedLocations.map((l) => (
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
                      {sortedLocations
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

      <div className="space-y-4">
        {sortedLocations.map((location) => {
          const rows = balancesByLocation.get(location.id) ?? [];
          return (
            <div key={location.id} className="space-y-2">
              <h2 className="rounded-md bg-green-700 px-3 py-1.5 text-sm font-bold text-white">
                {locationLabel(location, growerById)}
              </h2>
              <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
                <table className="w-full text-sm">
                  <thead className="bg-black/5 text-left dark:bg-white/5">
                    <tr>
                      <th className="px-2 py-2">Carton Type</th>
                      <th className="px-2 py-2 text-right">Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.cartonTypeId} className="border-t border-black/10 dark:border-white/10">
                        <td className="px-2 py-1.5">{cartonTypeById.get(r.cartonTypeId)?.name ?? "?"}</td>
                        <td className="px-2 py-1.5 text-right font-medium">{r.qty.toLocaleString()}</td>
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={2} className="px-3 py-3 text-center text-black/40 dark:text-white/40">
                          Nothing here yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
        {sortedLocations.length === 0 && (
          <p className="text-sm text-black/40 dark:text-white/40">No locations yet - add a grower to get started.</p>
        )}
      </div>
    </div>
  );
}
