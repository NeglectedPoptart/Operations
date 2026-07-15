"use client";

import { useMemo, useState } from "react";
import { parsePastedOldAge, type ParsedOldAgeRow } from "@/lib/oldAgeParse";
import { formatDate } from "@/lib/dates";
import { summarizeByCommodity, summarizeByNextStep } from "@/lib/oldAgeSummary";
import { OLD_AGE_NEXT_STEPS, type OldAgeItem, type OldAgeNextStep } from "@/lib/types";
import { addOldAgeRow, deleteOldAgeItem, importOldAgeItems, updateOldAgeItem } from "./actions";
import HorizontalBarChart from "@/components/HorizontalBarChart";

const field = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black";

export default function OldAgeClient({ initialItems }: { initialItems: OldAgeItem[] }) {
  const [items, setItems] = useState(initialItems);
  const nextStepSummary = useMemo(() => summarizeByNextStep(items), [items]);
  const commoditySummary = useMemo(() => summarizeByCommodity(items), [items]);
  const [showPaste, setShowPaste] = useState(initialItems.length === 0);
  const [pasteText, setPasteText] = useState("");
  const [previewRows, setPreviewRows] = useState<ParsedOldAgeRow[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [adding, setAdding] = useState(false);

  function handlePreview() {
    const result = parsePastedOldAge(pasteText);
    if (result.error) {
      setParseError(result.error);
      setPreviewRows(null);
      return;
    }
    setParseError(null);
    setPreviewRows(result.rows);
  }

  async function handleConfirmImport() {
    if (!previewRows) return;
    setImporting(true);
    try {
      const inserted = await importOldAgeItems(previewRows);
      setItems((inserted ?? []) as OldAgeItem[]);
      setPreviewRows(null);
      setPasteText("");
      setShowPaste(false);
    } finally {
      setImporting(false);
    }
  }

  function handleCancelPreview() {
    setPreviewRows(null);
    setParseError(null);
  }

  async function handleAddRow() {
    setAdding(true);
    try {
      const nextPosition = items.length > 0 ? Math.max(...items.map((i) => i.position)) + 1 : 1;
      const row = await addOldAgeRow(nextPosition);
      setItems((prev) => [...prev, row as OldAgeItem]);
    } finally {
      setAdding(false);
    }
  }

  function updateLocal(id: string, patch: Partial<OldAgeItem>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  async function handleFieldSave(id: string, patch: { notes?: string }) {
    await updateOldAgeItem(id, patch).catch(() => {});
  }

  async function handleNextStepChange(id: string, nextStep: OldAgeNextStep) {
    updateLocal(id, { next_step: nextStep });
    await updateOldAgeItem(id, { next_step: nextStep }).catch(() => {});
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this row?")) return;
    setItems((prev) => prev.filter((i) => i.id !== id));
    await deleteOldAgeItem(id).catch(() => {});
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Old Age</h1>
        <button
          onClick={() => setShowPaste((s) => !s)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          {showPaste ? "Hide paste box" : "Paste from Excel"}
        </button>
      </div>

      {items.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-black/10 p-4 shadow-sm dark:border-white/10">
            <h2 className="mb-3 text-sm font-bold text-green-700 dark:text-green-400">Next Step</h2>
            <HorizontalBarChart data={nextStepSummary} />
          </div>
          <div className="rounded-lg border border-black/10 p-4 shadow-sm dark:border-white/10">
            <h2 className="mb-3 text-sm font-bold text-green-700 dark:text-green-400">Qty by Commodity</h2>
            <HorizontalBarChart data={commoditySummary} />
          </div>
        </div>
      )}

      {showPaste && (
        <div className="space-y-3 rounded-lg border border-black/10 p-4 dark:border-white/10">
          <p className="text-sm text-black/60 dark:text-white/60">
            Copy the rows from Excel (including the header row) and paste below. This replaces the
            entire current list.
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
              <p className="text-sm font-medium">
                Found {previewRows.length} row{previewRows.length === 1 ? "" : "s"}:
              </p>
              <div className="max-h-64 overflow-auto rounded border border-black/10 dark:border-white/10">
                <table className="w-full text-xs">
                  <thead className="bg-black/5 text-left dark:bg-white/5">
                    <tr>
                      <th className="px-2 py-1">Document</th>
                      <th className="px-2 py-1">Received</th>
                      <th className="px-2 py-1">Description</th>
                      <th className="px-2 py-1">PStyle</th>
                      <th className="px-2 py-1">Size</th>
                      <th className="px-2 py-1">Qty</th>
                      <th className="px-2 py-1">Age</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((r, i) => (
                      <tr key={i} className="border-t border-black/10 dark:border-white/10">
                        <td className="px-2 py-1">{r.document}</td>
                        <td className="px-2 py-1">{formatDate(r.received_date)}</td>
                        <td className="px-2 py-1">{r.description}</td>
                        <td className="px-2 py-1">{r.pack_style}</td>
                        <td className="px-2 py-1">{r.size}</td>
                        <td className="px-2 py-1">{r.qty}</td>
                        <td className="px-2 py-1">{r.age}</td>
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
                  {importing ? "Importing..." : `Confirm Import (replaces ${items.length} current rows)`}
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

      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-black/5 text-left dark:bg-white/5">
            <tr>
              <th className="px-2 py-2">Document</th>
              <th className="px-2 py-2">Received</th>
              <th className="px-2 py-2">Description</th>
              <th className="px-2 py-2">PStyle</th>
              <th className="px-2 py-2">Size</th>
              <th className="px-2 py-2">Qty</th>
              <th className="px-2 py-2">Age</th>
              <th className="px-2 py-2">Next Step</th>
              <th className="px-2 py-2">Notes</th>
              <th className="w-16 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-black/10 dark:border-white/10">
                <td className="px-2 py-1.5">{item.document}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{formatDate(item.received_date)}</td>
                <td className="px-2 py-1.5">{item.description}</td>
                <td className="px-2 py-1.5">{item.pack_style}</td>
                <td className="px-2 py-1.5">{item.size}</td>
                <td className="px-2 py-1.5">{item.qty}</td>
                <td className="px-2 py-1.5">{item.age}</td>
                <td className="px-1 py-1">
                  <select
                    value={item.next_step ?? ""}
                    onChange={(e) => handleNextStepChange(item.id, e.target.value as OldAgeNextStep)}
                    className={field}
                  >
                    <option value="">--</option>
                    {OLD_AGE_NEXT_STEPS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-1 py-1">
                  <input
                    defaultValue={item.notes ?? ""}
                    onBlur={(e) => handleFieldSave(item.id, { notes: e.target.value })}
                    className={field}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="text-xs font-medium text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-4 text-center text-black/40 dark:text-white/40">
                  No items yet - paste in the Old Age report from Excel above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <button
        onClick={handleAddRow}
        disabled={adding}
        className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
      >
        {adding ? "Adding..." : "+ Add Row"}
      </button>
    </div>
  );
}
