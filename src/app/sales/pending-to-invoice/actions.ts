"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function deletePendingToInvoiceItem(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("pending_to_invoice").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/sales/pending-to-invoice");
}
