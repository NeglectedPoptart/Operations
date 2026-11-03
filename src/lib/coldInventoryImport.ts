import type { SupabaseClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import { findColdInventoryTable, parseColdInventoryPaste, type ParsedColdInventoryItem } from "./coldInventoryParse";
import type { ColdInventoryItem, ColdInventoryStatus } from "./types";

// Shared by the Cold Inventory page (upload) and the HOPS inbox reader (the warehouse emails the
// same Inventory Report .xlsx every morning).

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

export interface ColdInventoryFile {
  items: ParsedColdInventoryItem[];
  reportDate: string | null; // YYYY-MM-DD, from the report's own "Date:" line
  customer: string | null;
}

// Reads the cold storage "Inventory Report" .xlsx into the line items. Nothing is saved here.
export async function readColdInventoryBuffer(data: ArrayBuffer | Buffer): Promise<ColdInventoryFile | { error: string }> {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(data as ArrayBuffer);
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
    return { items: parsed.items, reportDate: table.reportDate, customer: table.customer };
  } catch (err) {
    return { error: `Couldn't read that file (${err instanceof Error ? err.message : String(err)}). Make sure it's an .xlsx.` };
  }
}

// Full-replace import, reviewed fresh every day: Good/unmarked items always
// reset to unmarked even when the same manifest+commodity+size reappears -
// only Issue/Dump carries its status+notes over (and gets carried_over set,
// so it's visibly distinguishable from something flagged today). Anything
// not in this import is deleted (that stock shipped out).
export async function replaceColdInventory(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  items: ParsedColdInventoryItem[],
): Promise<ColdInventoryItem[]> {
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
  return (finalRows ?? []) as ColdInventoryItem[];
}

// Handles one email from the inbox reader. The Inventory Report .xlsx is recognised by its file
// name (or the subject) containing "inventory" and by actually holding the inventory table.
// Returns false when this message was not an inventory email or was already handled.
export async function importColdInventoryEmail(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: SupabaseClient<any, any, any>,
  msg: { id: string; fromEmail: string; subject: string; receivedAt: string },
  loadFiles: () => Promise<{ fileName: string; data: Buffer }[]>,
): Promise<boolean> {
  const { data: existing, error: lookupError } = await db.from("cold_inventory_imports").select("id").eq("graph_message_id", msg.id).maybeSingle();
  // Table missing (migration 161 not run): do nothing, or the file would be re-read every poll.
  if (lookupError || existing) return false;

  const base = { graph_message_id: msg.id, received_at: msg.receivedAt, from_email: msg.fromEmail, subject: msg.subject };

  // Downloaded only now, after the "already handled" check, since the newest message is re-read
  // on every pass of the inbox reader.
  for (const file of await loadFiles()) {
    const read = await readColdInventoryBuffer(file.data);
    if ("error" in read) {
      // Not the inventory report at all (some other spreadsheet) - ignore unless named like it.
      if (!/inventory/i.test(file.fileName) && !/inventory/i.test(msg.subject)) continue;
      await db.from("cold_inventory_imports").insert({ ...base, file_name: file.fileName, status: "error", note: read.error });
      return true;
    }

    const common = {
      ...base,
      file_name: file.fileName,
      report_date: read.reportDate,
      customer: read.customer,
      items_count: read.items.length,
      items: read.items,
    };

    // Never go backwards to an older report, and never replace today's list with a second file
    // for the same report date (that would reset everyone's marks) - it waits for "Apply anyway".
    const { data: lastApplied } = await db
      .from("cold_inventory_imports")
      .select("report_date")
      .eq("status", "applied")
      .not("report_date", "is", null)
      .order("report_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    const last = (lastApplied?.report_date as string | null) ?? null;
    if (read.reportDate && last && read.reportDate < last) {
      await db.from("cold_inventory_imports").insert({ ...common, status: "skipped", note: `This report (${read.reportDate}) is older than the one already loaded (${last}).` });
      return true;
    }
    if (read.reportDate && last && read.reportDate === last) {
      await db.from("cold_inventory_imports").insert({ ...common, status: "skipped", note: `A report for ${read.reportDate} was already loaded, so this second file was not applied (it would reset today's marks).` });
      return true;
    }

    try {
      await replaceColdInventory(db, read.items);
      await db.from("cold_inventory_imports").insert({ ...common, status: "applied" });
    } catch (err) {
      await db.from("cold_inventory_imports").insert({ ...common, status: "error", note: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }
  return false;
}
