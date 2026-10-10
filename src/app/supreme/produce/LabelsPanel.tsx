"use client";

import { useMemo, useState } from "react";
import CollapsibleSection from "@/components/CollapsibleSection";
import { useConfirm } from "@/components/ConfirmProvider";
import { addProductLabel, deleteProductLabel, pullLabelsFromInspections, renameProductLabel, type ProductLabel } from "./actions";

const field = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black";

// The Product Label list on the New Inspection form (CHENEY, FU CHOY, HARVEST
// BEST ...). Renaming a label changes it in the list from now on; inspections
// already saved keep the label they were saved with.
function LabelRow({ item, onRename, onDelete }: { item: ProductLabel; onRename: (id: string, name: string) => Promise<void>; onDelete: (item: ProductLabel) => void }) {
  const [text, setText] = useState(item.value);
  const [saving, setSaving] = useState(false);

  async function commit() {
    const name = text.trim();
    if (name === item.value) return;
    if (!name) {
      setText(item.value);
      return;
    }
    setSaving(true);
    try {
      await onRename(item.id, name);
    } catch {
      alert(`Couldn't rename it to "${name}" - a label with that name may already exist.`);
      setText(item.value);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-1">
      <input
        value={text}
        disabled={saving}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setText(item.value);
            e.currentTarget.blur();
          }
        }}
        className={field}
      />
      <button onClick={() => onDelete(item)} title="Remove this label" className="shrink-0 px-1 text-sm font-medium text-red-600 hover:text-red-700">
        ✕
      </button>
    </div>
  );
}

export default function LabelsPanel({ initialLabels }: { initialLabels: ProductLabel[] }) {
  const confirm = useConfirm();
  const [labels, setLabels] = useState(initialLabels);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState("");
  const [pulling, setPulling] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const sorted = useMemo(() => [...labels].sort((a, b) => a.value.localeCompare(b.value, undefined, { numeric: true })), [labels]);
  const shown = filter.trim() ? sorted.filter((l) => l.value.toLowerCase().includes(filter.trim().toLowerCase())) : sorted;

  async function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    try {
      const row = await addProductLabel(name);
      setLabels((prev) => [...prev, row]);
      setNewName("");
    } catch {
      alert(`Couldn't add "${name}" - it may already be in the list.`);
    } finally {
      setAdding(false);
    }
  }

  async function handleRename(id: string, name: string) {
    await renameProductLabel(id, name);
    setLabels((prev) => prev.map((l) => (l.id === id ? { ...l, value: name } : l)));
  }

  async function handleDelete(item: ProductLabel) {
    if (!(await confirm(`Remove the label "${item.value}"? Inspections already saved keep it; it just won't be in the list to pick.`))) return;
    setLabels((prev) => prev.filter((l) => l.id !== item.id));
    await deleteProductLabel(item.id).catch(() => {});
  }

  async function pull() {
    setPulling(true);
    setMessage(null);
    try {
      const { added } = await pullLabelsFromInspections();
      if (added.length > 0) setLabels((prev) => [...prev, ...added]);
      setMessage(added.length > 0 ? `Added ${added.length} label${added.length === 1 ? "" : "s"} from the inspections.` : "Every label used on an inspection is already in the list.");
    } catch {
      setMessage("Couldn't read the inspections - try again.");
    } finally {
      setPulling(false);
    }
  }

  return (
    <CollapsibleSection id="produce-labels" title="Labels" note={`${labels.length}`} defaultOpen={false}>
      <div className="space-y-3 rounded-lg border border-black/10 p-4 dark:border-white/10">
        <p className="text-xs text-black/50 dark:text-white/50">
          The Product Label list on the New Inspection form. Click a label to rename it; ✕ removes it.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find a label..." className={`${field} max-w-xs`} />
          <button
            onClick={pull}
            disabled={pulling}
            className="rounded-md border border-black/20 px-3 py-1.5 text-sm font-medium hover:bg-black/5 disabled:opacity-60 dark:border-white/20 dark:hover:bg-white/10"
          >
            {pulling ? "Reading..." : "Pull labels from inspections"}
          </button>
          {message && <span className="text-sm text-green-700 dark:text-green-400">{message}</span>}
        </div>
        <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((l) => (
            <LabelRow key={l.id} item={l} onRename={handleRename} onDelete={handleDelete} />
          ))}
          {shown.length === 0 && <p className="text-sm text-black/40 dark:text-white/40">{labels.length === 0 ? "No labels yet." : "No label matches."}</p>}
        </div>
        <div className="flex items-center gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleAdd();
            }}
            placeholder="Add a label..."
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
    </CollapsibleSection>
  );
}
