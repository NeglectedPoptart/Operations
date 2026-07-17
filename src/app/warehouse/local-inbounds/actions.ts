"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { LocalInbound } from "@/lib/types";

function revalidateAll() {
  revalidatePath("/warehouse/local-inbounds");
  revalidatePath("/");
}

export async function addLocalInboundRow(entryDate: string, nextPosition: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("local_inbounds")
    .insert({ entry_date: entryDate, position: nextPosition })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidateAll();
  return data;
}

export async function updateLocalInboundRow(id: string, patch: Partial<Omit<LocalInbound, "id" | "created_at" | "updated_at">>) {
  const supabase = await createClient();
  const { error } = await supabase.from("local_inbounds").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function deleteLocalInboundRow(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("local_inbounds").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}
