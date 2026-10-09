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

function combinedCommodityName(commodityGroup: string, variety: string | null, size?: string | null): string {
  return [commodityGroup.trim(), (variety ?? "").trim(), (size ?? "").trim()].filter(Boolean).join(" ");
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

// Adds several sizes under one variety at once (e.g. JBO, XLG, LGE, MED). A
// size that already exists is skipped. Returns just the rows that were added.
export async function addCommoditySizes(
  commodityGroup: string,
  variety: string,
  sizes: string[],
  temps: { low: number | null; high: number | null },
) {
  const supabase = await createClient();
  const group = commodityGroup.trim();
  const v = variety.trim();
  const wanted = [...new Set(sizes.map((s) => s.trim().replace(/\s+/g, " ")).filter(Boolean))];
  if (wanted.length === 0) return [];

  const { data: existing, error: readError } = await supabase.from("mx_commodities").select("name");
  if (readError) throw new Error(readError.message);
  const have = new Set((existing ?? []).map((r) => (r.name as string).toLowerCase()));
  const rows = wanted
    .filter((size) => !have.has(combinedCommodityName(group, v, size).toLowerCase()))
    .map((size) => ({
      commodity_group: group,
      variety: v || null,
      size,
      name: combinedCommodityName(group, v, size),
      temp_low: temps.low,
      temp_high: temps.high,
    }));
  if (rows.length === 0) return [];
  const { data, error } = await supabase.from("mx_commodities").insert(rows).select();
  if (error) throw new Error(error.message);
  revalidateAll();
  revalidatePath("/supreme/produce");
  return data ?? [];
}

export async function renameCommoditySize(id: string, commodityGroup: string, variety: string | null, size: string) {
  const supabase = await createClient();
  const trimmed = size.trim().replace(/\s+/g, " ");
  if (!trimmed) throw new Error("Type a size.");
  const { error } = await supabase
    .from("mx_commodities")
    .update({ size: trimmed, name: combinedCommodityName(commodityGroup, variety, trimmed) })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
  revalidatePath("/supreme/produce");
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

// Removes a variety and all of its sizes. (Arrivals already using them keep
// their value - it just isn't selectable any more.)
export async function deleteCommodityVariety(commodityGroup: string, variety: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("mx_commodities").delete().eq("commodity_group", commodityGroup).eq("variety", variety);
  if (error) throw new Error(error.message);
  revalidateAll();
  revalidatePath("/supreme/produce");
}

// Renames a variety everywhere it appears in the group - its plain entry and
// every size under it - so each one's combined name follows.
export async function renameCommodityVariety(commodityGroup: string, oldVariety: string, newVariety: string) {
  const supabase = await createClient();
  const trimmed = newVariety.trim();
  if (!trimmed) throw new Error("Type a variety name.");
  const { data: rows, error: fetchError } = await supabase
    .from("mx_commodities")
    .select("id, size")
    .eq("commodity_group", commodityGroup)
    .eq("variety", oldVariety);
  if (fetchError) throw new Error(fetchError.message);
  for (const row of rows ?? []) {
    const { error } = await supabase
      .from("mx_commodities")
      .update({ variety: trimmed, name: combinedCommodityName(commodityGroup, trimmed, row.size as string | null) })
      .eq("id", row.id);
    if (error) throw new Error(error.message);
  }
  revalidateAll();
  revalidatePath("/supreme/produce");
}

// Renames a whole Commodity Group at once (every variety and size under it)
// rather than one row at a time - matched by its current group name since
// that's the only thing identifying the group (there's no separate group table).
export async function renameCommodityGroup(oldGroupName: string, newGroupName: string) {
  const supabase = await createClient();
  const trimmedNew = newGroupName.trim();
  const { data: rows, error: fetchError } = await supabase
    .from("mx_commodities")
    .select("id, variety, size")
    .eq("commodity_group", oldGroupName);
  if (fetchError) throw new Error(fetchError.message);

  for (const row of rows ?? []) {
    const { error } = await supabase
      .from("mx_commodities")
      .update({
        commodity_group: trimmedNew,
        name: combinedCommodityName(trimmedNew, row.variety as string | null, row.size as string | null),
      })
      .eq("id", row.id);
    if (error) throw new Error(error.message);
  }
  revalidateAll();
  revalidatePath("/supreme/produce");
}
