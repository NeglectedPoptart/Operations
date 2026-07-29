"use client";

import { Fragment, useMemo, useState } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import { parsePastedOldAge, type ParsedOldAgeRow } from "@/lib/oldAgeParse";
import { formatDate, todayISO } from "@/lib/dates";
import { copyOrDownloadPng, escapeHtml, renderPriceSheetPng, type CanvasBlock, type MonoRow } from "@/lib/fobPricing";
import { summarizeByCommodity, summarizeByNextStep, type BarDatum } from "@/lib/oldAgeSummary";
import { OLD_AGE_NEXT_STEPS, type OldAgeItem, type OldAgeMove, type OldAgeNextStep } from "@/lib/types";
import { addOldAgeMove, addOldAgeRow, deleteOldAgeItem, deleteOldAgeMove, importOldAgeItems, updateOldAgeItem } from "./actions";
import HorizontalBarChart from "@/components/HorizontalBarChart";

const field = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black";

function formatMoney(n: number | null): string {
  return n === null ? "" : `$${n.toFixed(2)}`;
}

function nextStepLabel(step: OldAgeNextStep | null): string {
  return OLD_AGE_NEXT_STEPS.find((s) => s.value === step)?.label ?? "";
}

const CASH_LIST_HEADERS = ["Document", "Received", "Description", "PStyle", "Size", "Qty", "Age", "Price", "Notes"];
function cashListRowValues(item: OldAgeItem): string[] {
  return [
    item.document ?? "",
    formatDate(item.received_date),
    item.description ?? "",
    item.pack_style ?? "",
    item.size ?? "",
    item.qty !== null ? String(item.qty) : "",
    item.age !== null ? String(item.age) : "",
    formatMoney(item.cash_price),
    item.notes ?? "",
  ];
}

const FULL_LIST_HEADERS = [
  "Document",
  "Received",
  "Description",
  "PStyle",
  "Size",
  "Qty",
  "Age",
  "Next Step",
  "Notes",
  "Cash List",
];
function fullListRowValues(item: OldAgeItem): string[] {
  return [
    item.document ?? "",
    formatDate(item.received_date),
    item.description ?? "",
    item.pack_style ?? "",
    item.size ?? "",
    item.qty !== null ? String(item.qty) : "",
    item.age !== null ? String(item.age) : "",
    nextStepLabel(item.next_step),
    item.notes ?? "",
    item.cash_list ? "Yes" : "",
  ];
}

const NEXT_STEP_HEADERS = ["Next Step", "Count"];
function nextStepRowValues(d: BarDatum): string[] {
  return [d.label, String(d.value)];
}

const COMMODITY_HEADERS = ["Commodity", "Qty"];
function commodityRowValues(d: BarDatum): string[] {
  return [d.label, d.value.toLocaleString()];
}

// Shared table builder for the Copy for Email clipboard HTML, used both by
// the Cash List section's own copy buttons and the page-wide Copy All.
function buildTableHtml(title: string, headerColor: string, headers: string[], rows: string[][]): string {
  const cell = "padding:3px 6px;border:1px solid #000;background:#ffffff;color:#000000;";
  const headCell = `${cell}font-weight:bold;background:#dddddd;`;
  const bodyRows =
    rows.length > 0
      ? rows.map((r) => `<tr>${r.map((c) => `<td style="${cell}">${escapeHtml(c)}</td>`).join("")}</tr>`).join("")
      : `<tr><td colspan="${headers.length}" style="${cell}text-align:center;color:#666666;">Nothing here.</td></tr>`;
  return `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #000;font-family:Calibri,Arial,sans-serif;font-size:12.5px;margin-bottom:14px;">
    <tr><td colspan="${headers.length}" style="background:${headerColor};color:#000000;font-weight:bold;text-align:center;padding:6px;border:1px solid #000;">${escapeHtml(title)}</td></tr>
    <tr>${headers.map((h) => `<td style="${headCell}">${escapeHtml(h)}</td>`).join("")}</tr>
    ${bodyRows}
  </table>`;
}

function buildPlainTextSection(title: string, headers: string[], rows: string[][]): string[] {
  const lines = [title, headers.join("\t")];
  if (rows.length === 0) lines.push("Nothing here.");
  for (const r of rows) lines.push(r.join("\t"));
  lines.push("");
  return lines;
}

function toCanvasRows(rows: string[][], colCount: number): MonoRow[] {
  if (rows.length === 0) return [{ cells: ["Nothing here.", ...Array(colCount - 1).fill("")] }];
  return rows.map((cells) => ({ cells }));
}

// Ledger for one "Partial Moved" item, plus a small form to log the next
// order and how much it's taking - same running-total pattern as Repack
// Inventory's per-item history panel.
function MovesHistory({
  item,
  moves,
  onAdd,
  onDelete,
}: {
  item: OldAgeItem;
  moves: OldAgeMove[];
  onAdd: (orderReference: string, qty: number, entryDate: string, notes: string) => Promise<void>;
  onDelete: (id: string) => void;
}) {
  const [orderReference, setOrderReference] = useState("");
  const [qty, setQty] = useState("");
  const [entryDate, setEntryDate] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const remaining = item.qty !== null ? item.qty - item.qty_moved : null;

  async function handleAdd() {
    const n = Number(qty);
    if (!orderReference.trim() || !Number.isFinite(n) || n === 0) return;
    setSaving(true);
    try {
      await onAdd(orderReference.trim(), n, entryDate, notes);
      setOrderReference("");
      setQty("");
      setNotes("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 bg-black/5 p-4 dark:bg-white/5">
      <p className="text-sm font-medium">
        {item.qty ?? 0} total · {item.qty_moved} moved so far
        {remaining !== null && <span className="text-black/60 dark:text-white/60"> · {remaining} remaining</span>}
      </p>
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
          Order #
          <input
            value={orderReference}
            onChange={(e) => setOrderReference(e.target.value)}
            placeholder="Order/PO #"
            className={`${field} mt-1 w-32`}
          />
        </label>
        <label className="text-sm">
          Qty taking
          <input type="number" value={qty} onChange={(e) => setQty(e.target.value)} className={`${field} mt-1 w-28`} />
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
              <th className="px-2 py-1">Order #</th>
              <th className="px-2 py-1">Qty</th>
              <th className="px-2 py-1">Notes</th>
              <th className="w-16 px-2 py-1" />
            </tr>
          </thead>
          <tbody>
            {moves.map((m) => (
              <tr key={m.id} className="border-t border-black/10 bg-white dark:border-white/10 dark:bg-neutral-900">
                <td className="whitespace-nowrap px-2 py-1">{formatDate(m.entry_date)}</td>
                <td className="px-2 py-1">{m.order_reference}</td>
                <td className={`px-2 py-1 font-medium ${m.qty < 0 ? "text-red-600" : "text-green-600"}`}>
                  {m.qty > 0 ? `+${m.qty}` : m.qty}
                </td>
                <td className="px-2 py-1">{m.notes}</td>
                <td className="px-2 py-1">
                  <button onClick={() => onDelete(m.id)} className="text-xs font-medium text-red-600 hover:underline">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {moves.length === 0 && (
              <tr>
                <td colSpan={5} className="px-2 py-3 text-center text-black/40 dark:text-white/40">
                  No moves logged yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CashListSection({
  items,
  onPriceSave,
  onNotesSave,
  onRemove,
}: {
  items: OldAgeItem[];
  onPriceSave: (id: string, price: number | null) => void;
  onNotesSave: (id: string, notes: string) => void;
  onRemove: (id: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [imageStatus, setImageStatus] = useState<string | null>(null);

  if (items.length === 0) return null;

  async function handleCopyEmail() {
    const html = buildTableHtml("Cash List", "#8DC63F", CASH_LIST_HEADERS, items.map(cashListRowValues));
    const text = buildPlainTextSection("Cash List", CASH_LIST_HEADERS, items.map(cashListRowValues)).join("\n");

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
          title: "Cash List",
          headerColor: "#8DC63F",
          columnHeaders: CASH_LIST_HEADERS,
          rows: items.map((item) => ({ cells: cashListRowValues(item) })),
        },
      ];
      const blob = await renderPriceSheetPng({ title: "Cash List", message: "", blocks });
      const result = await copyOrDownloadPng(blob, "cash-list.png");
      setImageStatus(result === "copied" ? "Image copied!" : "Image downloaded!");
      setTimeout(() => setImageStatus(null), 2500);
    } catch {
      alert("Could not create the image - try again.");
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-green-300 bg-green-50/50 p-4 dark:border-green-800 dark:bg-green-950/20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-green-700 dark:text-green-400">Cash List ({items.length})</h2>
        <div className="flex gap-2">
          <button
            onClick={handleCopyEmail}
            className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
          >
            {copied ? "Copied!" : "Copy for Email"}
          </button>
          <button
            onClick={handleCopyImage}
            className="rounded-md bg-teal-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-800"
          >
            {imageStatus ?? "Copy as Image"}
          </button>
        </div>
      </div>
      <div className="overflow-x-auto rounded border border-black/10 dark:border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-black/5 text-left dark:bg-white/5">
            <tr>
              <th className="px-2 py-1.5">Document</th>
              <th className="px-2 py-1.5">Received</th>
              <th className="px-2 py-1.5">Description</th>
              <th className="px-2 py-1.5">PStyle</th>
              <th className="px-2 py-1.5">Size</th>
              <th className="px-2 py-1.5">Qty</th>
              <th className="px-2 py-1.5">Age</th>
              <th className="px-2 py-1.5">Price</th>
              <th className="px-2 py-1.5">Notes</th>
              <th className="px-2 py-1.5" />
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
                <td className="min-w-[6rem] px-1 py-1">
                  <input
                    type="number"
                    step="any"
                    defaultValue={item.cash_price ?? ""}
                    onBlur={(e) => onPriceSave(item.id, e.target.value.trim() === "" ? null : Number(e.target.value))}
                    className={`${field} font-semibold`}
                  />
                </td>
                <td className="min-w-[10rem] px-1 py-1">
                  <input
                    defaultValue={item.notes ?? ""}
                    onBlur={(e) => onNotesSave(item.id, e.target.value)}
                    className={field}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <button
                    onClick={() => onRemove(item.id)}
                    className="text-xs font-medium text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function OldAgeClient({
  initialItems,
  initialMoves,
}: {
  initialItems: OldAgeItem[];
  initialMoves: OldAgeMove[];
}) {
  const confirm = useConfirm();
  const [items, setItems] = useState(initialItems);
  const [moves, setMoves] = useState(initialMoves);
  const [expandedMovesId, setExpandedMovesId] = useState<string | null>(null);
  const nextStepSummary = useMemo(() => summarizeByNextStep(items), [items]);
  const commoditySummary = useMemo(() => summarizeByCommodity(items), [items]);
  const cashListItems = useMemo(() => items.filter((i) => i.cash_list), [items]);
  const [showPaste, setShowPaste] = useState(initialItems.length === 0);
  const [pasteText, setPasteText] = useState("");
  const [previewRows, setPreviewRows] = useState<ParsedOldAgeRow[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);
  const [imageStatusAll, setImageStatusAll] = useState<string | null>(null);

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

  function handleFieldSave(id: string, patch: { notes?: string }) {
    updateLocal(id, patch);
    updateOldAgeItem(id, patch).catch(() => {});
  }

  async function handleNextStepChange(id: string, nextStep: OldAgeNextStep) {
    updateLocal(id, { next_step: nextStep });
    if (nextStep === "partial_moved") setExpandedMovesId(id);
    await updateOldAgeItem(id, { next_step: nextStep }).catch(() => {});
  }

  async function handleQtySave(id: string, qty: number | null) {
    updateLocal(id, { qty });
    await updateOldAgeItem(id, { qty }).catch(() => {});
  }

  async function handleDelete(id: string) {
    if (!(await confirm("Delete this row?"))) return;
    setItems((prev) => prev.filter((i) => i.id !== id));
    setMoves((prev) => prev.filter((m) => m.item_id !== id));
    await deleteOldAgeItem(id).catch(() => {});
  }

  async function handleAddMove(itemId: string, orderReference: string, qty: number, entryDate: string, notes: string) {
    const row = (await addOldAgeMove(itemId, entryDate, orderReference, qty, notes)) as OldAgeMove;
    setMoves((prev) => [row, ...prev]);
    updateLocal(itemId, { qty_moved: (items.find((i) => i.id === itemId)?.qty_moved ?? 0) + qty });
  }

  async function handleDeleteMove(id: string) {
    if (!(await confirm("Delete this move? The item's moved total will be adjusted back."))) return;
    const row = moves.find((m) => m.id === id);
    setMoves((prev) => prev.filter((m) => m.id !== id));
    if (row) updateLocal(row.item_id, { qty_moved: (items.find((i) => i.id === row.item_id)?.qty_moved ?? 0) - row.qty });
    await deleteOldAgeMove(id).catch(() => {});
  }

  async function handleCashListToggle(id: string, cashList: boolean) {
    updateLocal(id, { cash_list: cashList });
    await updateOldAgeItem(id, { cash_list: cashList }).catch(() => {});
  }

  async function handleCashPriceSave(id: string, price: number | null) {
    updateLocal(id, { cash_price: price });
    await updateOldAgeItem(id, { cash_price: price }).catch(() => {});
  }

  async function handleCopyAllEmail() {
    const html = `<div style="font-family:Calibri,Arial,sans-serif;background:#ffffff;">
        <div style="text-align:center;font-size:18px;font-weight:bold;padding-bottom:8px;color:#000000;">Old Age Report</div>
        ${buildTableHtml("Next Step Summary", "#8DC63F", NEXT_STEP_HEADERS, nextStepSummary.map(nextStepRowValues))}
        ${buildTableHtml("Qty by Commodity", "#8DC63F", COMMODITY_HEADERS, commoditySummary.map(commodityRowValues))}
        ${cashListItems.length > 0 ? buildTableHtml("Cash List", "#FFA726", CASH_LIST_HEADERS, cashListItems.map(cashListRowValues)) : ""}
        ${buildTableHtml("Full List", "#64B5F6", FULL_LIST_HEADERS, items.map(fullListRowValues))}
      </div>`;
    const text = [
      "Old Age Report",
      "",
      ...buildPlainTextSection("Next Step Summary", NEXT_STEP_HEADERS, nextStepSummary.map(nextStepRowValues)),
      ...buildPlainTextSection("Qty by Commodity", COMMODITY_HEADERS, commoditySummary.map(commodityRowValues)),
      ...(cashListItems.length > 0
        ? buildPlainTextSection("Cash List", CASH_LIST_HEADERS, cashListItems.map(cashListRowValues))
        : []),
      ...buildPlainTextSection("Full List", FULL_LIST_HEADERS, items.map(fullListRowValues)),
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
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    } catch {
      alert("Could not copy to clipboard - your browser may not support it.");
    }
  }

  async function handleCopyAllImage() {
    try {
      const blocks: CanvasBlock[] = [
        {
          title: "Next Step Summary",
          headerColor: "#8DC63F",
          columnHeaders: NEXT_STEP_HEADERS,
          rows: toCanvasRows(nextStepSummary.map(nextStepRowValues), NEXT_STEP_HEADERS.length),
        },
        {
          title: "Qty by Commodity",
          headerColor: "#8DC63F",
          columnHeaders: COMMODITY_HEADERS,
          rows: toCanvasRows(commoditySummary.map(commodityRowValues), COMMODITY_HEADERS.length),
        },
        ...(cashListItems.length > 0
          ? [
              {
                title: "Cash List",
                headerColor: "#FFA726",
                columnHeaders: CASH_LIST_HEADERS,
                rows: toCanvasRows(cashListItems.map(cashListRowValues), CASH_LIST_HEADERS.length),
              },
            ]
          : []),
        {
          title: "Full List",
          headerColor: "#64B5F6",
          columnHeaders: FULL_LIST_HEADERS,
          rows: toCanvasRows(items.map(fullListRowValues), FULL_LIST_HEADERS.length),
        },
      ];
      const blob = await renderPriceSheetPng({ title: "Old Age Report", message: "", blocks, direction: "column" });
      const result = await copyOrDownloadPng(blob, "old-age-report.png");
      setImageStatusAll(result === "copied" ? "Image copied!" : "Image downloaded!");
      setTimeout(() => setImageStatusAll(null), 2500);
    } catch {
      alert("Could not create the image - try again.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Old Age</h1>
        <div className="flex flex-wrap gap-2">
          {items.length > 0 && (
            <>
              <button
                onClick={handleCopyAllEmail}
                className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
              >
                {copiedAll ? "Copied!" : "Copy All for Email"}
              </button>
              <button
                onClick={handleCopyAllImage}
                className="rounded-md bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800"
              >
                {imageStatusAll ?? "Copy All as Image"}
              </button>
            </>
          )}
          <button
            onClick={() => setShowPaste((s) => !s)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            {showPaste ? "Hide paste box" : "Paste from Excel"}
          </button>
        </div>
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

      <CashListSection
        items={cashListItems}
        onPriceSave={handleCashPriceSave}
        onNotesSave={(id, notes) => handleFieldSave(id, { notes })}
        onRemove={(id) => handleCashListToggle(id, false)}
      />

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
              <th className="px-2 py-2">Cash List</th>
              <th className="w-16 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const isPartialMoved = item.next_step === "partial_moved";
              const expanded = expandedMovesId === item.id;
              const remaining = item.qty !== null ? item.qty - item.qty_moved : null;
              return (
                <Fragment key={item.id}>
                  <tr className="border-t border-black/10 dark:border-white/10">
                    <td className="px-2 py-1.5">{item.document}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{formatDate(item.received_date)}</td>
                    <td className="px-2 py-1.5">{item.description}</td>
                    <td className="px-2 py-1.5">{item.pack_style}</td>
                    <td className="px-2 py-1.5">{item.size}</td>
                    <td className="min-w-[5rem] px-1 py-1">
                      <input
                        type="number"
                        step="any"
                        defaultValue={item.qty ?? ""}
                        onBlur={(e) =>
                          handleQtySave(item.id, e.target.value.trim() === "" ? null : Number(e.target.value))
                        }
                        className={field}
                      />
                      {isPartialMoved && remaining !== null && (
                        <p className="mt-0.5 text-xs text-black/50 dark:text-white/50">{remaining} left</p>
                      )}
                    </td>
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
                    <td className="px-2 py-1.5 text-center">
                      <input
                        type="checkbox"
                        checked={item.cash_list}
                        onChange={(e) => handleCashListToggle(item.id, e.target.checked)}
                        className="h-4 w-4"
                      />
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      {isPartialMoved && (
                        <button
                          onClick={() => setExpandedMovesId(expanded ? null : item.id)}
                          className="mr-2 text-xs font-medium text-green-700 hover:underline dark:text-green-400"
                        >
                          {expanded ? "Hide moves" : "Moves"}
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="text-xs font-medium text-red-600 hover:underline"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                  {isPartialMoved && expanded && (
                    <tr>
                      <td colSpan={11} className="p-0">
                        <MovesHistory
                          item={item}
                          moves={moves.filter((m) => m.item_id === item.id)}
                          onAdd={(orderReference, qty, entryDate, notes) =>
                            handleAddMove(item.id, orderReference, qty, entryDate, notes)
                          }
                          onDelete={handleDeleteMove}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={11} className="px-3 py-4 text-center text-black/40 dark:text-white/40">
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
