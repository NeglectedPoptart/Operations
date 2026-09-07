"use client";

import { useState } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import { MX_STATES } from "@/lib/mexico";
import type { MxCommodity, MxGrower, MxGrowerLabel } from "@/lib/types";
import {
  createCommodity,
  createGrower,
  createLabel,
  deleteCommodity,
  deleteGrower,
  deleteLabel,
  updateGrower,
} from "./actions";

const field = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black";

// Simple chip-list manager shared by the Labels and Commodities panels -
// both are flat, name-only selection lists with the same add/remove shape.
function ChipListPanel({
  title,
  items,
  onAdd,
  onDelete,
}: {
  title: string;
  items: { id: string; name: string }[];
  onAdd: (name: string) => Promise<void>;
  onDelete: (id: string) => void;
}) {
  const confirm = useConfirm();
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  async function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    try {
      await onAdd(name);
      setNewName("");
    } catch {
      alert(`Couldn't add "${name}" - it may already exist.`);
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!(await confirm(`Remove "${name}"? Existing arrivals keep their value, but it won't be selectable anymore.`))) return;
    onDelete(id);
  }

  return (
    <div className="space-y-2 rounded-lg border border-black/10 p-4 dark:border-white/10">
      <h2 className="text-sm font-bold text-green-700 dark:text-green-400">{title}</h2>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <span
            key={item.id}
            className="flex items-center gap-1.5 rounded-full bg-black/5 px-3 py-1 text-sm dark:bg-white/10"
          >
            {item.name}
            <button
              onClick={() => handleDelete(item.id, item.name)}
              className="text-black/40 hover:text-red-600 dark:text-white/40"
              aria-label={`Remove ${item.name}`}
            >
              ×
            </button>
          </span>
        ))}
        {items.length === 0 && <p className="text-sm text-black/40 dark:text-white/40">None yet.</p>}
      </div>
      <div className="flex items-center gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={`Add a new ${title.toLowerCase().replace(/s$/, "")}...`}
          className={`${field} max-w-xs`}
        />
        <button
          onClick={handleAdd}
          disabled={adding || newName.trim() === ""}
          className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
        >
          {adding ? "Adding..." : "+ Add"}
        </button>
      </div>
    </div>
  );
}

export default function GrowersClient({
  initialGrowers,
  initialLabels,
  initialCommodities,
}: {
  initialGrowers: MxGrower[];
  initialLabels: MxGrowerLabel[];
  initialCommodities: MxCommodity[];
}) {
  const confirm = useConfirm();
  const [growers, setGrowers] = useState(initialGrowers);
  const [labels, setLabels] = useState(initialLabels);
  const [commodities, setCommodities] = useState(initialCommodities);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [newGrowerName, setNewGrowerName] = useState("");
  const [addingGrower, setAddingGrower] = useState(false);

  function toggleGrower(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleAddGrower() {
    const name = newGrowerName.trim();
    if (!name) return;
    setAddingGrower(true);
    try {
      const row = (await createGrower(name)) as MxGrower;
      setGrowers((prev) => [...prev, row].sort((a, b) => a.name.localeCompare(b.name)));
      setNewGrowerName("");
      setExpandedIds((prev) => new Set(prev).add(row.id));
    } catch {
      alert(`Couldn't add "${name}" - a grower with that name may already exist.`);
    } finally {
      setAddingGrower(false);
    }
  }

  function handleGrowerSave(id: string, patch: Partial<MxGrower>) {
    setGrowers((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
    updateGrower(id, patch).catch(() => {});
  }

  async function handleGrowerDelete(id: string, name: string) {
    if (!(await confirm(`Delete "${name}"? Past arrivals referencing this grower will keep their history but show no grower.`))) return;
    setGrowers((prev) => prev.filter((g) => g.id !== id));
    await deleteGrower(id).catch(() => {});
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Growers</h1>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={newGrowerName}
          onChange={(e) => setNewGrowerName(e.target.value)}
          placeholder="Add a grower..."
          className={`${field} max-w-xs`}
        />
        <button
          onClick={handleAddGrower}
          disabled={addingGrower || newGrowerName.trim() === ""}
          className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
        >
          {addingGrower ? "Adding..." : "+ Add Grower"}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {growers.map((g) => {
          const expanded = expandedIds.has(g.id);
          return (
            <div
              key={g.id}
              className={`rounded-lg border border-black/10 p-4 shadow-sm dark:border-white/10 ${
                expanded ? "sm:col-span-2 lg:col-span-3" : ""
              }`}
            >
              <button onClick={() => toggleGrower(g.id)} className="flex w-full items-center justify-between gap-2 text-left">
                <span className="font-medium">
                  {g.name}
                  {g.origin && <span className="ml-2 text-sm font-normal text-black/50 dark:text-white/50">{g.origin}</span>}
                </span>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  className={`h-4 w-4 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
                >
                  <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {expanded && (
                <div className="mt-4 grid grid-cols-1 gap-3 border-t border-black/10 pt-4 dark:border-white/10 sm:grid-cols-2">
                  <label className="text-xs font-medium">
                    Name
                    <input
                      defaultValue={g.name}
                      onBlur={(e) => handleGrowerSave(g.id, { name: e.target.value })}
                      className={`${field} mt-1`}
                    />
                  </label>
                  <label className="text-xs font-medium">
                    Origin
                    <select
                      value={g.origin ?? ""}
                      onChange={(e) => handleGrowerSave(g.id, { origin: e.target.value || null })}
                      className={`${field} mt-1`}
                    >
                      <option value="">--</option>
                      {MX_STATES.map((s) => (
                        <option key={s.code} value={s.code}>
                          {s.code} - {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-medium">
                    Best Contact
                    <input
                      defaultValue={g.best_contact ?? ""}
                      onBlur={(e) => handleGrowerSave(g.id, { best_contact: e.target.value })}
                      className={`${field} mt-1`}
                    />
                  </label>
                  <label className="text-xs font-medium">
                    Accounting Contact
                    <input
                      defaultValue={g.accounting_contact ?? ""}
                      onBlur={(e) => handleGrowerSave(g.id, { accounting_contact: e.target.value })}
                      className={`${field} mt-1`}
                    />
                  </label>
                  <label className="text-xs font-medium">
                    Logistics Contact
                    <input
                      defaultValue={g.logistics_contact ?? ""}
                      onBlur={(e) => handleGrowerSave(g.id, { logistics_contact: e.target.value })}
                      className={`${field} mt-1`}
                    />
                  </label>
                  <label className="text-xs font-medium sm:col-span-2">
                    Notes / Issues
                    <textarea
                      defaultValue={g.notes ?? ""}
                      onBlur={(e) => handleGrowerSave(g.id, { notes: e.target.value })}
                      rows={3}
                      className={`${field} mt-1`}
                    />
                  </label>
                  <div className="sm:col-span-2">
                    <button
                      onClick={() => handleGrowerDelete(g.id, g.name)}
                      className="text-xs font-medium text-red-600 hover:underline"
                    >
                      Delete Grower
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {growers.length === 0 && <p className="px-1 text-sm text-black/40 dark:text-white/40">No growers yet - add one above.</p>}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ChipListPanel
          title="Labels"
          items={labels}
          onAdd={async (name) => {
            const row = (await createLabel(name)) as MxGrowerLabel;
            setLabels((prev) => [...prev, row].sort((a, b) => a.name.localeCompare(b.name)));
          }}
          onDelete={(id) => {
            setLabels((prev) => prev.filter((l) => l.id !== id));
            deleteLabel(id).catch(() => {});
          }}
        />
        <ChipListPanel
          title="Commodities"
          items={commodities}
          onAdd={async (name) => {
            const row = (await createCommodity(name)) as MxCommodity;
            setCommodities((prev) => [...prev, row].sort((a, b) => a.name.localeCompare(b.name)));
          }}
          onDelete={(id) => {
            setCommodities((prev) => prev.filter((c) => c.id !== id));
            deleteCommodity(id).catch(() => {});
          }}
        />
      </div>
    </div>
  );
}
