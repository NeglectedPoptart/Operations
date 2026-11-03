"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { readColdInventoryBuffer, replaceColdInventory } from "@/lib/coldInventoryImport";
import type { ColdInventoryItem, ColdInventoryStatus } from "@/lib/types";
import type { ParsedColdInventoryItem } from "@/lib/coldInventoryParse";

function revalidateAll() {
  revalidatePath("/warehouse/cold-inventory");
  revalidatePath("/");
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
  if (/\.xls$/i.test(fileName)) return { error: "That is an old .xls file - open it in Excel and Save As .xlsx, then upload that." };

  const read = await readColdInventoryBuffer(await file.arrayBuffer());
  if ("error" in read) return read;
  return { ...read, fileName };
}

// Full-replace import, reviewed fresh every day (see replaceColdInventory).
export async function importColdInventory(items: ParsedColdInventoryItem[]): Promise<ColdInventoryItem[]> {
  const supabase = await createClient();
  const rows = await replaceColdInventory(supabase, items);
  revalidateAll();
  return rows;
}

// "Apply anyway" on an emailed report that was held back (older report, or a second file for a
// date already loaded). Uses the lines saved with that email.
export async function applyColdInventoryEmail(importId: string): Promise<{ count: number } | { error: string }> {
  const supabase = await createClient();
  const { data: row, error } = await supabase.from("cold_inventory_imports").select("items").eq("id", importId).maybeSingle();
  if (error || !row) return { error: error?.message ?? "That email is no longer on file." };
  const items = (row.items ?? []) as ParsedColdInventoryItem[];
  if (items.length === 0) return { error: "That email has no inventory lines saved." };
  try {
    await replaceColdInventory(supabase, items);
    await supabase.from("cold_inventory_imports").update({ status: "applied", note: "Applied by hand." }).eq("id", importId);
    revalidateAll();
    return { count: items.length };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not apply that report." };
  }
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
