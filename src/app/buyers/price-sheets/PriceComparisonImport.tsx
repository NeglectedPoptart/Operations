"use client";

import { useState, type ChangeEvent } from "react";
import { todayISO } from "@/lib/dates";
import { PRODUCE_CATEGORIES } from "@/lib/priceSheetParse";
import { parsePriceComparisonSheet } from "@/lib/priceComparisonParse";
import type { PriceSheetItem, Vendor } from "@/lib/types";
import { createVendor, extractExcelGrid, importPriceSheet } from "./actions";

const field = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black";

interface ComparisonRow {
  key: number;
  category: string;
  itemLabel: string;
  vendorColumn: string;
  price: number | null;
}

type Mapping = { mode: "existing"; vendorId: string } | { mode: "new"; newName: string };

// "Mexfresh TX" should default-match an existing "MexFresh" rather than
// always proposing a fresh vendor - normalizes both sides and checks for a
// substring match either direction. Still just a starting guess: the
// mapping step always shows it for the user to confirm or change.
function guessVendorId(columnName: string, vendors: Vendor[]): string | null {
  const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const nc = norm(columnName);
  const exact = vendors.find((v) => norm(v.name) === nc);
  if (exact) return exact.id;
  const partial = vendors.find((v) => {
    const nv = norm(v.name);
    return nv.length > 2 && nc.length > 2 && (nc.includes(nv) || nv.includes(nc));
  });
  return partial?.id ?? null;
}

export default function PriceComparisonImport({
  vendors,
  onComplete,
}: {
  vendors: Vendor[];
  onComplete: (newVendors: Vendor[], updates: { vendorId: string; items: PriceSheetItem[]; sheetDate: string }[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vendorColumns, setVendorColumns] = useState<string[] | null>(null);
  const [rows, setRows] = useState<ComparisonRow[]>([]);
  const [mappings, setMappings] = useState<Record<string, Mapping>>({});
  const [sheetDate, setSheetDate] = useState(todayISO());
  const [saving, setSaving] = useState(false);

  function reset() {
    setVendorColumns(null);
    setRows([]);
    setMappings({});
    setError(null);
  }

  async function handleUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const gridResult = await extractExcelGrid(formData);
      if ("error" in gridResult) {
        setError(`Couldn't read that file (${gridResult.error}).`);
        return;
      }
      const parsed = parsePriceComparisonSheet(gridResult.grid);
      if (parsed.error) {
        setError(parsed.error);
        return;
      }
      const flat: ComparisonRow[] = [];
      let key = 0;
      for (const item of parsed.items) {
        for (const [vendorColumn, price] of Object.entries(item.pricesByColumn)) {
          flat.push({ key: key++, category: item.category, itemLabel: item.itemLabel, vendorColumn, price });
        }
      }
      setRows(flat);
      setVendorColumns(parsed.vendorColumns);
      const initialMappings: Record<string, Mapping> = {};
      for (const col of parsed.vendorColumns) {
        const guessId = guessVendorId(col, vendors);
        initialMappings[col] = guessId ? { mode: "existing", vendorId: guessId } : { mode: "new", newName: col };
      }
      setMappings(initialMappings);
    } catch (err) {
      setError(`Couldn't read that file (${err instanceof Error ? err.message : String(err)}).`);
    } finally {
      setUploading(false);
    }
  }

  function updateRow(key: number, patch: Partial<ComparisonRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function removeRow(key: number) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  async function handleConfirm() {
    if (!vendorColumns) return;
    for (const col of vendorColumns) {
      const m = mappings[col];
      if (m.mode === "new" && !m.newName.trim()) {
        alert(`Enter a vendor name for the "${col}" column, or pick an existing vendor.`);
        return;
      }
    }
    setSaving(true);
    try {
      const newVendors: Vendor[] = [];
      const vendorIdByColumn = new Map<string, string>();
      for (const col of vendorColumns) {
        const m = mappings[col];
        if (m.mode === "existing") {
          vendorIdByColumn.set(col, m.vendorId);
        } else {
          const vendor = await createVendor(m.newName.trim());
          newVendors.push(vendor);
          vendorIdByColumn.set(col, vendor.id);
        }
      }

      // Only vendors with at least one surviving row get imported - a
      // vendor the user pruned down to zero rows during review keeps
      // whatever sheet they already had rather than being silently wiped.
      const rowsByVendorId = new Map<string, ComparisonRow[]>();
      for (const row of rows) {
        const vendorId = vendorIdByColumn.get(row.vendorColumn);
        if (!vendorId) continue;
        if (!rowsByVendorId.has(vendorId)) rowsByVendorId.set(vendorId, []);
        rowsByVendorId.get(vendorId)!.push(row);
      }

      const updates: { vendorId: string; items: PriceSheetItem[]; sheetDate: string }[] = [];
      for (const [vendorId, vendorRows] of rowsByVendorId) {
        const items = vendorRows.map((r) => ({ category: r.category, itemLabel: r.itemLabel, size: "", price: r.price }));
        const saved = await importPriceSheet(vendorId, items, sheetDate);
        updates.push({ vendorId, items: saved, sheetDate });
      }

      onComplete(newVendors, updates);
      reset();
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  const vendorColumnsWithRows = vendorColumns?.filter((col) => rows.some((r) => r.vendorColumn === col)) ?? [];

  return (
    <div className="space-y-3 rounded-lg border border-black/10 p-4 dark:border-white/10">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-green-700 dark:text-green-400">Import Price Comparison (Excel)</h2>
          <p className="text-xs text-black/50 dark:text-white/50">
            A sales-team cross-vendor summary (one column per vendor) updates several vendors&apos; sheets at once.
          </p>
        </div>
        <button
          onClick={() => {
            setOpen((o) => !o);
            if (open) reset();
          }}
          className="rounded-md border border-black/20 px-3 py-1.5 text-sm dark:border-white/20"
        >
          {open ? "Hide" : "Import Comparison"}
        </button>
      </div>

      {open && (
        <div className="space-y-4">
          {!vendorColumns && (
            <div className="flex flex-wrap items-center gap-2">
              <label className="cursor-pointer rounded-md border border-black/20 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10">
                {uploading ? "Reading file..." : "Upload .xlsx"}
                <input
                  type="file"
                  accept=".xlsx"
                  onChange={handleUpload}
                  disabled={uploading}
                  className="hidden"
                />
              </label>
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}

          {vendorColumns && (
            <>
              <div className="space-y-2">
                <p className="text-sm font-medium">Match each column to a vendor:</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {vendorColumns.map((col) => {
                    const m = mappings[col];
                    return (
                      <div key={col} className="flex items-center gap-2 rounded border border-black/10 p-2 text-sm dark:border-white/10">
                        <span className="w-32 shrink-0 truncate font-medium" title={col}>
                          {col}
                        </span>
                        <select
                          value={m.mode === "existing" ? m.vendorId : "__new__"}
                          onChange={(e) => {
                            if (e.target.value === "__new__") {
                              setMappings((prev) => ({ ...prev, [col]: { mode: "new", newName: col } }));
                            } else {
                              setMappings((prev) => ({ ...prev, [col]: { mode: "existing", vendorId: e.target.value } }));
                            }
                          }}
                          className={field}
                        >
                          <option value="__new__">+ Create new vendor</option>
                          {vendors.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.name}
                            </option>
                          ))}
                        </select>
                        {m.mode === "new" && (
                          <input
                            value={m.newName}
                            onChange={(e) =>
                              setMappings((prev) => ({ ...prev, [col]: { mode: "new", newName: e.target.value } }))
                            }
                            className={`${field} w-40`}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <label className="flex w-40 flex-col gap-1 text-sm">
                <span className="font-medium">Sheet date</span>
                <input type="date" value={sheetDate} onChange={(e) => setSheetDate(e.target.value)} className={field} />
              </label>

              <div className="space-y-2">
                <p className="text-sm font-medium">
                  {rows.length} price{rows.length === 1 ? "" : "s"} across {vendorColumnsWithRows.length} vendor
                  {vendorColumnsWithRows.length === 1 ? "" : "s"} - check before saving:
                </p>
                <datalist id="price-comparison-categories">
                  {PRODUCE_CATEGORIES.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
                <div className="max-h-96 overflow-auto rounded border border-black/10 dark:border-white/10">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-black/5 text-left dark:bg-neutral-900">
                      <tr>
                        <th className="px-2 py-1">Vendor</th>
                        <th className="px-2 py-1">Category</th>
                        <th className="px-2 py-1">Item</th>
                        <th className="px-2 py-1">Price</th>
                        <th className="w-8 px-2 py-1" />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.key} className="border-t border-black/10 dark:border-white/10">
                          <td className="px-2 py-1 whitespace-nowrap text-black/50 dark:text-white/50">{r.vendorColumn}</td>
                          <td className="min-w-[7rem] px-1 py-1">
                            <input
                              list="price-comparison-categories"
                              value={r.category}
                              onChange={(e) => updateRow(r.key, { category: e.target.value })}
                              className={field}
                            />
                          </td>
                          <td className="min-w-[10rem] px-1 py-1">
                            <input
                              value={r.itemLabel}
                              onChange={(e) => updateRow(r.key, { itemLabel: e.target.value })}
                              className={field}
                            />
                          </td>
                          <td className="min-w-[5rem] px-1 py-1">
                            <input
                              type="number"
                              step="any"
                              value={r.price ?? ""}
                              onChange={(e) =>
                                updateRow(r.key, { price: e.target.value.trim() === "" ? null : Number(e.target.value) })
                              }
                              className={field}
                            />
                          </td>
                          <td className="px-1 py-1">
                            <button onClick={() => removeRow(r.key)} className="text-xs font-medium text-red-600 hover:underline">
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleConfirm}
                  disabled={saving || rows.length === 0}
                  className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
                >
                  {saving ? "Saving..." : `Confirm & Save ${vendorColumnsWithRows.length} vendor${vendorColumnsWithRows.length === 1 ? "" : "s"}`}
                </button>
                <button
                  onClick={() => {
                    reset();
                  }}
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/10"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
