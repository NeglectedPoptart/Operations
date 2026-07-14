"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { AmHoldoverStatus } from "@/lib/types";

function revalidateAll() {
  revalidatePath("/warehouse/am-holdovers");
  revalidatePath("/");
}

export async function addHoldoverRow(entryDate: string, nextPosition: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("am_holdovers")
    .insert({ entry_date: entryDate, position: nextPosition })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidateAll();
  return data;
}

export async function updateHoldoverRow(
  id: string,
  patch: { po_lot_number?: string | null; status?: AmHoldoverStatus; notes?: string | null },
) {
  const supabase = await createClient();
  const { error } = await supabase.from("am_holdovers").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function deleteHoldoverRow(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("am_holdovers").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}
