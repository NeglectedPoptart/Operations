"use server";

import { revalidatePath } from "next/cache";
import { personName } from "@/lib/displayName";
import { canOpenPage } from "@/lib/pageAccess";
import { createClient } from "@/lib/supabase/server";
import type { Destination, SavedSheet } from "@/lib/customSheets";

const COLUMNS = "id, name, title, summary, footer, selection, destinations, updated_at";

async function allowed() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!(await canOpenPage(supabase, user, "/sales/custom-sheets"))) return null;
  return { supabase, user: user! };
}

export async function saveCustomSheet(input: {
  id?: string;
  name: string;
  title: string;
  summary: string;
  footer: string;
  selection: string[];
  destinations: Destination[];
}): Promise<{ sheet: SavedSheet } | { error: string }> {
  const ctx = await allowed();
  if (!ctx) return { error: "Not allowed." };
  const name = input.name.trim();
  if (!name) return { error: "Give the sheet a name to save it." };

  const row = {
    name,
    title: input.title,
    summary: input.summary,
    footer: input.footer,
    selection: input.selection,
    destinations: input.destinations,
    updated_at: new Date().toISOString(),
  };
  const query = input.id
    ? ctx.supabase.from("custom_price_sheets").update(row).eq("id", input.id)
    : ctx.supabase.from("custom_price_sheets").insert({ ...row, created_by: await personName(ctx.supabase, ctx.user) });
  const { data, error } = await query.select(COLUMNS).single();
  if (error) {
    if (error.code === "23505") return { error: `There is already a saved sheet called "${name}".` };
    return { error: /custom_price_sheets/.test(error.message) ? "Saving isn't set up yet - ask the admin to run migration 154." : error.message };
  }
  revalidatePath("/sales/custom-sheets");
  return { sheet: data as SavedSheet };
}

export async function deleteCustomSheet(id: string): Promise<{ ok: true } | { error: string }> {
  const ctx = await allowed();
  if (!ctx) return { error: "Not allowed." };
  const { error } = await ctx.supabase.from("custom_price_sheets").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/sales/custom-sheets");
  return { ok: true };
}
