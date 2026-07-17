"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function deletePendingToInvoiceItem(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("pending_to_invoice").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/sales/pending-to-invoice");
}

// Bulk-clears the "Invoicing" sub-list (status marked Invoicing) once
// accounting has finished processing everything on it.
export async function clearInvoicingItems() {
  const supabase = await createClient();
  const { error } = await supabase.from("pending_to_invoice").delete().ilike("status", "invoicing");
  if (error) throw new Error(error.message);
  revalidatePath("/sales/pending-to-invoice");
}
