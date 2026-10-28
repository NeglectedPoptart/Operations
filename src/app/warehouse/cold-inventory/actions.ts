"use server";

import { revalidatePath } from "next/cache";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { findColdInventoryTable, parseColdInventoryPaste } from "@/lib/coldInventoryParse";
import type { ColdInventoryItem, ColdInventoryStatus } from "@/lib/types";
import type { ParsedColdInventoryItem } from "@/lib/coldInventoryParse";

function revalidateAll() {
  revalidatePath("/warehouse/cold-inventory");
  revalidatePath("/");
}

function keyOf(i: { manifest: string; commodity: string; size: string }) {
  return `${i.manifest}|${i.commodity}|${i.size}`;
}

// One cell of the Excel report as text (merged cells and formulas included).
function cellText(cell: ExcelJS.Cell): string {
  try {
    const v = cell.value as unknown;
    if (v === null || v === undefined) return "";
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === "object") {
      const o = v as { result?: unknown; richText?: { text: string }[]; text?: unknown };
      if ("result" in o) return String(o.result ?? "");
      if (o.richText) return o.richText.map((t) => t.text).join("");
      if (o.text !== undefined) return String(o.text);
      return "";
    }
    return String(v);
  } catch {
    return "";
  }
}

export interface ColdInventoryXlsxResult {
  items: ParsedColdInventoryItem[];
  reportDate: string | null; // YYYY-MM-DD, from the report's own "Date:" line
  customer: string | null;
  fileName: string;
}

// Reads the cold storage "Inventory Report" .xlsx - the same pivot report that used to be copied
// and pasted - into the line items the import shows for review. Nothing is saved here.
export async function readColdInventoryXlsx(formData: FormData): Promise<ColdInventoryXlsxResult | { error: string }> {
  const file = formData.get("file");
  if (!(file instanceof Blob)) return { error: "No file received." };
  const fileName = file instanceof File ? file.name : "inventory.xlsx";
  if (/.xls$/i.test(fileName)) return { error: "That is an old .xls file - open it in Excel and Save As .xlsx, then upload that." };

  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const sheet = workbook.worksheets[0];
    if (!sheet) return { error: "The workbook has no sheets." };
    const rows: string[][] = [];
    for (let r = 1; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const cells: string[] = [];
      for (let c = 1; c <= sheet.columnCount; c++) cells.push(cellText(row.getCell(c)));
      rows.push(cells);
    }
    const table = findColdInventoryTable(rows);
    if (!table) return { error: "Could not find the inventory table (a header row starting with \"Manifest\" and \"Commodity\") - is this the cold storage Inventory Report?" };
    const parsed = parseColdInventoryPaste(table.tsv);
    if (parsed.error) return { error: parsed.error };
    return { items: parsed.items, reportDate: table.reportDate, customer: table.customer, fileName };
  } catch (err) {
    return { error: `Couldn't read that file (${err instanceof Error ? err.message : String(err)}). Make sure it's an .xlsx.` };
  }
}

// Full-replace import, reviewed fresh every day: Good/unmarked items always
// reset to unmarked even when the same manifest+commodity+size reappears -
// only Issue/Dump carries its status+notes over (and gets carried_over set,
// so it's visibly distinguishable from something flagged today). Anything
// not in this paste is deleted (that stock shipped out).
export async function importColdInventory(items: ParsedColdInventoryItem[]): Promise<ColdInventoryItem[]> {
  const supabase = await createClient();

  const { data: existingRows, error: fetchError } = await supabase
    .from("cold_inventory_items")
    .select("id, manifest, commodity, size, status");
  if (fetchError) throw new Error(fetchError.message);

  const existingByKey = new Map<string, { id: string; status: ColdInventoryStatus | null }>();
  for (const r of (existingRows ?? []) as {
    id: string;
    manifest: string;
    commodity: string;
    size: string;
    status: ColdInventoryStatus | null;
  }[]) {
    existingByKey.set(keyOf(r), { id: r.id, status: r.status });
  }

  const toInsert: {
    manifest: string;
    commodity: string;
    size: string;
    qty: number;
    manifest_order: number;
    column_order: number;
  }[] = [];
  const toKeep: { id: string; qty: number; manifest_order: number; column_order: number }[] = [];
  const toReset: { id: string; qty: number; manifest_order: number; column_order: number }[] = [];

  for (const item of items) {
    const existing = existingByKey.get(keyOf(item));
    if (!existing) {
      toInsert.push({
        manifest: item.manifest,
        commodity: item.commodity,
        size: item.size,
        qty: item.qty,
        manifest_order: item.manifestOrder,
        column_order: item.columnOrder,
      });
    } else if (existing.status === "issue" || existing.status === "dump") {
      toKeep.push({ id: existing.id, qty: item.qty, manifest_order: item.manifestOrder, column_order: item.columnOrder });
    } else {
      toReset.push({ id: existing.id, qty: item.qty, manifest_order: item.manifestOrder, column_order: item.columnOrder });
    }
  }

  if (toInsert.length > 0) {
    const { error } = await supabase.from("cold_inventory_items").insert(toInsert);
    if (error) throw new Error(error.message);
  }
  for (const u of toKeep) {
    const { error } = await supabase
      .from("cold_inventory_items")
      .update({ qty: u.qty, manifest_order: u.manifest_order, column_order: u.column_order, carried_over: true })
      .eq("id", u.id);
    if (error) throw new Error(error.message);
  }
  for (const u of toReset) {
    const { error } = await supabase
      .from("cold_inventory_items")
      .update({
        qty: u.qty,
        manifest_order: u.manifest_order,
        column_order: u.column_order,
        status: null,
        carried_over: false,
      })
      .eq("id", u.id);
    if (error) throw new Error(error.message);
  }

  const keep = new Set(items.map(keyOf));
  const staleIds = (existingRows ?? []).filter((r) => !keep.has(keyOf(r))).map((r) => r.id);
  if (staleIds.length > 0) {
    const { error } = await supabase.from("cold_inventory_items").delete().in("id", staleIds);
    if (error) throw new Error(error.message);
  }

  const { data: finalRows, error: finalError } = await supabase
    .from("cold_inventory_items")
    .select("*")
    .order("manifest_order", { ascending: true })
    .order("column_order", { ascending: true });
  if (finalError) throw new Error(finalError.message);

  revalidateAll();
  return (finalRows ?? []) as ColdInventoryItem[];
}

// Any manual status change is a fresh action taken today, so it clears
// carried_over regardless of the new status.
export async function updateColdInventoryStatus(id: string, status: ColdInventoryStatus | null) {
  const supabase = await createClient();
  const { error } = await supabase.from("cold_inventory_items").update({ status, carried_over: false }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function updateColdInventoryNotes(id: string, notes: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("cold_inventory_items")
    .update({ notes: notes.trim() === "" ? null : notes.trim() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}
