"use client";

import { useState } from "react";
import { parseBuyersListPaste, type ParsedBuyersItem } from "@/lib/buyersListParse";
import type { BuyersListItem } from "@/lib/types";
import { deleteBuyersListItem, importBuyersListItems, updateBuyersListNotes } from "./actions";

const field = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black";

export default function BuyersListClient({ initialItems }: { initialItems: BuyersListItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [showPaste, setShowPaste] = useState(initialItems.length === 0);
  const [pasteText, setPasteText] = useState("");
  const [previewItems, setPreviewItems] = useState<ParsedBuyersItem[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  function handlePreview() {
    const result = parseBuyersListPaste(pasteText);
    if (result.error) {
      setParseError(result.error);
      setPreviewItems(null);
      return;
    }
    setParseError(null);
    setPreviewItems(result.items);
  }

  async function handleConfirmImport() {
    if (!previewItems) return;
    setImporting(true);
    try {
      const result = await importBuyersListItems(previewItems);
      setItems(result);
      setPreviewItems(null);
      setPasteText("");
      setShowPaste(false);
    } finally {
      setImporting(false);
    }
  }

  function handleCancelPreview() {
    setPreviewItems(null);
    setParseError(null);
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this item from the Buyers List?")) return;
    setItems((prev) => prev.filter((i) => i.id !== id));
    await deleteBuyersListItem(id).catch(() => {});
  }

  function handleNotesSave(id: string, notes: string) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, notes } : i)));
    updateBuyersListNotes(id, notes).catch(() => {});
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Buyers List</h1>
        <button
          onClick={() => setShowPaste((s) => !s)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          {showPaste ? "Hide paste box" : "Paste from Excel"}
        </button>
      </div>

      {showPaste && (
        <div className="space-y-3 rounded-lg border border-black/10 p-4 dark:border-white/10">
          <p className="text-sm text-black/60 dark:text-white/60">
            Copy the inventory report from Excel (including the header row) and paste below. Any row
            with a negative Avl gets added below - an item already on the list just gets its quantity
            refreshed, nothing is removed automatically.
          </p>
          <textarea
            value={pasteText}
            onChange={(e) => {
              setPasteText(e.target.value);
              setPreviewItems(null);
              setParseError(null);
            }}
            rows={6}
            placeholder="Paste tab-separated rows from Excel here..."
            className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 font-mono text-xs text-black"
          />
          {parseError && <p className="text-sm text-red-600">{parseError}</p>}

          {!previewItems && (
            <button
              onClick={handlePreview}
              disabled={pasteText.trim() === ""}
              className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
            >
              Preview
            </button>
          )}

          {previewItems && (
            <div className="space-y-2">
              <p className="text-sm font-medium">
                Found {previewItems.length} shortage{previewItems.length === 1 ? "" : "s"}:
              </p>
              <div className="max-h-64 overflow-auto rounded border border-black/10 dark:border-white/10">
                <table className="w-full text-xs">
                  <thead className="bg-black/5 text-left dark:bg-white/5">
                    <tr>
                      <th className="px-2 py-1">Comm</th>
                      <th className="px-2 py-1">Var</th>
                      <th className="px-2 py-1">PStyle</th>
                      <th className="px-2 py-1">Size</th>
                      <th className="px-2 py-1">Label</th>
                      <th className="px-2 py-1">Qty Needed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewItems.map((r, i) => (
                      <tr key={i} className="border-t border-black/10 dark:border-white/10">
                        <td className="px-2 py-1">{r.comm}</td>
                        <td className="px-2 py-1">{r.variety}</td>
                        <td className="px-2 py-1">{r.pstyle}</td>
                        <td className="px-2 py-1">{r.size}</td>
                        <td className="px-2 py-1">{r.label}</td>
                        <td className="px-2 py-1">{r.qtyNeeded.toLocaleString()}</td>
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
                  {importing ? "Adding..." : "Add to Buyers List"}
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
              <th className="px-2 py-2">Comm</th>
              <th className="px-2 py-2">Var</th>
              <th className="px-2 py-2">PStyle</th>
              <th className="px-2 py-2">Size</th>
              <th className="px-2 py-2">Label</th>
              <th className="px-2 py-2">Qty Needed</th>
              <th className="px-2 py-2">Notes</th>
              <th className="w-16 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-black/10 dark:border-white/10">
                <td className="px-2 py-1.5">{item.comm}</td>
                <td className="px-2 py-1.5">{item.variety}</td>
                <td className="px-2 py-1.5">{item.pstyle}</td>
                <td className="px-2 py-1.5">{item.size}</td>
                <td className="px-2 py-1.5">{item.label}</td>
                <td className="px-2 py-1.5 font-semibold text-red-600 dark:text-red-400">
                  {item.qty_needed.toLocaleString()}
                </td>
                <td className="px-1 py-1">
                  <input
                    defaultValue={item.notes ?? ""}
                    onBlur={(e) => handleNotesSave(item.id, e.target.value)}
                    placeholder="Notes..."
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
                <td colSpan={8} className="px-3 py-4 text-center text-black/40 dark:text-white/40">
                  Nothing on the list - paste the inventory report from Excel above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
