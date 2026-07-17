"use client";

import { useState } from "react";
import { isPasRow, parsePastedPasFiles, type ParsedPasFileRow } from "@/lib/pasFilesParse";
import { daysSince, formatDate } from "@/lib/dates";
import { PAS_HIGHLIGHTS, type PasFile, type PasHighlight } from "@/lib/types";
import { addPasFileRow, deletePasFileRow, importPendingList, updatePasFileRow } from "./actions";

// Every cell in a row is a white input butted up against its neighbors, so a
// background tint on the <tr> itself is only visible in the thin gaps
// between fields - not a real "highlight at a glance". Tinting the inputs'
// own background instead makes a flagged row unmistakable.
const INPUT_BG_CLASS: Record<PasHighlight, string> = {
  none: "bg-white",
  yellow: "bg-yellow-200",
  red: "bg-red-200",
};

function rowFieldClass(highlight: PasHighlight): string {
  return `w-full rounded border border-gray-300 ${INPUT_BG_CLASS[highlight]} px-2 py-1 text-sm text-black`;
}

function matchKey(orderNo: string, po: string): string {
  return `${orderNo.trim().toLowerCase()}|${po.trim().toLowerCase()}`;
}

export default function PasFilesClient({
  initialItems,
  existingPendingKeys,
}: {
  initialItems: PasFile[];
  existingPendingKeys: string[];
}) {
  const [items, setItems] = useState(initialItems);
  const [pendingKeys, setPendingKeys] = useState(() => new Set(existingPendingKeys));
  const [showPaste, setShowPaste] = useState(initialItems.length === 0);
  const [pasteText, setPasteText] = useState("");
  const [previewRows, setPreviewRows] = useState<ParsedPasFileRow[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [adding, setAdding] = useState(false);

  const existingKeys = new Set(items.map((i) => matchKey(i.order_no, i.po ?? "")));

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

  function previewStatus(row: ParsedPasFileRow) {
    const key = matchKey(row.order_no, row.po);
    if (isPasRow(row)) {
      return { destination: "PAS Files", isNew: !existingKeys.has(key) };
    }
    return { destination: "Pending to Invoice", isNew: !pendingKeys.has(key) };
  }

  const newPasCount = previewRows ? previewRows.filter((r) => isPasRow(r) && previewStatus(r).isNew).length : 0;
  const newInvoiceCount = previewRows ? previewRows.filter((r) => !isPasRow(r) && previewStatus(r).isNew).length : 0;
  const totalNew = newPasCount + newInvoiceCount;
  const alreadyCount = previewRows ? previewRows.length - totalNew : 0;

  async function handleConfirmImport() {
    if (!previewRows) return;
    setImporting(true);
    try {
      const { pasFiles, pendingToInvoice } = await importPendingList(previewRows);
      setItems((prev) => [...prev, ...((pasFiles ?? []) as PasFile[])]);
      setPendingKeys((prev) => {
        const next = new Set(prev);
        for (const row of pendingToInvoice ?? []) next.add(matchKey(row.order_no, row.po ?? ""));
        return next;
      });
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
              Paste the entire pending-to-invoice export here (including the header row) - not just PAS
              orders. Rows marked PAS (on PO or Order Type) are routed here; everything else goes to Sales
              &gt; Pending to Invoice instead. Both lists are running - rows already present (matched on
              Order No + PO) are left untouched, only new rows get added.
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
                  Found {previewRows.length} row{previewRows.length === 1 ? "" : "s"}: {newPasCount} new to PAS
                  Files, {newInvoiceCount} new to Pending to Invoice, {alreadyCount} already in a list (will be
                  skipped).
                </p>
                <div className="max-h-64 overflow-auto rounded border border-black/10 dark:border-white/10">
                  <table className="w-full text-xs">
                    <thead className="bg-black/5 text-left dark:bg-white/5">
                      <tr>
                        <th className="px-2 py-1">Order No</th>
                        <th className="px-2 py-1">PO</th>
                        <th className="px-2 py-1">Customer</th>
                        <th className="px-2 py-1">Ship Date</th>
                        <th className="px-2 py-1">Goes To</th>
                        <th className="px-2 py-1">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((r, i) => {
                        const { destination, isNew } = previewStatus(r);
                        return (
                          <tr key={i} className="border-t border-black/10 dark:border-white/10">
                            <td className="px-2 py-1">{r.order_no}</td>
                            <td className="px-2 py-1">{r.po}</td>
                            <td className="px-2 py-1">{r.customer}</td>
                            <td className="px-2 py-1">{formatDate(r.ship_date)}</td>
                            <td className="px-2 py-1">{destination}</td>
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
                    disabled={importing || totalNew === 0}
                    className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
                  >
                    {importing ? "Importing..." : `Add ${totalNew} New Row${totalNew === 1 ? "" : "s"}`}
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
              {items.map((item) => {
                const rowField = rowFieldClass(item.highlight);
                return (
                  <tr key={item.id} className="border-t border-black/10 dark:border-white/10">
                    <td className="min-w-[6rem] px-1 py-1">
                      <input
                        defaultValue={item.order_no}
                        onBlur={(e) => handleFieldSave(item.id, { order_no: e.target.value })}
                        className={rowField}
                      />
                    </td>
                    <td className="min-w-[10rem] px-1 py-1">
                      <input
                        defaultValue={item.customer ?? ""}
                        onBlur={(e) => handleFieldSave(item.id, { customer: e.target.value })}
                        className={rowField}
                      />
                    </td>
                    <td className="min-w-[6rem] px-1 py-1">
                      <input
                        defaultValue={item.po ?? ""}
                        onBlur={(e) => handleFieldSave(item.id, { po: e.target.value })}
                        className={rowField}
                      />
                    </td>
                    <td className="min-w-[4rem] px-1 py-1">
                      <input
                        defaultValue={item.slp ?? ""}
                        onBlur={(e) => handleFieldSave(item.id, { slp: e.target.value })}
                        className={rowField}
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        type="date"
                        defaultValue={item.order_date ?? ""}
                        onBlur={(e) => handleFieldSave(item.id, { order_date: e.target.value || null })}
                        className={rowField}
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        type="date"
                        defaultValue={item.ship_date ?? ""}
                        onBlur={(e) => handleFieldSave(item.id, { ship_date: e.target.value || null })}
                        className={rowField}
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
                        className={rowField}
                      />
                    </td>
                    <td className="min-w-[6rem] px-1 py-1">
                      <input
                        type="number"
                        step="0.01"
                        defaultValue={item.fob_amt ?? ""}
                        onBlur={(e) => handleFieldSave(item.id, { fob_amt: e.target.value ? Number(e.target.value) : null })}
                        className={rowField}
                      />
                    </td>
                    <td className="min-w-[4rem] px-1 py-1">
                      <input
                        defaultValue={item.whse ?? ""}
                        onBlur={(e) => handleFieldSave(item.id, { whse: e.target.value })}
                        className={rowField}
                      />
                    </td>
                    <td className="min-w-[6rem] px-1 py-1">
                      <input
                        defaultValue={item.status ?? ""}
                        onBlur={(e) => handleFieldSave(item.id, { status: e.target.value })}
                        className={rowField}
                      />
                    </td>
                    <td className="min-w-[6rem] px-1 py-1">
                      <input
                        defaultValue={item.order_type ?? ""}
                        onBlur={(e) => handleFieldSave(item.id, { order_type: e.target.value })}
                        className={rowField}
                      />
                    </td>
                    <td className="min-w-[6rem] px-1 py-1">
                      <input
                        defaultValue={item.sales_type ?? ""}
                        onBlur={(e) => handleFieldSave(item.id, { sales_type: e.target.value })}
                        className={rowField}
                      />
                    </td>
                    <td className="min-w-[12rem] px-1 py-1">
                      <input
                        defaultValue={item.update_notes ?? ""}
                        onBlur={(e) => handleFieldSave(item.id, { update_notes: e.target.value })}
                        className={rowField}
                      />
                    </td>
                    <td className="min-w-[6rem] px-1 py-1">
                      <input
                        defaultValue={item.last_contact ?? ""}
                        onBlur={(e) => handleFieldSave(item.id, { last_contact: e.target.value })}
                        className={rowField}
                      />
                    </td>
                    <td className="min-w-[10rem] px-1 py-1">
                      <input
                        defaultValue={item.notes ?? ""}
                        onBlur={(e) => handleFieldSave(item.id, { notes: e.target.value })}
                        className={rowField}
                      />
                    </td>
                    <td className="min-w-[8rem] px-1 py-1">
                      <select
                        value={item.highlight}
                        onChange={(e) => handleFieldSave(item.id, { highlight: e.target.value as PasHighlight })}
                        className={rowField}
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
                );
              })}
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
