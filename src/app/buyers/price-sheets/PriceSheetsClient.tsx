"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import { formatDate, todayISO } from "@/lib/dates";
import { copyOrDownloadPng, escapeHtml, renderPriceSheetPng, type CanvasBlock } from "@/lib/fobPricing";
import { parsePriceSheetPaste, PRODUCE_CATEGORIES, type ParsedPriceSheetItem } from "@/lib/priceSheetParse";
import type { PriceSheetItem, Vendor } from "@/lib/types";
import {
  createVendor,
  deletePriceSheetItem,
  deleteVendor,
  extractPdfText,
  importPriceSheet,
  updatePriceSheetItem,
} from "./actions";
import PriceComparisonImport from "./PriceComparisonImport";

const field = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black";
// The saved sheet's Item cell folds size into the label so the table doesn't
// need a separate column ("25 lbs" becomes part of "Bell Pepper 25 lbs") -
// blur handlers below persist that combined text back into item_label and
// clear size, so it stays folded in going forward.
const cellInput =
  "min-w-0 rounded border border-transparent bg-transparent px-1.5 py-1 text-[13px] font-medium text-black transition-colors hover:bg-black/[0.04] focus:border-green-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-green-500 dark:text-white dark:hover:bg-white/[0.06] dark:focus:bg-black/40";
const PRICE_SHEET_HEADERS = ["Category", "Item", "Price"];

function formatMoney(n: number | null): string {
  return n === null ? "CALL" : `$${n.toFixed(2)}`;
}

function combinedItemLabel(item: Pick<PriceSheetItem, "item_label" | "size">): string {
  return item.size ? `${item.item_label} ${item.size}` : item.item_label;
}

function priceSheetRowValues(item: Pick<PriceSheetItem, "category" | "item_label" | "size" | "price">): string[] {
  return [item.category, combinedItemLabel(item), formatMoney(item.price)];
}

interface EditableRow extends ParsedPriceSheetItem {
  key: number;
}

function PastePreview({
  rows,
  onChange,
  onRemove,
}: {
  rows: EditableRow[];
  onChange: (key: number, patch: Partial<ParsedPriceSheetItem>) => void;
  onRemove: (key: number) => void;
}) {
  return (
    <div className="max-h-72 overflow-auto rounded border border-black/10 dark:border-white/10">
      <table className="w-full text-xs">
        <thead className="bg-black/5 text-left dark:bg-white/5">
          <tr>
            <th className="px-2 py-1">Category</th>
            <th className="px-2 py-1">Item</th>
            <th className="px-2 py-1">Size</th>
            <th className="px-2 py-1">Price</th>
            <th className="w-8 px-2 py-1" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-black/10 dark:border-white/10">
              <td className="min-w-[8rem] px-1 py-1">
                <input
                  list="price-sheet-categories"
                  value={r.category}
                  onChange={(e) => onChange(r.key, { category: e.target.value })}
                  className={field}
                />
              </td>
              <td className="min-w-[10rem] px-1 py-1">
                <input
                  value={r.itemLabel}
                  onChange={(e) => onChange(r.key, { itemLabel: e.target.value })}
                  className={field}
                />
              </td>
              <td className="min-w-[5rem] px-1 py-1">
                <input value={r.size} onChange={(e) => onChange(r.key, { size: e.target.value })} className={field} />
              </td>
              <td className="min-w-[5rem] px-1 py-1">
                <input
                  type="number"
                  step="any"
                  value={r.price ?? ""}
                  onChange={(e) =>
                    onChange(r.key, { price: e.target.value.trim() === "" ? null : Number(e.target.value) })
                  }
                  className={field}
                />
              </td>
              <td className="px-1 py-1">
                <button onClick={() => onRemove(r.key)} className="text-xs font-medium text-red-600 hover:underline">
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VendorSection({
  vendor,
  items,
  onFieldSave,
  onDeleteItem,
  onDeleteVendor,
}: {
  vendor: Vendor;
  items: PriceSheetItem[];
  onFieldSave: (id: string, patch: Partial<Pick<PriceSheetItem, "category" | "item_label" | "size" | "price">>) => void;
  onDeleteItem: (id: string) => void;
  onDeleteVendor: (id: string) => void;
}) {
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [imageStatus, setImageStatus] = useState<string | null>(null);

  const sheetLabel = `${vendor.name}${vendor.sheet_date ? ` - ${formatDate(vendor.sheet_date)}` : ""}`;

  async function handleCopyEmail() {
    const cell = "padding:3px 6px;border:1px solid #000;background:#ffffff;color:#000000;";
    const headCell = `${cell}font-weight:bold;background:#dddddd;`;
    const rows = items
      .map(
        (item) =>
          `<tr>${priceSheetRowValues(item)
            .map((c) => `<td style="${cell}">${escapeHtml(c)}</td>`)
            .join("")}</tr>`,
      )
      .join("");
    const html = `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #000;font-family:Calibri,Arial,sans-serif;font-size:12.5px;">
      <tr><td colspan="3" style="background:#8DC63F;color:#000;font-weight:bold;text-align:center;padding:6px;border:1px solid #000;">${escapeHtml(sheetLabel)}</td></tr>
      <tr>${PRICE_SHEET_HEADERS.map((h) => `<td style="${headCell}">${escapeHtml(h)}</td>`).join("")}</tr>
      ${rows}
    </table>`;
    const text = [
      sheetLabel,
      PRICE_SHEET_HEADERS.join("\t"),
      ...items.map((item) => priceSheetRowValues(item).join("\t")),
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
      setCopyStatus("Copied!");
      setTimeout(() => setCopyStatus(null), 2000);
    } catch {
      alert("Could not copy to clipboard - your browser may not support it.");
    }
  }

  async function handleCopyImage() {
    try {
      const blocks: CanvasBlock[] = [
        {
          title: sheetLabel,
          headerColor: "#8DC63F",
          columnHeaders: PRICE_SHEET_HEADERS,
          rows:
            items.length > 0
              ? items.map((item) => ({ cells: priceSheetRowValues(item) }))
              : [{ cells: ["Nothing on this sheet.", "", ""] }],
        },
      ];
      const blob = await renderPriceSheetPng({ title: vendor.name, message: "", blocks });
      const result = await copyOrDownloadPng(blob, `${vendor.name.toLowerCase().replace(/\s+/g, "-")}-price-sheet.png`);
      setImageStatus(result === "copied" ? "Image copied!" : "Image downloaded!");
      setTimeout(() => setImageStatus(null), 2500);
    } catch {
      alert("Could not create the image - try again.");
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-black/10 p-4 shadow-sm dark:border-white/10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-green-700 dark:text-green-400">{vendor.name}</h2>
          <p className="text-xs text-black/40 dark:text-white/40">
            {vendor.sheet_date ? `Sheet dated ${formatDate(vendor.sheet_date)}` : "No sheet pasted yet"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleCopyEmail}
            className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
          >
            {copyStatus ?? "Copy for Email"}
          </button>
          <button
            onClick={handleCopyImage}
            className="rounded-md bg-teal-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-800"
          >
            {imageStatus ?? "Copy as Image"}
          </button>
          {!vendor.is_unknown && (
            <button onClick={() => onDeleteVendor(vendor.id)} className="text-xs font-medium text-red-600 hover:underline">
              Delete Vendor
            </button>
          )}
        </div>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-black/40 dark:text-white/40">Nothing on this sheet yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
          <table className="border-collapse text-sm">
            <thead>
              <tr className="bg-black/[0.03] dark:bg-white/[0.05]">
                <th className="px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
                  Category
                </th>
                <th className="px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
                  Item
                </th>
                <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
                  Price
                </th>
                <th className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const label = combinedItemLabel(item);
                return (
                  <tr
                    key={item.id}
                    className="border-t border-black/5 hover:bg-black/[0.02] dark:border-white/5 dark:hover:bg-white/[0.03]"
                  >
                    <td className="px-1 py-0.5">
                      <input
                        list="price-sheet-categories"
                        defaultValue={item.category}
                        size={Math.max(item.category.length, 4)}
                        onBlur={(e) => onFieldSave(item.id, { category: e.target.value })}
                        className={cellInput}
                      />
                    </td>
                    <td className="px-1 py-0.5">
                      <input
                        defaultValue={label}
                        size={Math.max(label.length, 6)}
                        onBlur={(e) => onFieldSave(item.id, { item_label: e.target.value, size: null })}
                        className={cellInput}
                      />
                    </td>
                    <td className="px-1 py-0.5">
                      <input
                        type="number"
                        step="any"
                        defaultValue={item.price ?? ""}
                        size={Math.max(String(item.price ?? "").length, 4)}
                        onBlur={(e) =>
                          onFieldSave(item.id, { price: e.target.value.trim() === "" ? null : Number(e.target.value) })
                        }
                        className={`${cellInput} text-right tabular-nums`}
                      />
                    </td>
                    <td className="px-2 py-0.5">
                      <button
                        onClick={() => onDeleteItem(item.id)}
                        title="Delete row"
                        className="text-black/30 hover:text-red-600 dark:text-white/30 dark:hover:text-red-400"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function PriceSheetsClient({
  initialVendors,
  initialItems,
}: {
  initialVendors: Vendor[];
  initialItems: PriceSheetItem[];
}) {
  const confirm = useConfirm();
  const [vendors, setVendors] = useState(initialVendors);
  const [items, setItems] = useState(initialItems);
  const [showPaste, setShowPaste] = useState(false);
  const [vendorMode, setVendorMode] = useState<"existing" | "new">("existing");
  const [selectedVendorId, setSelectedVendorId] = useState("");
  const [newVendorName, setNewVendorName] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [previewRows, setPreviewRows] = useState<EditableRow[] | null>(null);
  const [previewDate, setPreviewDate] = useState(todayISO());
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);

  const itemsByVendor = useMemo(() => {
    const map = new Map<string, PriceSheetItem[]>();
    for (const item of items) {
      if (!map.has(item.vendor_id)) map.set(item.vendor_id, []);
      map.get(item.vendor_id)!.push(item);
    }
    return map;
  }, [items]);

  function handlePreview(text: string = pasteText) {
    setParseError(null);
    const result = parsePriceSheetPaste(text);
    if (result.error) {
      setParseError(result.error);
      setPreviewRows(null);
      return;
    }
    setPreviewRows(result.items.map((item, i) => ({ ...item, key: i })));
    if (result.sheetDateGuess) setPreviewDate(result.sheetDateGuess);
    if (vendorMode === "new" && result.vendorNameGuess && !newVendorName) {
      setNewVendorName(result.vendorNameGuess);
    }
  }

  async function handlePdfUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingPdf(true);
    setParseError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await extractPdfText(formData);
      if ("error" in result) {
        setParseError(`Couldn't read that PDF (${result.error}). It may be password protected or corrupted - try pasting the text instead.`);
        return;
      }
      setPasteText(result.text);
      handlePreview(result.text);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      setParseError(`Couldn't read that PDF (${detail}). It may be password protected or corrupted - try pasting the text instead.`);
    } finally {
      setUploadingPdf(false);
    }
  }

  function handlePreviewChange(key: number, patch: Partial<ParsedPriceSheetItem>) {
    setPreviewRows((prev) => prev?.map((r) => (r.key === key ? { ...r, ...patch } : r)) ?? null);
  }

  function handlePreviewRemove(key: number) {
    setPreviewRows((prev) => prev?.filter((r) => r.key !== key) ?? null);
  }

  function handleCancelPreview() {
    setPreviewRows(null);
    setParseError(null);
  }

  async function handleConfirmImport() {
    if (!previewRows) return;
    setImporting(true);
    try {
      let vendorId = selectedVendorId;
      if (vendorMode === "new") {
        if (!newVendorName.trim()) {
          alert("Enter a vendor name, or switch to an existing vendor / Unknown-TBD.");
          setImporting(false);
          return;
        }
        const vendor = await createVendor(newVendorName.trim());
        setVendors((prev) => [...prev, vendor].sort((a, b) => a.name.localeCompare(b.name)));
        vendorId = vendor.id;
      }
      if (!vendorId) {
        alert("Pick a vendor first.");
        setImporting(false);
        return;
      }
      const parsedItems: ParsedPriceSheetItem[] = previewRows.map(
        (r): ParsedPriceSheetItem => ({ category: r.category, itemLabel: r.itemLabel, size: r.size, price: r.price }),
      );
      const saved = await importPriceSheet(vendorId, parsedItems, previewDate);
      setItems((prev) => [...prev.filter((i) => i.vendor_id !== vendorId), ...saved]);
      setVendors((prev) => prev.map((v) => (v.id === vendorId ? { ...v, sheet_date: previewDate } : v)));
      setPreviewRows(null);
      setPasteText("");
      setNewVendorName("");
      setSelectedVendorId("");
      setVendorMode("existing");
      setShowPaste(false);
    } finally {
      setImporting(false);
    }
  }

  function handleItemFieldSave(
    id: string,
    patch: Partial<Pick<PriceSheetItem, "category" | "item_label" | "size" | "price">>,
  ) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    updatePriceSheetItem(id, patch).catch(() => {});
  }

  async function handleDeleteItem(id: string) {
    if (!(await confirm("Delete this item from the sheet?"))) return;
    setItems((prev) => prev.filter((i) => i.id !== id));
    await deletePriceSheetItem(id).catch(() => {});
  }

  async function handleDeleteVendor(id: string) {
    const vendor = vendors.find((v) => v.id === id);
    if (!vendor) return;
    if (!(await confirm(`Delete ${vendor.name} and their entire price sheet? This can't be undone.`))) return;
    setVendors((prev) => prev.filter((v) => v.id !== id));
    setItems((prev) => prev.filter((i) => i.vendor_id !== id));
    await deleteVendor(id).catch(() => {});
  }

  function handleComparisonImportComplete(
    newVendors: Vendor[],
    updates: { vendorId: string; items: PriceSheetItem[]; sheetDate: string }[],
  ) {
    if (newVendors.length > 0) {
      setVendors((prev) => [...prev, ...newVendors].sort((a, b) => a.name.localeCompare(b.name)));
    }
    const updatedVendorIds = new Set(updates.map((u) => u.vendorId));
    setItems((prev) => [...prev.filter((i) => !updatedVendorIds.has(i.vendor_id)), ...updates.flatMap((u) => u.items)]);
    if (updates.length > 0) {
      const sheetDateByVendorId = new Map(updates.map((u) => [u.vendorId, u.sheetDate]));
      setVendors((prev) =>
        prev.map((v) => (sheetDateByVendorId.has(v.id) ? { ...v, sheet_date: sheetDateByVendorId.get(v.id)! } : v)),
      );
    }
  }

  return (
    <div className="space-y-6">
      <datalist id="price-sheet-categories">
        {PRODUCE_CATEGORIES.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Price Sheets</h1>
        <button
          onClick={() => setShowPaste((s) => !s)}
          className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
        >
          {showPaste ? "Hide paste box" : "Paste a Price Sheet"}
        </button>
      </div>

      {showPaste && (
        <div className="space-y-3 rounded-lg border border-black/10 p-4 dark:border-white/10">
          <p className="text-sm text-black/60 dark:text-white/60">
            Paste the whole WhatsApp message - every category, item, size, and price get parsed out below for you to
            check before saving. Re-pasting for the same vendor replaces their current sheet.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Vendor</span>
              <select
                value={vendorMode === "existing" ? selectedVendorId : "__new__"}
                onChange={(e) => {
                  if (e.target.value === "__new__") {
                    setVendorMode("new");
                    setSelectedVendorId("");
                  } else {
                    setVendorMode("existing");
                    setSelectedVendorId(e.target.value);
                  }
                }}
                className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-black"
              >
                <option value="">-- Select --</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
                <option value="__new__">+ New vendor...</option>
              </select>
            </label>
            {vendorMode === "new" && (
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">New vendor name</span>
                <input
                  value={newVendorName}
                  onChange={(e) => setNewVendorName(e.target.value)}
                  className={`${field} w-56`}
                />
              </label>
            )}
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Sheet date</span>
              <input
                type="date"
                value={previewDate}
                onChange={(e) => setPreviewDate(e.target.value)}
                className={`${field} w-40`}
              />
            </label>
          </div>
          <textarea
            value={pasteText}
            onChange={(e) => {
              setPasteText(e.target.value);
              setPreviewRows(null);
              setParseError(null);
            }}
            rows={10}
            placeholder="Paste the price sheet text here..."
            className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 font-mono text-xs text-black"
          />
          <div className="flex flex-wrap items-center gap-2">
            <label className="cursor-pointer rounded-md border border-black/20 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10">
              {uploadingPdf ? "Reading PDF..." : "Or upload a PDF"}
              <input type="file" accept="application/pdf" onChange={handlePdfUpload} disabled={uploadingPdf} className="hidden" />
            </label>
            <span className="text-xs text-black/40 dark:text-white/40">
              Works best for text-based PDFs - a graphic/flyer-style layout may extract out of order, so check the
              preview carefully.
            </span>
          </div>
          {parseError && <p className="text-sm text-red-600">{parseError}</p>}
          {!previewRows && (
            <button
              onClick={() => handlePreview()}
              disabled={pasteText.trim() === ""}
              className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
            >
              Preview
            </button>
          )}
          {previewRows && (
            <div className="space-y-2">
              <p className="text-sm font-medium">
                Found {previewRows.length} item{previewRows.length === 1 ? "" : "s"} - check categories/prices before
                saving:
              </p>
              <PastePreview rows={previewRows} onChange={handlePreviewChange} onRemove={handlePreviewRemove} />
              <div className="flex gap-2">
                <button
                  onClick={handleConfirmImport}
                  disabled={importing}
                  className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
                >
                  {importing ? "Saving..." : "Confirm & Save"}
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

      <PriceComparisonImport vendors={vendors} onComplete={handleComparisonImportComplete} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {vendors.map((vendor) => (
          <VendorSection
            key={vendor.id}
            vendor={vendor}
            items={itemsByVendor.get(vendor.id) ?? []}
            onFieldSave={handleItemFieldSave}
            onDeleteItem={handleDeleteItem}
            onDeleteVendor={handleDeleteVendor}
          />
        ))}
        {vendors.length === 0 && (
          <p className="text-sm text-black/40 dark:text-white/40">No vendors yet - paste a price sheet above to add one.</p>
        )}
      </div>
    </div>
  );
}
