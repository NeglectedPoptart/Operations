"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { InvoiceStatement } from "@/lib/types";

function revalidateAll(brokerId: string) {
  revalidatePath(`/logistics/invoicing/${brokerId}`);
  revalidatePath("/logistics/invoicing");
}

export async function getInvoiceStatementsForBroker(brokerId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("invoice_statements").select("*").eq("broker_id", brokerId);
  if (error) throw new Error(error.message);
  return (data ?? []) as InvoiceStatement[];
}

// Applies the Statement Checker's confirmed results: rows found Posted and
// paid (Done + no balance) are removed entirely; rows found Posted but
// still carrying a balance (Done but not actually paid) get flagged.
export async function applyStatementCheck(brokerId: string, removeIds: string[], flagIds: string[]) {
  const supabase = await createClient();

  if (removeIds.length > 0) {
    const { error } = await supabase.from("invoice_statements").delete().in("id", removeIds);
    if (error) throw new Error(error.message);
  }
  if (flagIds.length > 0) {
    const { error } = await supabase.from("invoice_statements").update({ flagged: true }).in("id", flagIds);
    if (error) throw new Error(error.message);
  }
  revalidateAll(brokerId);
}
