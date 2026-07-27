"use client";

import { useState } from "react";
import { parseBuyersListPaste, type ParsedBuyersItem } from "@/lib/buyersListParse";
import { copyOrDownloadPng, escapeHtml, renderPriceSheetPng, type CanvasBlock } from "@/lib/fobPricing";
import type { BuyersListItem } from "@/lib/types";
import {
  clearBuyersList,
  deleteBuyersListItem,
  importBuyersListItems,
  updateBuyersListNotes,
  updateBuyersListQty,
} from "./actions";

const field = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black";

const BUYERS_LIST_HEADERS = ["Comm", "Var", "PStyle", "Size", "Label", "Qty Needed", "Notes"];
function buyersListRowValues(item: BuyersListItem): string[] {
  return [
    item.comm,
    item.variety,
    item.pstyle,
    item.size,
    item.label,
    item.qty_needed.toLocaleString(),
    item.notes ?? "",
  ];
}

export default function BuyersListClient({ initialItems }: { initialItems: BuyersListItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [showPaste, setShowPaste] = useState(initialItems.length === 0);
  const [pasteText, setPasteText] = useState("");
  const [previewItems, setPreviewItems] = useState<ParsedBuyersItem[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [imageStatus, setImageStatus] = useState<string | null>(null);

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

  function handleQtySave(id: string, value: string) {
    const qty = Number(value);
    if (value.trim() === "" || !Number.isFinite(qty)) return;
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, qty_needed: qty } : i)));
    updateBuyersListQty(id, qty).catch(() => {});
  }

  async function handleCopyEmail() {
    const cell = "padding:3px 6px;border:1px solid #000;background:#ffffff;color:#000000;";
    const headCell = `${cell}font-weight:bold;background:#dddddd;`;
    const bodyRows =
      items.length > 0
        ? items
            .map(
              (item) =>
                `<tr>${buyersListRowValues(item)
                  .map((c) => `<td style="${cell}">${escapeHtml(c)}</td>`)
                  .join("")}</tr>`,
            )
            .join("")
        : `<tr><td colspan="${BUYERS_LIST_HEADERS.length}" style="${cell}text-align:center;color:#666666;">Nothing on the list.</td></tr>`;
    const html = `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #000;font-family:Calibri,Arial,sans-serif;font-size:12.5px;">
        <tr><td colspan="${BUYERS_LIST_HEADERS.length}" style="background:#8DC63F;color:#000;font-weight:bold;text-align:center;padding:6px;border:1px solid #000;">Buyers List</td></tr>
        <tr>${BUYERS_LIST_HEADERS.map((h) => `<td style="${headCell}">${escapeHtml(h)}</td>`).join("")}</tr>
        ${bodyRows}
      </table>`;
    const text = [
      "Buyers List",
      BUYERS_LIST_HEADERS.join("\t"),
      ...(items.length > 0 ? items.map((item) => buyersListRowValues(item).join("\t")) : ["Nothing on the list."]),
    ].join("\n");

    try {
      if (typeof ClipboardItem !== "undefined") {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([text], { type: "text/plain" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(text);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert("Could not copy to clipboard - your browser may not support it.");
    }
  }

  async function handleCopyImage() {
    try {
      const blocks: CanvasBlock[] = [
        {
          title: "Buyers List",
          headerColor: "#8DC63F",
          columnHeaders: BUYERS_LIST_HEADERS,
          rows:
            items.length > 0
              ? items.map((item) => ({ cells: buyersListRowValues(item) }))
              : [{ cells: ["Nothing on the list.", "", "", "", "", "", ""] }],
        },
      ];
      const blob = await renderPriceSheetPng({ title: "Buyers List", message: "", blocks });
      const result = await copyOrDownloadPng(blob, "buyers-list.png");
      setImageStatus(result === "copied" ? "Image copied!" : "Image downloaded!");
      setTimeout(() => setImageStatus(null), 2500);
    } catch {
      alert("Could not create the image - try again.");
    }
  }

  async function handleClearAll() {
    if (!confirm(`Clear all ${items.length} item${items.length === 1 ? "" : "s"} from the Buyers List? This can't be undone.`)) {
      return;
    }
    setClearing(true);
    try {
      await clearBuyersList();
      setItems([]);
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Buyers List</h1>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleCopyEmail}
            className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
          >
            {copied ? "Copied!" : "Copy for Email"}
          </button>
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
          <button
            onClick={handleClearAll}
            disabled={clearing || items.length === 0}
            className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            {clearing ? "Clearing..." : "Clear All"}
          </button>
        </div>
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
                <td className="min-w-[6rem] px-1 py-1">
                  <input
                    type="number"
                    step="any"
                    defaultValue={item.qty_needed}
                    onBlur={(e) => handleQtySave(item.id, e.target.value)}
                    className={`${field} font-semibold text-red-600`}
                  />
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
