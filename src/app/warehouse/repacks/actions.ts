"use server";

import { revalidatePath } from "next/cache";
import { personName } from "@/lib/displayName";
import { createClient } from "@/lib/supabase/server";

function revalidateAll() {
  revalidatePath("/warehouse/repacks");
  revalidatePath("/warehouse/repack-inventory");
  revalidatePath("/meetings/weekly-company-call");
}

export interface RepackInput {
  id?: string;
  repack_date: string;
  product_in: string;
  qty_in: number | null;
  product_out: string;
  qty_out: number | null;
  cartons_used: number | null;
  carton_type: string;
  cost: number | null;
  notes: string;
  // Repack Inventory supplies used - taken off the shelf.
  supplies: { itemId: string; qty: number }[];
}

const MISSING = "Repacks aren't set up yet - ask the admin to run migration 157.";

// Saves a repack. Its supply lines become Repack Inventory usage tagged with the repack, so
// editing a repack swaps them out (the old ones are removed, which puts that stock back) and
// deleting it returns everything it used.
export async function saveRepack(input: RepackInput): Promise<{ ok: true; id: string } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  if (!input.repack_date) return { error: "Pick the date of the repack." };
  if (!input.product_in.trim() && !input.product_out.trim()) return { error: "Enter the product that went in or came out." };

  const row = {
    repack_date: input.repack_date,
    product_in: input.product_in.trim(),
    qty_in: input.qty_in,
    product_out: input.product_out.trim(),
    qty_out: input.qty_out,
    cartons_used: input.cartons_used,
    carton_type: input.carton_type.trim() || null,
    cost: input.cost,
    notes: input.notes.trim() || null,
  };

  let id = input.id;
  if (id) {
    const { error } = await supabase.from("repacks").update(row).eq("id", id);
    if (error) return { error: /repacks/.test(error.message) ? MISSING : error.message };
    // Put the old supplies back before applying the new ones.
    const { error: delError } = await supabase.from("repack_adjustments").delete().eq("repack_id", id);
    if (delError) return { error: delError.message };
  } else {
    const { data, error } = await supabase
      .from("repacks")
      .insert({ ...row, created_by: await personName(supabase, user) })
      .select("id")
      .single();
    if (error) return { error: /repacks/.test(error.message) ? MISSING : error.message };
    id = data.id as string;
  }

  const lines = input.supplies.filter((l) => l.itemId && Number.isFinite(l.qty) && l.qty > 0);
  if (lines.length > 0) {
    const label = [input.product_in.trim(), input.product_out.trim()].filter(Boolean).join(" -> ");
    const { error } = await supabase.from("repack_adjustments").insert(
      lines.map((l) => ({
        item_id: l.itemId,
        entry_date: input.repack_date,
        qty: -Math.abs(l.qty),
        notes: `Repack: ${label || "job"}`,
        repack_id: id,
      })),
    );
    if (error) return { error: error.message };
  }

  revalidateAll();
  return { ok: true, id: id! };
}

export async function deleteRepack(id: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  // Its supply usage goes with it (the database removes those lines, returning the stock).
  const { error } = await supabase.from("repacks").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidateAll();
  return { ok: true };
}
