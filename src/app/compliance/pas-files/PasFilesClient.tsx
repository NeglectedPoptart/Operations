"use client";

import { useState } from "react";
import { parsePastedPasFiles, type ParsedPasFileRow } from "@/lib/pasFilesParse";
import { daysSince, formatDate } from "@/lib/dates";
import { PAS_HIGHLIGHTS, type PasFile, type PasHighlight } from "@/lib/types";
import { addPasFileRow, deletePasFileRow, importPasFiles, updatePasFileRow } from "./actions";

const field = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black";

// Applied to the whole <tr> so a flagged row (needs contact / escalated) is
// visible at a glance while scanning the list.
const ROW_HIGHLIGHT_CLASS: Record<PasHighlight, string> = {
  none: "",
  yellow: "bg-yellow-50 dark:bg-yellow-900/20",
  red: "bg-red-50 dark:bg-red-900/20",
};

export default function PasFilesClient({ initialItems }: { initialItems: PasFile[] }) {
  const [items, setItems] = useState(initialItems);
  const [showPaste, setShowPaste] = useState(initialItems.length === 0);
  const [pasteText, setPasteText] = useState("");
  const [previewRows, setPreviewRows] = useState<ParsedPasFileRow[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [adding, setAdding] = useState(false);

  const existingKeys = new Set(items.map((i) => `${i.order_no.trim().toLowerCase()}|${(i.po ?? "").trim().toLowerCase()}`));

  function handlePreview() {
    const result = parsePastedPasFiles(pasteText);
    if (result.error) {
      setParseError(result.error);
      setPreviewRows(null);
      return;
    }
    setParseError(null);
    setPreviewRows(result.rows);
  }

  const newCount = previewRows
    ? previewRows.filter((r) => !existingKeys.has(`${r.order_no.trim().toLowerCase()}|${r.po.trim().toLowerCase()}`)).length
    : 0;
  const alreadyCount = previewRows ? previewRows.length - newCount : 0;

  async function handleConfirmImport() {
    if (!previewRows) return;
    setImporting(true);
    try {
      const inserted = await importPasFiles(previewRows);
      setItems((prev) => [...prev, ...((inserted ?? []) as PasFile[])]);
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
      const row = await addPasFileRow(nextPosition);
      setItems((prev) => [...prev, row as PasFile]);
    } finally {
      setAdding(false);
    }
  }

  function updateLocal(id: string, patch: Partial<PasFile>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  function handleFieldSave(id: string, patch: Partial<PasFile>) {
    updateLocal(id, patch);
    updatePasFileRow(id, patch).catch(() => {});
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this row? (Only do this once the invoice is settled.)")) return;
    setItems((prev) => prev.filter((i) => i.id !== id));
    await deletePasFileRow(id).catch(() => {});
  }

  return (
    // Breaks out of the page's centered max-w container so the wide list
    // below has more room before it needs to scroll left/right.
    <div className="relative left-1/2 right-1/2 -mx-[50vw] w-screen px-4 sm:px-8">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold">PAS Files</h1>
          <button
            onClick={() => setShowPaste((s) => !s)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            {showPaste ? "Hide paste box" : "Paste from Excel"}
          </button>
        </div>

        <p className="rounded-md bg-black/5 px-3 py-2 text-xs text-black/60 dark:bg-white/5 dark:text-white/60">
          Keep Update well updated to avoid a slip in admin updating. Move files to Invoicing once settled,
          and delete from this list once the settled invoice is sent (or invoiced in general for accounting).
        </p>

        {showPaste && (
          <div className="space-y-3 rounded-lg border border-black/10 p-4 dark:border-white/10">
            <p className="text-sm text-black/60 dark:text-white/60">
              Copy the rows from your system export (including the header row) and paste below. This is a
              running list - rows already here (matched on Order No + PO) are left untouched; only new rows
              get added.
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
                  Found {previewRows.length} row{previewRows.length === 1 ? "" : "s"}: {newCount} new,{" "}
                  {alreadyCount} already in the list (will be skipped).
                </p>
                <div className="max-h-64 overflow-auto rounded border border-black/10 dark:border-white/10">
                  <table className="w-full text-xs">
                    <thead className="bg-black/5 text-left dark:bg-white/5">
                      <tr>
                        <th className="px-2 py-1">Order No</th>
                        <th className="px-2 py-1">PO</th>
                        <th className="px-2 py-1">Customer</th>
                        <th className="px-2 py-1">Ship Date</th>
                        <th className="px-2 py-1">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((r, i) => {
                        const isNew = !existingKeys.has(`${r.order_no.trim().toLowerCase()}|${r.po.trim().toLowerCase()}`);
                        return (
                          <tr key={i} className="border-t border-black/10 dark:border-white/10">
                            <td className="px-2 py-1">{r.order_no}</td>
                            <td className="px-2 py-1">{r.po}</td>
                            <td className="px-2 py-1">{r.customer}</td>
                            <td className="px-2 py-1">{formatDate(r.ship_date)}</td>
                            <td className="px-2 py-1">
                              {isNew ? (
                                <span className="font-medium text-green-600">new</span>
                              ) : (
                                <span className="text-black/40 dark:text-white/40">already in list</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleConfirmImport}
                    disabled={importing || newCount === 0}
                    className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
                  >
                    {importing ? "Importing..." : `Add ${newCount} New Row${newCount === 1 ? "" : "s"}`}
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
                <th className="px-2 py-2">Order No</th>
                <th className="px-2 py-2">Customer</th>
                <th className="px-2 py-2">PO</th>
                <th className="px-2 py-2">Slp</th>
                <th className="px-2 py-2">Date</th>
                <th className="px-2 py-2">Ship Date</th>
                <th className="px-2 py-2">Days</th>
                <th className="px-2 py-2">Ship Qty</th>
                <th className="px-2 py-2">FOB Amt</th>
                <th className="px-2 py-2">Whse</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Order Type</th>
                <th className="px-2 py-2">Sales Type</th>
                <th className="px-2 py-2">Update</th>
                <th className="px-2 py-2">Last Contact</th>
                <th className="px-2 py-2">Notes</th>
                <th className="px-2 py-2">Highlight</th>
                <th className="w-16 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  className={`border-t border-black/10 dark:border-white/10 ${ROW_HIGHLIGHT_CLASS[item.highlight]}`}
                >
                  <td className="min-w-[6rem] px-1 py-1">
                    <input
                      defaultValue={item.order_no}
                      onBlur={(e) => handleFieldSave(item.id, { order_no: e.target.value })}
                      className={field}
                    />
                  </td>
                  <td className="min-w-[10rem] px-1 py-1">
                    <input
                      defaultValue={item.customer ?? ""}
                      onBlur={(e) => handleFieldSave(item.id, { customer: e.target.value })}
                      className={field}
                    />
                  </td>
                  <td className="min-w-[6rem] px-1 py-1">
                    <input
                      defaultValue={item.po ?? ""}
                      onBlur={(e) => handleFieldSave(item.id, { po: e.target.value })}
                      className={field}
                    />
                  </td>
                  <td className="min-w-[4rem] px-1 py-1">
                    <input
                      defaultValue={item.slp ?? ""}
                      onBlur={(e) => handleFieldSave(item.id, { slp: e.target.value })}
                      className={field}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      type="date"
                      defaultValue={item.order_date ?? ""}
                      onBlur={(e) => handleFieldSave(item.id, { order_date: e.target.value || null })}
                      className={field}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      type="date"
                      defaultValue={item.ship_date ?? ""}
                      onBlur={(e) => handleFieldSave(item.id, { ship_date: e.target.value || null })}
                      className={field}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-center text-black/60 dark:text-white/60">
                    {daysSince(item.ship_date) ?? "—"}
                  </td>
                  <td className="min-w-[5rem] px-1 py-1">
                    <input
                      type="number"
                      defaultValue={item.ship_qty ?? ""}
                      onBlur={(e) => handleFieldSave(item.id, { ship_qty: e.target.value ? Number(e.target.value) : null })}
                      className={field}
                    />
                  </td>
                  <td className="min-w-[6rem] px-1 py-1">
                    <input
                      type="number"
                      step="0.01"
                      defaultValue={item.fob_amt ?? ""}
                      onBlur={(e) => handleFieldSave(item.id, { fob_amt: e.target.value ? Number(e.target.value) : null })}
                      className={field}
                    />
                  </td>
                  <td className="min-w-[4rem] px-1 py-1">
                    <input
                      defaultValue={item.whse ?? ""}
                      onBlur={(e) => handleFieldSave(item.id, { whse: e.target.value })}
                      className={field}
                    />
                  </td>
                  <td className="min-w-[6rem] px-1 py-1">
                    <input
                      defaultValue={item.status ?? ""}
                      onBlur={(e) => handleFieldSave(item.id, { status: e.target.value })}
                      className={field}
                    />
                  </td>
                  <td className="min-w-[6rem] px-1 py-1">
                    <input
                      defaultValue={item.order_type ?? ""}
                      onBlur={(e) => handleFieldSave(item.id, { order_type: e.target.value })}
                      className={field}
                    />
                  </td>
                  <td className="min-w-[6rem] px-1 py-1">
                    <input
                      defaultValue={item.sales_type ?? ""}
                      onBlur={(e) => handleFieldSave(item.id, { sales_type: e.target.value })}
                      className={field}
                    />
                  </td>
                  <td className="min-w-[12rem] px-1 py-1">
                    <input
                      defaultValue={item.update_notes ?? ""}
                      onBlur={(e) => handleFieldSave(item.id, { update_notes: e.target.value })}
                      className={field}
                    />
                  </td>
                  <td className="min-w-[6rem] px-1 py-1">
                    <input
                      defaultValue={item.last_contact ?? ""}
                      onBlur={(e) => handleFieldSave(item.id, { last_contact: e.target.value })}
                      className={field}
                    />
                  </td>
                  <td className="min-w-[10rem] px-1 py-1">
                    <input
                      defaultValue={item.notes ?? ""}
                      onBlur={(e) => handleFieldSave(item.id, { notes: e.target.value })}
                      className={field}
                    />
                  </td>
                  <td className="min-w-[8rem] px-1 py-1">
                    <select
                      value={item.highlight}
                      onChange={(e) => handleFieldSave(item.id, { highlight: e.target.value as PasHighlight })}
                      className={field}
                    >
                      {PAS_HIGHLIGHTS.map((h) => (
                        <option key={h.value} value={h.value}>
                          {h.label}
                        </option>
                      ))}
                    </select>
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
                  <td colSpan={18} className="px-3 py-4 text-center text-black/40 dark:text-white/40">
                    No PAS files yet - paste in today&apos;s export from Excel above.
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
    </div>
  );
}
