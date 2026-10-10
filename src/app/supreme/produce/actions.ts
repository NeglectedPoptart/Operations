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

// Labels (the Product Label pick-list on the New Inspection form) -------------------

export interface ProductLabel {
  id: string;
  value: string;
}

export async function addProductLabel(name: string): Promise<ProductLabel> {
  const supabase = await createClient();
  const text = name.trim().replace(/\s+/g, " ");
  if (!text) throw new Error("Type a label.");
  const { data, error } = await supabase.from("qc_field_options").insert({ field_key: "product_label", value: text }).select("id, value").single();
  if (error || !data) throw new Error(error?.message ?? "Couldn't add the label.");
  revalidatePath("/supreme/produce");
  revalidatePath("/qc/inspections/new");
  return data as ProductLabel;
}

export async function renameProductLabel(id: string, name: string) {
  const supabase = await createClient();
  const text = name.trim().replace(/\s+/g, " ");
  if (!text) throw new Error("Type a label.");
  const { error } = await supabase.from("qc_field_options").update({ value: text }).eq("id", id).eq("field_key", "product_label");
  if (error) throw new Error(error.message);
  revalidatePath("/supreme/produce");
  revalidatePath("/qc/inspections/new");
}

export async function deleteProductLabel(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("qc_field_options").delete().eq("id", id).eq("field_key", "product_label");
  if (error) throw new Error(error.message);
  revalidatePath("/supreme/produce");
  revalidatePath("/qc/inspections/new");
}

// Adds every label already used on a saved inspection that isn't in the list yet.
export async function pullLabelsFromInspections(): Promise<{ added: ProductLabel[] }> {
  const supabase = await createClient();
  const have = new Set<string>();
  const { data: existing } = await supabase.from("qc_field_options").select("value").eq("field_key", "product_label");
  for (const o of existing ?? []) have.add((o.value as string).toLowerCase());

  const found = new Map<string, string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("qc_lot_inspections").select("product_label").not("product_label", "is", null).range(from, from + 999);
    if (error || !data) break;
    for (const r of data) {
      const value = ((r.product_label as string) ?? "").trim().replace(/\s+/g, " ");
      if (value && !have.has(value.toLowerCase()) && !found.has(value.toLowerCase())) found.set(value.toLowerCase(), value);
    }
    if (data.length < 1000) break;
  }
  if (found.size === 0) return { added: [] };
  const { data: inserted, error } = await supabase
    .from("qc_field_options")
    .insert([...found.values()].map((value) => ({ field_key: "product_label", value })))
    .select("id, value");
  if (error) throw new Error(error.message);
  revalidatePath("/supreme/produce");
  revalidatePath("/qc/inspections/new");
  return { added: (inserted ?? []) as ProductLabel[] };
}
