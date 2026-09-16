"use server";

import { createClient } from "@/lib/supabase/server";
import type { RepackCost } from "@/lib/types";

// No revalidatePath here - see employee-files/actions.ts for why.

export async function addRepackCostRow(nextPosition: number): Promise<RepackCost> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("repack_costs")
    .insert({ position: nextPosition })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as RepackCost;
}

export async function updateRepackCostRow(
  id: string,
  patch: Partial<Pick<RepackCost, "action" | "cost" | "unit">>,
) {
  const supabase = await createClient();
  const { error } = await supabase.from("repack_costs").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteRepackCostRow(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("repack_costs").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
