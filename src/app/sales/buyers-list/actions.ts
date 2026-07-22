"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { BuyersListItem } from "@/lib/types";
import type { ParsedBuyersItem } from "@/lib/buyersListParse";

function revalidateAll() {
  revalidatePath("/sales/buyers-list");
}

function keyOf(i: { whse: string; comm: string; variety: string; pstyle: string; size: string; label: string }) {
  return `${i.whse}|${i.comm}|${i.variety}|${i.pstyle}|${i.size}|${i.label}`;
}

// Merge-only: new shortages get inserted at the end of the list; a shortage
// already on the list (matched by whse+comm+variety+pstyle+size+label) just
// gets its qty_needed refreshed in place - position and notes are left
// untouched so nothing reshuffles or loses its note on re-paste.
export async function importBuyersListItems(items: ParsedBuyersItem[]): Promise<BuyersListItem[]> {
  const supabase = await createClient();

  const { data: existingRows, error: fetchError } = await supabase
    .from("buyers_list_items")
    .select("id, whse, comm, variety, pstyle, size, label, position");
  if (fetchError) throw new Error(fetchError.message);

  const existingByKey = new Map<string, { id: string; position: number }>();
  let maxPosition = -1;
  for (const r of (existingRows ?? []) as {
    id: string;
    whse: string;
    comm: string;
    variety: string;
    pstyle: string;
    size: string;
    label: string;
    position: number;
  }[]) {
    existingByKey.set(keyOf(r), { id: r.id, position: r.position });
    if (r.position > maxPosition) maxPosition = r.position;
  }

  const toInsert: {
    whse: string;
    comm: string;
    variety: string;
    pstyle: string;
    size: string;
    label: string;
    qty_needed: number;
    position: number;
  }[] = [];
  const toUpdate: { id: string; qty_needed: number }[] = [];

  for (const item of items) {
    const existing = existingByKey.get(keyOf(item));
    if (existing) {
      toUpdate.push({ id: existing.id, qty_needed: item.qtyNeeded });
    } else {
      maxPosition += 1;
      toInsert.push({
        whse: item.whse,
        comm: item.comm,
        variety: item.variety,
        pstyle: item.pstyle,
        size: item.size,
        label: item.label,
        qty_needed: item.qtyNeeded,
        position: maxPosition,
      });
    }
  }

  if (toInsert.length > 0) {
    const { error } = await supabase.from("buyers_list_items").insert(toInsert);
    if (error) throw new Error(error.message);
  }
  for (const u of toUpdate) {
    const { error } = await supabase.from("buyers_list_items").update({ qty_needed: u.qty_needed }).eq("id", u.id);
    if (error) throw new Error(error.message);
  }

  const { data: finalRows, error: finalError } = await supabase
    .from("buyers_list_items")
    .select("*")
    .order("position", { ascending: true });
  if (finalError) throw new Error(finalError.message);

  revalidateAll();
  return (finalRows ?? []) as BuyersListItem[];
}

export async function updateBuyersListNotes(id: string, notes: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("buyers_list_items")
    .update({ notes: notes.trim() === "" ? null : notes.trim() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function deleteBuyersListItem(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("buyers_list_items").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}
