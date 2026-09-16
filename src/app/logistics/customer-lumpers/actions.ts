"use server";

import { createClient } from "@/lib/supabase/server";
import type { CustomerLumper } from "@/lib/types";

// No revalidatePath here - see employee-files/actions.ts for why. A row can
// get several fields filled out in quick succession, and revalidating on
// every blur can remount the client mid-edit and drop whatever the next
// field's blur hadn't saved yet. The client's own optimistic setState
// already reflects changes instantly, and the page is force-dynamic so a
// later visit fetches fresh data anyway.

export async function addCustomerLumperRow(nextPosition: number): Promise<CustomerLumper> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_lumpers")
    .insert({ position: nextPosition })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as CustomerLumper;
}

export async function updateCustomerLumperRow(
  id: string,
  patch: Partial<Pick<CustomerLumper, "customer" | "description" | "price" | "notes">>,
) {
  const supabase = await createClient();
  const { error } = await supabase.from("customer_lumpers").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteCustomerLumperRow(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("customer_lumpers").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
