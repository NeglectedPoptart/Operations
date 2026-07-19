"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { FobFreightRate, FobItem, FobSection } from "@/lib/types";

function revalidateAll() {
  revalidatePath("/sales/fob-pharr");
}

export async function updateFobItem(
  id: string,
  patch: Partial<Pick<FobItem, "commodity_group" | "variety" | "unit_per" | "size" | "fob">>,
) {
  const supabase = await createClient();
  const { error } = await supabase.from("fob_items").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function addFobItem(section: FobSection, nextPosition: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fob_items")
    .insert({ section, commodity_group: "New Item", position: nextPosition })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidateAll();
  return data;
}

export async function deleteFobItem(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("fob_items").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function updateFreightRate(
  id: string,
  patch: Partial<Pick<FobFreightRate, "lane" | "ltl" | "ftl">>,
) {
  const supabase = await createClient();
  const { error } = await supabase.from("fob_freight_rates").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function addFreightRate(nextPosition: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fob_freight_rates")
    .insert({ lane: "New Lane", position: nextPosition })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidateAll();
  return data;
}

export async function deleteFreightRate(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("fob_freight_rates").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}
