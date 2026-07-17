"use client";

import { Fragment, useState } from "react";
import { formatDate, todayISO } from "@/lib/dates";
import type { RepackAdjustment, RepackItem } from "@/lib/types";
import {
  addRepackAdjustment,
  addRepackItem,
  deleteRepackAdjustment,
  deleteRepackItem,
  logRepackUsage,
} from "./actions";

const field = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black";

// A repack job usually touches several materials at once - pick each item
// and how much it took, save them all together as one batch.
function LogRepackModal({
  items,
  onClose,
  onSaved,
}: {
  items: RepackItem[];
  onClose: () => void;
  onSaved: (adjustments: RepackAdjustment[]) => void;
}) {
  const [entryDate, setEntryDate] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<{ itemId: string; qty: string }[]>([{ itemId: items[0]?.id ?? "", qty: "" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateLine(index: number, patch: Partial<{ itemId: string; qty: string }>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, { itemId: items[0]?.id ?? "", qty: "" }]);
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    const parsedLines = lines
      .map((l) => ({ itemId: l.itemId, qty: Number(l.qty) }))
      .filter((l) => l.itemId && Number.isFinite(l.qty) && l.qty > 0);
    if (parsedLines.length === 0) {
      setError("Add at least one item with a quantity used.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const inserted = await logRepackUsage(parsedLines, entryDate, notes);
      onSaved(inserted as RepackAdjustment[]);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to log repack.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg space-y-4 rounded-lg bg-white p-5 dark:bg-neutral-900">
        <h2 className="text-lg font-bold">Log Repack</h2>

        <div className="flex gap-3">
          <label className="flex-1 text-sm">
            Date
            <input
              type="date"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              className={`${field} mt-1`}
            />
          </label>
          <label className="flex-[2] text-sm">
            Notes (optional)
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Lettuce repack job"
              className={`${field} mt-1`}
            />
          </label>
        </div>

        <div className="space-y-2">
          {lines.map((line, i) => (
            <div key={i} className="flex items-center gap-2">
              <select
                value={line.itemId}
                onChange={(e) => updateLine(i, { itemId: e.target.value })}
                className={`${field} flex-1`}
              >
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                value={line.qty}
                onChange={(e) => updateLine(i, { qty: e.target.value })}
                placeholder="Qty used"
                className={`${field} w-28`}
              />
              {lines.length > 1 && (
                <button onClick={() => removeLine(i)} className="text-xs font-medium text-red-600 hover:underline">
                  Remove
                </button>
              )}
            </div>
          ))}
          <button
            onClick={addLine}
            className="text-sm font-medium text-green-700 hover:underline dark:text-green-400"
          >
            + Add another item
          </button>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save Repack"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Full ledger for one item, plus a small form for a one-off entry (restock,
// correction, or a single usage not tied to a multi-item repack).
function ItemHistory({
  item,
  adjustments,
  onAdd,
  onDelete,
}: {
  item: RepackItem;
  adjustments: RepackAdjustment[];
  onAdd: (qty: number, entryDate: string, notes: string) => Promise<void>;
  onDelete: (id: string) => void;
}) {
  const [qty, setQty] = useState("");
  const [entryDate, setEntryDate] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    const n = Number(qty);
    if (!Number.isFinite(n) || n === 0) return;
    setSaving(true);
    try {
      await onAdd(n, entryDate, notes);
      setQty("");
      setNotes("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 bg-black/5 p-4 dark:bg-white/5">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          Date
          <input
            type="date"
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
            className={`${field} mt-1`}
          />
        </label>
        <label className="text-sm">
          Qty (negative = used, positive = restock)
          <input type="number" value={qty} onChange={(e) => setQty(e.target.value)} className={`${field} mt-1 w-40`} />
        </label>
        <label className="flex-1 text-sm">
          Notes
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className={`${field} mt-1`} />
        </label>
        <button
          onClick={handleAdd}
          disabled={saving}
          className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
        >
          {saving ? "Adding..." : "Add"}
        </button>
      </div>

      <div className="overflow-x-auto rounded border border-black/10 dark:border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-black/5 text-left dark:bg-white/10">
            <tr>
              <th className="px-2 py-1">Date</th>
              <th className="px-2 py-1">Qty</th>
              <th className="px-2 py-1">Notes</th>
              <th className="w-16 px-2 py-1" />
            </tr>
          </thead>
          <tbody>
            {adjustments.map((a) => (
              <tr key={a.id} className="border-t border-black/10 bg-white dark:border-white/10 dark:bg-neutral-900">
                <td className="whitespace-nowrap px-2 py-1">{formatDate(a.entry_date)}</td>
                <td className={`px-2 py-1 font-medium ${a.qty < 0 ? "text-red-600" : "text-green-600"}`}>
                  {a.qty > 0 ? `+${a.qty}` : a.qty}
                </td>
                <td className="px-2 py-1">{a.notes}</td>
                <td className="px-2 py-1">
                  <button onClick={() => onDelete(a.id)} className="text-xs font-medium text-red-600 hover:underline">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {adjustments.length === 0 && (
              <tr>
                <td colSpan={4} className="px-2 py-3 text-center text-black/40 dark:text-white/40">
                  No history yet for {item.name}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function RepackInventoryClient({
  initialItems,
  initialAdjustments,
}: {
  initialItems: RepackItem[];
  initialAdjustments: RepackAdjustment[];
}) {
  const [items, setItems] = useState(initialItems);
  const [adjustments, setAdjustments] = useState(initialAdjustments);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showLogRepack, setShowLogRepack] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [newItemStock, setNewItemStock] = useState("");
  const [addingItem, setAddingItem] = useState(false);

  function bumpStock(itemId: string, delta: number) {
    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, current_stock: i.current_stock + delta } : i)));
  }

  function handleRepackSaved(inserted: RepackAdjustment[]) {
    setAdjustments((prev) => [...inserted, ...prev]);
    for (const a of inserted) bumpStock(a.item_id, a.qty);
  }

  async function handleAddAdjustment(itemId: string, qty: number, entryDate: string, notes: string) {
    const row = await addRepackAdjustment(itemId, entryDate, qty, notes);
    setAdjustments((prev) => [row as RepackAdjustment, ...prev]);
    bumpStock(itemId, qty);
  }

  async function handleDeleteAdjustment(id: string) {
    if (!confirm("Delete this entry? The item's current stock will be adjusted back.")) return;
    const row = adjustments.find((a) => a.id === id);
    setAdjustments((prev) => prev.filter((a) => a.id !== id));
    if (row) bumpStock(row.item_id, -row.qty);
    await deleteRepackAdjustment(id).catch(() => {});
  }

  async function handleAddItem() {
    if (!newItemName.trim()) return;
    setAddingItem(true);
    try {
      const nextPosition = items.length > 0 ? Math.max(...items.map((i) => i.position)) + 1 : 1;
      const stock = Number(newItemStock) || 0;
      const row = await addRepackItem(newItemName.trim(), stock, nextPosition);
      setItems((prev) => [...prev, row as RepackItem]);
      setNewItemName("");
      setNewItemStock("");
      setShowAddItem(false);
    } finally {
      setAddingItem(false);
    }
  }

  async function handleDeleteItem(id: string) {
    if (!confirm("Delete this item and all of its history? This can't be undone.")) return;
    setItems((prev) => prev.filter((i) => i.id !== id));
    setAdjustments((prev) => prev.filter((a) => a.item_id !== id));
    await deleteRepackItem(id).catch(() => {});
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Repack Inventory</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAddItem((s) => !s)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            + Add Item
          </button>
          <button
            onClick={() => setShowLogRepack(true)}
            disabled={items.length === 0}
            className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
          >
            Log Repack
          </button>
        </div>
      </div>

      {showAddItem && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-black/10 p-4 dark:border-white/10">
          <label className="flex-1 text-sm">
            Item name
            <input value={newItemName} onChange={(e) => setNewItemName(e.target.value)} className={`${field} mt-1`} />
          </label>
          <label className="text-sm">
            Initial stock
            <input
              type="number"
              value={newItemStock}
              onChange={(e) => setNewItemStock(e.target.value)}
              className={`${field} mt-1 w-32`}
            />
          </label>
          <button
            onClick={handleAddItem}
            disabled={addingItem}
            className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
          >
            {addingItem ? "Adding..." : "Add"}
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-black/5 text-left dark:bg-white/5">
            <tr>
              <th className="px-2 py-2">Item</th>
              <th className="px-2 py-2">Initial Stock</th>
              <th className="px-2 py-2">Current Stock</th>
              <th className="w-28 px-2 py-2" />
              <th className="w-16 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const expanded = expandedId === item.id;
              return (
                <Fragment key={item.id}>
                  <tr className="border-t border-black/10 dark:border-white/10">
                    <td className="px-2 py-2">
                      <button
                        onClick={() => setExpandedId(expanded ? null : item.id)}
                        className="flex items-center gap-1 text-left font-medium hover:underline"
                      >
                        <span className="text-black/40 dark:text-white/40">{expanded ? "▾" : "▸"}</span>
                        {item.name}
                      </button>
                    </td>
                    <td className="px-2 py-2 text-black/60 dark:text-white/60">{item.initial_stock}</td>
                    <td className="px-2 py-2 text-lg font-bold">{item.current_stock}</td>
                    <td className="px-2 py-2">
                      <button
                        onClick={() => setExpandedId(expanded ? null : item.id)}
                        className="text-xs font-medium text-green-700 hover:underline dark:text-green-400"
                      >
                        {expanded ? "Hide history" : "View history"}
                      </button>
                    </td>
                    <td className="px-2 py-2">
                      <button
                        onClick={() => handleDeleteItem(item.id)}
                        className="text-xs font-medium text-red-600 hover:underline"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                  {expanded && (
                    <tr>
                      <td colSpan={5} className="p-0">
                        <ItemHistory
                          item={item}
                          adjustments={adjustments.filter((a) => a.item_id === item.id)}
                          onAdd={(qty, entryDate, notes) => handleAddAdjustment(item.id, qty, entryDate, notes)}
                          onDelete={handleDeleteAdjustment}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-black/40 dark:text-white/40">
                  No items yet - click &quot;+ Add Item&quot; to start tracking a material.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showLogRepack && (
        <LogRepackModal items={items} onClose={() => setShowLogRepack(false)} onSaved={handleRepackSaved} />
      )}
    </div>
  );
}
