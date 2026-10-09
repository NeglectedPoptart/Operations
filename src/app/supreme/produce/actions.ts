"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function revalidateAll() {
  revalidatePath("/supreme/produce");
  revalidatePath("/mexico/arrivals");
  revalidatePath("/mexico/carton-inventory");
}

export async function addCartonType(name: string, nextPosition: number) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("carton_types").insert({ name, position: nextPosition }).select().single();
  if (error) throw new Error(error.message);
  revalidateAll();
  return data;
}

export async function deleteCartonType(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("carton_types").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

// Cartons are referenced by id everywhere (arrivals, inventory, transfers), so
// renaming only changes the label they show under.
export async function renameCartonType(id: string, name: string) {
  const supabase = await createClient();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Type a name.");
  const { error } = await supabase.from("carton_types").update({ name: trimmed }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}
