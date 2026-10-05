"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function revalidateAll() {
  revalidatePath("/mexico/growers");
  revalidatePath("/mexico/arrivals");
}

// Growers -----------------------------------------------------------------------

export async function createGrower(name: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("mx_growers").insert({ name }).select().single();
  if (error) throw new Error(error.message);
  revalidateAll();
  return data;
}

export async function updateGrower(
  id: string,
  patch: {
    name?: string;
    origin?: string | null;
    best_contact?: string | null;
    accounting_contact?: string | null;
    logistics_contact?: string | null;
    notes?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
  },
) {
  const supabase = await createClient();
  const { error } = await supabase.from("mx_growers").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function deleteGrower(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("mx_growers").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

// Labels --------------------------------------------------------------------------

export async function createLabel(name: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("mx_grower_labels").insert({ name }).select().single();
  if (error) throw new Error(error.message);
  revalidateAll();
  return data;
}

export async function deleteLabel(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("mx_grower_labels").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

// Commodities ----------------------------------------------------------------------

function combinedCommodityName(commodityGroup: string, variety: string | null): string {
  return [commodityGroup.trim(), (variety ?? "").trim()].filter(Boolean).join(" ");
}

export async function createCommodity(
  commodityGroup: string,
  variety: string | null,
  temps?: { low: number | null; high: number | null },
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mx_commodities")
    .insert({
      commodity_group: commodityGroup.trim(),
      variety: variety?.trim() || null,
      name: combinedCommodityName(commodityGroup, variety),
      temp_low: temps?.low ?? null,
      temp_high: temps?.high ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidateAll();
  revalidatePath("/supreme/produce");
  return data;
}

export async function updateCommodityGroupTemps(commodityGroup: string, low: number | null, high: number | null) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("mx_commodities")
    .update({ temp_low: low, temp_high: high })
    .eq("commodity_group", commodityGroup);
  if (error) throw new Error(error.message);
  revalidatePath("/supreme/produce");
}

export async function deleteCommodity(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("mx_commodities").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
  revalidatePath("/supreme/produce");
}

export async function updateCommodityVariety(id: string, commodityGroup: string, variety: string | null) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("mx_commodities")
    .update({ variety: variety?.trim() || null, name: combinedCommodityName(commodityGroup, variety) })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
  revalidatePath("/supreme/produce");
}

// Renames a whole Commodity Group at once (every variety under it) rather
// than one row at a time - matched by its current group name since that's
// the only thing identifying the group (there's no separate group table).
export async function renameCommodityGroup(oldGroupName: string, newGroupName: string) {
  const supabase = await createClient();
  const trimmedNew = newGroupName.trim();
  const { data: rows, error: fetchError } = await supabase
    .from("mx_commodities")
    .select("id, variety")
    .eq("commodity_group", oldGroupName);
  if (fetchError) throw new Error(fetchError.message);

  for (const row of rows ?? []) {
    const { error } = await supabase
      .from("mx_commodities")
      .update({ commodity_group: trimmedNew, name: combinedCommodityName(trimmedNew, row.variety as string | null) })
      .eq("id", row.id);
    if (error) throw new Error(error.message);
  }
  revalidateAll();
  revalidatePath("/supreme/produce");
}
