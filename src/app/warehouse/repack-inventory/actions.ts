"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { RepackItem } from "@/lib/types";

function revalidateAll() {
  revalidatePath("/warehouse/repack-inventory");
}

export async function addRepackItem(name: string, initialStock: number, nextPosition: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("repack_items")
    .insert({ name, initial_stock: initialStock, current_stock: initialStock, position: nextPosition })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidateAll();
  return data;
}

export async function updateRepackItem(id: string, patch: Partial<Pick<RepackItem, "name" | "initial_stock">>) {
  const supabase = await createClient();
  const { error } = await supabase.from("repack_items").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function deleteRepackItem(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("repack_items").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

// A single signed adjustment against one item - used by the per-item history
// panel (restocks, corrections, or a one-off usage entry). current_stock is
// updated by the apply_repack_adjustment trigger, not here.
export async function addRepackAdjustment(itemId: string, entryDate: string, qty: number, notes: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("repack_adjustments")
    .insert({ item_id: itemId, entry_date: entryDate, qty, notes: notes || null })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidateAll();
  return data;
}

// A repack job usually touches several materials at once. Each line's qty is
// the amount USED (always positive from the UI) and gets stored negative.
export async function logRepackUsage(
  lines: { itemId: string; qty: number }[],
  entryDate: string,
  notes: string,
) {
  const supabase = await createClient();
  const rows = lines
    .filter((l) => l.qty > 0)
    .map((l) => ({ item_id: l.itemId, entry_date: entryDate, qty: -Math.abs(l.qty), notes: notes || null }));
  if (rows.length === 0) return [];

  const { data, error } = await supabase.from("repack_adjustments").insert(rows).select();
  if (error) throw new Error(error.message);
  revalidateAll();
  return data;
}

export async function deleteRepackAdjustment(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("repack_adjustments").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}
