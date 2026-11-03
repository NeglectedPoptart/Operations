"use server";

import { revalidatePath } from "next/cache";
import { todayISO } from "@/lib/dates";
import { applyFobEmailText } from "@/lib/fobEmailImport";
import { createClient } from "@/lib/supabase/server";
import type { FobFreightRate, FobItem, FobSection } from "@/lib/types";

function revalidateAll() {
  revalidatePath("/sales/fob-pharr");
}

export async function updateFobItem(
  id: string,
  patch: Partial<Pick<FobItem, "commodity_group" | "variety" | "unit_per" | "size" | "fob" | "position">>,
) {
  const supabase = await createClient();
  const { error } = await supabase.from("fob_items").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function addFobItem(
  section: FobSection,
  nextPosition: number,
  commodityGroup: string = "New Item",
  entryDate: string,
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fob_items")
    .insert({ section, commodity_group: commodityGroup, position: nextPosition, entry_date: entryDate })
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

// "Apply now" on an Availability email that arrived outside the morning window (or to re-run one).
export async function applyFobEmailImport(importId: string): Promise<{ updated: number; unmatched: number } | { error: string }> {
  const supabase = await createClient();
  const { data: row, error } = await supabase.from("fob_email_imports").select("body_text").eq("id", importId).maybeSingle();
  if (error || !row) return { error: error?.message ?? "That email is no longer on file." };
  try {
    const result = await applyFobEmailText(supabase, row.body_text as string);
    await supabase
      .from("fob_email_imports")
      .update({
        status: result.pricesFound === 0 ? "nothing_found" : "applied",
        prices_found: result.pricesFound,
        items_updated: result.itemsUpdated,
        unmatched: result.unmatched,
        entry_date: todayISO(),
        note: result.pricesFound === 0 ? "No price lines were found in this email." : null,
      })
      .eq("id", importId);
    revalidateAll();
    return { updated: result.itemsUpdated, unmatched: result.unmatched.length };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not apply that email." };
  }
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
