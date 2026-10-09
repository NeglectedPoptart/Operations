"use client";

import { useState } from "react";
import { addFieldOption } from "@/app/qc/inspections/new/actions";

// A field you pick from a shared list. A missing entry is added from the
// bottom of the list ("+ Add new...") and is then there for everyone.
export default function PickListField({
  fieldKey,
  value,
  options,
  onChange,
  onAdded,
  inputClass,
  placeholder,
}: {
  fieldKey: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  onAdded: (value: string) => void;
  inputClass: string;
  placeholder?: string;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // "Carrots" and "CARROTS" are the same entry: show the list's spelling.
  const match = options.find((o) => o.toLowerCase() === value.trim().toLowerCase());
  const current = match ?? value;
  // A value that isn't in the list yet still shows.
  const shown = current && !match ? [...options, current] : options;

  async function add() {
    setSaving(true);
    setProblem(null);
    const result = await addFieldOption(fieldKey, draft);
    setSaving(false);
    if ("error" in result) {
      setProblem(result.error);
      return;
    }
    onAdded(result.value);
    onChange(result.value);
    setAdding(false);
    setDraft("");
  }

  if (adding) {
    return (
      <div className="mt-1 space-y-1">
        <div className="flex gap-2">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (draft.trim() && !saving) void add();
              }
            }}
            placeholder={placeholder ?? "New entry"}
            className={inputClass}
          />
          <button type="button" onClick={add} disabled={saving || !draft.trim()} className="shrink-0 rounded-md bg-green-600 px-4 text-sm font-medium text-white disabled:opacity-50">
            {saving ? "..." : "Add"}
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setDraft("");
              setProblem(null);
            }}
            className="shrink-0 rounded-md border border-gray-300 px-3 text-sm text-black/70 dark:text-white/70"
          >
            Cancel
          </button>
        </div>
        {problem && <p className="text-xs text-red-600">{problem}</p>}
      </div>
    );
  }

  return (
    <select
      value={current}
      onChange={(e) => (e.target.value === "__add__" ? setAdding(true) : onChange(e.target.value))}
      className={`${inputClass} mt-1`}
    >
      <option value=""></option>
      {shown.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
      <option value="__add__">+ Add new...</option>
    </select>
  );
}
