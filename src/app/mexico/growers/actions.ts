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

export async function createCommodity(name: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("mx_commodities").insert({ name }).select().single();
  if (error) throw new Error(error.message);
  revalidateAll();
  return data;
}

export async function deleteCommodity(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("mx_commodities").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function updateCommodityName(id: string, name: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("mx_commodities").update({ name }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
  revalidatePath("/supreme/produce");
}

// Which carton type a product/commodity ships in - set from Supreme >
// Produce, read back on Arrivals (and eventually used to drive carton
// deduction there).
export async function updateCommodityCartonType(id: string, cartonTypeId: string | null) {
  const supabase = await createClient();
  const { error } = await supabase.from("mx_commodities").update({ carton_type_id: cartonTypeId }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
  revalidatePath("/supreme/produce");
}
