"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ColdInventoryItem, ColdInventoryStatus } from "@/lib/types";
import type { ParsedColdInventoryItem } from "@/lib/coldInventoryParse";

function revalidateAll() {
  revalidatePath("/warehouse/cold-inventory");
  revalidatePath("/");
}

function keyOf(i: { manifest: string; commodity: string; size: string }) {
  return `${i.manifest}|${i.commodity}|${i.size}`;
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
