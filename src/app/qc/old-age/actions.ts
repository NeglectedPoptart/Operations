"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ParsedOldAgeRow } from "@/lib/oldAgeParse";
import type { OldAgeNextStep } from "@/lib/types";

function revalidateAll() {
  revalidatePath("/qc/old-age");
  revalidatePath("/");
}

// Wholesale replace: the user re-sends the full current report each time, so
// we don't try to diff/merge against what's already there.
export async function importOldAgeItems(rows: ParsedOldAgeRow[]) {
  const supabase = await createClient();

  const { error: deleteError } = await supabase
    .from("old_age_items")
    .delete()
    .not("id", "is", null);
  if (deleteError) throw new Error(deleteError.message);

  if (rows.length === 0) {
    revalidateAll();
    return [];
  }

  const { data, error: insertError } = await supabase
    .from("old_age_items")
    .insert(
      rows.map((r, i) => ({
        position: i + 1,
        document: r.document || null,
        received_date: r.received_date,
        description: r.description || null,
        pack_style: r.pack_style || null,
        size: r.size || null,
        qty: r.qty,
        age: r.age,
      })),
    )
    .select()
    .order("position", { ascending: true });
  if (insertError) throw new Error(insertError.message);

  revalidateAll();
  return data;
}

export async function addOldAgeRow(nextPosition: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("old_age_items")
    .insert({ position: nextPosition })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidateAll();
  return data;
}

export async function updateOldAgeItem(
  id: string,
  patch: {
    document?: string | null;
    description?: string | null;
    pack_style?: string | null;
    size?: string | null;
    qty?: number | null;
    age?: number | null;
    next_step?: OldAgeNextStep | null;
    notes?: string | null;
    cash_list?: boolean;
    cash_price?: number | null;
    qc_needed?: boolean;
  },
) {
  const supabase = await createClient();
  const { error } = await supabase.from("old_age_items").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function deleteOldAgeItem(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("old_age_items").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

// A single move logged against one item ("Partial Moved" ledger) - which
// order took how much. qty_moved on the parent row is kept in sync by the
// apply_old_age_move trigger, not here.
export async function addOldAgeMove(
  itemId: string,
  entryDate: string,
  orderReference: string,
  qty: number,
  notes: string,
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("old_age_moves")
    .insert({ item_id: itemId, entry_date: entryDate, order_reference: orderReference || null, qty, notes: notes || null })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidateAll();
  return data;
}

export async function deleteOldAgeMove(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("old_age_moves").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}
