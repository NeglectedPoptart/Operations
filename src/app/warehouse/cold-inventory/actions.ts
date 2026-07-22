"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ColdInventoryItem, ColdInventoryStatus } from "@/lib/types";
import type { ParsedColdInventoryItem } from "@/lib/coldInventoryParse";

function revalidateAll() {
  revalidatePath("/warehouse/cold-inventory");
  revalidatePath("/");
}

// Full-replace import: upserts every parsed row (refreshing qty/manifest_order
// /column_order so the layout always matches the latest paste), then deletes
// anything not present in this paste (that stock shipped out). Status/notes
// are never part of the upsert payload, so Postgres leaves them untouched on
// conflict - they only reset to null for a genuinely new manifest+commodity+
// size combination.
export async function importColdInventory(items: ParsedColdInventoryItem[]): Promise<ColdInventoryItem[]> {
  const supabase = await createClient();

  const rows = items.map((i) => ({
    manifest: i.manifest,
    commodity: i.commodity,
    size: i.size,
    qty: i.qty,
    manifest_order: i.manifestOrder,
    column_order: i.columnOrder,
  }));

  const { error: upsertError } = await supabase
    .from("cold_inventory_items")
    .upsert(rows, { onConflict: "manifest,commodity,size" });
  if (upsertError) throw new Error(upsertError.message);

  const { data: allRows, error: fetchError } = await supabase
    .from("cold_inventory_items")
    .select("id, manifest, commodity, size");
  if (fetchError) throw new Error(fetchError.message);

  const keep = new Set(items.map((i) => `${i.manifest}|${i.commodity}|${i.size}`));
  const staleIds = (allRows ?? [])
    .filter((r) => !keep.has(`${r.manifest}|${r.commodity}|${r.size}`))
    .map((r) => r.id);

  if (staleIds.length > 0) {
    const { error: deleteError } = await supabase.from("cold_inventory_items").delete().in("id", staleIds);
    if (deleteError) throw new Error(deleteError.message);
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

export async function updateColdInventoryStatus(id: string, status: ColdInventoryStatus | null) {
  const supabase = await createClient();
  const { error } = await supabase.from("cold_inventory_items").update({ status }).eq("id", id);
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
